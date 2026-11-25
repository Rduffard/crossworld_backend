import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { acquireWorkerLock } from "./windows.mjs";

export async function superviseRelay({ launch, log, signal, retryMs = 5_000, failureLimit = 3,
  startupMs = 120_000, heartbeatMs = 20_000, drainMs = 120_000 }) {
  let failures = 0;
  while (!signal.aborted && failures < failureLimit) {
    let child;
    try {
      child = launch();
    } catch (error) {
      log("spawn-failed", { code: error.code || "unknown" });
      failures++;
      await delay(retryMs, undefined, { signal }).catch(() => {});
      continue;
    }
    const pid = child.pid;
    log("starting", { pid });
    const startedAt = Date.now();
    let lastHeartbeat = 0;
    let lastState;
    let drainAt;
    let startupPhase;
    child.on("message", message => {
      if (message?.type === "startup" && ["codex-discovery", "subscription-check", "workspace-checks",
        "device-credential", "media-storage", "relay-connect"].includes(message.phase)) {
        startupPhase = message.phase;
        log("worker-startup", { pid, phase: startupPhase });
        return;
      }
      if (message?.type !== "heartbeat") return;
      lastHeartbeat = Date.now();
      const state = JSON.stringify([message.profiles, message.backgroundReviews, message.active]);
      if (state !== lastState) {
        log("healthy", { pid, profiles: message.profiles, backgroundReviews: message.backgroundReviews, active: message.active });
        lastState = state;
      }
    });
    function drain() {
      drainAt = Date.now();
      log("draining", { pid });
      if (child.connected) child.send({ type: "drain" }, error => {
        if (error) log("drain-unavailable", { pid });
      });
    }
    signal.addEventListener("abort", drain, { once: true });
    if (signal.aborted) drain();
    let issue;
    const watch = setInterval(() => {
      const now = Date.now();
      const next = drainAt
        ? now - drainAt >= drainMs && "drain-timeout"
        : lastHeartbeat
          ? now - lastHeartbeat >= heartbeatMs && "heartbeat-stale"
          : now - startedAt >= startupMs && "startup-timeout";
      if (next && next !== issue) {
        log(next, { pid, ...(startupPhase ? { phase: startupPhase } : {}) });
        if (next === "startup-timeout") child.kill();
      }
      if (!next && issue === "heartbeat-stale") log("heartbeat-restored", { pid });
      issue = next;
    }, Math.min(1000, startupMs, heartbeatMs, drainMs));
    const exit = await new Promise(resolve => {
      child.once("error", error => resolve({ code: error.code || "unknown" }));
      child.once("exit", (code, reason) => resolve({ code, reason }));
    });
    clearInterval(watch);
    signal.removeEventListener("abort", drain);
    log(signal.aborted ? "stopped" : "unexpected-exit", { pid, ...exit,
      ...(!lastHeartbeat && startupPhase ? { phase: startupPhase } : {}) });
    failures = lastHeartbeat && lastHeartbeat - startedAt >= heartbeatMs ? 0 : failures + 1;
    if (!signal.aborted && failures < failureLimit) {
      log("retrying", { failures });
      await delay(retryMs, undefined, { signal }).catch(() => {});
    }
  }
  if (!signal.aborted) log("recovery-exhausted", { failures });
  return signal.aborted ? "stopped" : "recovery-exhausted";
}

async function main() {
  if (process.platform !== "win32" || process.argv[2] !== "--start-supervised") {
    throw new Error("Launch requires Windows and an explicit --start-supervised argument.");
  }
  process.env.OPERATIONS_BACKEND_URL ||= "https://api.crossworldcreative.com";
  const worker = fileURLToPath(new URL("./worker.mjs", import.meta.url));
  const key = createHash("sha256").update(homedir().toLowerCase()).digest("hex").slice(0, 24);
  const release = await acquireWorkerLock(`\\\\.\\pipe\\crossworld-operations-supervisor-${key}`);
  try {
    const folder = path.join(process.env.LOCALAPPDATA, "Crossworld Operations");
    mkdirSync(folder, { recursive: true });
    const logFile = path.join(folder, "supervisor.jsonl");
    const log = (state, detail = {}) => appendFileSync(logFile,
      JSON.stringify({ at: new Date().toISOString(), state, ...detail }) + "\n", { flush: true });
    const controller = new AbortController();
    process.on("SIGINT", () => controller.abort());
    process.on("SIGTERM", () => controller.abort());
    log("supervisor-started", { worker, sourceHash: createHash("sha256").update(readFileSync(worker)).digest("hex") });
    const result = await superviseRelay({
      launch: () => fork(worker, ["--supervised"], { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] }),
      signal: controller.signal,
      log,
    });
    if (result === "recovery-exhausted") process.exitCode = 1;
  } finally {
    await release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

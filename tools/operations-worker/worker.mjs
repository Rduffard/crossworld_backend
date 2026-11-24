import { randomUUID } from "node:crypto";
import { acquireWorkerLock, loadCredential } from "./windows.mjs";
import { appendFileSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { AppServer, discoverCodex, model, runTurn } from "./codex.mjs";
import { turnControl } from "./control.mjs";
import { developmentRepositories, protectedDirectories, sandboxFor, verifyDirectory, verifySandbox, workspacePaths } from "./profiles.mjs";

import promptLimits from "../../src/modules/operations/prompt-limits.js";
import usageTools from "../../src/modules/operations/usage.js";

const { PROMPT_LIMIT } = promptLimits;
const { rateLimitObservation, usageHoldUntil } = usageTools;
const interval = 1000;
const offlineLimit = 15_000;

export function backendClient(base, token) {
  if (!base) throw new Error("Set OPERATIONS_BACKEND_URL or open Start Crossworld Operations.cmd.");
  const url = new URL(base);
  const loopback = process.env.OPERATIONS_LOOPBACK_TEST === "1" &&
    url.protocol === "http:" && url.hostname === "127.0.0.1";
  if ((!loopback && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) {
    throw new Error("Use an HTTPS backend URL without credentials, query, or fragment.");
  }
  return async (endpoint, body) => {
    const response = await fetch(`${url.href.replace(/\/$/, "")}/operations/worker${endpoint}`, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4000),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw Object.assign(new Error(`Operations request failed (HTTP ${response.status}).`), { status: response.status });
    }
    return response.json();
  };
}

export function redact(text, token) {
  return String(text ?? "")
    .replaceAll("\0", "")
    .replaceAll(token, "[device credential redacted]")
    .replace(/\b(?:sk-[\w-]{16,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})\b/g, "[credential redacted]")
    .replace(/((?:access_token|refresh_token|id_token|api_key)["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi, "$1[redacted]");
}

export async function runWorker({ send, efforts, execute, token, signal, profiles, getUsage, boundedCorrections = false, log = console.log }) {
  const instance = randomUUID();
  let advertisedProfiles = profiles;
  let active;
  let lastContact = Date.now();
  let heartbeat = 0;
  let disconnected = false;
  let connected = false;
  const sync = async () => {
    if (!active.batch) {
      const events = active.events.slice(0, 5);
      const result = events.length === active.events.length ? active.result : undefined;
      active.batch = { instance, offset: active.offset, events, result };
    }
    const reply = await send(`/jobs/${active.job._id}/sync`, { ...active.batch, control: active.control.snapshot() });
    active.batch = undefined;
    active.events.splice(0, reply.eventCount - active.offset);
    active.offset = reply.eventCount;
    if (["cancelled", "cancelling", "interrupted"].includes(reply.status)) {
      active.controller.abort(reply.status === "interrupted" ? "interrupted" : "cancelled");
    }
    if (reply.status === "running") active.control.receive(reply);
    if (active.result && ["completed", "cancelled", "interrupted", "failed"].includes(reply.status)) active = undefined;
  };
  try {
    while (!signal.aborted) {
      try {
        if (Date.now() - heartbeat >= 5000) {
          const announce = () => send("/heartbeat", {
            instance, efforts, profiles: advertisedProfiles, extendedPrompts: true, boundedCorrections, usage: getUsage?.() || undefined,
          });
          try { await announce(); }
          catch (error) {
            if (error.status !== 400 || !advertisedProfiles?.includes("full-access")) throw error;
            advertisedProfiles = advertisedProfiles.filter((profile) => profile !== "full-access");
            await announce();
            log("Relay did not accept Full Access. Restricted profiles remain available until the worker restarts.");
          }
          heartbeat = Date.now();
        }
        if (active) await sync();
        else {
          const job = await send("/claim", { instance, extendedPrompts: true });
          if (job && !signal.aborted) {
            const state = { job, offset: job.eventCount || 0, events: [], controller: new AbortController() };
            state.control = turnControl(state.controller.signal, (value) => redact(value, token));
            active = state;
            if (job.status === "cancelling") {
              state.result = { status: "cancelled", error: "" };
              continue;
            }
            const record = (view, label, value) => {
              const clean = redact(value, token).toWellFormed();
              let index = 0;
              while (index < clean.length) {
                let end = Math.min(index + 3000, clean.length);
                if (clean.charCodeAt(end - 1) >= 0xd800 && clean.charCodeAt(end - 1) <= 0xdbff) end--;
                state.events.push({ view, label: label.slice(0, 120), text: clean.slice(index, end) });
                index = end;
              }
            };
            record("activity", "Job assigned", "The Windows worker received the job.");
            state.execution = Promise.resolve().then(() => execute(job, record, state.controller.signal, state.control))
              .catch(() => ({ status: "failed", error: "Local execution failed." }))
              .then((result) => {
                const status = state.controller.signal.aborted && result.status !== "completed"
                  ? state.controller.signal.reason : result.status;
                state.result = { ...result, status, error: redact(result.error, token).slice(0, 2000) };
              });
          }
        }
        lastContact = Date.now();
        if (disconnected) log("Operations connection restored.");
        else if (!connected) log("Connected to Crossworld Operations. Device authentication verified.");
        connected = true;
        disconnected = false;
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          throw new Error("Device registration is invalid or revoked. Open Register Crossworld Operations.cmd.", { cause: error });
        }
        if (!disconnected) {
          const hint = error.status === 404 ? "Operations is unavailable on the backend. Check deployment and owner configuration." :
            error.status === 409 ? "Waiting for the previous worker lease or assignment to clear." :
            "Operations connection unavailable. Check HTTPS connectivity.";
          log(`${hint} Retrying.`);
        }
        disconnected = true;
        if (Date.now() - lastContact >= offlineLimit) active?.controller.abort("interrupted");
      }
      await sleep(!disconnected && active?.events.length >= 5 ? 50 : interval, undefined, { signal }).catch(() => {});
    }
  } finally {
    if (active) {
      active.controller.abort("interrupted");
      await active.execution;
      await sync().catch(() => {});
    }
  }
}

function resolvedWorkspaces() {
  return Object.fromEntries(Object.entries(workspacePaths).map(([key, directory]) => {
    const resolved = realpathSync(directory);
    if (resolved.toLowerCase() !== directory.toLowerCase() || !statSync(resolved).isDirectory()) {
      throw new Error(`Authorized workspace is missing or redirected: ${directory}`);
    }
    return [key, resolved];
  }));
}

function localSessions(deviceId) {
  const ledger = path.join(process.env.LOCALAPPDATA, "Crossworld Operations", `threads-${deviceId}.jsonl`);
  const threads = new Map();
  let content = "";
  try { content = readFileSync(ledger, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const line of content.split("\n").filter(Boolean)) {
    const { threadId, workspace, profile = "read-only" } = JSON.parse(line);
    threads.set(threadId, { workspace, profile });
  }
  return {
    allows: (threadId, workspace, profile) => {
      const saved = threads.get(threadId);
      return saved?.workspace === workspace && saved?.profile === profile;
    },
    remember(threadId, workspace, profile) {
      if (threads.has(threadId)) return;
      appendFileSync(ledger, JSON.stringify({ threadId, workspace, profile }) + "\n", { flush: true });
      threads.set(threadId, { workspace, profile });
    },
  };
}

async function startWorker() {
  const { exe, version } = discoverCodex();
  const workspaces = resolvedWorkspaces();
  const autonomousNetwork = process.env.OPERATIONS_AUTONOMOUS_NETWORK === "development";
  let fullAccess = false;
  const editRoots = {};
  const candidates = { development: developmentRepositories, workshop: [workspaces.workshop] };
  const exclusions = (roots) => protectedDirectories.filter((directory) => !roots.some((root) => {
    const relative = path.relative(root, directory);
    return !relative || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep));
  }));
  const probe = new AppServer(exe, workspaces.development);
  let efforts;
  let usage;
  const observeUsage = (rateLimits) => {
    if (rateLimits?.limitId != null && rateLimits.limitId !== "codex") return;
    usage = rateLimitObservation({ ...rateLimits, observedAt: Date.now() }) || usage;
  };
  let lastUsageAttempt = 0;
  async function refreshUsage(server) {
    lastUsageAttempt = Date.now();
    try {
      const { rateLimits, rateLimitsByLimitId } = await server.request("account/rateLimits/read", {});
      observeUsage(rateLimitsByLimitId?.codex || rateLimits);
    } catch { /* Telemetry is optional. Stale readings automatically expire. */ }
  }
  async function refreshHeldUsage() {
    lastUsageAttempt = Date.now();
    const server = new AppServer(exe, workspaces.development);
    try {
      await server.initialize();
      await refreshUsage(server);
    } catch { /* Keep the observed snapshot until it expires. */ }
    finally { server.close(); }
  }
  try {
    await probe.initialize();
    efforts = await probe.capabilities();
    if (!efforts.length) throw new Error("No supported reasoning efforts were reported.");
    await refreshUsage(probe);
    console.log(`${version} · ChatGPT sign-in verified · ${model} (${efforts.join(", ")})`);
    console.log("Authorized workspaces:", ...Object.values(workspaces));
    if (process.env.OPERATIONS_FULL_ACCESS === "1") {
      try {
        const result = await probe.request("command/exec", {
          command: [process.execPath, "-e", "console.log('CW_FULL_ACCESS_READY')"],
          cwd: workspaces.development, sandboxPolicy: { type: "dangerFullAccess" }, timeoutMs: 12000,
        });
        fullAccess = result.exitCode === 0 && result.stdout.trim() === "CW_FULL_ACCESS_READY";
      } catch { /* Other profiles can still be used. */ }
      if (fullAccess) {
        console.log("Full Access enabled. Commands run with the Windows worker account's permissions.");
      } else {
        console.error("Full Access command probe failed. Other profiles can still be used.");
      }
    }
  } finally {
    probe.close();
  }
  for (const [profile, directories] of Object.entries(candidates)) {
    let profileProbe;
    try {
      const roots = directories.map(verifyDirectory);
      profileProbe = new AppServer(exe, roots[0]);
      await profileProbe.initialize();
      await verifySandbox(profileProbe, roots[0], sandboxFor(roots[0], roots), exclusions(roots), roots);
      editRoots[profile] = roots;
      console.log(`Editing verified for ${profile}.`);
    } catch (error) {
      console.error(`Editing unavailable for ${profile}. ${error.message}`);
    } finally {
      profileProbe?.close();
    }
  }
  if (process.argv.includes("--check")) return;
  const token = loadCredential({ onboard: process.argv.includes("--onboard"), register: process.argv.includes("--register") });
  const sessions = localSessions(token.split(".")[0]);
  const send = backendClient(process.env.OPERATIONS_BACKEND_URL, token);
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  process.on("SIGTERM", () => controller.abort());
  await runWorker({
    send, token, efforts, profiles: ["read-only", ...Object.keys(editRoots), ...(fullAccess ? ["full-access"] : [])],
    signal: controller.signal,
    getUsage: () => {
      if (usageHoldUntil(usage) && Date.now() - lastUsageAttempt >= 120_000) void refreshHeldUsage();
      return usage;
    },
    boundedCorrections: true,
    execute: async (job, record, signal, control) => {
      const profile = job.profile || "read-only";
      const unrestricted = profile === "full-access";
      const correction = job.workerRole === "correction";
      if ((correction && profile !== job.workspace) || !Object.hasOwn(workspaces, job.workspace) || job.model !== model || !efforts.includes(job.effort) ||
          (unrestricted ? !fullAccess : profile !== "read-only" && (profile !== job.workspace || !Object.hasOwn(editRoots, profile))) ||
          typeof job.prompt !== "string" || job.prompt.length > PROMPT_LIMIT || !job.prompt.isWellFormed() ||
          (job.codexThreadId && !sessions.allows(job.codexThreadId, job.workspace, profile))) {
        return { status: "failed", error: "Job is outside the worker allowlist." };
      }
      if (job.status === "cancelling" || job.eventCount > 0) {
        return { status: "interrupted", error: "Previous assignment cannot be safely replayed." };
      }
      const roots = profile === "read-only" || unrestricted ? [] : editRoots[profile].map(verifyDirectory);
      const [root] = roots;
      const cwd = root || workspaces[job.workspace];
      return runTurn(new AppServer(exe, cwd), job, cwd, record, signal, control, {
        root,
        roots,
        gitRoots: profile === "development" && !correction ? roots : [],
        protectedDirectories: unrestricted ? undefined : exclusions(roots),
        supervised: !!root && !correction,
        fullAccess: unrestricted && fullAccess,
        autonomousNetwork: !correction && autonomousNetwork && profile === "development",
        localMcp: !job.workerRole || job.workerRole === "direct",
        observeUsage,
        remember: (threadId) => sessions.remember(threadId, job.workspace, profile),
      });
    },
  });
}

async function main() {
  if (process.platform !== "win32" || Number(process.versions.node.split(".")[0]) < 22) {
    throw new Error("The worker requires Windows and Node.js 22 or later.");
  }
  if (process.argv.includes("--check")) return startWorker();
  const releaseLock = await acquireWorkerLock();
  try { await startWorker(); }
  finally { await releaseLock(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

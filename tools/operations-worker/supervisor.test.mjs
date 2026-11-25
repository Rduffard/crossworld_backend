import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { superviseRelay } from "./supervisor.mjs";
import { runWorker } from "./worker.mjs";
import { pollMedia } from "./media-storage.mjs";

test("media drain acknowledges the accepted transfer without polling for another", { timeout: 5000 }, async () => {
  const controller = new AbortController();
  const requestId = "63d7822b-9b1c-4b29-b735-db87a743a8ed";
  const requests = [];
  let drain = false;
  await pollMedia({
    signal: controller.signal, instance: "fixture", draining: () => drain,
    send: async (_path, message) => {
      requests.push(message);
      if (requests.length === 1) return { requestId };
      return null;
    },
    storage: { execute: async () => { drain = true; return { state: "ok" }; } },
  });
  assert.deepEqual(requests, [
    { instance: "fixture" },
    { instance: "fixture", replyId: requestId, reply: { state: "ok" }, draining: true },
  ]);
});

const launch = source => spawn(process.execPath, ["-e", source], {
  windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"],
});

test("supervisor recovers from an exit and drains only its own replacement", { timeout: 5000 }, async () => {
  const controller = new AbortController();
  let attempts = 0;
  const states = [];
  const result = await superviseRelay({
    launch: () => ++attempts === 1 ? launch("process.exit(3)") : launch(`
      process.on("message", message => {
        if (message.type === "drain") process.exit(0);
      });
      process.send({ type: "heartbeat", profiles: ["read-only"], active: 0 });
    `),
    log: (state, detail) => {
      states.push([state, detail]);
      if (state === "healthy") controller.abort();
    },
    signal: controller.signal, retryMs: 10,
  });
  assert.equal(result, "stopped");
  assert.deepEqual(states.map(([state]) => state),
    ["starting", "unexpected-exit", "retrying", "starting", "healthy", "draining", "stopped"]);
  assert.equal(states.at(-1)[1].code, 0);
});

test("supervisor stops repeated failed starts at the recovery limit", { timeout: 5000 }, async () => {
  let attempts = 0;
  const states = [];
  const result = await superviseRelay({
    launch: () => { attempts++; return launch("process.exit(4)"); },
    signal: new AbortController().signal, retryMs: 10, failureLimit: 2,
    log: state => states.push(state),
  });
  assert.equal(result, "recovery-exhausted");
  assert.equal(attempts, 2);
  assert.equal(states.at(-1), "recovery-exhausted");
});

test("supervisor identifies and recovers a hung startup before device authentication", { timeout: 5000 }, async () => {
  const states = [];
  const result = await superviseRelay({
    launch: () => launch(`
      process.send({ type: "startup", phase: "subscription-check" });
      setInterval(() => {}, 1000);
    `),
    signal: new AbortController().signal, retryMs: 10, startupMs: 300, failureLimit: 2,
    log: (state, detail) => states.push([state, detail]),
  });
  assert.equal(result, "recovery-exhausted");
  const timeouts = states.filter(([state]) => state === "startup-timeout");
  assert.equal(timeouts.length, 2);
  assert.ok(timeouts.every(([, detail]) => detail.phase === "subscription-check"));
});

test("relay drain commits an in-flight result and stops claiming turns", { timeout: 5000 }, async () => {
  const controller = new AbortController();
  let drainRequested = false;
  let claims = 0;
  let committed;
  await runWorker({
    token: "fixture-token",
    efforts: ["low"], profiles: ["read-only"],
    signal: controller.signal, draining: () => drainRequested, log: () => {},
    send: async (endpoint, body) => {
      if (endpoint === "/heartbeat") return {};
      if (endpoint === "/claim") {
        claims++;
        return { _id: "fixture-job" };
      }
      committed = body;
      return { eventCount: body.events.length, status: body.result?.status || "running" };
    },
    execute: async (_job, record) => {
      record("activity", "Agent commentary", "Captured before draining.");
      drainRequested = true;
      return { status: "completed", error: "" };
    },
  });
  assert.equal(claims, 1);
  assert.equal(committed.result.status, "completed");
  assert.ok(committed.events.some(event => event.label === "Agent commentary" && event.messageId));
});

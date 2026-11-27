import assert from "node:assert/strict";
import { test } from "node:test";
import { runWorker } from "../../tools/operations-worker/worker.mjs";
import usage from "../../src/modules/operations/usage.js";

const snapshot = (usedPercent, observedAt = Date.now()) => ({
  observedAt, ordinaryUsageAllowed: true,
  primary: { usedPercent: 99, windowDurationMins: 300 },
  secondary: { usedPercent, windowDurationMins: 10080, resetsAt: Math.floor(observedAt / 1000) + 3600 },
});

test("weekly budget transitions at 90, 95 and 98 and survives stale observations until reset", () => {
  for (const [percent, expected] of [[43, "normal"], [89.9, "normal"], [90, "warning"],
    [94.9, "warning"], [95, "dispatch-stopped"], [97.9, "dispatch-stopped"], [98, "suspended"]]) {
    assert.equal(usage.budgetStatus(snapshot(percent)).state, expected);
  }
  const now = Date.now();
  const capped = snapshot(98, now - 900_000);
  assert.ok(usage.usageHoldUntil(capped, now) > now);
  assert.equal(usage.usageHoldUntil(capped, capped.secondary.resetsAt * 1000), 0);
  assert.equal(usage.shouldSampleUsage(snapshot(89, now - 100), snapshot(90, now)), true);
});

test("relay logs the warning, drains at 95 and interrupts at 98", { timeout: 10_000 }, async () => {
  const stop = new AbortController();
  const messages = [];
  let percent = 90;
  let claims = 0;
  let executions = 0;
  let interruptedAt;
  let saved;
  await runWorker({
    signal: stop.signal, efforts: ["low"], profiles: ["read-only"], token: "test-token",
    getUsage: () => snapshot(percent), log: message => messages.push(message),
    send: async (path, body) => {
      if (path === "/heartbeat") return { backgroundReviews: true };
      if (path === "/claim") {
        claims++;
        if (body.lane === "review") return null;
        return { _id: "fixture", status: "running" };
      }
      if (path === "/jobs/fixture/sync") {
        if (body.result) {
          saved = body.result;
          stop.abort();
        } else {
          percent = 98;
        }
        return { status: body.result?.status || "running", eventCount: body.offset + body.events.length };
      }
      throw new Error("Unexpected fixture request " + path);
    },
    backgroundReviews: true,
    execute: (_job, _record, signal) => {
      executions++;
      percent = 95;
      return new Promise(resolve => signal.addEventListener("abort", () => {
        interruptedAt = percent;
        resolve({ status: "cancelled", error: "" });
      }, { once: true }));
    },
  });
  assert.equal(executions, 1);
  assert.equal(claims, 1);
  assert.equal(interruptedAt, 98);
  assert.equal(saved.status, "interrupted");
  assert.match(saved.error, /Weekly subscription execution limit/);
  assert.ok(messages.some(message => message.includes("90% (warning)")));
});

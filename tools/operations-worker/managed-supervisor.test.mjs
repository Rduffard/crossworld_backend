import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { lifecycleController, workerProcess } from "./managed-supervisor.mjs";

function fixture(operation, rejectCandidate = false) {
  let state = { active: "original", previous: "previous" };
  let journal = null;
  let offer = { _id: "request", operation, current: "original",
    target: { restart: "original", update: "candidate", rollback: "previous" }[operation] };
  const operations = [];
  const receipts = [];
  const controller = lifecycleController({
    store: {
      open: release => release,
      list: () => ["original", "previous", "candidate"],
      state: () => state,
      save: value => { state = value; },
      journal: () => journal,
      record: value => { journal = value; },
      clear: () => { journal = null; },
    },
    service: {
      start: async release => {
        operations.push("start:" + release);
        if (release === "candidate" && rejectCandidate) throw new Error("Wrong heartbeat.");
      },
      probe: async release => { operations.push("probe:" + release); },
      drain: async () => { operations.push("drain"); },
      stopRejected: async () => { operations.push("stop-rejected"); },
    },
    send: async (endpoint, body) => {
      if (endpoint === "/handover-readiness") return { ready: true };
      if (endpoint === "/supervisor/poll") {
        const current = offer;
        offer = null;
        return current;
      }
      receipts.push(body);
      return { accepted: true };
    },
  });
  return { controller, operations, receipts, getState: () => state };
}

test("independent supervisor applies restart, update and rollback targets and acknowledges each result", async () => {
  for (const [kind, target] of [["restart", "original"], ["update", "candidate"], ["rollback", "previous"]]) {
    const model = fixture(kind);
    await model.controller.recover();
    await model.controller.poll();
    await model.controller.poll();
    assert.deepEqual(model.operations, ["start:original", "probe:" + target, "drain", "start:" + target]);
    assert.deepEqual(model.receipts, [{ status: "completed", active: target }]);
    assert.equal(model.getState().active, target);
  }
});

test("failed readiness restores the known-good worker before reporting rollback", async () => {
  const model = fixture("update", true);
  await model.controller.recover();
  await model.controller.poll();
  await model.controller.poll();
  assert.deepEqual(model.operations, ["start:original", "probe:candidate", "drain", "start:candidate", "stop-rejected", "start:original"]);
  assert.deepEqual(model.receipts, [{ status: "rolled-back", active: "original" }]);
});

test("separate worker processes require a matching heartbeat, drain, and allow independent recovery", async () => {
  const directory = mkdtempSync(path.join(realpathSync(tmpdir()), "fleetmaster-supervisor-"));
  const childFile = path.join(directory, "fixture.cjs");
  writeFileSync(childFile, [
    'process.send({ type: "heartbeat", relayVersion: process.argv[2], profiles: ["read-only", "development", "workshop"], active: 0 });',
    'process.on("message", message => { if (message.type === "drain") process.disconnect(); });',
  ].join("\n"));
  const service = workerProcess({
    launch: version => fork(childFile, [version], { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] }),
    readinessMs: 750, drainMs: 1000, probe: async () => {},
  });
  try {
    await service.start({ worker: "known-good", version: "known-good" });
    await service.drain();
    assert.equal(service.alive(), false);
    await assert.rejects(service.start({ worker: "wrong", version: "approved" }), /expected authenticated heartbeat/);
    await service.stopRejected();
    await service.start({ worker: "known-good", version: "known-good" });
    assert.equal(service.alive(), true);
    await service.drain();
  } finally {
    service.disconnect();
    rmSync(childFile, { force: true });
    rmdirSync(directory);
  }
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { createStudioActions } from "../../src/modules/operations/studio-actions.js";
import { backendClient } from "./worker.mjs";

test("Run assignment admission ignores stale grant IDs and returns existing work without duplicating it", async t => {
  const [ownerId, actorId, turnId, employeeId, projectId, objectiveId, instance] =
    Array.from({ length: 7 }, () => randomUUID());
  const studioActor = { id: actorId, role: "first-mate" };
  const actor = { _id: turnId, executiveReview: true, studioActor, operatingGeneration: 2,
    workspace: "development", effort: "low" };
  const objective = { _id: objectiveId, projectId, revision: 1, criteria: [], title: "Test objective" };
  const project = { _id: projectId, revision: 1, workspace: "development" };
  const employee = { _id: employeeId, supervisorId: actorId, revision: 1, role: "worker" };
  const settings = { operatingMode: "run", operatingGeneration: 2 };
  const host = { _id: "relay", instance, profiles: ["development", "read-only"], efforts: ["low"], boundedCorrections: true };
  const queued = new Map();
  let unrelatedDuplicate = false;
  const actions = createStudioActions({
    owner: () => ownerId, online: () => true, workerEnabled: true, hostLimit: () => 10_000,
    executivePaused: async () => false, inMaintenance: async () => false,
    dispatch: () => ({ findOne: async () => settings }),
    objectives: () => ({ findOne: async () => objective }),
    projects: () => ({ findOne: async () => project }),
    workforce: () => ({ findOne: async ({ _id }) => _id === actorId ? studioActor : _id === employeeId ? employee : null }),
    missionRecords: () => assert.fail("Run admission consulted a historical mission grant"),
    jobs: () => ({
      findOne: async ({ _id }) => _id === turnId ? actor : queued.get(_id),
      insertOne: async job => {
        if (unrelatedDuplicate || queued.has(job._id)) throw Object.assign(new Error("Duplicate"), { code: 11000 });
        queued.set(job._id, job);
      },
    }),
  });
  const app = express();
  app.use(express.json(), (req, _res, next) => { req.operationsHost = host; next(); });
  app.use("/operations/worker", actions.worker);
  app.use((error, _req, res, next) => {
    if (error.code !== 11000) return next(error);
    return res.sendStatus(500);
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");
  const previousLoopback = process.env.OPERATIONS_LOOPBACK_TEST;
  process.env.OPERATIONS_LOOPBACK_TEST = "1";
  const send = backendClient(`http://127.0.0.1:${server.address().port}`, "test-relay-token");
  if (previousLoopback === undefined) delete process.env.OPERATIONS_LOOPBACK_TEST;
  else process.env.OPERATIONS_LOOPBACK_TEST = previousLoopback;

  const input = { instance, action: "assign", assignmentKey: "test-work", assignmentType: "implementation",
    instruction: "Exercise the approved workspace.", objectiveId, employeeId };
  const submit = changes => send(`/jobs/${turnId}/studio-mission`, { ...input, ...changes });
  const receipt = await submit({ grantId: randomUUID() });
  assert.equal(receipt.state, "queued");
  assert.equal(queued.get(receipt.assignmentId).delegatedBy.scope, "autonomous-assignment");
  assert.equal(queued.get(receipt.assignmentId).delegatedBy.grantId, undefined);
  assert.deepEqual(await submit(), receipt);
  queued.get(receipt.assignmentId).status = "running";
  assert.deepEqual(await submit({ assignmentKey: "another-key", instruction: "Different work." }),
    { ...receipt, state: "running", reused: true });
  assert.equal(queued.size, 1);

  host.profiles = ["read-only"];
  await assert.rejects(submit(), { status: 403, message: /required assignment profile/ });
  host.profiles = ["development", "read-only"];
  host.efforts = [];
  await assert.rejects(submit(), { status: 403, message: /selected effort level/ });
  host.efforts = ["low"];
  host.boundedCorrections = false;
  await assert.rejects(submit(), { status: 403, message: /implementation assignment type/ });
  host.boundedCorrections = true;
  assert.equal(queued.size, 1);

  unrelatedDuplicate = true;
  await assert.rejects(submit({ assignmentType: "research" }),
    { status: 500, message: "Operations request failed (HTTP 500)." });
  settings.operatingGeneration++;
  await assert.rejects(submit(), { status: 409, message: /no longer part of the active Run generation/ });
});

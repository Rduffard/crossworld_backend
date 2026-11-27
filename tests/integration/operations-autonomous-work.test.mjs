import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { MongoClient } from "mongodb";
import { startTestMongo } from "../support/mongo-fixture.mjs";
import { createRouter } from "../../src/modules/operations/routes.js";

test("Run admits mission-free implementation and independent QA, with bounded recovery and owner controls", async t => {
  const fixture = await startTestMongo(t);
  const client = await MongoClient.connect(fixture.uri);
  t.after(() => client.close());
  const db = client.db(fixture.database);
  const ownerId = "a".repeat(24);
  const actor = { id: randomUUID(), name: "Barnaby", role: "first-mate" };
  const hostId = randomUUID();
  const instance = randomUUID();
  const token = hostId + "." + "a".repeat(64);
  const projectId = randomUUID();
  const objectiveId = randomUUID();
  const firstMate = randomUUID();
  const workforce = db.collection("operations_workforce");
  const jobs = db.collection("operations_jobs");
  const objectives = db.collection("operations_objectives");
  const employee = (role, supervisorId) => ({ _id: randomUUID(), ownerId, kind: "employee", role, supervisorId,
    status: "available", workspace: "development", revision: 0, name: role });
  const lead = employee("lead", actor.id);
  const engineer = employee("worker", lead._id);
  const reviewer = employee("qa", actor.id);
  await workforce.insertMany([{ ...employee("first-mate"), _id: actor.id }, lead, engineer, reviewer]);
  await db.collection("operations_projects").insertOne({ _id: projectId, ownerId, status: "active", workspace: "development", revision: 0 });
  await objectives.insertOne({ _id: objectiveId, projectId, ownerId, status: "active", revision: 0, title: "Fixture deliverable",
    priority: "high", criteria: [{ text: "Verify the fixture" }] });
  await db.collection("operations_hosts").insertOne({ _id: hostId, ownerId, instance, lastSeen: new Date(), revokedAt: null,
    profiles: ["read-only", "development"], efforts: ["low"], boundedCorrections: true, backgroundReviews: true,
    digest: createHash("sha256").update(token).digest("hex") });
  const router = createRouter({ db: () => db, owner: () => ownerId, enabled: () => true, executiveEnabled: true,
    authenticate(req, _res, next) { req.user = { _id: ownerId }; next(); } });
  const app = express();
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  async function send(path, method, fields, expected = 200) {
    const response = await fetch("http://127.0.0.1:" + server.address().port + path, {
      method, headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify(path.startsWith("/worker/") ? { instance, ...fields } : fields),
    });
    const body = await response.json();
    assert.equal(response.status, expected, JSON.stringify(body));
    return body;
  }
  const mode = value => send("/executive-service", "PATCH", { mode: value });
  const studio = (fields, status) => send("/worker/jobs/" + firstMate + "/studio-mission", "POST",
    { action: "assign", objectiveId, instruction: "Exercise the fixture", assignmentKey: "fixture", ...fields }, status);
  const claim = fields => send("/worker/claim", "POST", fields);
  const finish = (job, status, fields = {}) => jobs.updateOne({ _id: job }, { $set: {
    status, finishedAt: new Date(), ...fields,
  }, $unset: { activeHost: "", leaseUntil: "" } });

  assert.equal((await mode("run")).mode, "run");
  await jobs.insertOne({ _id: firstMate, ownerId, hostId, instance, activeHost: hostId, status: "running",
    leaseUntil: new Date(Date.now() + 60_000), workspace: "development", studioTools: true, studioActor: actor,
    executiveReview: true, operatingGeneration: 0, sessionId: firstMate, workerRole: "direct", model: "fixture", effort: "low" });
  const assign = { employeeId: engineer._id, assignmentType: "implementation" };
  const work = await studio(assign);
  assert.equal((await studio(assign)).assignmentId, work.assignmentId);
  await finish(firstMate, "completed");
  assert.equal((await mode("pause")).mode, "pause");
  assert.equal(await claim({}), null);
  assert.equal((await mode("run")).mode, "run");
  const initial = await claim({});
  assert.equal(initial._id, work.assignmentId);
  assert.equal(initial.profile, "development");
  await finish(initial._id, "failed");
  await Promise.all([router.reconcileOperations(), router.reconcileOperations()]);
  const retry = await claim({});
  assert.ok(retry && retry._id !== initial._id);
  assert.equal(await jobs.countDocuments({ "autonomous.retryOf": initial._id }), 1);
  await finish(retry._id, "completed", { eventCount: 1, events: [{ view: "response", text: "Fixture deliverable" }] });
  await jobs.updateOne({ _id: firstMate }, { $set: { status: "running", activeHost: hostId,
    leaseUntil: new Date(Date.now() + 60_000) } });
  const qa = { employeeId: reviewer._id, assignmentType: "qa", sourceJobId: retry._id };
  await studio({ ...qa, employeeId: engineer._id }, 403);
  const review = await studio(qa);
  await finish(firstMate, "completed");
  const independentlyClaimed = await claim({ lane: "review" });
  assert.equal(independentlyClaimed?._id, review.assignmentId);
  assert.equal(independentlyClaimed.profile, "read-only");
  await finish(review.assignmentId, "completed", { eventCount: 1,
    events: [{ view: "response", text: "Fixture has a reproducible defect\nQA_VERDICT: FAIL" }] });
  await router.reconcileOperations();
  assert.equal((await objectives.findOne({ _id: objectiveId })).autonomousDelivery, undefined);
  const reactivateFirstMate = () => jobs.updateOne({ _id: firstMate }, { $set: { status: "running", activeHost: hostId,
    leaseUntil: new Date(Date.now() + 60_000) } });
  await reactivateFirstMate();
  const correction = await studio({ ...assign, sourceJobId: review.assignmentId });
  await finish(firstMate, "completed");
  assert.equal((await claim({}))._id, correction.assignmentId);
  await finish(correction.assignmentId, "completed", { eventCount: 1,
    events: [{ view: "response", text: "Fixture corrected" }] });
  await reactivateFirstMate();
  const retest = await studio({ ...qa, sourceJobId: correction.assignmentId });
  await finish(firstMate, "completed");
  assert.equal((await claim({ lane: "review" }))._id, retest.assignmentId);
  await finish(retest.assignmentId, "completed", { eventCount: 1,
    events: [{ view: "response", text: "Fixture checked independently\nQA_VERDICT: PASS" }] });
  await router.reconcileOperations();
  assert.equal((await objectives.findOne({ _id: objectiveId })).autonomousDelivery.qaJobId, retest.assignmentId);
  assert.equal((await mode("stop")).state, "Stopped");
  assert.equal(await claim({}), null);
  assert.equal(await jobs.countDocuments({ missionId: { $exists: true } }), 0);
});

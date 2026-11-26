import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { MongoClient } from "mongodb";
import { startTestMongo } from "../support/mongo-fixture.mjs";
import { createExecutiveService } from "../../src/modules/operations/executive-service.js";
import { createRouter } from "../../src/modules/operations/routes.js";

test("First Mate coalesces wakes, restores its checkpoint and keeps owner decisions separate", async t => {
  const fixture = await startTestMongo(t);
  const client = await MongoClient.connect(fixture.uri);
  t.after(() => client.close());
  const db = client.db(fixture.database);
  const collections = Object.fromEntries(["dispatch", "jobs", "hosts", "workforce", "records", "proposals", "eventBatches"]
    .map(name => [name, () => db.collection(name)]));
  const relay = { _id: "relay", ownerId: "owner", revokedAt: null, profiles: ["read-only", "full-access"], efforts: ["low", "high"] };
  await collections.hosts().insertOne(relay);
  const actor = { _id: "first-mate", ownerId: relay.ownerId, kind: "employee", role: "first-mate", status: "available", name: "Barnaby" };
  await collections.workforce().insertOne(actor);
  await collections.jobs().insertOne({ _id: "source", ownerId: relay.ownerId, hostId: relay._id, createdAt: new Date(),
    studioTools: true, studioActor: { id: actor._id, role: actor.role }, workspace: "development", model: "fixture", profile: "full-access" });

  let now = Date.now();
  const create = () => createExecutiveService({ ...collections, online: () => true, enabled: true, clock: () => now });
  let controller = create();
  const runs = () => collections.jobs().find({ executiveReview: true }).sort({ createdAt: 1 }).toArray();
  const status = () => controller.view(relay.ownerId);
  await Promise.all([controller.reconcile(relay), controller.reconcile(relay), controller.reconcile(relay)]);
  const [first] = await runs();
  assert.equal((await runs()).length, 1);
  assert.equal(first.profile, "read-only");
  assert.equal(first.executiveTrigger, "enrollment");
  assert.equal(first.effort, "low");
  assert.equal((await status()).state, "Working");

  await collections.jobs().deleteOne({ _id: first._id });
  controller = create();
  await controller.reconcile(relay);
  assert.equal((await runs())[0]._id, first._id, "Restart restores the reservation instead of dispatching a duplicate");
  await collections.jobs().updateOne({ _id: first._id }, { $set: { status: "completed", finishedAt: new Date(now),
    eventCount: 1, events: [{ view: "response", text: "Recorded decision from prior review" }] } });
  assert.equal((await status()).state, "Standing By");
  await collections.proposals().insertOne({ ownerId: relay.ownerId, state: "pending", jobId: first._id, sessionId: first.sessionId });
  assert.equal((await status()).state, "Awaiting Decision");
  assert.equal((await status()).jobId, first._id);
  await collections.records().insertOne({ _id: "gate", ownerId: relay.ownerId, status: "active",
    endsAt: new Date(now + 3600_000), reason: "Waiting for owner approval." });
  assert.equal((await status()).state, "Awaiting Decision");
  await Promise.all([controller.signal(relay.ownerId), controller.signal(relay.ownerId)]);
  now += 119_999;
  await controller.reconcile(relay);
  assert.equal((await runs()).length, 1);
  now++;
  await controller.reconcile(relay);
  const second = (await runs())[1];
  assert.equal(second.sessionId, first.sessionId);
  assert.equal(second.executiveTrigger, "event");
  assert.match(second.prompt, /Recorded decision from prior review/);
  assert.equal((await status()).state, "Working", "An owner gate does not block an independent review");
  await collections.jobs().updateOne({ _id: second._id }, { $set: { status: "failed", finishedAt: new Date(now) } });
  now += 899_999;
  await controller.reconcile(relay);
  assert.equal((await runs()).length, 2, "A failed review alone does not start another execution");
  now++;
  await collections.dispatch().updateOne({ _id: relay.ownerId }, { $set: { executivePaused: true } });
  await controller.reconcile(relay);
  assert.equal((await status()).state, "Paused");
  assert.equal((await runs()).length, 2);
  await collections.dispatch().updateOne({ _id: relay.ownerId }, { $set: { executivePaused: false } });
  await controller.reconcile({ ...relay, usage: { observedAt: now, primary: { usedPercent: 100, resetsAt: now / 1000 + 1200 } } });
  assert.equal((await runs()).length, 2, "Subscription hold prevents admission");
  await controller.reconcile({ ...relay, usage: { observedAt: now,
    secondary: { usedPercent: 66, windowDurationMins: 10080, resetsAt: Math.ceil(now / 1000) + 1200 } } });
  assert.equal((await runs()).length, 2, "The weekly budget blocks new executive dispatch");
  await controller.reconcile(relay);
  assert.equal((await runs()).length, 3, "The 15-minute standby review survives an owner pause");
  assert.equal((await runs())[2].executiveTrigger, "interval");
});

test("First Mate claims remain exclusive across relays and a stale lease can be recovered", async t => {
  const fixture = await startTestMongo(t);
  const client = await MongoClient.connect(fixture.uri);
  t.after(() => client.close());
  const db = client.db(fixture.database);
  const ownerId = "a".repeat(24);
  const actor = { id: "first-mate", role: "first-mate", name: "Barnaby" };
  await db.collection("operations_workforce").insertOne({
    _id: actor.id, role: actor.role, name: actor.name, ownerId, kind: "employee",
    status: "available", workspace: "development",
  });

  const app = express();
  app.use(createRouter({ db: () => db, owner: () => ownerId, enabled: () => true, executiveEnabled: true }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const jobs = db.collection("operations_jobs");
  const relays = await Promise.all(["studioActor", "conversationActor"].map(async (actorField, index) => {
    const hostId = randomUUID();
    const token = hostId + "." + "a".repeat(64);
    const instance = randomUUID();
    const id = randomUUID();
    await db.collection("operations_hosts").insertOne({
      _id: hostId, ownerId, instance, revokedAt: null, lastSeen: new Date(),
      profiles: ["read-only"], efforts: ["low"], employeeConversations: true,
      digest: createHash("sha256").update(token).digest("hex"),
    });
    await jobs.insertOne({
      _id: id, ownerId, hostId, [actorField]: actor, status: "queued", effort: "low",
      createdAt: new Date(), eventCount: 0, workspace: "development", profile: "read-only",
      ...(index === 0 ? { executiveReview: true } : {}),
    });
    async function send(operation, fields = {}) {
      const reply = await fetch("http://127.0.0.1:" + server.address().port + "/worker/" + operation, {
        method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
        body: JSON.stringify({ instance, ...fields }),
      });
      assert.equal(reply.status, 200);
      return reply.json();
    }
    return { id, send };
  }));

  const claims = await Promise.all(relays.map(({ send }) => send("claim")));
  assert.equal(claims.filter(Boolean).length, 1);
  const winner = claims.findIndex(Boolean);
  const other = relays[1 - winner];
  assert.equal(await other.send("claim"), null);
  assert.equal((await jobs.findOne({ _id: relays[winner].id })).status, "running");

  await jobs.updateOne({ _id: relays[winner].id }, { $set: { leaseUntil: new Date(0) } });
  await other.send("heartbeat", { efforts: ["low"], profiles: ["read-only"], employeeConversations: true });
  assert.equal((await jobs.findOne({ _id: relays[winner].id })).status, "interrupted");
  assert.equal((await other.send("claim"))._id, other.id);
});

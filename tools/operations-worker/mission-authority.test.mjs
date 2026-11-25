import assert from "node:assert/strict";
import { test } from "node:test";
import missions from "../../src/modules/operations/missions.js";

const id = "30e3fc4b-4e36-463b-bb39-8668497c5341";
const firstMate = { _id: "new-turn", sessionId: "new-session", workspace: "development",
  studioActor: { id: "first-mate" } };

function fixture(overrides = {}) {
  const end = new Date(Date.now() + 60_000);
  let record = { _id: id, ownerId: "owner", hostId: "relay", workspace: "development",
    coordinatorSessionId: "old-session", coordinatorActorId: "first-mate",
    revision: 0, status: "authorized", endsAt: end, current: null, approvals: {},
    steps: [{ key: "implementation", after: [], profile: "full-access", assignee: "forge" },
      { key: "verify", after: [{ step: "implementation", result: "pass" }], profile: "read-only" }],
    results: {}, ...overrides };
  const matches = query => Object.entries(query).every(([key, value]) =>
    key === "$expr" ? record.endsAt > new Date() : record[key] === value);
  const update = (query, operation) => {
    if (!matches(query)) return null;
    record = { ...record, ...operation.$set, revision: record.revision + 1 };
    return record;
  };
  const records = {
    findOne: async query => matches(query) ? record : null,
    findOneAndUpdate: async (query, operation) => update(query, operation),
    updateOne: async (query, operation) => ({ matchedCount: Number(!!update(query, operation)) }),
  };
  return missions.createMissions({ records: () => records, owner: () => "owner",
    hosts: () => ({ findOne: async () => null }),
    jobs: () => ({ findOne: async () => null }),
  });
}

async function call(method, ...args) {
  const response = { code: 200, status(code) { this.code = code; return this; },
    json(body) { return { code: this.code, body }; } };
  return method(...args, response);
}

test("an existing grant follows the bound First Mate across conversations", async () => {
  const { registerFromTurn, inspectFromTurn } = fixture();
  assert.equal((await call(registerFromTurn, firstMate, "other-relay", id)).code, 404);
  assert.equal((await call(registerFromTurn, { ...firstMate, workspace: "workshop" }, "relay", id)).code, 404);
  assert.equal((await call(registerFromTurn, { ...firstMate, studioActor: { id: "replacement" } }, "relay", id)).code, 404);
  const registered = await call(registerFromTurn, firstMate, "relay", id);
  assert.equal(registered.code, 201);
  assert.equal(registered.body.registration.sourceTurnId, "new-turn");
  assert.equal(registered.body.coordinatorSessionId, "old-session");
  const resumed = { ...firstMate, _id: "later-turn", sessionId: "later-session" };
  assert.equal((await call(inspectFromTurn, resumed, "relay", id)).body.revision, 1);
  assert.equal((await call(registerFromTurn, resumed, "relay", id)).body.registration.sourceTurnId, "new-turn");
});

test("blocked recovery requires recorded delegation and preserves the mission's scope and dependent review", async () => {
  const blocked = { status: "blocked", registration: { actorId: "first-mate" },
    results: { implementation: { result: "blocked", jobId: "earlier" }, verify: { result: "skipped" } } };
  const input = { grantId: id, revision: 0, step: "implementation", resolution: "Apply the review findings." };
  assert.equal((await call(fixture(blocked).recoverFromTurn, firstMate, "relay", input)).code, 403);
  const expired = fixture({ ...blocked, delegatedRecoverySteps: ["implementation"],
    delegatedRecoveryEndsAt: new Date(Date.now() - 1) });
  assert.equal((await call(expired.recoverFromTurn, firstMate, "relay", input)).code, 403);
  const used = fixture({ ...blocked, delegatedRecoverySteps: ["implementation"],
    delegatedRecoveryEndsAt: new Date(Date.now() + 120_000), recoveries: [{ step: "implementation" }] });
  assert.equal((await call(used.recoverFromTurn, firstMate, "relay", input)).code, 403);
  const { recoverFromTurn } = fixture({ ...blocked, delegatedRecoverySteps: ["implementation"],
    delegatedRecoveryEndsAt: new Date(Date.now() + 120_000) });
  assert.equal((await call(recoverFromTurn, firstMate, "relay", { ...input, endsAt: new Date().toISOString() })).code, 403);
  const attempts = await Promise.all([call(recoverFromTurn, firstMate, "relay", input),
    call(recoverFromTurn, firstMate, "relay", input)]);
  assert.deepEqual(attempts.map(attempt => attempt.code).sort(), [200, 409]);
  const { body } = attempts.find(attempt => attempt.code === 200);
  assert.equal(body.current.step, "implementation");
  assert.deepEqual(body.results, {});
  assert.equal(body.steps[0].profile, "full-access");
  assert.equal(body.steps[0].assignee, "forge");
  assert.deepEqual(body.steps[1].after, [{ step: "implementation", result: "pass" }]);
  assert.equal(body.recoveries[0].previous.jobId, "earlier");
  assert.equal(body.recoveries[0].sourceTurnId, firstMate._id);
});

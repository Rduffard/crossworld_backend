import assert from "node:assert/strict";
import { test } from "node:test";
import missions from "../../src/modules/operations/missions.js";
import capabilities from "../../src/modules/operations/mission-capabilities.js";

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

test("an owner revision retains recovery delegation only for unchanged steps", async () => {
  const steps = [
    { key: "implementation", title: "Implement", prompt: "Implement the approved change.", profile: "read-only",
      after: [], approval: false, requires: ["read"] },
    { key: "verify", title: "Verify", prompt: "Verify the approved change.", profile: "read-only",
      after: [{ step: "implementation", result: "pass" }], approval: false, requires: ["read"] },
  ];
  const { router } = fixture({ steps, status: "active", completionStep: "verify",
    authorization: capabilities.inheritedAuthorization("full-access"),
    delegatedRecoverySteps: ["implementation", "verify"] });
  const ownerPatch = router.stack.find(layer => layer.route?.methods.patch).route.stack[0].handle;
  const result = await call(ownerPatch, { params: { id }, body: { action: "revise", revision: 0,
    steps: [{ ...steps[0], prompt: "Inspect the revised scope." }, steps[1]] } });
  assert.equal(result.code, 200);
  assert.deepEqual(result.body.delegatedRecoverySteps, ["verify"]);
});

test("an owner revision can redirect skipped pending work after a blocked mobile check", async () => {
  const step = (key, after = [], approval = false) => ({
    key, title: key, prompt: "Check the disposable mobile fixture.", profile: "read-only",
    requires: ["read"], after, approval,
  });
  const hosted = step("hosted-refresh");
  const accessibility = step("narrow-layout");
  const review = step("review", [{ step: hosted.key, result: "pass" }]);
  const decision = step("candidate-decision", [{ step: review.key, result: "pass" }], true);
  const close = step("close", [{ step: decision.key, result: "pass" }]);
  const steps = [hosted, accessibility, review, decision, close];
  const results = {
    [hosted.key]: { result: "blocked", jobId: "hosted-fixture" },
    [accessibility.key]: { result: "pass", jobId: "layout-fixture" },
    [review.key]: { result: "skipped" },
    [decision.key]: { result: "skipped" },
    [close.key]: { result: "skipped" },
  };
  const { router } = fixture({ steps, results, status: "active", completionStep: close.key,
    authorization: capabilities.inheritedAuthorization("full-access") });
  const ownerPatch = router.stack.find(layer => layer.route?.methods.patch).route.stack[0].handle;
  const revise = revised => call(ownerPatch, {
    params: { id }, body: { action: "revise", revision: 0, steps: revised },
  });
  const revisedReview = { ...review, after: [{ step: accessibility.key, result: "pass" }] };
  assert.equal((await revise([{ ...hosted, prompt: "Rewrite executed work." }, accessibility,
    revisedReview, decision, close])).code, 409);
  assert.equal((await revise([hosted, accessibility, revisedReview, { ...decision, approval: false }, close])).code, 409);
  const revised = [hosted, accessibility, revisedReview, decision, close];
  const response = await revise(revised);
  assert.equal(response.code, 200);
  assert.equal(response.body.next, review.key);
  assert.deepEqual(response.body.awaitingApprovals, []);
  assert.deepEqual(response.body.approvals, {});
  assert.deepEqual(response.body.results, {
    [hosted.key]: results[hosted.key],
    [accessibility.key]: results[accessibility.key],
  });
  assert.deepEqual(response.body.planHistory[0].steps, steps);
  assert.equal((await revise(revised)).code, 409);
});

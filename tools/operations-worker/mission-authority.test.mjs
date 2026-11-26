import assert from "node:assert/strict";
import { test } from "node:test";
import missions from "../../src/modules/operations/missions.js";
import capabilities from "../../src/modules/operations/mission-capabilities.js";

const id = "30e3fc4b-4e36-463b-bb39-8668497c5341";
const firstMate = { _id: "new-turn", sessionId: "new-session", workspace: "development",
  studioActor: { id: "first-mate" } };

test("consolidated recovery validates every revision before recording one approval", async t => {
  const endsAt = new Date(Date.now() + 60_000);
  const candidate = "a".repeat(40);
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ sha: candidate }) }));
  const selected = Array.from({ length: 6 }, (_, index) => ({
    _id: id.slice(0, -1) + index, ownerId: "owner", initiativeId: "initiative",
    title: "ENDURANCE - Lane " + index, coordinatorActorId: "first-mate", registration: {},
    startsAt: new Date(), endsAt, revision: 3, status: "blocked", approvals: {},
    authorization: { routes: [{ profile: "read-only", capabilities: ["read"] }] },
    steps: [{ key: "implement", after: [] }, { key: "review", profile: "read-only", reviewer: "trace",
      after: [{ step: "implement", result: "pass" }] },
      { key: "close", approval: true, after: [{ step: "review", result: "pass" }] }],
    results: { implement: { result: "pass" }, review: { result: "blocked" }, close: { result: "skipped" } },
  }));
  const demo = { ...selected[0], _id: "demo", revision: 0, status: "authorized", results: {},
    steps: selected[0].steps.map(step => step.key === "review" ? { ...step, profile: "full-access" } : step) };
  const writes = [];
  const session = { withTransaction: async run => run(), endSession: async () => {} };
  const { router } = missions.createMissions({ owner: () => "owner", startSession: () => session,
    initiatives: () => ({ findOne: async () => ({ _id: "initiative",
      missions: [{ grantId: demo._id, after: selected.map(item => item._id) }] }) }),
    records: () => ({
      findOne: async () => demo,
      find: (query, options) => {
        assert.equal(query.ownerId, "owner");
        assert.equal(options.session, session);
        return { toArray: async () => selected };
      },
      updateOne: async (query, operation, options) => {
        assert.equal(options.session, session);
        writes.push([query, operation.$set]);
        return { matchedCount: 1 };
      },
    }),
  });
  const approve = router.stack.find(layer => layer.route?.path === "/endurance-recovery" &&
    layer.route.methods.post).route.stack[0].handle;
  const entries = selected.map(item => ({ id: item._id, revision: item.revision, step: "review",
    candidate: "crossworld_creative@" + candidate }));
  const stale = entries.map((entry, index) => index ? entry : { ...entry, revision: 2 });
  assert.equal((await call(approve, { body: { missions: stale } })).code, 409);
  assert.equal(writes.length, 0);
  selected[0].steps[1].profile = "full-access";
  const incompatible = await call(approve, { body: { missions: entries } });
  assert.equal(incompatible.code, 409);
  assert.match(incompatible.body.message, /Read Only review/);
  assert.equal(writes.length, 0);
  const approved = await call(approve, { body: { missions: entries, approveReadOnlyReviews: true } });
  assert.equal(approved.code, 200);
  assert.equal(writes.length, 7);
  assert.equal(writes[0][1].steps[1].profile, "read-only");
  assert.deepEqual(writes[0][1].steps[1].requires, ["read"]);
  assert.equal(writes[0][1].planHistory[0].steps[1].profile, "full-access");
  assert.equal(writes[6][1].steps[1].profile, "read-only");
  assert.equal(writes[6][1].status, undefined);
  for (const [, fields] of writes.slice(0, 6)) {
    assert.equal(fields.recoveryApprovalId, approved.body.approvalId);
    assert.equal(fields.current.step, "review");
    assert.equal(fields.endsAt, endsAt);
    assert.equal(fields.delegatedRecoveryEndsAt, endsAt);
    assert.deepEqual(fields.delegatedRecoverySteps, ["implement", "review"]);
    assert.equal(fields.approvedRecoveryCandidate.commit, candidate);
    assert.equal(fields.recoveries[0].previous.result, "blocked");
    assert.equal(Object.hasOwn(fields, "approvals"), false);
  }
});

test("ENDURANCE only queues independent review for a repository-resolvable commit", async t => {
  const candidate = { repository: "crossworld_creative", commit: "a".repeat(40) };
  const host = { _id: "relay", ownerId: "owner", profiles: ["full-access", "read-only"], efforts: ["low"] };
  const implement = { key: "implement", profile: "full-access", after: [] };
  const review = { key: "review", profile: "read-only", reviewer: "trace",
    after: [{ step: "implement", result: "pass" }] };
  const fetch = t.mock.method(globalThis, "fetch", async () => ({ status: 404 }));
  for (const scenario of ["missing", "unavailable", "full-access", "fallback", "outage", "verified recovery",
    "explicit unavailable", "explicit verified"]) {
    const recovered = ["full-access", "fallback", "verified recovery"].includes(scenario);
    const explicit = scenario.startsWith("explicit");
    const before = fetch.mock.callCount();
    if (scenario === "outage") fetch.mock.mockImplementation(async () => ({ status: 503 }));
    if (scenario === "verified recovery") fetch.mock.mockImplementation(async url => {
      if (fetch.mock.callCount() === before) return { status: 429 };
      assert.ok(url.endsWith("/" + candidate.repository + "/git/commits/" + candidate.commit));
      return { ok: true, json: async () => ({ sha: candidate.commit }) };
    });
    if (scenario === "explicit unavailable") fetch.mock.mockImplementation(async () => ({ status: 404 }));
    if (scenario === "explicit verified") fetch.mock.mockImplementation(async () => ({
      ok: true, json: async () => ({ sha: candidate.commit }),
    }));
    const attempts = [];
    const jobs = [];
    const mission = { _id: id, initiativeId: "initiative", title: explicit ? "Candidate review" : "ENDURANCE - Test",
      ...(explicit ? { authorization: { routes: [{ profile: "read-only", capabilities: ["read"] }] } } : {}),
      ownerId: host.ownerId, hostId: host._id, effort: "low", revision: 0, approvals: {},
      current: { step: "review", jobId: "review-job", ...(recovered ? { recoveryJobId: "review-job" } : {}) },
      steps: [implement, { ...review, ...(scenario === "full-access" ? { profile: "full-access" } : {}),
        ...(scenario === "fallback" ? { allowProfileFallback: true } : {}),
        ...(explicit ? { candidate, requires: ["read"] } : {}) }],
      results: { implement: { result: "pass", ...(["unavailable", "outage"].includes(scenario) ? { candidate } : {}) } },
      recoveries: recovered ? [{ jobId: "review-job", previous: {},
        resolution: `CANDIDATE: ${candidate.repository}@${candidate.commit}\nUse the existing handoff.` }] : [],
    };
    const controller = missions.createMissions({
      records: () => ({
        findOne: async () => mission,
        updateMany: async () => {},
        find: () => ({ sort: () => [mission] }),
        updateOne: async (_query, change) => {
          attempts.push(change.$set);
          return { matchedCount: 1 };
        },
      }),
      jobs: () => ({ findOne: async () => null, insertOne: async job => jobs.push(job) }),
      workforce: () => ({ find: () => ({ limit: () => ({ toArray: async () => [{ _id: "trace", role: "qa" }] }) }) }),
    });
    const relay = explicit ? { ...host, missionPreflights: [{ profile: "read-only", capabilities: ["read"],
      observedAt: Date.now(), environment: "windows-account", sandbox: "read-only", runtime: "fixture" }] } : host;
    await controller.reconcile(relay, id);
    if (scenario === "verified recovery" || scenario === "explicit verified") {
      assert.equal(jobs.length, 1);
      assert.deepEqual(jobs[0].reviewCandidate, candidate);
      assert.equal(jobs[0].profile, "read-only");
      assert.match(jobs[0].prompt, new RegExp(candidate.commit));
      const stale = { ...jobs[0], reviewCandidate: { ...candidate, commit: "b".repeat(40) } };
      assert.match((await controller.admit(stale, relay)).candidateRejection, /differs from the mission handoff/);
      if (explicit) {
        assert.equal(jobs[0].requiresMissionPreflight, true);
        assert.equal(await controller.admit(jobs[0], host), false);
        assert.equal(await controller.admit({ ...jobs[0], profile: "full-access" }, relay), false);
        const admission = await controller.admit(jobs[0], relay);
        assert.deepEqual(admission.authorizedCapabilities, ["read"]);
        assert.deepEqual(admission.verifiedCapabilities, ["read"]);
        const legacy = { ...jobs[0] };
        delete legacy.reviewCandidateVerified;
        fetch.mock.mockImplementation(async () => ({ status: 404 }));
        assert.match((await controller.admit(legacy, relay)).candidateRejection, /unavailable/);
        fetch.mock.mockImplementation(async () => ({ status: 503 }));
        assert.equal((await controller.admit(legacy, relay)).retryCandidate, true);
        fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => ({ sha: candidate.commit }) }));
        assert.deepEqual((await controller.admit(legacy, relay)).verifiedCapabilities, ["read"]);
      }
    } else {
      assert.equal(jobs.length, 0);
      assert.equal(attempts[0].results.review.result, "blocked");
      const reason = attempts[0].results.review.reason;
      if (scenario === "outage") assert.match(reason, /verification failed twice/);
      if (["full-access", "fallback"].includes(scenario)) assert.match(reason, /Read Only route/);
    }
  }
  assert.equal(fetch.mock.callCount(), 11);
});

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

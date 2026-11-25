import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Bug = require("../../src/modules/squash/bugs/model");
const Project = require("../../src/modules/squash/projects/model");
const Comment = require("../../src/modules/squash/comments/model");
const { updateQuality, qualityProblem } = require("../../src/modules/squash/bugs/quality");
const { getComments, createComment } = require("../../src/modules/squash/comments/controller");

function response() {
  return { code: 200, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

test("quality workflow requires correction before retest and evidence before verification", () => {
  assert.match(qualityProblem("triage", "verified", "evidence"), /unavailable/);
  assert.equal(qualityProblem("correction", "retest", ""), null);
  assert.match(qualityProblem("retest", "verified", ""), /evidence/);
  assert.equal(qualityProblem("retest", "verified", "Browser run passed."), null);
  assert.equal(qualityProblem("closed", "reopened", "Regression reproduced."), null);
});

test("quality writes are project-owner scoped and atomically match the prior revision", async t => {
  const owner = "111111111111111111111111";
  const bugId = "222222222222222222222222";
  const projectId = "333333333333333333333333";
  const bug = { _id: bugId, projectId, status: "in_progress", quality: { state: "retest", revision: 2 } };
  t.mock.method(Bug, "findById", id => {
    assert.equal(id, bugId);
    return { lean: async () => bug };
  });
  t.mock.method(Project, "exists", async query => query.owner === owner && query._id === projectId);
  let writes = 0;
  t.mock.method(Bug, "findOneAndUpdate", (query, update) => {
    writes++;
    assert.deepEqual(query, { _id: bugId, projectId, "quality.revision": 2 });
    assert.equal(update.$set.status, "resolved");
    assert.equal(update.$set.priority, "medium");
    assert.equal(update.$set["quality.severity"], "major");
    assert.equal(update.$push["quality.history"].actor, owner);
    return { lean: async () => ({ ...bug, status: update.$set.status }) };
  });
  const body = { state: "verified", severity: "major", priority: "medium", revision: 2, reason: "Fixture passed." };
  const send = async (account, data) => {
    const res = response();
    await updateQuality({ user: { _id: account }, params: { bugId }, body: data }, res, error => { throw error; });
    return res;
  };
  assert.equal((await send("other", body)).code, 404);
  assert.equal((await send(owner, { ...body, revision: 1 })).code, 409);
  assert.equal((await send(owner, { ...body, reason: "" })).code, 400);
  assert.equal((await send(owner, body)).body.status, "resolved");
  assert.equal(writes, 1);
});

test("private defect comments reject accounts outside the project before reaching comment storage", async t => {
  const bugId = "222222222222222222222222";
  const account = "444444444444444444444444";
  t.mock.method(Bug, "findById", () => ({ select: () => ({ lean: async () => ({ projectId: bugId }) }) }));
  t.mock.method(Project, "exists", async query => {
    assert.deepEqual(query.$or, [{ owner: account }, { members: account }]);
    return null;
  });
  t.mock.method(Comment, "find", () => assert.fail("Private comment enumeration"));
  t.mock.method(Comment, "create", () => assert.fail("Private comment write"));
  const request = { user: { _id: account }, query: { bugId }, body: { bugId, text: "Fixture" } };
  for (const handler of [getComments, createComment]) {
    let error;
    await handler(request, response(), result => { error = result; });
    assert.equal(error.statusCode, 404);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { startHttp, stopHttp } from "../helpers/http.mjs";
import reporting from "../../src/modules/operations/reporting.js";

const uid = value => "11111111-1111-4111-8111-" + String(value).padStart(12, "0");
const employee = (_id, supervisorId = null, role = "worker", status = "available") =>
  ({ _id, supervisorId, role, status, revision: 0 });

test("reporting validation detects arbitrary-depth cycles, self-supervision and invalid supervisors", () => {
  const first = employee(uid(1));
  const branch = [employee(uid(2), first._id), employee(uid(3), uid(2)), employee(uid(4), uid(3))];
  const retired = employee(uid(5), null, "lead", "retired");
  const directory = new Map([first, ...branch, retired].map(row => [row._id, row]));
  assert.match(reporting.reportingProblem(first, uid(4), directory), /cycle/);
  assert.match(reporting.reportingProblem(first, first._id, directory), /cycle/);
  assert.match(reporting.reportingProblem(first, retired._id, directory), /unavailable/);
  assert.match(reporting.reportingProblem(first, uid(6), directory), /unavailable/);
  assert.match(reporting.reportingProblem(employee(uid(7), null, "first-mate"), first._id, directory), /owner/);
  assert.equal(reporting.reportingProblem(branch[2], first._id, directory), null);
});

test("reporting writes require transaction scope and an idle employee and preserve history", async t => {
  const ownerId = "owner-fixture";
  const child = employee(uid(1));
  const leader = employee(uid(2));
  let activeRun = true;
  const session = { async withTransaction(task) { await task(); }, async endSession() {} };
  let history;
  const records = {
    find(filter, options) {
      assert.equal(filter.ownerId, ownerId);
      assert.equal(options.session, session);
      return { toArray: async () => [child, leader] };
    },
    async findOne(filter, options) {
      assert.equal(filter.ownerId, ownerId);
      assert.equal(options.session, session);
      return null;
    },
    async updateOne(filter, update, options) {
      assert.equal(filter.ownerId, ownerId);
      if (filter.kind === "reporting-lock") {
        if (!options.upsert) assert.equal(options.session, session);
        return { matchedCount: 1 };
      }
      assert.equal(options.session, session);
      assert.equal(filter.revision, child.revision);
      child.supervisorId = update.$set.supervisorId;
      child.revision += update.$inc.revision;
      history = update.$push.reportingChanges;
      return { matchedCount: 1 };
    },
  };
  const app = express();
  app.use(express.json(), reporting.createReporting({
    records: () => records, owner: () => ownerId, startSession: () => session,
    jobs: () => ({ async findOne(filter, options) {
      assert.equal(filter.ownerId, ownerId);
      assert.equal(options.session, session);
      return activeRun ? {} : null;
    } }),
  }));
  const server = await startHttp(app);
  t.after(() => stopHttp(server));
  const url = "http://127.0.0.1:" + server.address().port + "/employees/" + child._id + "/supervisor";
  const patch = (supervisorId, revision) => fetch(url, { method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ supervisorId, revision }) });
  assert.equal((await patch(leader._id, 0)).status, 409);
  activeRun = false;
  assert.equal((await patch(uid(7), 0)).status, 400);
  assert.equal((await patch(leader._id, 0)).status, 204);
  assert.equal(child.supervisorId, leader._id);
  assert.deepEqual({ from: history.from, to: history.to, actor: history.actor }, { from: null, to: leader._id, actor: "owner" });
  assert.equal((await patch(null, 0)).status, 409);
});

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { startHttp, stopHttp } from "../helpers/http.mjs";
import ops from "../../src/modules/operations/routes.js";

test("artifact review is owner-only, revision-checked and works when the source is offline", async t => {
  const ownerId = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const outsider = "bbbbbbbbbbbbbbbbbbbbbbbb";
  const id = "11111111-1111-4111-8111-111111111111";
  const foreign = { _id: "22222222-2222-4222-8222-222222222222", ownerId: outsider, state: "ready" };
  const unfinished = { _id: "33333333-3333-4333-8333-333333333333", ownerId, state: "uploading" };
  const item = { _id: id, ownerId, state: "ready", name: "Candidate.webp", createdAt: new Date() };
  const all = [item, foreign, unfinished];
  let writes = 0;
  const collection = {
    async findOne(query) { return all.find(row => row._id === query._id && row.ownerId === query.ownerId); },
    async findOneAndUpdate(query, update, options) {
      assert.equal(options.returnDocument, "after");
      const row = all.find(record => record._id === query._id && record.ownerId === query.ownerId && record.state === query.state);
      const revision = query["review.revision"];
      if (!row || (revision.$exists === false ? !!row.review : row.review?.revision !== revision)) return null;
      writes++;
      return Object.assign(row, { review: { state: update.$set["review.state"], revision: update.$set["review.revision"],
        history: [...(row.review?.history || []), update.$push["review.history"]] } });
    },
  };
  const app = express();
  app.use("/operations", ops.createRouter({
    owner: () => ownerId,
    enabled: () => true,
    authenticate(req, res, next) {
      const account = req.get("x-test-account");
      if (!account) return res.sendStatus(401);
      req.user = { _id: account };
      next();
    },
    db: () => ({ collection(name) {
      assert.equal(name, "operations_media", "review must not contact a device or another collection");
      return collection;
    } }),
  }));
  const server = await startHttp(app);
  t.after(() => stopHttp(server));
  const base = "http://127.0.0.1:" + server.address().port + "/operations/media/";
  const request = (record, account, body) => fetch(base + record + "/review", { method: "PATCH", headers: {
    "content-type": "application/json", ...(account ? { "x-test-account": account } : {}),
  }, body: JSON.stringify(body) });
  const accept = { state: "approved", revision: 0, feedback: "Candidate accepted for review." };
  assert.equal((await request(id, null, accept)).status, 401);
  assert.equal((await request(id, outsider, accept)).status, 403);
  assert.equal((await request(foreign._id, ownerId, accept)).status, 404);
  assert.equal((await request(unfinished._id, ownerId, accept)).status, 409);
  assert.equal((await request(id, ownerId, { ...accept, state: "published" })).status, 400);
  const initial = await fetch(base + id, { headers: { "x-test-account": ownerId } }).then(response => response.json());
  assert.deepEqual(initial.review, { state: "pending", revision: 0, history: [] });
  const results = await Promise.all([request(id, ownerId, accept), request(id, ownerId, accept)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(writes, 1);
  const saved = await results.find(result => result.ok).json();
  assert.equal(saved.review.revision, 1);
  assert.equal(saved.review.history[0].actor, "owner");
  assert.equal(saved.review.history[0].feedback, accept.feedback);
  assert.equal((await request(id, ownerId, { state: "changes-requested", revision: 1 })).status, 200);
  assert.equal(item.review.history.length, 2);
});

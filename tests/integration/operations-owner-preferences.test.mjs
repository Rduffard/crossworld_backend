import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { startHttp, stopHttp } from "../helpers/http.mjs";
import ops from "../../src/modules/operations/routes.js";

test("owner account preference uses optimistic revisions and never alters workforce policy", async t => {
  const owner = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const other = "bbbbbbbbbbbbbbbbbbbbbbbb";
  let record;
  const collection = {
    async findOne(query) { assert.equal(query._id, owner); return record; },
    async findOneAndUpdate(query, update, options) {
      assert.equal(query._id, owner);
      assert.equal(options.returnDocument, "after");
      if (record && query.revision !== record.revision) {
        if (options.upsert) throw Object.assign(new Error("duplicate"), { code: 11000 });
        return null;
      }
      record = { ...update.$set, revision: (record?.revision || 0) + update.$inc.revision };
      return record;
    },
  };
  const app = express();
  app.use("/operations", ops.createRouter({
    owner: () => owner, enabled: () => true,
    authenticate(req, res, next) {
      req.user = { _id: req.get("x-account") };
      next();
    },
    db: () => ({ collection(name) { assert.equal(name, "operations_owner_preferences"); return collection; } }),
  }));
  const server = await startHttp(app);
  t.after(() => stopHttp(server));
  const url = "http://127.0.0.1:" + server.address().port + "/operations/owner-preferences";
  const request = (account, body) => fetch(url, {
    method: body ? "PATCH" : "GET", headers: { "x-account": account, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal((await request(other)).status, 403);
  assert.deepEqual(await (await request(owner)).json(), { directDevelopmentProfile: null, revision: 0 });
  assert.equal((await request(owner, { directDevelopmentProfile: "workshop", revision: 0 })).status, 400);
  const requested = { directDevelopmentProfile: "full-access", revision: 0 };
  const concurrent = await Promise.all([request(owner, requested), request(owner, requested)]);
  assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
  assert.deepEqual(await (await request(owner)).json(), { directDevelopmentProfile: "full-access", revision: 1 });
});

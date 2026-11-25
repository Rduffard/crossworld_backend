import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import operations from "../../src/modules/operations/routes.js";

test("Internal correspondence requires the owner, validates routing and revision-checks archive changes", async () => {
  const ownerId = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const outsider = "bbbbbbbbbbbbbbbbbbbbbbbb";
  const departmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const foreignDepartmentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const departments = [
    { _id: departmentId, ownerId, kind: "department", name: "Engineering" },
    { _id: foreignDepartmentId, ownerId: outsider, kind: "department", name: "Unrelated department" },
  ];
  const correspondence = [{ _id: foreignDepartmentId, ownerId: outsider, state: "open", revision: 0, subject: "Private" }];
  const matches = (entry, filter) => Object.entries(filter).every(([key, value]) => entry[key] === value);
  const collections = {
    operations_workforce: {
      async findOne(filter) { return departments.find(entry => matches(entry, filter)); },
      find(filter) {
        return { sort: () => ({ toArray: async () => departments.filter(entry => matches(entry, filter))
          .map(({ _id, name }) => ({ _id, name })) }) };
      },
    },
    operations_correspondence: {
      async insertOne(record) {
        if (correspondence.some(entry => entry._id === record._id)) throw Object.assign(new Error("Duplicate fixture key"), { code: 11000 });
        correspondence.push(record);
      },
      async findOne(filter) { return correspondence.find(entry => matches(entry, filter)); },
      find(filter) {
        return { sort: () => ({ limit: () => ({
          toArray: async () => correspondence.filter(entry => matches(entry, filter)).map(({ ownerId: _owner, ...entry }) => entry),
        }) }) };
      },
      async updateOne(filter, update) {
        const entry = correspondence.find(item => matches(item, filter));
        if (!entry) return { matchedCount: 0 };
        Object.assign(entry, update.$set);
        entry.revision += update.$inc.revision;
        return { matchedCount: 1 };
      },
    },
  };
  const app = express();
  app.use("/operations", operations.createRouter({
    enabled: () => true,
    owner: () => ownerId,
    authenticate(req, res, next) {
      const user = req.get("x-fixture-user");
      if (!user) return res.sendStatus(401);
      req.user = { _id: user };
      return next();
    },
    db: () => ({ collection(name) { return collections[name]; } }),
  }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}/operations/communications`;
    assert.equal((await fetch(endpoint)).status, 401);
    assert.equal((await fetch(endpoint, { headers: { "x-fixture-user": outsider } })).status, 403);
    const request = (path = "", method = "GET", body) => fetch(endpoint + path, {
      method, headers: { "x-fixture-user": ownerId, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const message = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", kind: "review-request", subject: "Inspect candidate", message: "Review against the original requirements." };
    assert.equal((await request("", "POST", { ...message, departmentId: foreignDepartmentId })).status, 400);
    const created = await request("", "POST", { ...message, departmentId, author: "forged", ownerId: outsider });
    assert.equal(created.status, 201);
    const { _id } = await created.json();
    assert.equal((await request("", "POST", { ...message, departmentId })).status, 200);
    assert.equal((await request("", "POST", { ...message, subject: "Different", departmentId })).status, 409);
    assert.equal((await request("", "POST", { ...message, id: foreignDepartmentId, departmentId })).status, 409);
    const inbox = await request().then(response => response.json());
    assert.deepEqual(inbox.departments, [{ _id: departmentId, name: "Engineering" }]);
    assert.deepEqual(inbox.mailbox, { state: "disconnected" });
    assert.equal(inbox.messages.length, 1);
    assert.equal(inbox.messages[0].author, "owner");
    assert.equal(inbox.messages[0].departmentId, departmentId);
    assert.equal((await request("/" + foreignDepartmentId, "PATCH", { state: "archived", revision: 0 })).status, 409);
    assert.equal((await request("/" + _id, "PATCH", { state: "archived", revision: 0 })).status, 204);
    assert.equal((await request("/" + _id, "PATCH", { state: "open", revision: 0 })).status, 409);
    assert.deepEqual((await request().then(response => response.json())).messages, []);
    const archive = await request("?state=archived").then(response => response.json());
    assert.equal(archive.messages[0]._id, _id);
    assert.equal(archive.messages[0].revision, 1);
    assert.equal((await request("?before=invalid&beforeId=" + _id)).status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

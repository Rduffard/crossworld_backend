import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import mongoose from "mongoose";
import routes from "../../src/modules/operations/routes.js";
import governanceModule from "../../src/modules/operations/github-governance.js";
import { isMcpConfirmation } from "./codex.mjs";

const { createRouter } = routes;
const { createGovernance } = governanceModule;
const ownerId = "1".repeat(24);
const db = await mongoose.createConnection("mongodb://127.0.0.1:27017", {
  dbName: `operations_governance_${randomUUID().replaceAll("-", "")}`, serverSelectionTimeoutMS: 4000,
}).asPromise();
const requests = () => db.db.collection("operations_github_requests");
const policies = () => db.db.collection("operations_github_policies");
const repository = "example/disposable";
const job = { _id: randomUUID(), sessionId: randomUUID(), ownerId };
const host = { _id: randomUUID(), label: "Mock worker" };
const intent = { operation: "push", repository, branch: "development/test", headSha: "a".repeat(40),
  baseSha: "b".repeat(40), changes: "Disposable candidate", tests: "unit tests passed" };
let calls = 0;
let changed = false;
let canPublish = false;
const adapter = {
  async inspect(request) {
    return { headSha: changed ? "c".repeat(40) : request.headSha, baseSha: request.baseSha, safe: !canPublish };
  },
  async perform() { calls++; },
};
const broker = createGovernance({ requests, policies, repositories: () => [repository], adapter,
  toolAdapter: { inspect: async () => ({ safe: true }), perform: async () => { calls++; } },
});
const app = express();
app.use("/operations", createRouter({
  workerEnabled: false,
  db: () => db.db, owner: () => ownerId, enabled: () => true,
  authenticate: (req, _res, next) => { req.user = { _id: req.get("x-test-user") }; next(); },
}));
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const api = async (path, body, id = ownerId) => fetch(`http://127.0.0.1:${server.address().port}/operations${path}`, {
  method: body ? "POST" : "GET",
  headers: { "x-test-user": id, "content-type": "application/json" },
  body: body ? JSON.stringify(body) : undefined,
});

try {
  const propose = (overrides) => broker.propose(job, host, { ...intent, ...overrides });
  const decide = (record, choice = "approve", fingerprint = record.fingerprint) =>
    broker.decide(ownerId, job._id, record._id, choice, fingerprint);
  const run = (record) => broker.execute(ownerId, record._id);
  const request = await propose();
  assert.equal(request.state, "pending");
  assert.equal((await broker.list(ownerId))[0]._id, request._id);
  assert.equal(await run(request), "unavailable");
  assert.equal(await decide(request, "approve", "0".repeat(64)), false);
  assert.deepEqual((await Promise.all([decide(request), decide(request)])).sort(), [false, true]);
  assert.deepEqual((await Promise.all([run(request), run(request)])).sort(), ["completed", "unavailable"]);
  assert.equal(calls, 1);

  for (const operation of ["npmPublish", "packagePublish", "release", "releaseTag", "visibility", "secrets",
    "permissions", "deleteRepository", "bypassProtection", "unknown"]) {
    assert.equal((await propose({ operation })).state, "blocked");
  }
  assert.equal((await propose({ repository: "outside/allowlist" })).state, "blocked");
  const local = await propose({ operation: "localCommit" });
  assert.equal(local.state, "authorized");
  assert.equal(await run(local), "completed");
  const denied = await propose();
  assert.equal(await decide(denied, "deny"), true);
  assert.equal(await run(denied), "unavailable");
  const expired = await propose();
  await requests().updateOne({ _id: expired._id }, { $set: { expiresAt: new Date(0) } });
  assert.equal(await decide(expired), false);
  assert.equal((await broker.list(ownerId)).find(({ _id }) => _id === expired._id).state, "expired");

  const stale = await propose();
  assert.equal(await decide(stale), true);
  changed = true;
  assert.equal(await run(stale), "blocked");
  changed = false;
  const indirect = await propose();
  assert.equal(await decide(indirect), true);
  canPublish = true;
  assert.equal(await run(indirect), "blocked");
  assert.equal(calls, 2);

  const previousPolicy = await propose();
  assert.equal(await decide(previousPolicy), true);
  assert.equal(await broker.configure(ownerId, 0, { push: "allow" }), 400);
  assert.equal(await broker.configure(ownerId, 0, { push: "block", localCommit: "ask" }), 204);
  assert.equal(await broker.configure(ownerId, 0, { push: "ask" }), 409);
  assert.equal(await run(previousPolicy), "policy-changed");
  assert.equal((await propose()).state, "blocked");
  assert.equal((await propose({ operation: "localCommit" })).state, "pending");
  assert.equal((await policies().findOne({ _id: ownerId })).audit[0].type, "policy.changed");
  const workshopJob = { ...job, workspace: "workshop", profile: "workshop", workerRole: "direct" };
  const tool = { operation: "mcpTool", tool: "aseprite.add_frame", arguments: { filename: "sprite/test.aseprite" } };
  assert.equal((await broker.propose(workshopJob, host, tool)).state, "blocked");
  assert.equal(await broker.configure(ownerId, 1, {}, { "direct:workshop:blender.execute_blender_code": "allow" }), 400);
  assert.equal(await broker.configure(ownerId, 1, {}, { "direct:workshop:aseprite.add_frame": "allow" }), 204);
  assert.equal(await broker.propose(workshopJob, host, { ...tool, arguments: { filename: "../production.aseprite" } }), null);
  assert.equal(await broker.propose({ ...workshopJob, profile: "read-only" }, host, tool), null);
  assert.equal((await broker.propose({ ...workshopJob, workerRole: "other" }, host, tool)).state, "blocked");
  assert.equal(await run(await broker.propose(workshopJob, host, tool)), "completed");
  assert.equal(await broker.configure(ownerId, 2, {}, { "direct:workshop:aseprite.add_frame": "ask" }), 204);
  const toolApproval = await broker.propose(workshopJob, host, tool);
  assert.equal(toolApproval.state, "pending");
  assert.ok(await decide(toolApproval));
  assert.equal(await run(toolApproval), "completed");
  const confirmation = { serverName: "verified", mode: "form", requestedSchema: { type: "object", properties: {} } };
  const verify = (server) => server === "verified";
  assert.ok(isMcpConfirmation(confirmation, verify));
  assert.equal(isMcpConfirmation({ ...confirmation, mode: "url" }, verify), false);
  assert.equal(isMcpConfirmation(confirmation, () => false), false);
  assert.equal(isMcpConfirmation({ ...confirmation, requestedSchema: { type: "object", properties: { password: {} } } }, verify), false);

  const [status, registered] = await api("/hosts", { label: "Test host" }).then(async (response) => [response.status, await response.json()]);
  assert.equal(status, 201);
  const worker = (path, body) => fetch(`http://127.0.0.1:${server.address().port}/operations/worker${path}`, {
    method: "POST", headers: { authorization: `Bearer ${registered.token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const instance = randomUUID();
  assert.equal((await worker("/heartbeat", { instance, efforts: ["low"] })).status, 200);
  assert.equal(await (await worker("/claim", { instance })).json(), null);
  assert.equal((await worker(`/jobs/${job._id}/github-request`, { instance, intent })).status, 423);
  assert.equal((await api("/jobs", {})).status, 423);
  const governance = await (await api("/approvals")).json();
  assert.equal(governance.githubEnabled, false);
  assert.equal(governance.workerEnabled, false);
  assert.equal((await api("/approvals", null, "2".repeat(24))).status, 403);
  console.log("GitHub and MCP governance, confirmation classification, and optional worker pause PASS");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await db.dropDatabase();
  await db.close();
}

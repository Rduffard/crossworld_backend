const express = require("express");
const mongoose = require("mongoose");
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const auth = require("../../core/middleware/auth");
const { createGovernance } = require("./github-governance");

const workspaces = ["development", "workshop"];
const profiles = ["read-only", ...workspaces];
const terminal = ["completed", "failed", "cancelled", "interrupted"];
const leaseMs = 45_000;
const deviceHash = (token) => createHash("sha256").update(token).digest("hex");
const uuid = (value) => typeof value === "string" && /^[a-f\d-]{36}$/.test(value);
const text = (value, max) => typeof value === "string" && value.length <= max;
const future = (value, max) => Number.isSafeInteger(value) && value <= Date.now() + max;
const ownerAllowed = (owner, user) =>
  /^[a-f\d]{24}$/.test(owner || "") && owner === user?._id;
const online = (host) => !host.revokedAt && Date.now() - Number(host.lastSeen) < 15_000;
const reject = (res, status, message) => res.status(status).json({ message });
function jobView(job) {
  if (job.leaseUntil <= new Date() && ["running", "cancelling"].includes(job.status)) {
    job = { ...job, status: "interrupted", error: "Worker lease expired." };
  }
  if (job.approval?.state === "pending" && (job.status !== "running" || job.approval.expiresAt <= Date.now())) {
    job = { ...job, approval: { ...job.approval, state: "expired" } };
  }
  if (job.instruction && !["accepted", "rejected", "uncertain"].includes(job.instruction.state) &&
      (job.status !== "running" || job.instruction.expiresAt <= Date.now())) {
    job = { ...job, instruction: { ...job.instruction, state: "uncertain" } };
  }
  return job;
}

function createRouter({
  db = () => mongoose.connection.db,
  owner = () => process.env.OPERATIONS_OWNER_ID,
  enabled = () => (process.env.JWT_SECRET || "").length >= 32 &&
    process.env.JWT_SECRET !== "super-strong-secret",
  authenticate = auth,
  reportError = () => {},
  workerEnabled = true,
  githubTestAdapter,
  mcpTestAdapter,
  repositories = () => (process.env.OPERATIONS_GITHUB_REPOSITORIES || "").split(",").map((name) => name.trim().toLowerCase()).filter(Boolean),
} = {}) {
  const router = express.Router();
  const hosts = () => db().collection("operations_hosts");
  const jobs = () => db().collection("operations_jobs");
  const governance = createGovernance({
    requests: () => db().collection("operations_github_requests"),
    policies: () => db().collection("operations_github_policies"),
    repositories,
    adapter: githubTestAdapter,
    toolAdapter: mcpTestAdapter,
  });
  let indexes;
  function ensureIndexes() {
    indexes ||= Promise.all([
      jobs().createIndex({ activeHost: 1 }, {
        unique: true, partialFilterExpression: { activeHost: { $type: "string" } },
      }),
      jobs().createIndex({ successorOf: 1 }, {
        unique: true, partialFilterExpression: { successorOf: { $type: "string" } },
      }),
    ]).catch((error) => { indexes = undefined; throw error; });
    return indexes;
  }
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!enabled() || !/^[a-f\d]{24}$/.test(owner() || "")) {
      return reject(res, 404, "Operations is unavailable.");
    }
    next();
  });

  const worker = express.Router();
  worker.use(async (req, res, next) => {
    const token = /^Bearer ([a-f\d-]{36}\.[a-f\d]{64})$/.exec(req.get("authorization") || "")?.[1];
    if (!token) return reject(res, 401, "Device credential required.");
    const host = await hosts().findOne({
      _id: token.split(".")[0], digest: deviceHash(token), ownerId: owner(), revokedAt: null,
    });
    if (!host) return reject(res, 403, "Device revoked or unknown.");
    req.operationsHost = host;
    next();
  });
  worker.use(express.json({ limit: "100kb" }));
  worker.post("/heartbeat", async (req, res) => {
    const { efforts, instance, profiles: supported = ["read-only"] } = req.body || {};
    if (!uuid(instance) || !Array.isArray(efforts) || !efforts.length || efforts.length > 8 ||
        efforts.some((effort) => !["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"].includes(effort)) ||
        !Array.isArray(supported) || supported.length > profiles.length || supported.some((entry) => !profiles.includes(entry))) {
      return reject(res, 400, "Invalid worker capabilities.");
    }
    const now = new Date();
    const host = await hosts().findOneAndUpdate({
      _id: req.operationsHost._id, revokedAt: null,
      $or: [{ instance }, { lastSeen: { $lt: new Date(+now - leaseMs) } }, { lastSeen: null }],
    }, { $set: { instance, efforts, profiles: supported, lastSeen: now } }, { returnDocument: "after" });
    if (!host) return reject(res, 409, "Another worker instance holds this device lease.");
    await jobs().updateMany({
      ownerId: owner(), activeHost: host._id, leaseUntil: { $lte: now },
    }, {
      $set: { status: "interrupted", finishedAt: now, error: "Worker lease expired." },
      $unset: { activeHost: "" },
    });
    res.json({ ok: true });
  });

  worker.post("/claim", async (req, res) => {
    if (!workerEnabled) return res.json(null);
    const instance = req.body?.instance;
    if (!uuid(instance) || req.operationsHost.instance !== instance || !online(req.operationsHost)) {
      return reject(res, 409, "Worker heartbeat required.");
    }
    await ensureIndexes();
    const scope = { ownerId: owner(), hostId: req.operationsHost._id };
    let job = await jobs().findOne({ ...scope, activeHost: req.operationsHost._id, instance });
    if (!job) {
      const blocked = await jobs().find({ ...scope, status: "waiting" }).sort({ createdAt: 1 }).limit(50).toArray();
      for (const child of blocked) {
        const parent = await jobs().findOne({ _id: child.parentId, ...scope });
        if (parent && !terminal.includes(jobView(parent).status)) continue;
        const next = parent?.status === "completed" && parent.codexThreadId
          ? { status: "queued", codexThreadId: parent.codexThreadId }
          : { status: "interrupted", error: "Preceding turn did not complete.", finishedAt: new Date() };
        await jobs().updateOne({ _id: child._id, ...scope, status: "waiting" }, {
          $set: next, ...(next.status === "interrupted" ? { $unset: { successorOf: "" } } : {}),
        });
      }
      try {
        job = await jobs().findOneAndUpdate({
          ...scope, status: "queued",
          $or: [{ profile: { $exists: false } }, { profile: { $in: req.operationsHost.profiles || ["read-only"] } }],
        }, { $set: {
          status: "running", instance, activeHost: req.operationsHost._id,
          leaseUntil: new Date(Date.now() + leaseMs), startedAt: new Date(),
        } }, { sort: { createdAt: 1 }, returnDocument: "after" });
      } catch (error) {
        if (error.code !== 11000) throw error;
        job = await jobs().findOne({ ...scope, activeHost: req.operationsHost._id, instance });
      }
    }
    if (!job) return res.json(null);
    const { _id, prompt, model, effort, workspace, profile, codexThreadId, status, eventCount } = job;
    res.json({ _id, prompt, model, effort, workspace, profile, codexThreadId, status, eventCount });
  });

  worker.post("/jobs/:id/sync", async (req, res) => {
    const { instance, offset, events, result, control = {} } = req.body || {};
    const { turn, approval, steering } = control || {};
    if (!uuid(req.params.id) || !uuid(instance) || req.operationsHost.instance !== instance ||
        !Number.isInteger(offset) || offset < 0 ||
        !Array.isArray(events) || events.length > 12 || offset + events.length > 401 ||
        events.some((event) => !event || !["activity", "execution", "response"].includes(event.view) ||
          typeof event.label !== "string" || event.label.length > 120 ||
          typeof event.text !== "string" || event.text.length > 8000) ||
        (result && (!terminal.includes(result.status) || typeof result.error !== "string" ||
          result.error.length > 2000 || (result.threadId != null && !uuid(result.threadId)))) ||
        (turn && (!uuid(turn.threadId) || !text(turn.turnId, 128) || !turn.turnId)) ||
        (approval && (!uuid(approval.id) || !["pending", "approved", "denied", "expired"].includes(approval.state) ||
          !future(approval.expiresAt, 100_000) || !text(approval.operation, 4000) ||
          !text(approval.paths, 4000) || !text(approval.reason, 2000) || typeof approval.canApprove !== "boolean")) ||
        (steering && (!uuid(steering.id) || !["sending", "accepted", "rejected", "uncertain"].includes(steering.state)))) {
      return reject(res, 400, "Invalid job update.");
    }
    const query = { _id: req.params.id, ownerId: owner(), hostId: req.operationsHost._id, instance };
    const current = await jobs().findOne(query, {
      projection: { status: 1, eventCount: 1, instruction: 1, decision: 1, codexThreadId: 1 },
    });
    if (!current) return reject(res, 404, "Job assignment not found.");
    if (terminal.includes(current.status)) return res.json(current);
    if (!workerEnabled) {
      await jobs().updateOne({ ...query, status: "running" }, { $set: { status: "cancelling" } });
      if (!result) return res.json({ status: "cancelling", eventCount: current.eventCount });
      current.status = "cancelling";
    }
    const update = { $set: { leaseUntil: new Date(Date.now() + leaseMs) } };
    if (turn) {
      update.$set.activeTurn = { turnId: turn.turnId, threadId: turn.threadId };
      update.$set.codexThreadId = turn.threadId;
    }
    if (approval) {
      update.$set.approval = {
        id: approval.id, state: approval.state, expiresAt: approval.expiresAt,
        operation: approval.operation, paths: approval.paths, reason: approval.reason, canApprove: approval.canApprove,
      };
    }
    if (steering?.id && steering.id === current.instruction?.id) update.$set["instruction.state"] = steering.state;
    if (events.length && offset === current.eventCount) {
      update.$push = { events: { $each: events.map(({ view, label, text }) => ({
        view, label, text, at: new Date(),
      })) } };
      update.$inc = { eventCount: events.length };
    } else if (offset > current.eventCount || offset + events.length > current.eventCount) {
      return reject(res, 409, "Event sequence mismatch.");
    }
    if (result) {
      Object.assign(update.$set, {
        status: result.status, error: result.error,
        codexThreadId: result.threadId || current.codexThreadId || null, finishedAt: new Date(),
      });
      update.$unset = { activeHost: "" };
    }
    const saved = await jobs().findOneAndUpdate({
      ...query, status: current.status, eventCount: current.eventCount,
      leaseUntil: { $gt: new Date() },
    }, update, { projection: { status: 1, eventCount: 1 }, returnDocument: "after" });
    if (!saved) return reject(res, 409, "Job lease or status changed. Retry sync.");
    const decision = current.decision?.id === approval?.id && approval?.state === "pending"
      ? current.decision : undefined;
    const instruction = current.instruction?.state === "pending" && current.instruction.id !== steering?.id
      ? current.instruction : undefined;
    res.json({ ...saved, decision, instruction });
  });
  worker.post(["/jobs/:id/github-request", "/jobs/:id/operation-request"], async (req, res) => {
    if (!workerEnabled) return reject(res, 423, "Worker execution is paused.");
    const host = req.operationsHost;
    const job = await jobs().findOne({
      _id: req.params.id, ownerId: owner(), hostId: host._id, activeHost: host._id,
      instance: host.instance, status: "running", leaseUntil: { $gt: new Date() },
    });
    if (!online(host) || !job || req.body?.instance !== host.instance) return reject(res, 409, "Active worker assignment required.");
    const proposal = await governance.propose(job, host, req.body.intent);
    if (!proposal) return reject(res, 400, "Invalid GitHub operation request.");
    const available = proposal.intent.operation === "mcpTool" ? governance.toolsAvailable : governance.available;
    const state = proposal.state === "authorized" && available
      ? await governance.execute(owner(), proposal._id) : proposal.state;
    res.status(201).json({ id: proposal._id, state });
  });
  worker.use((_req, res) => reject(res, 404, "Worker route not found."));
  router.use("/worker", worker);

  router.use(authenticate, (req, res, next) => {
    if (!ownerAllowed(owner(), req.user)) return reject(res, 403, "Operations access denied.");
    next();
  });
  router.use(express.json({ limit: "64kb" }));
  router.get("/approvals", async (_req, res) => {
    res.json({
      githubEnabled: governance.available, toolsEnabled: governance.toolsAvailable, workerEnabled,
      policy: await governance.config(owner()), requests: await governance.list(owner()),
    });
  });
  router.patch("/approvals/policy", async (req, res) => {
    const status = await governance.configure(owner(), req.body?.revision, req.body?.modes, req.body?.toolModes);
    if (status === 204) return res.sendStatus(204);
    return reject(res, status, "Policy revision or permission settings are invalid.");
  });
  router.get("/hosts", async (_req, res) => {
    const records = await hosts().find({ ownerId: owner() }, {
      projection: { label: 1, lastSeen: 1, revokedAt: 1, efforts: 1, profiles: 1 },
    }).sort({ createdAt: -1 }).limit(50).toArray();
    res.json(records.map((host) => ({ ...host, online: online(host) })));
  });
  router.post("/hosts", async (req, res) => {
    const label = req.body?.label?.trim?.();
    if (!label || label.length > 80) return reject(res, 400, "Device name required.");
    const id = randomUUID();
    const token = `${id}.${randomBytes(32).toString("hex")}`;
    await hosts().insertOne({
      _id: id, ownerId: owner(), label, digest: deviceHash(token),
      createdAt: new Date(), lastSeen: null, revokedAt: null,
    });
    res.status(201).json({ id, token });
  });
  router.delete("/hosts/:id", async (req, res) => {
    const filter = { hostId: req.params.id, ownerId: owner() };
    await hosts().updateOne({ _id: filter.hostId, ownerId: filter.ownerId }, { $set: { revokedAt: new Date() } });
    await jobs().updateMany({ ...filter, status: { $in: ["waiting", "queued", "running", "cancelling"] } }, {
      $set: { status: "interrupted", finishedAt: new Date(), error: "Device revoked." },
      $unset: { activeHost: "" },
    });
    res.sendStatus(204);
  });
  router.get("/jobs", async (_req, res) => {
    const search = _req.query.search;
    const archive = _req.query.archived;
    if (search !== undefined && !text(search, 120)) return reject(res, 400, "Invalid search.");
    const pattern = search && new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const named = pattern ? await jobs().find({ ownerId: owner(), title: pattern }, {
      projection: { _id: 1 },
    }).limit(100).toArray() : [];
    const filter = { ownerId: owner() };
    if (archive === "true" || archive === "false") {
      const archived = await jobs().find({ ownerId: owner(), archivedAt: { $type: "date" } }, {
        projection: { _id: 1 },
      }).toArray();
      filter.sessionId = { [archive === "true" ? "$in" : "$nin"]: archived.map(({ _id }) => _id) };
    }
    if (pattern) filter.$or = [
      { prompt: pattern },
      { sessionId: { $in: named.map(({ _id }) => _id) } },
      { events: { $elemMatch: { view: "response", text: pattern } } },
    ];
    const records = await jobs().find(filter, {
      projection: { events: 0, instance: 0, activeHost: 0, approvalHistory: 0 },
    }).sort({ createdAt: -1 }).limit(50).toArray();
    const roots = await jobs().find({
      ownerId: owner(), _id: { $in: [...new Set(records.map((job) => job.sessionId || job._id))] },
    }, { projection: { title: 1, archivedAt: 1 } }).toArray();
    const metadata = new Map(roots.map((root) => [root._id, root]));
    res.json(records.map((job) => {
      const root = metadata.get(job.sessionId || job._id);
      return { ...jobView(job), title: root?.title, archivedAt: root?.archivedAt };
    }));
  });
  router.patch("/sessions/:id", async (req, res) => {
    const { title, archived } = req.body || {};
    if (!uuid(req.params.id) || (title === undefined && archived === undefined) ||
        (title !== undefined && (!text(title, 120) || !title.trim())) ||
        (archived !== undefined && typeof archived !== "boolean")) {
      return reject(res, 400, "Invalid session update.");
    }
    const changes = {};
    if (title !== undefined) changes.title = title.trim();
    if (archived !== undefined) changes.archivedAt = archived ? new Date() : null;
    const saved = await jobs().updateOne({ _id: req.params.id, ownerId: owner(), parentId: null }, { $set: changes });
    if (!saved.matchedCount) return reject(res, 404, "Session not found.");
    res.sendStatus(204);
  });
  router.get("/jobs/:id", async (req, res) => {
    const offset = Number(req.query.offset || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 401) {
      return reject(res, 400, "Invalid event offset.");
    }
    const job = await jobs().findOne({ _id: req.params.id, ownerId: owner() }, {
      projection: { events: { $slice: [offset, 40] }, instance: 0, activeHost: 0 },
    });
    if (!job) return reject(res, 404, "Job not found.");
    const root = await jobs().findOne({ _id: job.sessionId || job._id, ownerId: owner() }, {
      projection: { title: 1, archivedAt: 1 },
    });
    res.json({ ...jobView(job), title: root?.title, archivedAt: root?.archivedAt });
  });
  router.post("/jobs/:id/approval", async (req, res) => {
    const { id, choice, fingerprint } = req.body || {};
    if (!uuid(id) || !["approve", "deny"].includes(choice)) return reject(res, 400, "Invalid approval decision.");
    if (fingerprint !== undefined) {
      if (typeof fingerprint !== "string" || !/^[a-f\d]{64}$/.test(fingerprint)) {
        return reject(res, 400, "Invalid reviewed fingerprint.");
      }
      if (!(await governance.decide(owner(), req.params.id, id, choice, fingerprint))) {
        return reject(res, 409, "Approval expired, changed, or already decided.");
      }
      if (choice === "approve") await governance.execute(owner(), id);
      return res.sendStatus(204);
    }
    const job = await jobs().findOne({ _id: req.params.id, ownerId: owner() });
    if (job?.decision?.id === id && job.decision.choice === choice) return res.sendStatus(204);
    const host = job && await hosts().findOne({ _id: job.hostId, ownerId: owner(), instance: job.instance });
    if (!host || !online(host)) return reject(res, 409, "The assigned worker is disconnected.");
    const decision = { id, choice, at: new Date() };
    const changed = await jobs().updateOne({
      _id: job._id, ownerId: owner(), instance: host.instance, status: "running", leaseUntil: { $gt: new Date() },
      "approval.id": id, "approval.state": "pending", "approval.expiresAt": { $gt: Date.now() },
      "decision.id": { $ne: id },
      ...(choice === "approve" ? { "approval.canApprove": true } : {}),
    }, {
      $set: { decision },
      $push: { approvalHistory: { $each: [{ ...decision, request: job.approval }], $slice: -50 } },
    });
    if (!changed.matchedCount) return reject(res, 409, "Approval no longer available.");
    res.sendStatus(204);
  });
  router.post("/jobs/:id/steer", async (req, res) => {
    const { id, turnId, input } = req.body || {};
    if (!uuid(id) || !text(turnId, 128) || !turnId || !text(input, 12000) || !input.trim()) {
      return reject(res, 400, "Invalid steering instruction.");
    }
    const job = await jobs().findOne({ _id: req.params.id, ownerId: owner() });
    if (job?.instruction?.id === id) return res.sendStatus(204);
    const host = job && await hosts().findOne({ _id: job.hostId, ownerId: owner(), instance: job.instance });
    if (!host || !online(host)) return reject(res, 409, "The assigned worker is disconnected.");
    const changed = await jobs().updateOne({
      _id: job._id, ownerId: owner(), instance: host.instance, status: "running", leaseUntil: { $gt: new Date() },
      "activeTurn.turnId": turnId,
      $or: [{ instruction: { $exists: false } }, { "instruction.state": { $in: ["accepted", "rejected", "uncertain"] } },
        { "instruction.expiresAt": { $lte: Date.now() } }],
    }, { $set: { instruction: { id, turnId, text: input, expiresAt: Date.now() + 20_000, state: "pending" } } });
    if (!changed.matchedCount) return reject(res, 409, "The turn changed or an instruction is awaiting acknowledgement.");
    res.sendStatus(204);
  });
  router.post("/jobs", async (req, res) => {
    if (!workerEnabled) return reject(res, 423, "Worker execution is paused.");
    const { id, hostId, workspace, model, effort, prompt, parentId, queue = false, profile = "read-only" } = req.body || {};
    if (!uuid(id) || !uuid(hostId) || !workspaces.includes(workspace) || model !== "gpt-6.2-sol" ||
        typeof prompt !== "string" || !prompt.trim() || prompt.length > 12000 ||
        (parentId != null && !uuid(parentId)) || (queue !== false && (queue !== true || !parentId)) ||
        (profile !== "read-only" && profile !== workspace)) {
      return reject(res, 400, "Invalid job request.");
    }
    const existing = await jobs().findOne({ _id: id, ownerId: owner() });
    if (existing) return res.json({ _id: id });
    const host = await hosts().findOne({ _id: hostId, ownerId: owner(), revokedAt: null });
    if (!host || (!queue && !online(host)) || !host.efforts?.includes(effort) ||
        !(host.profiles || ["read-only"]).includes(profile)) {
      return reject(res, 409, "Select an online host and a supported reasoning effort.");
    }
    const parent = parentId && await jobs().findOne({
      _id: parentId, ownerId: owner(), hostId, workspace,
      status: { $in: queue ? ["queued", "running", "completed"] : terminal },
    });
    if (parentId && (!parent || (!queue && !parent.codexThreadId) || (parent.profile || "read-only") !== profile)) {
      return reject(res, 409, "Session cannot be continued with that execution profile.");
    }
    if (parentId) await ensureIndexes();
    try {
      await jobs().insertOne({
        _id: id, ownerId: owner(), hostId, workspace, profile, model, effort, prompt,
        workerRole: "direct", sessionId: parent?.sessionId || id, parentId: parentId || null,
        ...(parentId ? { successorOf: parentId } : {}),
        codexThreadId: queue ? null : parent?.codexThreadId || null, status: queue ? "waiting" : "queued",
        createdAt: new Date(), events: [], eventCount: 0,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      if (!(await jobs().findOne({ _id: id, ownerId: owner() }))) {
        return reject(res, 409, "This turn already has a continuation. Select that turn to continue the session.");
      }
    }
    res.status(201).json({ _id: id });
  });
  router.post("/jobs/:id/cancel", async (req, res) => {
    const query = { _id: req.params.id, ownerId: owner() };
    const queued = await jobs().updateOne({ ...query, status: { $in: ["waiting", "queued"] } }, {
      $set: { status: "cancelled", finishedAt: new Date() }, $unset: { successorOf: "" },
    });
    if (!queued.matchedCount) {
      await jobs().updateOne({ ...query, status: "running" }, { $set: { status: "cancelling" } });
    }
    res.sendStatus(204);
  });
  router.use((_req, res) => reject(res, 404, "Operations route not found."));
  router.use((error, _req, res, _next) => {
    const status = error.statusCode || error.status || 500;
    if (status >= 500) reportError(error);
    reject(res, status, status >= 500 ? "Operations storage or service unavailable." : "Operations request rejected.");
  });
  return router;
}

module.exports = createRouter();
module.exports.createRouter = createRouter;

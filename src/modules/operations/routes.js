const express = require("express");
const mongoose = require("mongoose");
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const auth = require("../../core/middleware/auth");

const workspaces = ["development", "workshop"];
const terminal = ["completed", "failed", "cancelled", "interrupted"];
const leaseMs = 45_000;
const deviceHash = (token) => createHash("sha256").update(token).digest("hex");
const uuid = (value) => typeof value === "string" && /^[a-f\d-]{36}$/.test(value);
const ownerAllowed = (owner, user) =>
  /^[a-f\d]{24}$/.test(owner || "") && owner === user?._id;
const online = (host) => !host.revokedAt && Date.now() - Number(host.lastSeen) < 15_000;
const reject = (res, status, message) => res.status(status).json({ message });
const jobView = (job) => job.leaseUntil <= new Date() && ["running", "cancelling"].includes(job.status)
  ? { ...job, status: "interrupted", error: "Worker lease expired." } : job;

function createRouter({
  db = () => mongoose.connection.db,
  owner = () => process.env.OPERATIONS_OWNER_ID,
  enabled = () => (process.env.JWT_SECRET || "").length >= 32 &&
    process.env.JWT_SECRET !== "super-strong-secret",
  authenticate = auth,
  reportError = () => {},
} = {}) {
  const router = express.Router();
  const hosts = () => db().collection("operations_hosts");
  const jobs = () => db().collection("operations_jobs");
  let indexes;
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
    const { efforts, instance } = req.body || {};
    if (!uuid(instance) || !Array.isArray(efforts) || !efforts.length || efforts.length > 8 ||
        efforts.some((effort) => !["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"].includes(effort))) {
      return reject(res, 400, "Invalid worker capabilities.");
    }
    const now = new Date();
    const host = await hosts().findOneAndUpdate({
      _id: req.operationsHost._id, revokedAt: null,
      $or: [{ instance }, { lastSeen: { $lt: new Date(+now - leaseMs) } }, { lastSeen: null }],
    }, { $set: { instance, efforts, lastSeen: now } }, { returnDocument: "after" });
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
    const instance = req.body?.instance;
    if (!uuid(instance) || req.operationsHost.instance !== instance || !online(req.operationsHost)) {
      return reject(res, 409, "Worker heartbeat required.");
    }
    indexes ||= jobs().createIndex({ activeHost: 1 }, {
      unique: true, partialFilterExpression: { activeHost: { $type: "string" } },
    }).catch((error) => { indexes = undefined; throw error; });
    await indexes;
    const scope = { ownerId: owner(), hostId: req.operationsHost._id };
    let job = await jobs().findOne({ ...scope, activeHost: req.operationsHost._id, instance });
    if (!job) {
      try {
        job = await jobs().findOneAndUpdate({
          ...scope, status: "queued",
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
    const { _id, prompt, model, effort, workspace, codexThreadId, status, eventCount } = job;
    res.json({ _id, prompt, model, effort, workspace, codexThreadId, status, eventCount });
  });

  worker.post("/jobs/:id/sync", async (req, res) => {
    const { instance, offset, events, result } = req.body || {};
    if (!uuid(req.params.id) || !uuid(instance) || req.operationsHost.instance !== instance ||
        !Number.isInteger(offset) || offset < 0 ||
        !Array.isArray(events) || events.length > 12 || offset + events.length > 401 ||
        events.some((event) => !event || !["activity", "execution", "response"].includes(event.view) ||
          typeof event.label !== "string" || event.label.length > 120 ||
          typeof event.text !== "string" || event.text.length > 8000) ||
        (result && (!terminal.includes(result.status) || typeof result.error !== "string" ||
          result.error.length > 2000 || (result.threadId != null && !uuid(result.threadId))))) {
      return reject(res, 400, "Invalid job update.");
    }
    const query = { _id: req.params.id, ownerId: owner(), hostId: req.operationsHost._id, instance };
    const current = await jobs().findOne(query, { projection: { status: 1, eventCount: 1 } });
    if (!current) return reject(res, 404, "Job assignment not found.");
    if (terminal.includes(current.status)) return res.json(current);
    const update = { $set: { leaseUntil: new Date(Date.now() + leaseMs) } };
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
        status: result.status, error: result.error, codexThreadId: result.threadId || null, finishedAt: new Date(),
      });
      update.$unset = { activeHost: "" };
    }
    const saved = await jobs().findOneAndUpdate({
      ...query, status: current.status, eventCount: current.eventCount,
      leaseUntil: { $gt: new Date() },
    }, update, { projection: { status: 1, eventCount: 1 }, returnDocument: "after" });
    if (!saved) return reject(res, 409, "Job lease or status changed. Retry sync.");
    res.json(saved);
  });
  worker.use((_req, res) => reject(res, 404, "Worker route not found."));
  router.use("/worker", worker);

  router.use(authenticate, (req, res, next) => {
    if (!ownerAllowed(owner(), req.user)) return reject(res, 403, "Operations access denied.");
    next();
  });
  router.use(express.json({ limit: "64kb" }));
  router.get("/hosts", async (_req, res) => {
    const records = await hosts().find({ ownerId: owner() }, {
      projection: { label: 1, lastSeen: 1, revokedAt: 1, efforts: 1 },
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
    await jobs().updateMany({ ...filter, status: { $in: ["queued", "running", "cancelling"] } }, {
      $set: { status: "interrupted", finishedAt: new Date(), error: "Device revoked." },
      $unset: { activeHost: "" },
    });
    res.sendStatus(204);
  });
  router.get("/jobs", async (_req, res) => {
    const records = await jobs().find({ ownerId: owner() }, {
      projection: { events: 0, instance: 0, activeHost: 0 },
    }).sort({ createdAt: -1 }).limit(50).toArray();
    res.json(records.map(jobView));
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
    res.json(jobView(job));
  });
  router.post("/jobs", async (req, res) => {
    const { id, hostId, workspace, model, effort, prompt, parentId } = req.body || {};
    if (!uuid(id) || !uuid(hostId) || !workspaces.includes(workspace) || model !== "gpt-6.2-sol" ||
        typeof prompt !== "string" || !prompt.trim() || prompt.length > 12000 ||
        (parentId != null && !uuid(parentId))) {
      return reject(res, 400, "Invalid job request.");
    }
    const existing = await jobs().findOne({ _id: id, ownerId: owner() });
    if (existing) return res.json({ _id: id });
    const host = await hosts().findOne({ _id: hostId, ownerId: owner(), revokedAt: null });
    if (!host || !online(host) || !host.efforts?.includes(effort)) {
      return reject(res, 409, "Select an online host and a supported reasoning effort.");
    }
    const parent = parentId && await jobs().findOne({
      _id: parentId, ownerId: owner(), hostId, workspace,
      status: { $in: ["completed", "failed", "cancelled"] },
    });
    if (parentId && !parent?.codexThreadId) return reject(res, 409, "Session cannot be continued.");
    try {
      await jobs().insertOne({
        _id: id, ownerId: owner(), hostId, workspace, model, effort, prompt,
        workerRole: "direct", sessionId: parent?.sessionId || id, parentId: parentId || null,
        codexThreadId: parent?.codexThreadId || null, status: "queued",
        createdAt: new Date(), events: [], eventCount: 0,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    res.status(201).json({ _id: id });
  });
  router.post("/jobs/:id/cancel", async (req, res) => {
    const query = { _id: req.params.id, ownerId: owner() };
    const queued = await jobs().updateOne({ ...query, status: "queued" }, {
      $set: { status: "cancelled", finishedAt: new Date() },
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

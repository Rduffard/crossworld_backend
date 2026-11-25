const express = require("express");
const { randomUUID, createHash } = require("node:crypto");
const { once } = require("node:events");
const { ARTIFACT_LIMIT, GLB_MIME, artifactMime, artifactMaxBytes } = require("./media-artifacts");

const CHUNK = 192 * 1024;
const MAX_SIZE = 100 * 1024 * 1024;
const MAX_PENDING = 4;
const TTL = 24 * 60 * 60 * 1000;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/;
const isId = (value) => typeof value === "string" && uuid.test(value);
const types = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4", "video/quicktime", "video/webm"]);
const videoTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const reviewStates = new Set(["pending", "approved", "changes-requested", "rejected", "archived", "superseded"]);
const maxReviewRevisions = 200;
const maxImages = 4;
const maxImageSize = 12 * 1024 * 1024;
const fail = (res, status, message) => res.status(status).json({ message });
const stableId = (value) => digest(Buffer.from(value)).slice(0, 32).replace(/^(........)(....)(....)(....)(............)$/, "$1-$2-$3-$4-$5");

function view(record, includeHistory = false) {
  const { _id, name, size, offset, state, hostId, mime, sha256, createdAt, derivedFrom, jobId, projectId, review } = record;
  const { state: reviewState = "pending", revision = 0, history = [] } = review || {};
  return { _id, name, size, offset, state, hostId, mime, sha256, createdAt, derivedFrom, jobId, projectId,
    ...(state === "ready" ? { review: { state: reviewState, revision, ...(includeHistory === true ? { history } : {}) } } : {}) };
}

function parseRange(header, length) {
  if (!header) return { start: 0, end: length - 1 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(length - 1, Number(match[2])) : length - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && start < length ? { start, end } : null;
}

function mediaObservation(value, now = Date.now()) {
  const { usedBytes, quotaBytes, freeBytes, observedAt } = value || {};
  if (![usedBytes, quotaBytes, freeBytes, observedAt].every(Number.isSafeInteger) ||
      usedBytes < 0 || freeBytes < 0 || quotaBytes < CHUNK || observedAt < now - 86_400_000 || observedAt > now + 60_000) return null;
  return { usedBytes, quotaBytes, freeBytes, observedAt };
}

function createMedia({ records, hosts, jobs, owner, online, workerEnabled, inMaintenance }) {
  const browser = express.Router();
  const worker = express.Router();
  const pending = new Map();
  const waitingWorkers = new Map();
  const mutations = new Set();
  let uploadBodies = 0;
  let activeReads = 0;
  let indexed;
  function indexes() {
    indexed ||= Promise.all([
      records().createIndex({ ownerId: 1, createdAt: -1, _id: -1 }),
      records().createIndex({ ownerId: 1, hostId: 1, state: 1, createdAt: -1 }),
      records().createIndex({ ownerId: 1, jobId: 1, state: 1 }),
    ]).catch((error) => { indexed = undefined; throw error; });
    return indexed;
  }

  function exchange(host, operation, signal) {
    if (pending.size >= MAX_PENDING) throw Object.assign(new Error(), { status: 429 });
    signal?.throwIfAborted();
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      function clean() {
        pending.delete(id);
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      }
      function abort() { clean(); reject(signal.reason); }
      const timeout = setTimeout(() => {
        clean();
        reject(Object.assign(new Error(), { status: 503 }));
      }, 12_000);
      pending.set(id, { hostId: host._id, instance: host.instance, operation, finish(reply) {
        clean();
        resolve(reply);
      } });
      signal?.addEventListener("abort", abort, { once: true });
      waitingWorkers.get(host._id)?.();
    });
  }

  worker.post("/exchange", (req, res) => {
    const host = req.operationsHost;
    if (!host.media || !online(host) || req.body?.instance !== host.instance) return res.sendStatus(409);
    const current = pending.get(req.body.replyId);
    if (current?.hostId === host._id && current.instance === host.instance) current.finish(req.body.reply);
    if (req.body.draining === true) return res.json(null);
    const find = () => [...pending].find(([, item]) => item.hostId === host._id && item.instance === host.instance);
    const payload = (entry) => entry ? { requestId: entry[0], ...entry[1].operation } : null;
    const ready = find();
    if (ready) return res.json(payload(ready));
    waitingWorkers.get(host._id)?.();
    const timer = setTimeout(respond, 2200);
    function clean() {
      clearTimeout(timer);
      if (waitingWorkers.get(host._id) === respond) waitingWorkers.delete(host._id);
    }
    function respond() {
      clean();
      if (!res.destroyed) res.json(payload(find()));
    }
    waitingWorkers.set(host._id, respond);
    res.once("close", clean);
  });

  worker.post("/jobs/:id/artifacts", async (req, res) => {
    if (!workerEnabled) return fail(res, 423, "Worker execution is paused.");
    const jobId = req.params.id;
    const host = req.operationsHost;
    const { instance, phase, name, mime, size, sha256 } = req.body || {};
    if (!isId(jobId) || !["reserve", "finish"].includes(phase) || !mime || mime !== artifactMime(name) ||
        !Number.isSafeInteger(size) || size < (mime === GLB_MIME ? 20 : 12) || size > artifactMaxBytes(mime) ||
        typeof sha256 !== "string" || !/^[\da-f]{64}$/.test(sha256)) {
      return fail(res, 400, "Invalid artifact metadata.");
    }
    if (!host.mediaOutput || !online(host) || instance !== host.instance) return fail(res, 409, "Artifact worker is unavailable.");
    const key = `artifact:${jobId}`;
    if (mutations.has(key)) return fail(res, 429, "Another artifact is being published.");
    mutations.add(key);
    try {
      await indexes();
      const ownerId = owner();
      const job = await jobs().findOne({
        _id: jobId, ownerId, hostId: host._id, activeHost: host._id, instance, outputMedia: true, workspace: "workshop",
        $or: [{ profile: "workshop" }, { profile: "scoped", workerRole: "scoped-assignment", workspace: "workshop",
          assignmentScopeId: { $type: "string" } }],
        status: "running", leaseUntil: { $gt: new Date() },
      }, { projection: { _id: 1, projectId: 1, artifactImport: 1 } });
      if (!job) return fail(res, 403, "Artifact publication is not authorized for this turn.");
      if (job.artifactImport && !job.artifactImport.some((file) => file.name === name && file.size === size && file.sha256 === sha256)) {
        return fail(res, 403, "The file is not in the authorized import manifest.");
      }
      const originalId = stableId(`artifact:${ownerId}:${jobId}:${name.toLowerCase()}`);
      let query = { _id: originalId, ownerId, hostId: host._id, jobId, kind: "artifact" };
      let existing = await records().findOne(query);
      if (!existing && job.artifactImport) {
        existing = await records().findOne({
          ownerId, hostId: host._id, kind: "artifact", name, size, mime, sha256,
          projectId: job.projectId ?? null, state: { $in: ["ready", "publishing"] },
        }, { sort: { state: -1, createdAt: 1 } });
        if (existing) query = { ...query, _id: existing._id, jobId: existing.jobId };
      }
      const id = query._id;
      if (existing && (existing.sha256 !== sha256 || existing.mime !== mime || existing.size !== size)) {
        return fail(res, 409, "This artifact filename already represents different bytes.");
      }
      if (existing?.state === "ready" && phase === "reserve") return res.json({ id, name: existing.name, state: "ready" });
      if (phase === "finish") {
        if (!existing) return fail(res, 409, "Reserve this artifact before publishing it.");
        await records().updateOne({ ...query, state: "publishing" },
          { $set: { state: "ready", offset: size, finalizedAt: new Date() } });
        if (job.artifactImport) await jobs().updateOne({ _id: jobId, ownerId }, { $addToSet: { artifactIds: id } });
        return res.json({ id, name: existing.name, state: "ready" });
      }
      if (!existing) {
        if (await inMaintenance()) return fail(res, 423, "New media transfers are paused for production maintenance.");
        const count = await records().countDocuments({ ownerId, jobId, kind: "artifact" }, { limit: ARTIFACT_LIMIT });
        if (count >= ARTIFACT_LIMIT) return fail(res, 409, "The turn has reached its artifact limit.");
        await records().insertOne({ ...query, name, mime, size, sha256, createdAt: new Date(), state: "publishing",
          ...(job.projectId ? { projectId: job.projectId } : {}) });
      }
      return res.json({ id, name: existing?.name || name, state: "publishing" });
    } finally { mutations.delete(key); }
  });

  const findHost = (id) => hosts().findOne({ _id: id, ownerId: owner(), revokedAt: null, media: true });
  const findMedia = (id) => records().findOne({ _id: id, ownerId: owner() });
  const liveHost = async (id) => {
    const host = await findHost(id);
    return host && online(host) ? host : null;
  };

  browser.get("/", async (req, res) => {
    const cursor = typeof req.query.before === "string" && req.query.before.split("~");
    const before = cursor && new Date(cursor[0]);
    if (req.query.before !== undefined && (!cursor || cursor.length !== 2 || !isId(cursor[1]) || Number.isNaN(+before))) {
      return fail(res, 400, "Invalid cursor.");
    }
    await indexes();
    const [items, devices] = await Promise.all([
      records().find({ ownerId: owner(), $and: [
        { $or: [{ state: "ready" }, { state: "uploading", createdAt: { $gt: new Date(Date.now() - TTL) } }] },
        ...(before ? [{ $or: [{ createdAt: { $lt: before } }, { createdAt: before, _id: { $lt: cursor[1] } }] }] : []),
      ],
      }, { projection: { "review.history": 0 } }).sort({ createdAt: -1, _id: -1 }).limit(51).toArray(),
      hosts().find({ ownerId: owner(), revokedAt: null, media: true }).limit(25).toArray(),
    ]);
    return res.json({ items: items.slice(0, 50).map(item => view(item)),
      nextBefore: items.length > 50 ? `${items[49].createdAt.toISOString()}~${items[49]._id}` : null,
      maxSize: MAX_SIZE, chunkSize: CHUNK, hosts: devices.map((host) => ({
        _id: host._id, label: host.label, online: online(host), videoFrames: host.mediaVideoFrames === true,
        storage: mediaObservation(host.mediaUsage),
      })) });
  });

  browser.post("/", async (req, res) => {
    const { hostId, name, size } = req.body || {};
    if (!isId(hostId) || typeof name !== "string" || !name.isWellFormed() || !name.trim() || name.length > 180 ||
        /[\\/\p{C}]/u.test(name) || !Number.isSafeInteger(size) || size < 12 || size > MAX_SIZE) {
      return fail(res, 400, "Invalid media name, size, or device.");
    }
    const key = `allocate:${hostId}`;
    if (mutations.has(key)) return fail(res, 429, "Another upload is starting.");
    mutations.add(key);
    try {
      if (await inMaintenance()) return fail(res, 423, "New media transfers are paused for production maintenance.");
      if (!await liveHost(hostId)) return fail(res, 503, "The media device is offline.");
      await indexes();
      if (await records().countDocuments({ ownerId: owner(), hostId, state: "uploading",
        createdAt: { $gt: new Date(Date.now() - TTL) } }, { limit: 12 }) >= 12) {
        return fail(res, 429, "Too many incomplete uploads.");
      }
      const record = { _id: randomUUID(), ownerId: owner(), hostId, name: name.trim(), size, offset: 0,
        state: "uploading", createdAt: new Date() };
      await records().insertOne(record);
      return res.status(201).json(view(record));
    } finally { mutations.delete(key); }
  });

  browser.use("/:id", async (req, res, next) => {
    if (!isId(req.params.id)) return fail(res, 404, "Media record unavailable.");
    req.media = await findMedia(req.params.id);
    if (!req.media || req.media.state === "deleted") return fail(res, 404, "Media record unavailable.");
    next();
  });
  browser.get("/:id", (req, res) => res.json(view(req.media, true)));
  browser.patch("/:id/review", async (req, res) => {
    const { state, revision, feedback = "" } = req.body || {};
    if (!reviewStates.has(state) || !Number.isSafeInteger(revision) || revision < 0 ||
        typeof feedback !== "string" || !feedback.isWellFormed() || feedback.length > 2000) {
      return fail(res, 400, "Provide a valid decision, revision and feedback.");
    }
    if (req.media.state !== "ready") return fail(res, 409, "Only ready artifacts can be reviewed.");
    if (revision >= maxReviewRevisions) return fail(res, 409, "The artifact has reached its review history limit.");
    const entry = { state, revision: revision + 1, feedback: feedback.trim(), at: new Date(), actor: "owner" };
    const filter = { _id: req.media._id, ownerId: owner(), state: "ready", ...(revision === 0 ?
      { "review.revision": { $exists: false } } : { "review.revision": revision }) };
    const result = await records().findOneAndUpdate(filter, {
      $set: { "review.state": state, "review.revision": entry.revision },
      $push: { "review.history": entry },
    }, { returnDocument: "after" });
    if (!result) return fail(res, 409, "Review changed. Refresh before recording another decision.");
    return res.json(view(result, true));
  });

  const mutate = (handler) => async (req, res) => {
    const id = req.media._id;
    if (mutations.has(id)) return fail(res, 409, "Media update in progress.");
    mutations.add(id);
    try {
      const current = await findMedia(id);
      if (!current || current.state === "deleted") return fail(res, 404, "Media record unavailable.");
      const host = await liveHost(current.hostId);
      if (!host) return fail(res, 503, "The media device is offline.");
      return await handler(req, res, current, host);
    } finally { mutations.delete(id); }
  };

  const admitChunk = (_req, res, next) => {
    if (uploadBodies >= MAX_PENDING) return fail(res, 429, "Media capacity is busy. Retry this chunk.");
    uploadBodies++;
    const timeout = setTimeout(() => res.destroy(), 20_000);
    res.once("close", () => { clearTimeout(timeout); uploadBodies--; });
    next();
  };
  browser.put("/:id/chunks/:offset", admitChunk, express.raw({ type: "application/octet-stream", limit: CHUNK, inflate: false }),
    mutate(async (req, res, current, host) => {
      const offset = Number(req.params.offset);
      if (current.state !== "uploading" || +current.createdAt < Date.now() - TTL) return fail(res, 409, "Upload is closed.");
      if (!/^\d+$/.test(req.params.offset) || offset !== current.offset || !Buffer.isBuffer(req.body) ||
          req.body.length !== Math.min(CHUNK, current.size - offset) || !req.body.length) {
        return res.status(409).json({ message: "Incorrect chunk offset or length.", offset: current.offset });
      }
      const reply = await exchange(host, { kind: "write", id: current._id, offset, size: current.size,
        bytes: req.body.toString("base64"), sha256: digest(req.body) });
      if (reply?.state === "full") return fail(res, 507, "The media device has reached its quota or minimum free space.");
      if (reply?.offset !== offset + req.body.length) return fail(res, 422, "Media chunk rejected by storage.");
      await records().updateOne({ _id: current._id, ownerId: owner(), state: "uploading", offset },
        { $set: { offset: reply.offset } });
      return res.json({ offset: reply.offset });
    }));

  browser.post("/:id/finalize", mutate(async (_req, res, current, host) => {
    if (current.state === "ready") return res.json(view(current));
    if (current.state !== "uploading" || current.offset !== current.size || +current.createdAt < Date.now() - TTL) {
      return fail(res, 409, "Upload is incomplete or expired.");
    }
    const reply = await exchange(host, { kind: "finalize", id: current._id, size: current.size });
    if (!types.has(reply?.mime) || !/^[\da-f]{64}$/.test(reply?.sha256 || "")) {
      return fail(res, 422, "Unsupported or invalid media.");
    }
    const changes = { state: "ready", mime: reply.mime, sha256: reply.sha256, finalizedAt: new Date() };
    await records().updateOne({ _id: current._id, ownerId: owner(), state: "uploading" }, { $set: changes });
    return res.json(view({ ...current, ...changes }));
  }));

  browser.delete("/:id", mutate(async (_req, res, current, host) => {
    if (current.state !== "uploading") return fail(res, 409, "Only incomplete uploads can be cancelled.");
    if ((await exchange(host, { kind: "discard", id: current._id }))?.ok !== true) {
      return fail(res, 503, "The upload could not be discarded.");
    }
    await records().updateOne({ _id: current._id, ownerId: owner(), state: "uploading" },
      { $set: { state: "deleted", deletedAt: new Date() } });
    return res.sendStatus(204);
  }));

  browser.post("/:id/frames", mutate(async (req, res, source, host) => {
    if (await inMaintenance()) return fail(res, 423, "New media transfers are paused for production maintenance.");
    const atMs = req.body?.atMs;
    if (!Number.isSafeInteger(atMs) || atMs < 0 || atMs > 3_600_000) return fail(res, 400, "Choose a frame offset up to one hour.");
    if (source.state !== "ready" || !videoTypes.has(source.mime)) return fail(res, 409, "Choose an uploaded video.");
    if (host.mediaVideoFrames !== true) return fail(res, 503, "Frame extraction is unavailable on this device.");
    const id = stableId(`frame:${owner()}:${source._id}:${source.sha256}:${atMs}`);
    const derivedFrom = { id: source._id, requestedOffsetMs: atMs };
    const record = await records().findOneAndUpdate({ _id: id, ownerId: owner(), derivedFrom },
      { $setOnInsert: { hostId: host._id, state: "deriving", createdAt: new Date(), name: `Video frame at ${atMs} ms.jpg` } },
      { upsert: true, returnDocument: "after" });
    if (record.state === "ready") return res.json(view(record));
    const reply = await exchange(host, { kind: "frame", id: source._id, derivedId: id,
      size: source.size, mime: source.mime, sha256: source.sha256, atMs });
    if (reply?.state === "full") return fail(res, 507, "The media device has reached its quota or minimum free space.");
    if (reply?.mime !== "image/jpeg" || !Number.isSafeInteger(reply.size) || reply.size < 12 || reply.size > 3 * 1024 ** 2 ||
        !/^[\da-f]{64}$/.test(reply.sha256)) return fail(res, 422, "No preview frame could be extracted at this offset.");
    const updates = { state: "ready", mime: reply.mime, sha256: reply.sha256, size: reply.size, offset: reply.size, finalizedAt: new Date() };
    await records().updateOne({ _id: id, ownerId: owner(), state: "deriving" }, { $set: updates });
    return res.status(201).json(view({ ...record, ...updates }));
  }));

  browser.get("/:id/content", async (req, res) => {
    const { _id: id, state, size, mime, name, hostId } = req.media;
    if (state !== "ready") return fail(res, 409, "Media is still uploading.");
    const host = await liveHost(hostId);
    if (!host) return fail(res, 503, "The media device is offline.");
    const range = parseRange(req.get("range"), size);
    if (!range) return res.set("Content-Range", `bytes */${size}`).sendStatus(416);
    if (res.destroyed) return;
    if (activeReads >= MAX_PENDING) return fail(res, 429, "Media download capacity is busy.");
    activeReads++;
    const controller = new AbortController();
    res.once("close", () => {
      activeReads--;
      controller.abort();
    });
    if (await inMaintenance()) return fail(res, 423, "New media transfers are paused for production maintenance.");
    const headers = { "Content-Type": mime, "Content-Length": String(range.end - range.start + 1), "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": `${mime === GLB_MIME ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (character) => "%" + character.charCodeAt(0).toString(16))}` };
    if (req.get("range")) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;
    if (req.method === "HEAD") {
      const reply = await exchange(host, { kind: "read", id, size, offset: range.start, length: 1 }, controller.signal).catch(() => null);
      if (res.destroyed) return;
      if (typeof reply?.bytes !== "string") return fail(res, 503, "Media could not be read from the storage device.");
      return res.status(req.get("range") ? 206 : 200).set(headers).end();
    }
    for (let offset = range.start; offset <= range.end && !res.destroyed;) {
      try {
        const length = Math.min(CHUNK, range.end - offset + 1);
        const reply = await exchange(host, { kind: "read", id, size, offset, length }, controller.signal);
        const bytes = typeof reply?.bytes === "string" ? Buffer.from(reply.bytes, "base64") : null;
        if (bytes?.length !== length || digest(bytes) !== reply.sha256) throw new Error();
        if (!res.headersSent) res.status(req.get("range") ? 206 : 200).set(headers);
        if (!res.write(bytes) && !res.destroyed) {
          await once(res, "drain", { signal: controller.signal });
        }
        offset += length;
      } catch {
        if (res.headersSent || res.destroyed) return res.destroy();
        return fail(res, 503, "Media could not be read from the storage device.");
      }
    }
    return res.end();
  });
  async function resolveImages(ids, hostId) {
    if (!Array.isArray(ids) || ids.length > maxImages || new Set(ids).size !== ids.length ||
        ids.some((item) => !isId(item))) return null;
    if (!ids.length) return [];
    const entries = await records().find({
      _id: { $in: ids }, ownerId: owner(), hostId, state: "ready",
      mime: { $in: ["image/png", "image/jpeg", "image/webp"] }, size: { $lte: maxImageSize },
    }).limit(maxImages).toArray();
    if (entries.length !== ids.length) return null;
    const byId = new Map(entries.map(({ _id, mime, size, sha256 }) => [_id, { id: _id, mime, size, sha256 }]));
    return ids.map((id) => byId.get(id));
  }
  async function outputs(jobId, artifactIds) {
    const entries = await records().find({ ownerId: owner(), kind: "artifact", state: "ready",
      ...(artifactIds?.length ? { _id: { $in: artifactIds } } : { jobId }) }, {
      projection: { name: 1, mime: 1, size: 1 },
    }).sort({ createdAt: 1 }).limit(ARTIFACT_LIMIT).toArray();
    return entries.map(({ _id, name, mime, size }) => ({ id: _id, name, mime, size }));
  }
  async function drainStatus() {
    const inFlight = activeReads + mutations.size;
    const uploads = await records().countDocuments({ ownerId: owner(), state: "uploading",
      createdAt: { $gt: new Date(Date.now() - TTL) } });
    return uploads + Math.max(inFlight, activeReads + mutations.size);
  }
  return { browser, worker, resolveImages, outputs, drainStatus };
}

module.exports = { createMedia, CHUNK, MAX_SIZE, parseRange, mediaObservation };

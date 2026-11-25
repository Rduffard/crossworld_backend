const express = require("express");

const uuid = value => typeof value === "string" && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(value);
const digest = value => typeof value === "string" && /^[a-f\d]{64}$/.test(value);
const operations = ["restart", "update", "rollback"];
const available = control => control?.observedAt && +control.observedAt > Date.now() - 20_000;
const fail = (res, status, message) => res.status(status).json({ message });

function createRemoteLifecycle({ hosts, requests, owner, maintenanceStatus, workerEnabled }) {
  const browser = express.Router();
  const worker = express.Router();
  let index;
  const ensureIndex = () => index ||= requests().createIndex({ ownerId: 1, hostId: 1 }, {
    unique: true, partialFilterExpression: { pending: true },
  }).catch(error => { index = undefined; throw error; });

  browser.get("/", async (_req, res) => {
    const ownerId = owner();
    const [devices, recent] = await Promise.all([
      hosts().find({ ownerId, revokedAt: null, supervisorControl: { $exists: true } },
        { projection: { label: 1, supervisorControl: 1 } }).limit(25).toArray(),
      requests().find({ ownerId }, { projection: { ownerId: 0, pending: 0 } }).sort({ createdAt: -1 }).limit(30).toArray(),
    ]);
    res.json({ devices: devices.map(({ _id, label, supervisorControl }) => ({
      _id, label, online: !!available(supervisorControl), ...supervisorControl,
    })), requests: recent });
  });

  browser.post("/", async (req, res) => {
    const { id, hostId, operation, current, target } = req.body || {};
    if (!uuid(id) || !uuid(hostId) || !operations.includes(operation) || !digest(current) || !digest(target)) {
      return fail(res, 400, "Select an operation and the exact active and target releases.");
    }
    if (!workerEnabled) return fail(res, 423, "Remote execution is disabled.");
    const ownerId = owner();
    const key = { _id: id, ownerId, hostId, operation, current, target };
    if (await requests().findOne(key)) return res.json({ id });
    const host = await hosts().findOne({ _id: hostId, ownerId, revokedAt: null }, { projection: { supervisorControl: 1 } });
    const control = host?.supervisorControl;
    if (!available(control) || control.active !== current ||
        (operation === "restart" ? target !== current : target === current) ||
        (operation === "rollback" && target !== control.previous) || !control.releases.includes(target)) {
      return fail(res, 409, "The independently supervised release or target changed.");
    }
    const maintenance = await maintenanceStatus();
    if (!maintenance.paused || !maintenance.active || +maintenance.expiresAt - Date.now() < 300_000) {
      return fail(res, 409, "Pause dispatch and hold maintenance for at least five more minutes.");
    }
    await ensureIndex();
    try {
      await requests().insertOne({ ...key, status: "authorized", pending: true, createdAt: new Date(), authorizedBy: "owner" });
      return res.status(201).json({ id });
    } catch (error) {
      if (error.code !== 11000) throw error;
      return await requests().findOne(key) ? res.json({ id }) : fail(res, 409, "Another lifecycle request already exists.");
    }
  });

  browser.post("/:id/cancel", async (req, res) => {
    const updated = await requests().updateOne({ _id: req.params.id, ownerId: owner(), status: "authorized" },
      { $set: { status: "cancelled", finishedAt: new Date() }, $unset: { pending: "" } });
    return updated.modifiedCount ? res.sendStatus(204) : fail(res, 409, "Only a request waiting for handover can be cancelled.");
  });

  worker.post("/pulse", async (req, res) => {
    const { _id, ownerId } = req.operationsHost;
    const result = await hosts().updateOne({ _id, ownerId, revokedAt: null, supervisorControl: { $exists: true } },
      { $set: { "supervisorControl.observedAt": new Date() } });
    res.json({ accepted: !!result.matchedCount });
  });

  worker.post("/poll", async (req, res) => {
    const { active, previous, releases, remoteStaging } = req.body || {};
    if (!digest(active) || (previous !== null && !digest(previous)) || !Array.isArray(releases) ||
        releases.length > 16 || !releases.every(digest) || !releases.includes(active) || (previous && !releases.includes(previous))) {
      return fail(res, 400, "Invalid supervisor release inventory.");
    }
    const { _id: hostId, ownerId } = req.operationsHost;
    const scope = { ownerId, hostId };
    await hosts().updateOne({ _id: hostId, ownerId, revokedAt: null },
      { $set: { supervisorControl: { active, previous, releases, observedAt: new Date(), ...(remoteStaging === true ? { remoteStaging: true } : {}) } } });
    if (!workerEnabled) return res.json(null);
    const existing = await requests().findOne({ ...scope, status: "running" });
    if (existing) return res.json(existing);
    const maintenance = await maintenanceStatus();
    if (!maintenance.paused || !maintenance.ready || +maintenance.expiresAt - Date.now() < 300_000) return res.json(null);
    const request = await requests().findOneAndUpdate({ ...scope, status: "authorized", current: active,
      target: { $in: releases }, $or: [{ operation: { $ne: "rollback" } }, { target: previous }] },
      { $set: { status: "running", startedAt: new Date() } }, { returnDocument: "after" });
    res.json(request);
  });

  worker.post("/:id/receipt", async (req, res) => {
    const { status, active } = req.body || {};
    if (!uuid(req.params.id) || !["completed", "rolled-back", "failed"].includes(status) || !digest(active)) {
      return fail(res, 400, "Invalid supervisor receipt.");
    }
    const { _id: hostId, ownerId } = req.operationsHost;
    const key = { _id: req.params.id, ownerId, hostId };
    const expected = status === "completed" ? { target: active } : { current: active };
    const update = await requests().updateOne({ ...key, ...expected, status: "running" },
      { $set: { status, active, finishedAt: new Date() }, $unset: { pending: "" } });
    if (update.matchedCount || await requests().findOne({ ...key, status, active })) return res.json({ accepted: true });
    return fail(res, 409, "The supervisor receipt does not match an in-flight request.");
  });
  return { browser, worker };
}

module.exports = { createRemoteLifecycle };

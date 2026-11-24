const express = require("express");
const { createHash, randomUUID } = require("node:crypto");
const { objectiveInput, objectiveRecord } = require("./objectives");

const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/;
const fingerprint = data => createHash("sha256").update(JSON.stringify(data)).digest("hex");
const fail = (res, status, message) => res.status(status).json({ message });
const sameName = value => new RegExp("^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i");
const safe = ({ ownerId: _ownerId, ...details }) => details;

function createStudioActions({ proposals, jobs, projects, objectives, owner, online, headquarters }) {
  const browser = express.Router();
  const worker = express.Router();
  async function directTurn(req) {
    const host = req.operationsHost;
    const { instance } = req.body ?? {};
    if (!uuid.test(req.params.id) || instance !== host.instance || !online(host)) return null;
    return jobs().findOne({
      _id: req.params.id, ownerId: owner(), activeHost: host._id, hostId: host._id, instance,
      status: "running", leaseUntil: { $gt: new Date() }, workerRole: { $in: [null, "direct"] },
      objectiveId: null, employeeId: null, studioTools: true,
    }, { projection: { sessionId: 1, studioActor: 1 } });
  }

  worker.post("/jobs/:id/studio-briefing", async (req, res) => {
    if (!await directTurn(req)) return fail(res, 409, "An active First Mate turn is required.");
    const ownerId = owner();
    const briefing = await headquarters(ownerId);
    const turn = (item) => ({
      id: item._id, title: item.title || item.workspace, workspace: item.workspace, status: item.status,
      url: `/operations?workspace=command&job=${item._id}`,
    });
    const readKeys = new Set(briefing.attentionRead);
    return res.json({
      observedAt: briefing.observedAt, paused: briefing.paused, hosts: briefing.hosts,
      turns: briefing.jobs, objectiveStatuses: briefing.objectives,
      projects: briefing.activeProjects.map(project => ({
        name: project.name, workspace: project.workspace,
        url: `/operations?workspace=projects&source=project&record=${project._id}`,
      })),
      approvals: briefing.approvals.map(item => ({
        ...turn(item), expiresAt: item.approval.expiresAt, read: readKeys.has("approval:" + item.approval.id),
      })),
      recent: briefing.recent.map(item => ({
        ...turn(item), finishedAt: item.finishedAt,
        ...(["failed", "interrupted"].includes(item.status) ? { read: readKeys.has("incident:" + item._id) } : {}),
      })),
      schedules: briefing.next.map(item => ({ ...turn(item), scheduledAt: item.scheduledAt })),
    });
  });

  worker.post("/jobs/:id/objective-proposal", async (req, res) => {
    const ownerId = owner();
    const { project, callId } = req.body ?? {};
    const input = objectiveInput(req.body);
    if (!uuid.test(req.params.id) || typeof project !== "string" || !project.trim() || project.length > 100 || !project.isWellFormed() ||
        typeof callId !== "string" || !/^[\w-]{1,150}$/.test(callId) || !input) {
      return fail(res, 400, "Invalid objective proposal.");
    }
    const job = await directTurn(req);
    if (!job) return fail(res, 409, "An active First Mate turn is required.");
    const candidates = await projects().find({ ownerId, status: "active", name: sameName(project.trim()) }, {
      projection: { name: 1, revision: 1 },
    }).limit(2).toArray();
    if (candidates.length !== 1) return fail(res, 409, "Specify the exact name of one active project.");
    const [target] = candidates;
    const action = {
      action: "objective.create", authorization: "owner-approval-required", validation: "validated",
      ownerId, jobId: job._id, sessionId: job.sessionId || job._id,
      actor: job.studioActor ?? { role: "first-mate", binding: "unassigned" },
      projectId: target._id, projectName: target.name, expectedRevision: target.revision ?? null, input,
    };
    const digest = fingerprint(action);
    // One objective proposal per turn keeps a worker from flooding the owner inbox.
    const _id = job._id;
    const stored = await proposals().findOneAndUpdate({ _id, ownerId }, {
      $setOnInsert: { ...action, digest, callId, objectiveId: randomUUID(), state: "pending", createdAt: new Date() },
    }, { upsert: true, returnDocument: "after" });
    if (stored.digest !== digest || stored.callId !== callId) {
      return fail(res, 409, "This turn already has an objective proposal.");
    }
    return res.json({ state: stored.state, jobId: job._id, project: target.name });
  });

  browser.get("/jobs/:id/objective-proposal", async (req, res) => {
    const entry = await proposals().findOne({ _id: req.params.id, ownerId: owner() });
    return res.json(entry ? safe(entry) : null);
  });
  browser.post("/jobs/:id/objective-proposal", async (req, res) => {
    const ownerId = owner();
    const { digest, decision } = req.body ?? {};
    if (typeof digest !== "string" || !/^[a-f\d]{64}$/.test(digest) || !["approve", "reject"].includes(decision)) {
      return fail(res, 400, "Provide the reviewed objective proposal and decision.");
    }
    const query = { _id: req.params.id, ownerId, digest };
    let entry = await proposals().findOne(query);
    if (!entry) return fail(res, 404, "Objective proposal unavailable.");
    if (entry.state === "pending" && decision === "reject") {
      entry = await proposals().findOneAndUpdate({ ...query, state: "pending" }, {
        $set: { state: "rejected", decidedAt: new Date(), decidedBy: "owner" },
      }, { returnDocument: "after" });
    }
    if (entry?.state === "rejected" && decision === "reject") return res.json(safe(entry));
    if (entry?.state === "applied" && decision === "approve") return res.json(safe(entry));
    if (!entry || decision !== "approve" || !["pending", "authorized"].includes(entry.state)) {
      return fail(res, 409, "The objective proposal changed.");
    }
    const existing = await objectives().findOne({ _id: entry.objectiveId, ownerId, "provenance.sourceTurnId": entry.jobId });
    if (!existing && entry.state === "pending" && !await projects().findOne({
      _id: entry.projectId, ownerId, status: "active", revision: entry.expectedRevision,
    })) return fail(res, 409, "The project changed. Ask First Mate to prepare a fresh proposal.");
    if (entry.state === "pending") {
      const authorized = await proposals().findOneAndUpdate({ ...query, state: "pending" }, {
        $set: { state: "authorized", decidedAt: new Date(), decidedBy: "owner" },
      }, { returnDocument: "after" });
      if (!authorized) return fail(res, 409, "The objective proposal changed. Try again.");
      entry = authorized;
    }
    if (!existing) {
      const project = { _id: entry.projectId, ownerId };
      // The project revision check and approval receipt share a single atomic write.
      // This is the authorization point even if an owner edit arrives before the objective insert.
      const confirmed = await projects().updateOne({
        ...project, status: "active", revision: entry.expectedRevision,
      }, { $addToSet: { studioActionReceipts: entry._id } });
      if (!confirmed.matchedCount && !await projects().findOne({ ...project, studioActionReceipts: entry._id })) {
        return fail(res, 409, "The project changed. Ask First Mate to prepare a fresh proposal.");
      }
      const record = objectiveRecord({ id: entry.objectiveId, input: entry.input, ownerId, projectId: entry.projectId });
      const objectiveKey = { _id: record._id, ownerId, "provenance.sourceTurnId": entry.jobId };
      try {
        await objectives().updateOne(objectiveKey, {
          $setOnInsert: { ...record, provenance: { sourceTurnId: entry.jobId,
            sessionId: entry.sessionId, proposedBy: entry.actor, authorizedBy: "owner", actionDigest: digest } },
        }, { upsert: true });
      } catch (error) {
        if (error.code !== 11000 || !await objectives().findOne(objectiveKey)) throw error;
      }
    }
    const saved = await proposals().findOneAndUpdate({ ...query, state: { $in: ["authorized", "applied"] } }, {
      $set: { state: "applied" }, $min: { appliedAt: new Date() },
    }, { returnDocument: "after" });
    await projects().updateOne({ _id: entry.projectId, ownerId, studioActionReceipts: entry._id }, {
      $pull: { studioActionReceipts: entry._id },
    });
    return res.json(safe(saved));
  });
  return { browser, worker };
}

module.exports = { createStudioActions };

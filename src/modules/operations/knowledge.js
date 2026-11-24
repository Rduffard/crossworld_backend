const { randomUUID } = require("node:crypto");
const express = require("express");

const kinds = ["procedure", "research", "decision", "handover", "handbook", "qa", "air"];
const memoryKinds = ["decision", "preference", "policy"];
const provenance = ["untested", "external", "experimental", "validated", "owner-approved", "deprecated", "failed"];
const pickText = (value, max) => typeof value === "string" && value.isWellFormed() && value.length <= max
  ? value.trim() : null;

function createKnowledge({ records, projects, owner }) {
  const router = express.Router();
  let indexed;
  const ensureIndex = () => {
    indexed ||= records().createIndex({ ownerId: 1, title: "text", project: "text", summary: "text", source: "text" }, {
      name: "knowledge_search", default_language: "none",
    }).catch((error) => { indexed = undefined; throw error; });
    return indexed;
  };

  router.get("/", async (req, res) => {
    const query = pickText(req.query.q ?? "", 120);
    const kind = req.query.kind;
    if (query === null || (kind !== undefined && !kinds.includes(kind))) {
      return res.status(400).json({ message: "Invalid knowledge search." });
    }
    if (query) await ensureIndex();
    const filter = {
      ownerId: owner(), ...(kind ? { kind } : {}), ...(query ? { $text: { $search: query } } : {}),
    };
    const entries = await records().find(filter, {
      projection: { ownerId: 0, body: 0, evidence: 0, limitations: 0 },
    }).sort({ createdAt: -1, _id: 1 }).limit(50).toArray();
    return res.json(entries);
  });

  router.post("/", async (req, res) => {
    const { kind, status, projectId, memoryKind } = req.body || {};
    const fields = Object.fromEntries(Object.entries({
      title: 120, project: 100, summary: 400, body: 8000, source: 500, author: 100, evidence: 2000, limitations: 2000, license: 300,
    }).map(([key, limit]) => [key, pickText(req.body?.[key] ?? "", limit)]));
    if (Object.values(fields).includes(null) || !fields.title || !fields.summary || !fields.body ||
        !fields.source || !fields.author || !kinds.includes(kind) || !provenance.includes(status) ||
        (memoryKind && (kind !== "decision" || !memoryKinds.includes(memoryKind))) ||
        (["validated", "owner-approved"].includes(status) && !fields.evidence) ||
        (projectId != null && (typeof projectId !== "string" || projectId.length > 80))) {
      return res.status(400).json({ message: "Provide content, an author and a source. Validated entries require evidence." });
    }
    const linked = projectId && await projects?.().findOne({ _id: projectId, ownerId: owner() });
    if (projectId && !linked) return res.status(404).json({ message: "Project unavailable." });
    const _id = randomUUID();
    await records().insertOne({ _id, ownerId: owner(), kind, status, ...fields,
      ...(kind === "decision" ? { memoryKind: memoryKind || "decision", revision: 0, recordedBy: "owner" } : {}),
      ...(linked ? { projectId: linked._id, project: linked.name } : {}), createdAt: new Date() });
    return res.status(201).json({ _id });
  });

  router.patch("/:id/decision", async (req, res) => {
    const { revision, action, memoryKind } = req.body || {};
    if (!Number.isSafeInteger(revision) || revision < 0 || !["revise", "retire"].includes(action)) {
      return res.status(400).json({ message: "Provide the decision revision and action." });
    }
    const record = await records().findOne({ _id: req.params.id, ownerId: owner(), kind: "decision", status: "owner-approved" });
    if (!record) return res.status(404).json({ message: "Active approved decision unavailable." });
    if ((record.revision ?? 0) !== revision) return res.status(409).json({ message: "The decision changed. Reload before updating." });
    const fields = Object.fromEntries(Object.entries({
      title: 120, summary: 400, body: 8000, source: 500, evidence: 2000,
    }).map(([key, limit]) => [key, pickText(req.body?.[key], limit)]));
    if (action === "revise" && (!memoryKinds.includes(memoryKind) || Object.values(fields).some(value => !value))) {
      return res.status(400).json({ message: "Provide the revised decision and evidence for its source." });
    }
    const at = new Date();
    const { title, summary, body, source, evidence, memoryKind: priorKind } = record;
    const history = { title, summary, body, source, evidence, memoryKind: priorKind || "decision", revision, replacedAt: at, replacedBy: "owner" };
    const filter = {
      _id: record._id, ownerId: owner(), status: "owner-approved",
      ...(revision === 0 ? { revision: { $in: [0, null] } } : { revision }),
    };
    const changes = action === "retire" ? { status: "deprecated" } : { ...fields, memoryKind };
    const saved = await records().updateOne(filter, {
      $set: { ...changes, updatedAt: at, updatedBy: "owner", revision: revision + 1 },
      $push: { decisionHistory: { $each: [history], $slice: -50 } },
    });
    if (!saved.matchedCount) return res.status(409).json({ message: "The decision changed. Reload before updating." });
    return res.sendStatus(204);
  });

  router.get("/:id", async (req, res) => {
    const record = await records().findOne({ _id: req.params.id, ownerId: owner() }, { projection: { ownerId: 0 } });
    if (!record) return res.status(404).json({ message: "Knowledge entry not found." });
    return res.json(record);
  });

  return router;
}

async function approvedDecisions(records, ownerId, projectIds) {
  return records().find({
    ownerId, kind: "decision", status: "owner-approved",
    $or: [{ projectId: null }, { projectId: { $in: projectIds } }],
  }, {
    projection: { title: 1, summary: 1, source: 1, memoryKind: 1, projectId: 1, revision: 1, createdAt: 1, updatedAt: 1 },
  }).sort({ updatedAt: -1, createdAt: -1, _id: 1 }).limit(6).toArray();
}

module.exports = { createKnowledge, approvedDecisions };

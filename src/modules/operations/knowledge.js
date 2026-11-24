const { randomUUID } = require("node:crypto");
const express = require("express");

const kinds = ["procedure", "research", "decision", "handover", "handbook", "qa", "air"];
const provenance = ["untested", "external", "experimental", "validated", "deprecated", "failed"];
const pickText = (value, max) => typeof value === "string" && value.isWellFormed() && value.length <= max
  ? value.trim() : null;

function createKnowledge({ records, owner }) {
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
    const { kind, status } = req.body || {};
    const fields = Object.fromEntries(Object.entries({
      title: 120, project: 100, summary: 400, body: 8000, source: 500, author: 100, evidence: 2000, limitations: 2000,
    }).map(([key, limit]) => [key, pickText(req.body?.[key] ?? "", limit)]));
    if (Object.values(fields).includes(null) || !fields.title || !fields.summary || !fields.body ||
        !fields.source || !fields.author || !kinds.includes(kind) || !provenance.includes(status) ||
        (status === "validated" && !fields.evidence)) {
      return res.status(400).json({ message: "Provide content, an author and a source. Validated entries require evidence." });
    }
    const _id = randomUUID();
    await records().insertOne({ _id, ownerId: owner(), kind, status, ...fields, createdAt: new Date() });
    return res.status(201).json({ _id });
  });

  router.get("/:id", async (req, res) => {
    const record = await records().findOne({ _id: req.params.id, ownerId: owner() }, { projection: { ownerId: 0 } });
    if (!record) return res.status(404).json({ message: "Knowledge entry not found." });
    return res.json(record);
  });

  return router;
}

module.exports = { createKnowledge };

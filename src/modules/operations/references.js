const express = require("express");

const categories = ["visual", "technical", "candidate", "review-evidence"];
const states = ["provisional", "approved", "superseded"];
const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const text = (value, max) => typeof value === "string" && value.isWellFormed() && value.length <= max ? value.trim() : null;

function createReferences({ records, media, projects, owner }) {
  const router = express.Router();
  router.get("/", async (req, res) => {
    const search = text(req.query.q ?? "", 100);
    const status = req.query.status;
    const before = req.query.before;
    if (search === null || (status && !states.includes(status)) || (before && typeof before !== "string")) {
      return res.status(400).json({ message: "Invalid reference filters." });
    }
    const scope = { ownerId: owner() };
    const query = { ...scope, ...(status ? { status } : {}) };
    const conditions = [];
    if (before) {
      const previous = await records().findOne({ ...scope, _id: before }, { projection: { createdAt: 1 } });
      if (!previous) return res.status(404).json({ message: "Reference cursor unavailable." });
      conditions.push({ $or: [{ createdAt: { $lt: previous.createdAt } }, { createdAt: previous.createdAt, _id: { $lt: before } }] });
    }
    if (search) {
      const literal = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      conditions.push({ $or: [{ name: literal }, { description: literal }, { tags: literal }, { source: literal }] });
    }
    if (conditions.length) query.$and = conditions;
    const entries = await records().find(query, { projection: { ownerId: 0 } }).sort({ createdAt: -1, _id: -1 }).limit(41).toArray();
    return res.json({ entries: entries.slice(0, 40), nextBefore: entries.length > 40 ? entries[39]._id : null });
  });

  router.post("/", async (req, res) => {
    const { id, mediaId, category, projectId, tags } = req.body ?? {};
    const name = text(req.body?.name, 160);
    const source = text(req.body?.source, 1000);
    const description = text(req.body?.description ?? "", 3000);
    const license = text(req.body?.license ?? "", 500);
    if (typeof id !== "string" || !idPattern.test(id) || typeof mediaId !== "string" || !idPattern.test(mediaId) ||
        !categories.includes(category) || typeof projectId !== "string" || projectId.length > 80 ||
        !name || !source || description === null || license === null || !Array.isArray(tags) ||
        tags.length > 12 || tags.some(tag => !text(tag, 40))) {
      return res.status(400).json({ message: "Provide a ready attachment, title, category, and source." });
    }
    const ownerId = owner();
    const asset = await media().findOne({ _id: mediaId, ownerId, state: "ready" }, { projection: { mime: 1, size: 1, sha256: 1, hostId: 1 } });
    if (!asset || (projectId && !await projects().findOne({ _id: projectId, ownerId }))) {
      return res.status(404).json({ message: "Attachment or project unavailable." });
    }
    const now = new Date();
    const _id = ownerId + ":" + id;
    const metadata = { name, source, description, license, category, tags: [...new Set(tags.map(tag => tag.trim()))], mediaId, projectId };
    const saved = await records().findOneAndUpdate({ _id, ownerId }, {
      $setOnInsert: { ...metadata, asset, createdAt: now, updatedAt: now, revision: 0, status: "provisional",
        history: [{ status: "provisional", recordedAt: now, recordedBy: "owner" }] },
    }, { upsert: true, returnDocument: "after", includeResultMetadata: true });
    if (Object.entries(metadata).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(saved.value[key]))) {
      return res.status(409).json({ message: "This submission ID already refers to another reference." });
    }
    return res.status(saved.lastErrorObject.updatedExisting ? 200 : 201).json({ _id });
  });

  router.put("/:id/status", async (req, res) => {
    const { revision, status } = req.body ?? {};
    if (!Number.isSafeInteger(revision) || revision < 0 || !["approved", "superseded"].includes(status)) {
      return res.status(400).json({ message: "Provide an expected revision and allowed status." });
    }
    const current = status === "approved" ? "provisional" : { $in: ["approved", "provisional"] };
    const now = new Date();
    const result = await records().updateOne({ _id: req.params.id, ownerId: owner(), revision, status: current }, {
      $set: { status, updatedAt: now }, $inc: { revision: 1 }, $push: { history: { status, recordedAt: now, recordedBy: "owner" } },
    });
    return result.matchedCount ? res.sendStatus(204) : res.status(409).json({ message: "Reference changed. Reload before proceeding." });
  });
  return router;
}

module.exports = { createReferences };

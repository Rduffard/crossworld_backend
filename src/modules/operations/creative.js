const express = require("express");
const { responseMarker } = require("./objective-runs");

const workflow = {
  direction: {
    draft: ["proposed"],
    proposed: ["draft", "approved", "rejected"],
    approved: ["superseded"],
    rejected: ["draft"],
    superseded: [],
  },
  brief: {
    draft: ["active"],
    active: ["technical-review", "rejected"],
    "technical-review": ["artistic-review", "revision", "rejected"],
    "artistic-review": ["independent-review", "revision", "rejected"],
    revision: ["active", "rejected"],
    "independent-review": ["recommended", "revision", "rejected"],
    recommended: ["accepted", "revision", "rejected"],
    accepted: [],
    rejected: [],
  },
};
const text = (value, max) => typeof value === "string" && value.isWellFormed() && value.length <= max ? value.trim() : "";
const recordId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const referenceId = /^[a-f\d]{24}:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const limit = 96;

function allowed(record) {
  return workflow[record.kind][record.stage];
}

function view(record) {
  const details = { ...record, transitions: allowed(record) };
  delete details.ownerId;
  return details;
}

function createCreative({ records, projects, objectives, jobs, eventBatches, references, owner }) {
  const router = express.Router();
  const validReferences = (ids) => Array.isArray(ids) && ids.length <= 8 &&
    new Set(ids).size === ids.length && ids.every((id) => typeof id === "string" && referenceId.test(id));
  const scope = (record) => ({ ownerId: record.ownerId, projectId: { $in: ["", record.projectId] } });

  async function available(record, ids) {
    return !ids.length || await references().countDocuments({
      ...scope(record), _id: { $in: ids }, status: { $ne: "superseded" },
    }) === ids.length;
  }

  async function detail(record) {
    const ids = record.referenceIds || [];
    const linkedReferences = ids.length ? await references().find({
      ...scope(record), _id: { $in: ids },
    }, { projection: { name: 1, status: 1, category: 1, mediaId: 1 } }).limit(8).toArray() : [];
    return { ...view(record), linkedReferences };
  }
  router.get("/", async (req, res) => {
    const projectId = req.query.projectId;
    if (projectId != null && (typeof projectId !== "string" || !projectId || projectId.length > 80)) {
      return res.status(400).json({ message: "Invalid project." });
    }
    const entries = await records().find({ ownerId: owner(), ...(projectId ? { projectId } : {}) }, {
      projection: { history: 0 },
    }).sort({ updatedAt: -1, _id: -1 }).limit(50).toArray();
    return res.json(entries.map(view));
  });

  router.get("/:id", async (req, res) => {
    const record = await records().findOne({ _id: req.params.id, ownerId: owner() });
    return record ? res.json(await detail(record)) : res.status(404).json({ message: "Creative record unavailable." });
  });

  router.post("/", async (req, res) => {
    const { id, kind, projectId, objectiveId, referenceIds = [] } = req.body ?? {};
    const title = text(req.body?.title, 160);
    const content = text(req.body?.content, 8000);
    const source = text(req.body?.source, 1500);
    if (typeof id !== "string" || !recordId.test(id) || typeof kind !== "string" || !Object.hasOwn(workflow, kind) ||
        typeof projectId !== "string" || !projectId || projectId.length > 80 || !title || !content || !source ||
        !validReferences(referenceIds) ||
        (objectiveId != null && (kind !== "brief" || typeof objectiveId !== "string" || !recordId.test(objectiveId)))) {
      return res.status(400).json({ message: "Provide a project, title, requirements, and source." });
    }
    const ownerId = owner();
    const _id = ownerId + ":" + id;
    if (!await projects().findOne({ _id: projectId, ownerId })) return res.status(404).json({ message: "Project unavailable." });
    if (objectiveId && !await objectives().findOne({ _id: objectiveId, ownerId, projectId }, { projection: { _id: 1 } })) {
      return res.status(404).json({ message: "The objective is unavailable for this project." });
    }
    if (!await available({ ownerId, projectId }, referenceIds) &&
        !await records().findOne({ _id, ownerId }, { projection: { _id: 1 } })) {
      return res.status(404).json({ message: "A selected reference is unavailable for this project." });
    }
    const now = new Date();
    const initial = { title, content, source, referenceIds, objectiveId: objectiveId || null,
      stage: "draft", revision: 0, recordedAt: now, recordedBy: "owner" };
    const saved = await records().findOneAndUpdate({ _id, ownerId }, {
      $setOnInsert: { kind, projectId, ...initial, history: [initial], updatedAt: now },
    }, { upsert: true, returnDocument: "after", includeResultMetadata: true });
    const [original] = saved.value.history;
    if (saved.value.kind !== kind || saved.value.projectId !== projectId ||
        original.title !== title || original.content !== content || original.source !== source ||
        (original.objectiveId ?? null) !== (objectiveId ?? null) ||
        JSON.stringify(original.referenceIds || []) !== JSON.stringify(referenceIds)) {
      return res.status(409).json({ message: "This submission ID already refers to a different record." });
    }
    return res.status(saved.lastErrorObject.updatedExisting ? 200 : 201).json(await detail(saved.value));
  });

  router.put("/:id", async (req, res) => {
    const { revision, stage, reviewTurnId, referenceIds, objectiveId } = req.body ?? {};
    const content = text(req.body?.content, 8000);
    const source = text(req.body?.source, 1500);
    if (!Number.isSafeInteger(revision) || revision < 0 || !content || !source ||
        (reviewTurnId != null && (typeof reviewTurnId !== "string" || !recordId.test(reviewTurnId))) ||
        (objectiveId != null && (typeof objectiveId !== "string" || !recordId.test(objectiveId))) ||
        (referenceIds !== undefined && !validReferences(referenceIds))) {
      return res.status(400).json({ message: "Provide revision, requirements and evidence." });
    }
    const ownerId = owner();
    const current = await records().findOne({ _id: req.params.id, ownerId });
    if (!current) return res.status(404).json({ message: "Creative record unavailable." });
    const editable = ["draft", "active", "revision"].includes(current.stage);
    if (revision !== current.revision || revision >= limit ||
        (stage === current.stage ? !editable : !allowed(current).includes(stage))) {
      return res.status(409).json({ message: "This record changed or the transition is unavailable. Reload before proceeding." });
    }
    if (!editable && content !== current.content) {
      return res.status(409).json({ message: "Return the record for revision before changing its requirements." });
    }
    const nextObjective = objectiveId ?? current.objectiveId ?? null;
    if (objectiveId && objectiveId !== current.objectiveId) {
      if (!editable || current.kind !== "brief") {
        return res.status(409).json({ message: "Change the linked objective while the brief is editable." });
      }
      if (!await objectives().findOne({ _id: objectiveId, ownerId, projectId: current.projectId }, { projection: { _id: 1 } })) {
        return res.status(404).json({ message: "The objective is unavailable for this project." });
      }
    }
    const currentReferences = current.referenceIds || [];
    const nextReferences = referenceIds ?? currentReferences;
    const changesReferences = JSON.stringify(currentReferences) !== JSON.stringify(nextReferences);
    if (changesReferences && ["recommended", "accepted", "approved", "superseded"].includes(stage)) {
      return res.status(409).json({ message: "Record a new revision before changing this decision's reference evidence." });
    }
    if (!await available(current, nextReferences.filter((id) => !currentReferences.includes(id)))) {
      return res.status(404).json({ message: "A selected reference is unavailable for this project." });
    }
    if (stage === "recommended" && (!reviewTurnId || !nextObjective)) {
      return res.status(400).json({ message: "Link a brief objective and its completed independent QA turn before recommending this brief." });
    }
    if (reviewTurnId) {
      const job = await jobs().findOne({
        _id: reviewTurnId, ownerId, status: "completed",
        ...(stage === "recommended" ? { workerRole: "qa", objectiveId: nextObjective } : {}),
      });
      if (!job || job.projectId !== current.projectId) return res.status(404).json({ message: "A completed review turn for this project is required." });
      if (stage === "recommended" && !await responseMarker(job, eventBatches(), "QA_VERDICT: PASS")) {
        return res.status(409).json({ message: "The completed independent QA turn must contain a passing verdict." });
      }
    }
    const now = new Date();
    const change = { title: current.title, stage, content, source, objectiveId: nextObjective,
      referenceIds: nextReferences, revision: revision + 1,
      recordedAt: now, recordedBy: "owner", ...(reviewTurnId ? { reviewTurnId } : {}) };
    const updated = await records().findOneAndUpdate({ _id: current._id, ownerId, revision }, {
      $set: { stage, content, source, objectiveId: nextObjective, referenceIds: nextReferences, updatedAt: now,
        revision: change.revision }, $push: { history: change },
    }, { returnDocument: "after" });
    if (!updated) return res.status(409).json({ message: "This record changed. Reload before proceeding." });
    return res.json(await detail(updated));
  });
  return router;
}

module.exports = { createCreative };

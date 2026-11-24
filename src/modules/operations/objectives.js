const { randomUUID } = require("node:crypto");
const express = require("express");

const idPattern = /^[a-f\d-]{36}$/;
const nonempty = (value, limit) =>
  typeof value === "string" && value.length <= limit && value.isWellFormed() && !!value.trim();

function objectiveInput(value) {
  const { title, instruction, criteria, priority = "normal" } = value || {};
  if (!nonempty(title, 120) || !nonempty(instruction, 6000) || !["low", "normal", "high"].includes(priority) ||
      !Array.isArray(criteria) || !criteria.length || criteria.length > 12 ||
      !criteria.every(criterion => nonempty(criterion, 400)) ||
      new Set(criteria.map(criterion => criterion.trim())).size !== criteria.length) return null;
  return { title: title.trim(), instruction, priority, criteria: criteria.map(criterion => criterion.trim()) };
}

function objectiveRecord({ input, ownerId, projectId, id = randomUUID(), now = new Date() }) {
  return {
    _id: id, ownerId, ...input, status: "active", ...(projectId ? { projectId } : {}),
    criteria: input.criteria.map(criterion => ({ id: randomUUID(), text: criterion, review: null })),
    createdAt: now, updatedAt: now, revision: 0,
  };
}

function createObjectives({ records, projects, jobs, jobView, owner }) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const { projectId } = req.query;
    if (projectId !== undefined && (typeof projectId !== "string" || !idPattern.test(projectId))) {
      return res.status(400).json({ message: "Invalid project filter." });
    }
    const objectives = await records().find({ ownerId: owner(), ...(projectId ? { projectId } : {}) }, {
      projection: { title: 1, priority: 1, status: 1, projectId: 1 },
    }).sort({ createdAt: -1, _id: 1 }).limit(50).toArray();
    res.json(objectives);
  });

  router.post("/", async (req, res) => {
    const { projectId } = req.body || {};
    const input = objectiveInput(req.body);
    if ((projectId !== undefined && (typeof projectId !== "string" || !idPattern.test(projectId))) || !input) {
      return res.status(400).json({ message: "Provide a title, instruction and 1 to 12 distinct acceptance criteria." });
    }
    if (projectId && !(await projects().findOne({ _id: projectId, ownerId: owner(), status: "active" }))) {
      return res.status(409).json({ message: "Only active projects can receive new objectives." });
    }
    const record = objectiveRecord({ input, ownerId: owner(), projectId });
    await records().insertOne(record);
    return res.status(201).json({ _id: record._id });
  });

  router.get("/:id/assignments", async (req, res) => {
    const assignments = await jobs().find({
      objectiveId: req.params.id, ownerId: owner(), assignedRole: { $in: ["worker", "lead", "art-director"] },
    }, { projection: { status: 1, leaseUntil: 1, assigneeName: 1, workspace: 1, title: 1, objectiveId: 1, createdAt: 1 } })
      .sort({ createdAt: -1, _id: 1 }).limit(50).toArray();
    return res.json(assignments.map(jobView));
  });
  router.get("/:id", async (req, res) => {
    const objective = await records().findOne({ _id: req.params.id, ownerId: owner() }, { projection: { ownerId: 0 } });
    if (!objective) return res.status(404).json({ message: "Objective not found." });
    return res.json(objective);
  });

  router.post("/:id/criteria/:criterionId/review", async (req, res) => {
    const { decision, evidence, revision } = req.body || {};
    const { id, criterionId } = req.params;
    if (!idPattern.test(id) || !idPattern.test(criterionId) ||
        !["accepted", "rejected"].includes(decision) || !nonempty(evidence, 1200) ||
        !Number.isSafeInteger(revision) || revision < 0) {
      return res.status(400).json({ message: "Provide an acceptance decision and its evidence." });
    }
    const filter = { _id: id, ownerId: owner(), status: "active", revision };
    const objective = await records().findOne(filter);
    if (!objective?.criteria.some((criterion) => criterion.id === criterionId)) {
      return res.status(409).json({ message: "The objective or criterion changed. Reload the latest record." });
    }
    const now = new Date();
    const review = { decision, evidence: evidence.trim(), at: now };
    const criteria = objective.criteria.map((criterion) =>
      criterion.id === criterionId ? { ...criterion, review } : criterion);
    const complete = criteria.every((criterion) => criterion.review?.decision === "accepted");
    const saved = await records().updateOne(filter, {
      $set: { criteria, updatedAt: now, ...(complete ? { status: "completed", completedAt: now } : {}) },
      $push: { reviewHistory: { criterionId, ...review } },
      $inc: { revision: 1 },
    });
    if (!saved.matchedCount) return res.status(409).json({ message: "The objective changed. Reload the latest record." });
    return res.sendStatus(204);
  });

  return router;
}

module.exports = { createObjectives, objectiveInput, objectiveRecord };

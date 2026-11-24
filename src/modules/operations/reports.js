const express = require("express");

const reportable = {
  status: "completed", employeeId: { $type: "string" }, objectiveId: { $type: "string" }, parentId: null,
};
const reportFields = {
  title: 1, workspace: 1, employeeId: 1, assigneeName: 1, reviewerName: 1, projectId: 1, objectiveId: 1,
  status: 1, profile: 1, createdAt: 1, startedAt: 1, finishedAt: 1, workerRole: 1, reviewOf: 1,
  "delegatedBy.sourceTurnId": 1, "delegatedBy.employeeId": 1, eventCount: 1,
};
const idPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/;
const regexCharacters = /[.*+?^${}()|[\]\\]/g;

function reportText(value) {
  return value
    .replace(/\bBearer[ \t]+[\w.~/+=-]+/gi, "Bearer [redacted]")
    .replace(/\b(?:github_pat_|gh[pousr]_|sk-)[\w-]+/g, "[redacted]")
    .replace(/\b[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.[a-f\d]{64}\b/gi, "[redacted]")
    .replace(/\b(?:token|password|api[_ -]?key|secret)\s*[:=]\s*[^\s]+/gi, "[redacted]");
}

function createReports({ jobs, objectives, projects, workforce, eventBatches, owner }) {
  const router = express.Router();
  router.get("/", async (req, res) => {
    const { projectId, employeeId, search = "", before } = req.query;
    if (![projectId, employeeId, before].every(value => value === undefined || typeof value === "string" && idPattern.test(value)) ||
        typeof search !== "string" || search.length > 100 || !search.isWellFormed()) {
      return res.status(400).json({ message: "Invalid report filter." });
    }
    const filter = { ...reportable, ownerId: owner(), ...(projectId ? { projectId } : {}), ...(employeeId ? { employeeId } : {}) };
    if (search.trim()) {
      const literal = new RegExp(search.trim().replace(regexCharacters, "\\$&"), "i");
      filter.$or = [{ title: literal }, { assigneeName: literal }, { reviewerName: literal }];
    }
    if (before) {
      const cursor = await jobs().findOne({ ...filter, _id: before }, { projection: { finishedAt: 1 } });
      if (!cursor) return res.status(404).json({ message: "Report cursor unavailable." });
      filter.$and = [{ $or: [{ finishedAt: { $lt: cursor.finishedAt } }, { finishedAt: cursor.finishedAt, _id: { $gt: cursor._id } }] }];
    }
    const records = await jobs().find(filter, { projection: reportFields }).sort({ finishedAt: -1, _id: 1 }).limit(26).toArray();
    return res.json({ reports: records.slice(0, 25), before: records.length === 26 ? records[24]._id : null });
  });

  router.get("/:id", async (req, res) => {
    if (!idPattern.test(req.params.id)) return res.status(400).json({ message: "Invalid report identifier." });
    const ownerId = owner();
    const report = await jobs().findOne({ ...reportable, _id: req.params.id, ownerId }, {
      projection: { ...reportFields, prompt: 1, mediaInputs: 1, events: 1 },
    });
    if (!report) return res.status(404).json({ message: "Report unavailable." });
    const { events: legacy = [], mediaInputs, prompt, ...metadata } = report;
    const responseParts = legacy.filter(event => event.view === "response").map(event => event.text);
    const batches = eventBatches().find({
      jobId: report._id, offset: { $lt: report.eventCount },
      events: { $elemMatch: { view: "response" } },
    }, { projection: { offset: 1, events: 1 } }).sort({ offset: 1 });
    for await (const batch of batches) {
      const committed = batch.events.slice(Math.max(0, legacy.length - batch.offset), report.eventCount - batch.offset);
      responseParts.push(...committed.filter(event => event.view === "response").map(event => event.text));
    }
    const response = reportText(responseParts.join(""));
    const [objective, project, supervisor, review] = await Promise.all([
      objectives().findOne({ ownerId, _id: report.objectiveId }, { projection: { title: 1, status: 1, criteria: 1 } }),
      report.projectId && projects().findOne({ ownerId, _id: report.projectId }, { projection: { name: 1 } }),
      report.delegatedBy?.employeeId && workforce().findOne({ ownerId, _id: report.delegatedBy.employeeId }, { projection: { name: 1 } }),
      jobs().find({ ownerId, reviewOf: report._id, workerRole: { $in: ["qa", "first-mate", "air"] } }, {
        projection: { title: 1, workerRole: 1, status: 1, reviewerName: 1 },
      }).sort({ createdAt: -1, _id: 1 }).limit(20).toArray(),
    ]);
    return res.json({
      ...metadata, prompt: reportText(prompt || ""), response, objective, project, supervisor, review,
      attachments: (mediaInputs || []).map(({ name, mime }) => ({ name: reportText(name || "Attachment"), mime })),
    });
  });
  return router;
}

module.exports = { createReports };

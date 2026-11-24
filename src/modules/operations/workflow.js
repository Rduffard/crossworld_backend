const express = require("express");

const idPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/;
const fields = {
  title: 1, employeeId: 1, assigneeName: 1, reviewerName: 1, studioActor: 1, objectiveId: 1, projectId: 1,
  workspace: 1, workerRole: 1, status: 1, error: 1, reviewOf: 1, parentId: 1,
  "delegatedBy.sourceTurnId": 1, "delegatedBy.employeeId": 1, "delegatedBy.sessionId": 1,
  createdAt: 1, startedAt: 1, finishedAt: 1, leaseUntil: 1,
};

function createWorkflow({ jobs, projects, objectives, workforce, owner, jobView }) {
  const router = express.Router();
  router.get("/", async (req, res) => {
    const { jobId, employeeId, projectId, objectiveId } = req.query;
    if (![jobId, employeeId, projectId, objectiveId].every(value =>
      value === undefined || typeof value === "string" && idPattern.test(value))) {
      return res.status(400).json({ message: "Invalid workflow filter." });
    }
    const ownerId = owner();
    const scope = { ownerId };
    const match = {
      ...scope, employeeId: employeeId || { $type: "string" },
      objectiveId: objectiveId || { $type: "string" }, ...(projectId ? { projectId } : {}), parentId: null,
      ...(jobId ? { $or: [{ _id: jobId }, { "delegatedBy.sourceTurnId": jobId }, { reviewOf: jobId }] } : {}),
    };
    const [root, recent] = await Promise.all([
      jobId ? jobs().findOne({ ...scope, _id: jobId }, { projection: fields }) : null,
      jobs().find(match, { projection: fields }).sort({ createdAt: -1, _id: 1 }).limit(41).toArray(),
    ]);
    if (jobId && !root) return res.status(404).json({ message: "Workflow execution unavailable." });
    const nodes = new Map(recent.slice(0, 40).map(job => [job._id, job]));
    if (root) nodes.set(root._id, root);
    const parents = new Set([...nodes.values()].flatMap(job => [job.delegatedBy?.sourceTurnId, job.reviewOf])
      .filter(id => id && !nodes.has(id)));
    if (parents.size) {
      const linked = await jobs().find({ ...scope, _id: { $in: [...parents] } }, { projection: fields }).toArray();
      for (const job of linked) nodes.set(job._id, job);
    }
    const all = [...nodes.values()];
    const [projectRows, objectiveRows, employeeRows] = await Promise.all([
      projects().find({ ...scope, _id: { $in: all.map(node => node.projectId).filter(Boolean) } }, { projection: { name: 1 } }).toArray(),
      objectives().find({ ...scope, _id: { $in: all.map(node => node.objectiveId).filter(Boolean) } }, { projection: { title: 1 } }).toArray(),
      workforce().find({ ...scope, kind: "employee", _id: { $in: all.map(node => node.employeeId).filter(Boolean) } }, {
        projection: { name: 1, role: 1, supervisorId: 1 },
      }).toArray(),
    ]);
    const byId = records => new Map(records.map(item => [item._id, item]));
    const projectById = byId(projectRows);
    const objectiveById = byId(objectiveRows);
    const employeeById = byId(employeeRows);
    return res.json({
      observedAt: new Date(), limited: recent.length > 40,
      nodes: all.map(job => ({
        ...jobView(job),
        project: projectById.get(job.projectId)?.name,
        objective: objectiveById.get(job.objectiveId)?.title,
        employee: employeeById.get(job.employeeId),
        hasReport: job.status === "completed" && !!(job.employeeId && job.objectiveId) && !job.parentId,
      })),
    });
  });
  return router;
}

module.exports = { createWorkflow };

const { randomUUID } = require("node:crypto");
const express = require("express");

const roles = ["worker", "lead", "first-mate", "qa", "air"];
const availability = ["available", "paused", "retired"];
const workspaces = ["development", "workshop"];
const text = (value, limit) => typeof value === "string" && value.isWellFormed() && value.length <= limit
  ? value.trim() : null;

function createWorkforce({ records, jobs, owner, jobView }) {
  const router = express.Router();

  router.get("/", async (_req, res) => {
    const ownerId = owner();
    const [directory, observedRuns] = await Promise.all([
      records().find({ ownerId }, { projection: { ownerId: 0 } }).sort({ name: 1, _id: 1 }).toArray(),
      jobs().find({ ownerId, employeeId: { $type: "string" } }, {
        projection: { employeeId: 1, title: 1, status: 1, leaseUntil: 1, createdAt: 1 },
      }).sort({ createdAt: -1, _id: 1 }).limit(100).toArray(),
    ]);
    return res.json({
      observedRuns: observedRuns.map(jobView),
      departments: directory.filter((entry) => entry.kind === "department"),
      employees: directory.filter((entry) => entry.kind === "employee"),
    });
  });

  router.post("/departments", async (req, res) => {
    const name = text(req.body?.name, 100);
    const responsibilities = text(req.body?.responsibilities, 2000);
    if (!name || !responsibilities) return res.status(400).json({ message: "Provide the department name and responsibilities." });
    const _id = randomUUID();
    await records().insertOne({ _id, ownerId: owner(), kind: "department", name, responsibilities, createdAt: new Date() });
    return res.status(201).json({ _id });
  });

  async function saveEmployee(req, res) {
    const { role, departmentId, status, workspace, revision } = req.body || {};
    const name = text(req.body?.name, 100);
    const responsibilities = text(req.body?.responsibilities, 2000);
    const instructions = text(req.body?.instructions ?? "", 6000);
    if (!name || !responsibilities || instructions === null || !roles.includes(role) || !availability.includes(status) ||
        !workspaces.includes(workspace) || typeof departmentId !== "string" ||
        ((role === "air" || role === "first-mate") && departmentId) || (req.params.id && !Number.isSafeInteger(revision))) {
      return res.status(400).json({ message: "Provide a valid employee profile. AIR and the First Mate report to the owner." });
    }
    const ownerId = owner();
    if (departmentId && !(await records().findOne({ _id: departmentId, ownerId, kind: "department" }))) {
      return res.status(400).json({ message: "Department not found." });
    }
    const details = { name, role, departmentId: departmentId || null, status, workspace, responsibilities, instructions, updatedAt: new Date() };
    if (req.params.id) {
      const updated = await records().updateOne({ _id: req.params.id, ownerId, kind: "employee", revision }, {
        $set: details, $inc: { revision: 1 },
      });
      if (!updated.matchedCount) return res.status(409).json({ message: "Employee profile changed. Reload before editing." });
      return res.sendStatus(204);
    }
    const _id = randomUUID();
    await records().insertOne({ _id, ownerId, kind: "employee", ...details, revision: 0, createdAt: details.updatedAt });
    return res.status(201).json({ _id });
  }

  router.post("/employees", saveEmployee);
  router.put("/employees/:id", saveEmployee);
  return router;
}

module.exports = { createWorkforce };

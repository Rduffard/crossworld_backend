const { randomUUID } = require("node:crypto");
const express = require("express");

const roles = ["worker", "lead", "first-mate", "art-director", "qa", "air"];
const availability = ["available", "paused", "retired"];
const workspaces = ["development", "workshop"];
const identityFields = { background: 1200, temperament: 300, communication: 600, standards: 1200, terminology: 400 };
const text = (value, limit) => typeof value === "string" && value.isWellFormed() && value.length <= limit
  ? value.trim() : null;

function createWorkforce({ records, jobs, objectives, owner, jobView }) {
  const router = express.Router();

  router.get("/", async (_req, res) => {
    const ownerId = owner();
    const [directory, observedRuns] = await Promise.all([
      records().find({ ownerId }, { projection: { ownerId: 0 } }).sort({ name: 1, _id: 1 }).toArray(),
      jobs().find({ ownerId, employeeId: { $type: "string" } }, {
        projection: { employeeId: 1, title: 1, status: 1, leaseUntil: 1, createdAt: 1, startedAt: 1,
          finishedAt: 1, model: 1, effort: 1, profile: 1, parentId: 1, objectiveId: 1,
          "delegatedBy.sourceTurnId": 1, "delegatedBy.employeeId": 1 },
      }).sort({ createdAt: -1, _id: 1 }).limit(100).toArray(),
    ]);
    const projectAssignments = directory.filter((entry) => entry.kind === "project-assignment");
    const activationIds = [...new Set(projectAssignments
      .filter(({ activationSource }) => activationSource === "foundation-objective").map(({ objectiveId }) => objectiveId))];
    const activated = activationIds.length ? await objectives().find({
      _id: { $in: activationIds }, ownerId, "activation.by": "owner", status: { $in: ["active", "completed"] },
    }, { projection: { status: 1 } }).toArray() : [];
    const state = new Map(activated.map(({ _id, status }) => [_id, status === "active" ? "assigned" : "completed"]));
    return res.json({
      capabilities: { employeeIdentity: true, reportingChanges: true },
      observedRuns: observedRuns.map(jobView),
      departments: directory.filter((entry) => entry.kind === "department"),
      employees: directory.filter((entry) => entry.kind === "employee"),
      roles: directory.filter((entry) => entry.kind === "role"),
      projectAssignments: projectAssignments.map((entry) => entry.activationSource === "foundation-objective"
        ? { ...entry, status: state.get(entry.objectiveId) || "paused" } : entry),
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
    const suppliedIdentity = req.body?.identity;
    let identity;
    if (suppliedIdentity !== undefined) {
      if (!suppliedIdentity || typeof suppliedIdentity !== "object" || Array.isArray(suppliedIdentity) ||
          Object.keys(suppliedIdentity).some(key => !Object.hasOwn(identityFields, key))) {
        return res.status(400).json({ message: "Provide supported employee identity fields." });
      }
      identity = Object.fromEntries(Object.entries(identityFields).map(([key, length]) =>
        [key, text(suppliedIdentity[key] ?? "", length)]));
      if (Object.values(identity).includes(null)) return res.status(400).json({ message: "An employee identity field is invalid." });
    }
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
    if (identity !== undefined) details.identity = identity;
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

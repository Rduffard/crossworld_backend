const express = require("express");
const id = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/;

function reportingProblem(employee, supervisorId, byId) {
  if (supervisorId === null) return null;
  if (["first-mate", "air"].includes(employee.role)) return "This role reports directly to the owner.";
  const visited = new Set([employee._id]);
  let next = supervisorId;
  while (next) {
    if (visited.has(next)) return "A reporting relationship cannot form a cycle.";
    visited.add(next);
    const supervisor = byId.get(next);
    if (!supervisor || supervisor.status === "retired") return "Supervisor unavailable.";
    next = supervisor.supervisorId;
  }
  return null;
}

function conflict(message, status = 409) {
  return Object.assign(new Error(message), { reportingStatus: status });
}

function createReporting({ records, jobs, owner, startSession }) {
  const router = express.Router();
  router.patch("/employees/:id/supervisor", async (req, res) => {
    const employeeId = req.params.id;
    const { supervisorId, revision } = req.body || {};
    if (!id.test(employeeId) || (supervisorId !== null && (typeof supervisorId !== "string" || !id.test(supervisorId))) ||
        !Number.isSafeInteger(revision) || revision < 0) {
      return res.status(400).json({ message: "Provide a valid employee, reporting destination and revision." });
    }
    const ownerId = owner();
    const lockKey = { _id: "reporting:" + ownerId, ownerId, kind: "reporting-lock" };
    try {
      await records().updateOne(lockKey, { $setOnInsert: { version: 0 } }, { upsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    const session = startSession();
    try {
      await session.withTransaction(async () => {
        await records().updateOne(lockKey, { $inc: { version: 1 } }, { session });
        const employees = await records().find({ ownerId, kind: "employee" }, {
          session, projection: { role: 1, status: 1, supervisorId: 1, revision: 1, reportingChanges: 1 },
        }).toArray();
        const byId = new Map(employees.map(employee => [employee._id, employee]));
        const employee = byId.get(employeeId);
        if (!employee) throw conflict("Employee unavailable.", 404);
        if (employee.revision !== revision) throw conflict("Employee changed. Refresh before editing.");
        if ((employee.supervisorId || null) === supervisorId) return;
        if (employee.status === "retired" || employee.reportingChanges?.length >= 200) {
          throw conflict("This employee cannot accept another reporting change.");
        }
        const problem = reportingProblem(employee, supervisorId, byId);
        if (problem) throw conflict(problem, 400);
        const mandate = await records().findOne({ ownerId, kind: "project-assignment", employeeId, status: "assigned" }, { session });
        const run = await jobs().findOne({ ownerId, employeeId, status: { $in: ["queued", "waiting", "scheduled", "running", "cancelling"] } }, { session });
        if (mandate || run) throw conflict("Resolve current assigned work before changing supervision.");
        const now = new Date();
        const result = await records().updateOne({ ownerId, kind: "employee", _id: employeeId, revision }, {
          $set: { supervisorId, updatedAt: now }, $inc: { revision: 1 },
          $push: { reportingChanges: { from: employee.supervisorId || null, to: supervisorId, actor: "owner", at: now } },
        }, { session });
        if (!result.matchedCount) throw conflict("Employee changed. Refresh before editing.");
      });
      return res.sendStatus(204);
    } catch (error) {
      if (error.reportingStatus) return res.status(error.reportingStatus).json({ message: error.message });
      if (error.code === 20 || error.code === 263) {
        return res.status(503).json({ message: "Reporting changes require transactional database support." });
      }
      throw error;
    } finally {
      await session.endSession();
    }
  });
  return router;
}

module.exports = { createReporting, reportingProblem };

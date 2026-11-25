const express = require("express");

const kinds = ["announcement", "department-request", "handoff", "review-request", "decision-request", "notice"];
const idPattern = /^[a-f\d-]{36}$/;
const pageSize = 50;

function field(value, limit) {
  return typeof value === "string" && value.isWellFormed() && value.length <= limit ? value.trim() : "";
}

function createCommunications({ records, workforce, owner, now = () => new Date() }) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const { state = "open", before, beforeId } = req.query;
    const cutoff = typeof before === "string" && before.length <= 32 ? new Date(before) : null;
    if (!["open", "archived"].includes(state) || ((before !== undefined || beforeId !== undefined) &&
        (!cutoff || !Number.isFinite(+cutoff) || typeof beforeId !== "string" || !idPattern.test(beforeId)))) {
      return res.status(400).json({ message: "Select a valid correspondence page." });
    }
    const ownerId = owner();
    const criteria = { ownerId, state, ...(cutoff && { $or: [
      { createdAt: { $lt: cutoff } }, { createdAt: cutoff, _id: { $lt: beforeId } },
    ] }) };
    const [rows, departments] = await Promise.all([
      records().find(criteria, { projection: { ownerId: 0 } }).sort({ createdAt: -1, _id: -1 }).limit(pageSize + 1).toArray(),
      workforce().find({ ownerId, kind: "department" }, { projection: { name: 1 } }).sort({ name: 1 }).toArray(),
    ]);
    const messages = rows.slice(0, pageSize);
    const last = messages.at(-1);
    return res.json({
      messages, departments, mailbox: { state: "disconnected" },
      next: rows.length > pageSize ? { before: last.createdAt, beforeId: last._id } : null,
    });
  });

  router.post("/", async (req, res) => {
    const { id, kind, departmentId = "" } = req.body || {};
    const subject = field(req.body?.subject, 160);
    const message = field(req.body?.message, 6000);
    const ownerId = owner();
    if (typeof id !== "string" || !idPattern.test(id) || !kinds.includes(kind) || !subject || !message || typeof departmentId !== "string" ||
        (departmentId && !idPattern.test(departmentId))) {
      return res.status(400).json({ message: "Provide a valid correspondence type, subject and message." });
    }
    if (departmentId && !(await workforce().findOne({ ownerId, kind: "department", _id: departmentId }))) {
      return res.status(400).json({ message: "Department not found." });
    }
    const _id = id;
    const target = departmentId || null;
    try {
      await records().insertOne({
        _id, ownerId, kind, subject, message, departmentId: target,
        author: "owner", state: "open", createdAt: now(), revision: 0,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const existing = await records().findOne({ _id, ownerId });
      if (!existing || existing.kind !== kind || existing.subject !== subject ||
          existing.message !== message || existing.departmentId !== target) {
        return res.status(409).json({ message: "That correspondence identifier is already in use." });
      }
      return res.json({ _id });
    }
    return res.status(201).json({ _id });
  });

  router.patch("/:id", async (req, res) => {
    const { state, revision } = req.body || {};
    if (!idPattern.test(req.params.id) || !["open", "archived"].includes(state) ||
        !Number.isSafeInteger(revision) || revision < 0) {
      return res.status(400).json({ message: "Provide a valid correspondence state and revision." });
    }
    const result = await records().updateOne(
      { _id: req.params.id, ownerId: owner(), revision },
      { $set: { state, updatedAt: now() }, $inc: { revision: 1 } },
    );
    if (!result.matchedCount) return res.status(409).json({ message: "Correspondence changed or is unavailable. Refresh and retry." });
    return res.sendStatus(204);
  });

  return router;
}

module.exports = { createCommunications };

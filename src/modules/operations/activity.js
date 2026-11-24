const express = require("express");

const pageSize = 40;
const eventSources = [
  { type: "objective-opened", group: "objective", date: "createdAt" },
  { type: "objective-accepted", group: "objective", date: "completedAt" },
  { type: "turn-queued", group: "job", date: "createdAt" },
  { type: "turn-started", group: "job", date: "startedAt" },
  { type: "turn-finished", group: "job", date: "finishedAt" },
  { type: "knowledge-recorded", group: "knowledge", date: "createdAt" },
];

function timeBound(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 32) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time) : null;
}

function createActivity({ sources, owner }) {
  const router = express.Router();
  router.get("/", async (req, res) => {
    const { type, before, after } = req.query;
    const start = timeBound(after);
    const end = timeBound(before);
    if (start === null || end === null || (start && end && start >= end) ||
        (type !== undefined && !eventSources.some((source) => source.type === type))) {
      return res.status(400).json({ message: "Select a valid activity type and date range." });
    }
    const selected = type ? eventSources.filter((source) => source.type === type) : eventSources;
    const ownerId = owner();
    const groups = await Promise.all(selected.map(async ({ type: eventType, group, date }) => {
      const dates = { $type: "date", ...(start ? { $gte: start } : {}), ...(end ? { $lt: end } : {}) };
      const records = await sources[group]().find({ ownerId, [date]: dates }, { projection: {
        [date]: 1, title: 1, workspace: 1, workerRole: 1, project: 1, kind: 1,
        ...(eventType === "turn-finished" ? { status: 1 } : {}),
      } }).sort({ [date]: -1, _id: 1 }).limit(pageSize).toArray();
      return records.map((record) => ({
        id: eventType + ":" + record._id,
        sourceId: record._id, group, type: eventType, at: record[date], title: record.title || record.workspace,
        workspace: record.workspace, role: record.workerRole, status: record.status, project: record.project, kind: record.kind,
      }));
    }));
    return res.json(groups.flat().sort((left, right) => +right.at - +left.at || left.id.localeCompare(right.id)).slice(0, pageSize));
  });
  return router;
}

module.exports = { createActivity };

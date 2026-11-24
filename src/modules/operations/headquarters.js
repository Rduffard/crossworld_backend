const { usageHoldUntil } = require("./usage");
const live = ["running", "cancelling"];

function createHeadquarters({ hosts, jobs, objectives, dispatch, online }) {
  return async function headquarters(ownerId, now = new Date()) {
    const scope = { ownerId };
    const jobFields = { hostId: 1, status: 1, workspace: 1, title: 1 };
    const [devices, jobCounts, approvals, recent, active, next, objectiveCounts, settings] = await Promise.all([
      hosts().find({ ...scope, revokedAt: null }, {
        projection: { label: 1, lastSeen: 1, profiles: 1, efforts: 1, usage: 1 },
      }).sort({ label: 1, _id: 1 }).toArray(),
      jobs().aggregate([
        { $match: scope },
        { $group: { _id: { $cond: [
          { $and: [{ $in: ["$status", live] }, { $lte: ["$leaseUntil", now] }] },
          "interrupted", "$status",
        ] }, count: { $sum: 1 } } },
      ]).toArray(),
      jobs().find({
        ...scope, status: "running", leaseUntil: { $gt: now },
        "approval.state": "pending", "approval.expiresAt": { $gt: +now },
        $expr: { $ne: ["$approval.id", { $ifNull: ["$decision.id", null] }] },
      }, { projection: { ...jobFields, "approval.operation": 1, "approval.expiresAt": 1 } })
        .sort({ "approval.expiresAt": 1, _id: 1 }).limit(20).toArray(),
      jobs().find({ ...scope, finishedAt: { $type: "date" } }, {
        projection: { ...jobFields, finishedAt: 1 },
      }).sort({ finishedAt: -1, _id: 1 }).limit(12).toArray(),
      jobs().find({ ...scope, activeHost: { $type: "string" }, status: { $in: live } }, {
        projection: { ...jobFields, leaseUntil: 1, "approval.id": 1, "approval.state": 1, "approval.expiresAt": 1, "decision.id": 1 },
      }).toArray(),
      jobs().find({ ...scope, status: "scheduled" }, {
        projection: { ...jobFields, scheduledAt: 1 },
      }).sort({ scheduledAt: 1, _id: 1 }).limit(8).toArray(),
      objectives().aggregate([
        { $match: scope },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]).toArray(),
      dispatch().findOne({ _id: ownerId }, { projection: { paused: 1 } }),
    ]);

    const activeByHost = new Map(active.map((job) => [job.hostId, job]));
    const hostCounts = { online: 0, offline: 0 };
    const workforce = devices.map((host) => {
      const connected = online(host, now);
      hostCounts[connected ? "online" : "offline"] += 1;
      const job = activeByHost.get(host._id);
      const usageResumesAt = usageHoldUntil(host.usage, +now) || null;
      let state = connected ? (usageResumesAt ? "usage limited" : "idle") : "offline";
      if (job) {
        if (job.leaseUntil <= now) state = "lease expired";
        else if (job.status === "running" && job.approval?.state === "pending" &&
            job.approval.expiresAt > +now && job.decision?.id !== job.approval.id) state = "approval required";
        else state = job.status;
      }
      return { ...host, online: connected, state, usageResumesAt, job: job && {
        _id: job._id, title: job.title, workspace: job.workspace,
      } };
    });

    return {
      observedAt: now, paused: settings?.paused === true,
      hosts: hostCounts, workforce, approvals, recent, next,
      jobs: Object.fromEntries(jobCounts.map(({ _id, count }) => [_id, count])),
      objectives: Object.fromEntries(objectiveCounts.map(({ _id, count }) => [_id, count])),
    };
  };
}

module.exports = { createHeadquarters };

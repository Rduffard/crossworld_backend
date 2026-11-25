const { usageHoldUntil } = require("./usage");
const live = ["running", "cancelling"];

function createHeadquarters({ hosts, jobs, objectives, projects, finance, dispatch, receipts, online }) {
  return async function headquarters(ownerId, now = new Date()) {
    const scope = { ownerId };
    const jobFields = { hostId: 1, status: 1, workspace: 1, title: 1, assigneeName: 1, reviewerName: 1, "studioActor.name": 1, "conversationActor.name": 1 };
    const date = now.toISOString().slice(0, 10);
    const month = date.slice(0, 7);
    const [devices, jobCounts, approvals, recent, active, next, objectiveCounts, settings, activeProjects, expenses] = await Promise.all([
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
      }, { projection: { ...jobFields, "approval.id": 1, "approval.operation": 1, "approval.expiresAt": 1 } })
        .sort({ "approval.expiresAt": 1, _id: 1 }).limit(20).toArray(),
      jobs().find({ ...scope, finishedAt: { $type: "date" } }, {
        projection: { ...jobFields, finishedAt: 1 },
      }).sort({ finishedAt: -1, _id: 1 }).limit(12).toArray(),
      jobs().find({ ...scope, activeHost: { $type: "string" }, status: { $in: live } }, {
        projection: { ...jobFields, activeHost: 1, leaseUntil: 1, startedAt: 1, "approval.id": 1, "approval.state": 1, "approval.expiresAt": 1, "decision.id": 1 },
      }).toArray(),
      jobs().find({ ...scope, status: "scheduled" }, {
        projection: { ...jobFields, scheduledAt: 1 },
      }).sort({ scheduledAt: 1, _id: 1 }).limit(8).toArray(),
      objectives().aggregate([
        { $match: scope },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]).toArray(),
      dispatch().findOne({ _id: ownerId }, { projection: { paused: 1 } }),
      projects().find({ ...scope, status: "active" }, { projection: { name: 1, workspace: 1 } })
        .sort({ name: 1, _id: 1 }).limit(20).toArray(),
      finance().aggregate([
        { $match: { ...scope, month, kind: "expense", date: { $lte: date } } },
        { $group: { _id: "$currency", amount: { $sum: "$amount" } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
    ]);

    const activeByHost = new Map();
    for (const job of active) {
      if (!activeByHost.has(job.hostId)) activeByHost.set(job.hostId, []);
      activeByHost.get(job.hostId).push(job);
    }
    const hostCounts = { online: 0, offline: 0 };
    const workforce = devices.map((host) => {
      const connected = online(host, now);
      hostCounts[connected ? "online" : "offline"] += 1;
      const assignments = activeByHost.get(host._id) || [];
      assignments.sort((a, b) => Number(b.activeHost === host._id) - Number(a.activeHost === host._id));
      const current = assignments.map(job => {
        let state = job.leaseUntil <= now ? "lease expired" : job.status;
        if (state === "running" && job.approval?.state === "pending" &&
            job.approval.expiresAt > +now && job.decision?.id !== job.approval.id) state = "approval required";
        return {
          _id: job._id, title: job.title, workspace: job.workspace, status: job.status, state, startedAt: job.startedAt,
          employee: job.assigneeName || job.reviewerName || job.conversationActor?.name || job.studioActor?.name,
          slot: job.activeHost === host._id + ":review" ? "background review" : "primary",
        };
      });
      const usageResumesAt = usageHoldUntil(host.usage, +now) || null;
      let state = connected ? (usageResumesAt ? "usage limited" : "idle") : "offline";
      if (connected && current.length) state = current.some(job => job.state === "approval required") ? "approval required" : current[0].state;
      return { ...host, online: connected, state, usageResumesAt, job: current[0], jobs: current };
    });

    const attentionKeys = [
      ...approvals.map(job => "approval:" + job.approval.id),
      ...recent.filter(job => ["failed", "interrupted"].includes(job.status)).map(job => "incident:" + job._id),
    ];
    const seen = attentionKeys.length && receipts
      ? await receipts().find({ ownerId, key: { $in: attentionKeys } }, { projection: { key: 1 } }).toArray() : [];
    return {
      observedAt: now, paused: settings?.paused === true,
      hosts: hostCounts, workforce, approvals, recent, next,
      activeProjects, finance: { month, source: "manual", expenses: expenses.map(item => ({
        currency: item._id, amount: item.amount,
      })) },
      attentionRead: seen.map(item => item.key),
      jobs: Object.fromEntries(jobCounts.map(({ _id, count }) => [_id, count])),
      objectives: Object.fromEntries(objectiveCounts.map(({ _id, count }) => [_id, count])),
    };
  };
}

module.exports = { createHeadquarters };

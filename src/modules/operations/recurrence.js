const { createHash, randomUUID } = require("node:crypto");

const day = 86_400_000;
const terminal = ["completed", "failed", "interrupted", "cancelled"];

function validRepeat(repeat) {
  return !!repeat && [1, 7].includes(repeat.days) &&
    Number.isSafeInteger(repeat.count) && repeat.count >= 2 && repeat.count <= 12;
}

const digest = (request) => createHash("sha256").update(JSON.stringify(request)).digest("hex");

function createRecurrence({ records, jobs }) {
  async function existing(request) {
    const found = await records().findOne({ _id: request.id, ownerId: request.ownerId }, { projection: { requestDigest: 1 } });
    return found ? found.requestDigest === digest(request) ? "replay" : "conflict" : null;
  }

  async function register(request) {
    const { id, ownerId, hostId, workspace, model, effort, profile, prompt, scheduledAt, repeat, requiresExtendedPrompt } = request;
    try {
      await records().insertOne({
        _id: id, ownerId, hostId, workspace, model, effort, profile, prompt, requiresExtendedPrompt,
        requestDigest: digest(request), repeatDays: repeat.days, total: repeat.count, remaining: repeat.count,
        nextAt: new Date(scheduledAt), occurrenceId: randomUUID(), state: "active", createdAt: new Date(),
      });
      return "created";
    } catch (error) {
      if (error.code !== 11000) throw error;
      return await existing(request) || "conflict";
    }
  }

  async function list(ownerId) {
    return records().aggregate([
      { $match: { ownerId } },
      { $project: { hostId: 1, workspace: 1, repeatDays: 1, total: 1, remaining: 1, nextAt: 1, occurrenceId: 1, state: 1, stopReason: 1, createdAt: 1 } },
      { $facet: {
        active: [{ $match: { state: "active" } }, { $sort: { nextAt: 1, _id: 1 } }],
        history: [{ $match: { state: { $ne: "active" } } }, { $sort: { createdAt: -1, _id: 1 } }, { $limit: 25 }],
      } },
      { $project: { entries: { $concatArrays: ["$active", "$history"] } } },
      { $unwind: "$entries" }, { $replaceWith: "$entries" },
      { $lookup: {
        from: "operations_jobs", localField: "occurrenceId", foreignField: "_id", as: "occurrence",
        pipeline: [{ $match: { ownerId } }, { $project: { status: 1 } }],
      } },
      { $set: { occurrenceStatus: { $first: "$occurrence.status" } } },
      { $project: { hostId: 1, workspace: 1, repeatDays: 1, total: 1, remaining: 1, nextAt: 1, occurrenceId: 1, occurrenceStatus: 1, state: 1, stopReason: 1 } },
    ]).toArray();
  }

  async function cancel(ownerId, id) {
    const filter = { _id: id, ownerId };
    const stopped = await records().findOneAndUpdate({ ...filter, state: "active" }, {
      $set: { state: "cancelled", stopReason: "Cancelled by owner.", stoppedAt: new Date() },
    });
    const entry = stopped || await records().findOne(filter, { projection: { state: 1, occurrenceId: 1 } });
    if (!entry) return false;
    if (!stopped && entry.state !== "cancelled") return true;
    await jobs().updateOne({
      _id: entry.occurrenceId, seriesId: id, ownerId, status: { $in: ["scheduled", "queued"] },
    }, { $set: { status: "cancelled", finishedAt: new Date() } });
    return true;
  }

  async function reconcile(host, now = new Date()) {
    const scope = { ownerId: host.ownerId, hostId: host._id };
    const available = {
      profile: { $in: host.profiles || ["read-only"] }, effort: { $in: host.efforts || [] },
      ...(host.extendedPrompts === true ? {} : { requiresExtendedPrompt: false }),
    };
    const waiting = await records().aggregate([
      { $match: { ...scope, state: "active", nextAt: { $lte: now } } },
      { $lookup: {
        from: "operations_jobs", localField: "occurrenceId", foreignField: "_id", as: "job",
        pipeline: [{ $match: scope }, { $project: { status: 1 } }],
      } },
      { $set: { job: { $first: "$job" } } },
      { $match: { $or: [{ "job.status": { $in: terminal } }, { job: null, ...available }] } },
      { $sort: { nextAt: 1, _id: 1 } }, { $limit: 50 },
    ]).toArray();

    for (const series of waiting) {
      const key = { _id: series.occurrenceId, seriesId: series._id, ...scope };
      const job = series.job;
      if (!job) {
        await jobs().updateOne(key, { $setOnInsert: {
          sessionId: series.occurrenceId, parentId: null, workerRole: "direct",
          title: "Recurring " + series.workspace + " turn (" + (series.total - series.remaining + 1) + "/" + series.total + ")",
          workspace: series.workspace, model: series.model, effort: series.effort, profile: series.profile,
          prompt: series.prompt, requiresExtendedPrompt: series.requiresExtendedPrompt,
          scheduledAt: series.nextAt, status: "scheduled", createdAt: now, eventCount: 0, events: [],
        } }, { upsert: true }).catch((error) => { if (error.code !== 11000) throw error; });
        if (!await authorizes(key)) {
          await jobs().updateOne({ ...key, status: "scheduled" }, { $set: { status: "cancelled", finishedAt: now } });
        }
        continue;
      }
      if (!terminal.includes(job.status)) continue;
      const filter = { _id: series._id, ...scope, state: "active", occurrenceId: job._id };
      if (job.status !== "completed" || series.remaining <= 1) {
        await records().updateOne(filter, { $set: {
          state: job.status === "completed" ? "completed" : "stopped",
          remaining: series.remaining - 1, stoppedAt: now,
          stopReason: job.status === "completed" ? "All occurrences completed." : "An occurrence ended as " + job.status + ".",
        } });
      } else {
        const interval = series.repeatDays * day;
        const elapsed = Math.floor((+now - +series.nextAt) / interval);
        const nextAt = new Date(+series.nextAt + (elapsed + 1) * interval);
        await records().updateOne(filter, { $set: { nextAt, occurrenceId: randomUUID() }, $inc: { remaining: -1 } });
      }
    }
  }

  const authorizes = (job) => records().findOne({
    _id: job.seriesId, ownerId: job.ownerId, hostId: job.hostId, state: "active", occurrenceId: job._id,
  }, { projection: { _id: 1 } });

  return { existing, register, list, cancel, reconcile, authorizes };
}

module.exports = { createRecurrence, validRepeat };

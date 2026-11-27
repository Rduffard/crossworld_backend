const { createHash } = require("node:crypto");
const { missionStepRoles, resolveRoute } = require("./mission-capabilities");

const limit = 50;
const digest = values => createHash("sha256").update(JSON.stringify(values)).digest("hex");

async function actionableGrants({ ownerId, host, coordinator, now, records, jobs, workforce }) {
  if (!coordinator) return [];
  const time = new Date(now);
  const primary = await jobs().findOne({
    ownerId, activeHost: host._id, status: { $in: ["running", "cancelling"] }, leaseUntil: { $gt: time },
  }, { projection: { _id: 1 } });
  if (primary) return [];
  const grants = await records().find({
    ownerId, hostId: host._id, workspace: coordinator.workspace, coordinatorActorId: coordinator.actor.id,
    status: "authorized", registration: null, initiativeId: null, endsAt: { $gt: time },
  }, { projection: { steps: 1, authorization: 1, effort: 1, revision: 1 } })
    .sort({ endsAt: 1, _id: 1 }).limit(limit).toArray();

  const choices = grants.flatMap(grant => grant.steps.filter(step => !step.after.length && !step.approval &&
    (step.assignee || step.reviewer) && !resolveRoute(host, grant, step, now).reason)
    .map(step => ({ grant, step, id: step.assignee || step.reviewer })));
  if (!choices.length) return [];
  const ids = [...new Set(choices.map(choice => choice.id))];
  const [employees, busy] = await Promise.all([
    workforce().find({ ownerId, kind: "employee", status: "available", _id: { $in: ids } }, { projection: { role: 1 } }).toArray(),
    jobs().find({ ownerId, status: { $in: ["running", "cancelling"] }, leaseUntil: { $gt: time },
      $or: [{ employeeId: { $in: ids } }, { "studioActor.id": { $in: ids } }, { "conversationActor.id": { $in: ids } }],
    }, { projection: { employeeId: 1, "studioActor.id": 1, "conversationActor.id": 1 } }).toArray(),
  ]);
  const roles = new Map(employees.map(employee => [employee._id, employee.role]));
  const occupied = new Set(busy.flatMap(job => [job.employeeId, job.studioActor?.id, job.conversationActor?.id]));
  const eligibleGrants = new Map();
  for (const { grant, step, id } of choices) {
    if (!occupied.has(id) && missionStepRoles(step).includes(roles.get(id))) eligibleGrants.set(grant._id, grant.revision ?? 0);
  }
  return [...eligibleGrants].map(([id, revision]) => ["actionable grant", id, revision]);
}

async function executiveEvents({ ownerId, host, coordinator, now, records, proposals, jobs, workforce }) {
  const [missions, assignments, pending, decisions, resolved, available] = await Promise.all([
    records().find({ ownerId, hostId: host._id, $or: [
      { status: "blocked" },
      { status: "active", reason: { $gt: "" } },
    ] }, { projection: { status: 1, reason: 1, results: 1 } }).sort({ updatedAt: -1, _id: 1 }).limit(limit).toArray(),
    jobs().find({
      ownerId, hostId: host._id, executiveReview: { $ne: true }, missionId: null,
      status: { $in: ["completed", "failed", "interrupted"] },
      workerRole: { $in: ["assignment", "qa", "correction", "air"] },
      executiveOutcomeObserved: null,
    }, { projection: { status: 1, error: 1, workerRole: 1, finishedAt: 1 } })
      .sort({ finishedAt: 1, _id: 1 }).limit(limit + 1).toArray(),
    jobs().find({
      ownerId, status: "running", "approval.state": "pending", "approval.expiresAt": { $gt: now },
      $expr: { $ne: ["$approval.id", { $ifNull: ["$decision.id", null] }] },
    }, { projection: { "approval.id": 1 } }).sort({ createdAt: -1, _id: 1 }).limit(limit).toArray(),
    jobs().find({ ownerId, "decision.at": { $exists: true } }, { projection: { "decision.id": 1, "decision.choice": 1 } })
      .sort({ "decision.at": -1, _id: 1 }).limit(limit).toArray(),
    proposals().find({ ownerId, state: { $in: ["applied", "rejected"] } }, { projection: { state: 1 } })
      .sort({ decidedAt: -1, _id: 1 }).limit(limit).toArray(),
    actionableGrants({ ownerId, host, coordinator, now, records, jobs, workforce }),
  ]);

  const moreAssignments = assignments.length > limit;
  if (moreAssignments) assignments.pop();
  const conditions = [
    ...missions.map(mission => ["mission", mission._id, mission.status, mission.reason,
      Object.entries(mission.results ?? {}).sort(([a], [b]) => a.localeCompare(b))
        .filter(([, result]) => ["blocked", "correct"].includes(result.result))
        .map(([step, result]) => [step, result.result, result.executionStatus, result.reason,
          result.reviewCandidate?.commit])]),
    ...assignments.map(job => [job.status === "completed" ? "assignment completed" : "failure",
      job._id, job.status, job.workerRole, job.error]),
    ...pending.map(job => ["approval", job._id, job.approval.id]),
    ...decisions.map(job => ["decision", job._id, job.decision.id, job.decision.choice]),
    ...resolved.map(proposal => ["proposal decision", proposal._id, proposal.state]),
    ...available,
  ].map(event => ({ key: digest(event), kind: event[0], recordId: event[1] }));
  return { conditions, moreAssignments, assignmentReceiptIds: assignments.map(job => job._id) };
}

module.exports = { actionableGrants, executiveEvents };

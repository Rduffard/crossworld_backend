const { createHash } = require("node:crypto");
const { objectiveRecord } = require("./objectives");
const { responseMarker } = require("./objective-runs");

const operatingModes = ["run", "pause", "stop"];
const operatingMode = settings => settings?.operatingMode ?? null;
const runGeneration = settings => settings?.operatingGeneration ?? 0;
const autonomousScope = "autonomous-assignment";

function stableId(parts) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32)
    .replace(/^(........)(....)(....)(....)(............)$/, "$1-$2-$3-$4-$5");
}

async function insertOnce(collection, record) {
  try {
    await collection.insertOne(record);
  } catch (error) {
    if (error.code !== 11000 || !await collection.findOne({ _id: record._id, ownerId: record.ownerId })) throw error;
  }
}

function autonomousClaimFilter(settings) {
  const inactive = { "delegatedBy.scope": { $ne: autonomousScope } };
  return operatingMode(settings) === "run"
    ? { $or: [inactive, { "autonomous.generation": runGeneration(settings) }] }
    : inactive;
}

async function reportsTo(workforce, ownerId, employee, supervisorId) {
  let parentId = employee?.supervisorId;
  const seen = new Set();
  while (parentId && seen.size < 8 && !seen.has(parentId)) {
    const parent = await workforce().findOne({
      _id: parentId, ownerId, kind: "employee", status: "available",
    }, { projection: { supervisorId: 1, role: 1 } });
    if (!parent) return false;
    if (parentId === supervisorId) return parent.role === "first-mate";
    seen.add(parentId);
    parentId = parent.supervisorId;
  }
  return false;
}

const enduranceInitiative = "5c6d3b9c-5a07-4f55-941e-9e6b9bc52149";
const enduranceProject = "958a36fc-4b67-8821-832c-a8fd9f2be33a";
const enduranceRequirements = {
  "c61bb85e-9910-4b26-905e-da9012f9dced": "Exercise and correct persisted Blueprint revision, blocked-step isolation, reconnect and candidate handoff.",
  "33ad020f-855a-4907-9b9a-712a5ccf8cf5": "Exercise Command Center polling recovery and canonical Approvals at desktop and phone widths.",
  "07e16a3f-7111-4468-b25b-d8e93f48ead2": "Exercise the Visual Blueprint and workforce workflows with populated records and correct remaining functional defects.",
  "284d5334-304b-4b1a-9ac7-62c6a7043d87": "Exercise persistent First Mate conversations and mobile oversight, including refresh and reconnect.",
  "ff7c3c31-20e8-4428-9869-1e81d3ff0364": "Exercise production management and knowledge workflows with persisted studio records.",
  "49af8686-5469-429b-beec-0b23cb310dec": "Exercise the Virtual Headquarters vertical slice with live studio records and narrow layouts.",
  "6357a9a4-0702-4df9-bb0b-b3252117a671": "Demonstrate production dispatch, correction, separate QA and inspectable evidence on the private mobile operations objective. Present the verified evidence for owner acceptance.",
};

async function migrateEndurance({ ownerId, records, objectives, projects }) {
  const project = await projects().findOne({ _id: enduranceProject, ownerId, workspace: "development", status: "active" });
  if (!project) return;
  const recordsToMigrate = await records().find({
    ownerId, workspace: "development", initiativeId: enduranceInitiative,
    _id: { $in: Object.keys(enduranceRequirements) },
  }).toArray();
  if (recordsToMigrate.length !== Object.keys(enduranceRequirements).length) return false;
  const objectiveId = missionId => stableId([ownerId, "endurance-objective", missionId]);
  for (const mission of recordsToMigrate) {
    if (mission.status === "completed" && mission.results?.[mission.completionStep]?.result === "pass") continue;
    const id = objectiveId(mission._id);
    const integrated = mission._id === "6357a9a4-0702-4df9-bb0b-b3252117a671";
    const dependencies = integrated ? recordsToMigrate.filter(item => item._id !== mission._id &&
      !(item.status === "completed" && item.results?.[item.completionStep]?.result === "pass"))
      .map(item => objectiveId(item._id)) : [];
    const record = objectiveRecord({ ownerId, id, projectId: project._id, input: {
      title: mission.title, priority: integrated ? "normal" : "high",
      instruction: enduranceRequirements[mission._id] +
        " Reuse prior exact candidates and passing evidence where applicable. Preserve historical results and production approval gates.",
      criteria: ["Record an inspectable result and a separate independent verification of the exact deliverable."],
    } });
    await insertOnce(objectives(), {
      ...record, autonomousMigration: { initiativeId: enduranceInitiative, missionId: mission._id, dependencies,
        ownerAcceptance: integrated },
    });
  }
  return true;
}

async function reconcileAutonomous({ settings, ownerId, hostId, jobs, objectives, eventBatches }) {
  const generation = runGeneration(settings);
  const scope = { ownerId, hostId, "delegatedBy.scope": autonomousScope };
  if (generation > 0) await discardStoppedWork(jobs, { ownerId, hostId }, generation);
  if (operatingMode(settings) !== "run") return;
  const terminal = await jobs().find({
    ...scope, "autonomous.generation": generation, "autonomous.reconciledAt": null,
    status: { $in: ["completed", "failed", "interrupted"] },
  }).sort({ finishedAt: 1, _id: 1 }).limit(20).toArray();
  for (const job of terminal) {
    if (job.status === "completed" && job.executiveAssignmentType === "qa" &&
        await responseMarker(job, eventBatches(), "QA_VERDICT: PASS")) {
      await objectives().updateOne({
        _id: job.objectiveId, ownerId, status: "active", revision: job.delegatedBy.objectiveRevision,
        "autonomousDelivery.objectiveRevision": { $ne: job.delegatedBy.objectiveRevision },
      }, { $set: {
        autonomousDelivery: { qaJobId: job._id, sourceJobId: job.autonomous.sourceJobId,
          objectiveRevision: job.delegatedBy.objectiveRevision, verifiedAt: new Date() },
      } });
    }
    if (job.autonomous.attempt === 0 && ["failed", "interrupted"].includes(job.status) && job.runAuthorizedAt) {
      const id = stableId([job._id, "retry"]);
      const fields = [
        "ownerId", "hostId", "objectiveId", "employeeId", "assignedRole", "assigneeName", "title", "projectId",
        "assignmentContext", "workspace", "profile", "model", "effort", "workerRole", "requiresExtendedPrompt",
        "executiveAssignmentType", "browserVerification", "delegatedBy", "dispatchPriority",
      ];
      const retry = Object.fromEntries(fields.filter(field => Object.hasOwn(job, field)).map(field => [field, job[field]]));
      await insertOnce(jobs(), {
        ...retry, _id: id, sessionId: id, parentId: null, status: "queued", events: [], eventCount: 0,
        codexThreadId: null, createdAt: new Date(),
        prompt: job.prompt,
        autonomous: { generation, attempt: 1, sourceJobId: job.autonomous.sourceJobId, retryOf: job._id },
      });
    }
    await jobs().updateOne({ _id: job._id, ...scope }, { $set: { "autonomous.reconciledAt": new Date() } });
  }
}

async function discardStoppedWork(jobs, scope, generation) {
  const stopped = { ...scope, $or: [
    { "delegatedBy.scope": autonomousScope, "autonomous.generation": { $lt: generation } },
    { executiveReview: true, $or: [{ operatingGeneration: { $exists: false } }, { operatingGeneration: { $lt: generation } }] },
  ] };
  await jobs().updateMany({ ...stopped, status: "queued" }, {
    $set: { status: "cancelled", finishedAt: new Date() },
  });
  await jobs().updateMany({ ...stopped, status: "running" }, { $set: { status: "cancelling" } });
}

module.exports = {
  autonomousClaimFilter, autonomousScope, discardStoppedWork, migrateEndurance, operatingMode, reconcileAutonomous,
  operatingModes, reportsTo, runGeneration, stableId,
};

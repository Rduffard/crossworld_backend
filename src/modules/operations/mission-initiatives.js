const { isDeepStrictEqual } = require("node:util");
const expiringMissionStatuses = ["authorized", "active", "paused"];
const missionStatus = (mission, now = new Date()) => !mission ? "unavailable" :
  expiringMissionStatuses.includes(mission.status) && mission.endsAt <= now ? "expired" : mission.status;

function createInitiatives({ initiatives, records, owner, uuid, fail }) {
  const scopeFor = initiative => ({ ownerId: initiative.ownerId, hostId: initiative.hostId, workspace: initiative.workspace });
  const passed = mission => mission?.status === "completed" && mission.completionStep &&
    mission.results?.[mission.completionStep]?.result === "pass";

  async function missionStates(initiative) {
    const ids = [...new Set(initiative.missions.flatMap(({ grantId, after }) => [grantId, ...after]))];
    const missions = await records().find({ ...scopeFor(initiative), _id: { $in: ids } }, {
      projection: { title: 1, status: 1, initiativeId: 1, revision: 1, endsAt: 1, completionStep: 1, results: 1, creationDigest: 1 },
    }).toArray();
    return new Map(missions.map(mission => [mission._id, mission]));
  }

  function mount(router) {
    router.post("/initiatives", async (req, res) => {
      const { id, title, blueprintRevision, anchorId, missions } = req.body || {};
      const isId = value => typeof value === "string" && uuid.test(value);
      if (!isId(id) || !isId(anchorId) || typeof title !== "string" || !title.trim() || title.length > 120 ||
          typeof blueprintRevision !== "string" || !blueprintRevision.trim() || blueprintRevision.length > 200 ||
          !Array.isArray(missions) || !missions.length || missions.length > 30) {
        return fail(res, 400, "Provide an approved Blueprint revision, anchor mission and successor grants.");
      }
      const earlier = new Set([anchorId]);
      const normalized = [];
      for (const entry of missions) {
        if (!entry || !isId(entry.grantId) || earlier.has(entry.grantId) || !Array.isArray(entry.after) ||
            !entry.after.length || new Set(entry.after).size !== entry.after.length ||
            entry.after.some(id => !earlier.has(id))) {
          return fail(res, 400, "Each successor must depend on the anchor or earlier grants in the initiative.");
        }
        earlier.add(entry.grantId);
        normalized.push({ grantId: entry.grantId, after: entry.after });
      }
      const ownerId = owner();
      const approvedPlan = { anchorId, title: title.trim(), blueprintRevision: blueprintRevision.trim(), missions: normalized };
      const existing = () => initiatives().findOne({ _id: id, ownerId });
      const receipt = record => ({ id, approvedAt: record.approvedAt, approvalSource: record.approvalSource });
      const replay = record => record && Object.entries(approvedPlan).every(([key, value]) => isDeepStrictEqual(record[key], value))
        ? res.json(receipt(record))
        : fail(res, 409, "This initiative identifier is already enrolled with a different plan.");
      const saved = await existing();
      if (saved) return replay(saved);
      if (req.body.approvePlan !== true) {
        return fail(res, 400, "Confirm owner approval of these exact grants and their dependency order.");
      }
      const anchor = await records().findOne({ _id: anchorId, ownerId });
      if (!anchor?.completionStep ||
          !["active", "paused", "blocked", "completed"].includes(anchor.status) ||
          (anchor.status === "completed" && !passed(anchor))) {
        return fail(res, 409, "Select an existing anchor mission with a verified completion step.");
      }
      const initiative = { _id: id, ownerId, hostId: anchor.hostId, workspace: anchor.workspace,
        ...approvedPlan, approvedAt: new Date(), approvalSource: "authenticated-owner-enrollment" };
      const states = await missionStates(initiative);
      if (normalized.some(({ grantId }) => {
        const grant = states.get(grantId);
        return grant?.initiativeId !== id || grant.status !== "authorized" || grant.endsAt <= new Date();
      })) return fail(res, 409, "Every successor needs a current grant reserved for this initiative on the anchor relay and workspace.");
      initiative.approvedGrants = normalized.map(({ grantId }) => ({
        grantId, creationDigest: states.get(grantId).creationDigest, endsAt: states.get(grantId).endsAt,
      }));
      try {
        await initiatives().insertOne(initiative);
      } catch (error) {
        if (error.code !== 11000) throw error;
        return replay(await existing());
      }
      res.status(201).json(receipt(initiative));
    });

    router.get("/initiatives/:id", async (req, res) => {
      const initiative = await initiatives().findOne({ _id: req.params.id, ownerId: owner() });
      if (!initiative) return fail(res, 404, "Initiative unavailable.");
      const states = await missionStates(initiative);
      const now = new Date();
      const missions = initiative.missions.map(({ grantId, after }) => {
        const grant = states.get(grantId);
        const dependencies = after.map(id => {
          const predecessor = states.get(id);
          const status = missionStatus(predecessor, now);
          const state = passed(predecessor) ? "passed" :
            ["terminated", "unavailable", "completed"].includes(status) ? "cannot-continue" :
              ["paused", "expired", "blocked"].includes(status) ? "needs-attention" : "pending";
          return { id, title: predecessor?.title, status, state };
        });
        return { grantId, after, status: missionStatus(grant, now), dependencies,
          waitingFor: dependencies.filter(dependency => dependency.state !== "passed").map(dependency => dependency.id) };
      });
      delete initiative.ownerId;
      res.json({ ...initiative, missions, completed: missions.every(({ grantId }) => passed(states.get(grantId))) });
    });
  }

  async function reconcile(scope, missionId) {
    const query = missionId ? { "missions.after": missionId } : {
      _id: { $in: await records().distinct("initiativeId", { ...scope, status: "authorized",
        initiativeId: { $exists: true }, endsAt: { $gt: new Date() } }) },
    };
    for await (const initiative of initiatives().find({ ...scope, ...query })) {
      const states = await missionStates(initiative);
      for (const { grantId, after } of initiative.missions) {
        const grant = states.get(grantId);
        if (grant?.status !== "authorized" || grant.initiativeId !== initiative._id ||
            !after.every(id => passed(states.get(id)))) continue;
        await records().updateOne({
          ...scopeFor(initiative), _id: grantId, revision: grant.revision, status: "authorized", initiativeId: initiative._id,
          $expr: { $gt: ["$endsAt", "$$NOW"] },
        }, {
          $set: { status: "active", reason: "", updatedAt: new Date(),
            registration: { initiativeId: initiative._id, blueprintRevision: initiative.blueprintRevision, registeredAt: new Date() } },
          $inc: { revision: 1 },
        });
      }
    }
  }

  return { mount, reconcile };
}

module.exports = { createInitiatives, missionStatus, expiringMissionStatuses };

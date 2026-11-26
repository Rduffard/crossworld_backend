const { isDeepStrictEqual } = require("node:util");

function createInitiatives({ initiatives, records, owner, uuid, fail }) {
  const scopeFor = initiative => ({ ownerId: initiative.ownerId, hostId: initiative.hostId, workspace: initiative.workspace });
  const passed = mission => mission?.status === "completed" && mission.completionStep &&
    mission.results?.[mission.completionStep]?.result === "pass";

  async function missionStates(initiative) {
    const ids = [...new Set(initiative.missions.flatMap(({ grantId, after }) => [grantId, ...after]))];
    const missions = await records().find({ ...scopeFor(initiative), _id: { $in: ids } }, {
      projection: { status: 1, initiativeId: 1, revision: 1, endsAt: 1, completionStep: 1, results: 1 },
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
      const replay = record => record && Object.entries(approvedPlan).every(([key, value]) => isDeepStrictEqual(record[key], value))
        ? res.json({ id, approvedAt: record.approvedAt })
        : fail(res, 409, "This initiative identifier is already enrolled with a different plan.");
      const saved = await existing();
      if (saved) return replay(saved);
      const anchor = await records().findOne({ _id: anchorId, ownerId });
      if (!anchor?.completionStep ||
          !["active", "paused", "blocked", "completed"].includes(anchor.status) ||
          (anchor.status === "completed" && !passed(anchor))) {
        return fail(res, 409, "Select an existing anchor mission with a verified completion step.");
      }
      const initiative = { _id: id, ownerId, hostId: anchor.hostId, workspace: anchor.workspace,
        ...approvedPlan, approvedAt: new Date() };
      const states = await missionStates(initiative);
      if (normalized.some(({ grantId }) => {
        const grant = states.get(grantId);
        return grant?.initiativeId !== id || grant.status !== "authorized" || grant.endsAt <= new Date();
      })) return fail(res, 409, "Every successor needs a current grant reserved for this initiative on the anchor relay and workspace.");
      try {
        await initiatives().insertOne(initiative);
      } catch (error) {
        if (error.code !== 11000) throw error;
        return replay(await existing());
      }
      res.status(201).json({ id, approvedAt: initiative.approvedAt });
    });

    router.get("/initiatives/:id", async (req, res) => {
      const initiative = await initiatives().findOne({ _id: req.params.id, ownerId: owner() });
      if (!initiative) return fail(res, 404, "Initiative unavailable.");
      const states = await missionStates(initiative);
      const missions = initiative.missions.map(({ grantId, after }) => {
        const grant = states.get(grantId);
        return { grantId, after, status: grant?.status ?? "unavailable",
          waitingFor: after.filter(id => !passed(states.get(id))) };
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

module.exports = { createInitiatives };

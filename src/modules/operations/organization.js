const { createHash, randomUUID } = require("node:crypto");
const express = require("express");

const initiative = "leviathan-ii-unchained";
const mandate = "Maintain project visual direction and evaluation criteria. Delegate specialist experiments, review technical and artistic evidence separately, reject inadequate candidates, request revisions and recommend verified candidates for owner acceptance.";
const authority = "First Mate supervises operational execution. The owner controls approved creative direction, candidate acceptance and production promotion. Keep experiments in the Workshop. Preserve failed approaches and require independent verification before recommending acceptance.";
const trouserEvidence = "Loom Art Intelligence/07_Experiments/active/trouser_research_log.md";
const garmentGates = "Loom Art Intelligence/06_Validation/acceptance_criteria/archetype_gates.md";
const reviewEvidence = "Loom Art Intelligence/07_Experiments/failed/dashing_corsair.md";
const candidateEvidence = "Art/Sanguine Archipelago/Characters/FemaleAthletic/In-Test/FreeportCorsair_A_FitTest/DashingCorsair_FinalAcceptanceNotes.md";
const firstMateEvidence = "docs/leviathan-validation/original-directive.md";
const authorization = "LEVIATHAN II — UNCHAINED owner directive";
const clothingKey = "objective-character-clothing";
const operationsDesign = "Lead creative direction for the Crossworld Operations application, focusing on application aesthetics, UI design, interaction design and visual consistency.";
const releaseAuthorization = "LEVIATHAN II — Release and Activation owner directive";

function foundationId(ownerId, key) {
  const hash = createHash("sha256").update(`${initiative}/${ownerId}/${key}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const exact = (value) => new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");

async function planFoundation({ workforce, projects, objectives }, ownerId) {
  const actions = [];

  async function add(records, key, name, query, values, sources, validate = () => true, prerequisites = []) {
    const _id = foundationId(ownerId, key);
    const matches = await records().find({ ownerId, $or: [{ _id }, ...query] }).limit(2).toArray();
    let state = "create";
    let reason;
    if (matches.length > 1) {
      reason = "Multiple matching records. Resolve the ambiguity in the source workspace.";
    } else if (matches.length === 1 && !validate(matches[0])) {
      reason = "The existing record conflicts with the proposed role, assignment or project state.";
    } else if (prerequisites.some((entry) => entry.state === "conflict")) {
      reason = "An earlier prerequisite needs review.";
    } else if (matches.length) {
      state = "retain";
    }
    if (reason) state = "conflict";
    const existing = matches[0];
    const action = {
      key, name: existing?.kind === "employee" ? existing.name : name,
      state, id: existing?._id || _id, ...(reason ? { reason } : {}), sources,
    };
    actions.push({
      ...action, records, record: { _id, ownerId, ...values, foundationKey: key,
        provenance: { initiative, authorization, sources } },
      ...(existing ? { existing, revision: existing.revision } : {}),
    });
    return actions.at(-1);
  }

  async function department() {
    return add(workforce, "creative-department", "Creative Department", [
      { kind: "department", name: exact("Creative Department") },
    ], {
      kind: "department", name: "Creative Department",
      responsibilities: "Maintain studio visual direction, experimental production methods, creative review and reusable validation evidence.",
    }, [authorization, garmentGates], (entry) => entry.kind === "department");
  }

  async function role(key, name, responsibilities, sources) {
    return add(workforce, `role-${key}`, `${name} role`, [{ kind: "role", key }], {
      kind: "role", key, name, responsibilities,
    }, sources, (entry) => entry.kind === "role" && entry.key === key);
  }

  async function employee(key, name, position, unit, supervisor, workspace, responsibilities, instructions, sources) {
    return add(workforce, `employee-${key}`, name, [
      { kind: "employee", name: exact(name) },
      { kind: "employee", role: position.record.key, status: { $ne: "retired" } },
    ], {
      kind: "employee", name, role: position.record.key, roleId: position.id, departmentId: unit?.id || null,
      supervisorId: supervisor?.id || null, status: "available", workspace, responsibilities, instructions, revision: 0,
    }, sources, (entry) => entry.kind === "employee" && entry.role === position.record.key &&
      entry.status !== "retired" && (entry.departmentId || null) === (unit?.id || null) &&
      (key !== "barnaby" || exact(name).test(entry.name)) &&
      (key !== "art-director" || ["development", "workshop"].includes(entry.workspace)) &&
      (!entry.roleId || entry.roleId === position.id) &&
      (!entry.supervisorId || entry.supervisorId === supervisor?.id),
    [position, unit, supervisor].filter(Boolean));
  }

  async function project(key, name, description, workspace, repositories, sources) {
    return add(projects, `project-${key}`, name, [{ name: exact(name) }], {
      name, description, workspace, repositories, status: "active", instructions: "", revision: 0,
    }, sources, (entry) => entry.status === "active" && entry.workspace === workspace);
  }

  const creative = await department();
  const firstMate = await role("first-mate", "First Mate", "Coordinate studio operations and report to the owner.", [firstMateEvidence]);
  const barnaby = await employee("barnaby", "Barnaby", firstMate, null, null, "development",
    "Coordinate studio execution, identify blockers, route independent verification and bring decisions to the owner.",
    "Use approved capabilities and report actual outcomes. Keep independent review and owner acceptance distinct.", [firstMateEvidence, authorization]);
  const director = await role("art-director", "Art Director", mandate, [authorization, garmentGates]);
  const iona = await employee("art-director", "Iona Keel", director, creative, barnaby, "development", operationsDesign, authority,
    [releaseAuthorization, authorization]);
  const operations = await project("operations", "Crossworld Operations", "Operate the private Crossworld Creative studio and its execution infrastructure.",
    "development", ["crossworld_backend", "crossworld_creative"], ["crossworld_backend/docs/operations-leviathan.md"]);
  await project("creative", "Crossworld Creative", "Maintain the studio’s website and its connected project experiences.",
    "development", ["crossworld_creative"], ["crossworld_creative/package.json"]);
  const sanguine = await project("sanguine", "Sanguine Archipelago", "Develop Sanguine Archipelago and validate character art methods against its production constraints.",
    "workshop", ["archipelago"], [candidateEvidence, "archipelago/package.json"]);
  const loom = await project("loom", "Loom", "Develop Loom and build reusable production methods through experimental Workshop validation.",
    "workshop", [], ["Loom/ProjectSettings/ProjectVersion.txt", "Loom Art Intelligence/README.md"]);

  async function objective(key, project, title, instruction, criteria, sources, status = "active") {
    return add(objectives, `objective-${key}`, title, [{ projectId: project.id, title: exact(title) }], {
      projectId: project.id, title, priority: "high", status, instruction, revision: 0,
      criteria: criteria.map((text) => ({ id: randomUUID(), text, review: null })),
    }, sources, (entry) => entry.projectId === project.id, [project]);
  }
  await objective("operations-reliability", operations, "Verify private mobile studio operations",
    "Exercise the owner’s authentic workflow through the deployed application. Record evidence for each check and leave unavailable integrations identified.",
    [
      "Verify owner access and rejection of unauthorized requests in production.",
      "Verify that a conversation and in-flight execution remain available after refreshing on a phone.",
      "Check composer accessibility at 320px and 390px and record unresolved defects.",
    ], [authorization, "crossworld_backend/docs/operations-leviathan.md"]);
  const design = await objective("operations-design", operations, "Direct Crossworld Operations application design",
    operationsDesign, [
      "Review the application’s visual hierarchy, typography, spacing and component consistency across workspaces.",
      "Review navigation and interaction patterns on desktop and mobile, and document design priorities for owner review.",
    ], [releaseAuthorization]);
  const designTitle = `${iona.existing?.name || "Iona Keel"} assignment · ${operations.name}`;
  await add(workforce, "assignment-project-operations", designTitle, [
    { kind: "project-assignment", employeeId: iona.id, projectId: operations.id },
  ], {
    kind: "project-assignment", name: designTitle, employeeId: iona.id, supervisorId: barnaby.id,
    roleId: director.id, projectId: operations.id, projectName: operations.name, objectiveId: design.id,
    status: "assigned", responsibilities: operationsDesign,
  }, [releaseAuthorization], (entry) => entry.kind === "project-assignment" &&
    entry.employeeId === iona.id && entry.projectId === operations.id && entry.objectiveId === design.id &&
    entry.status === "assigned", [iona, operations, design]);
  const clothing = await objective("character-clothing", sanguine, "Establish a repeatable character clothing pipeline",
    "Reproduce the four-panel neutral baseline on a disposable Workshop fixture. The strongest documented 60° correction still had 14 face crossings despite zero vertex-depth hits. Static shirt and waistcoat clearance does not verify sleeves in motion. Use the Loom Workshop to test repeatability. The Dashing Corsair candidate awaits owner acceptance.",
    [
      "Reproduce the neutral trouser fit and independently validate the pelvis, rise, inseam, marked openings and coverage.",
      "Record garment-body face crossings, coverage and the worst edge stretch at 45°, 50°, 55° and 60°. Demonstrate zero detected face crossings at the listed angles before recommending the method.",
      "Verify sleeve and waistcoat layer clearance through arm motion and pose transitions.",
      "Run target Unity import and playback where available. Preserve machine-readable results, failed approaches and reproducible steps in the Workshop.",
      "Obtain independent technical verification and separate artistic review before asking the owner to decide on acceptance.",
    ], [trouserEvidence, garmentGates, reviewEvidence, candidateEvidence], "paused");

  for (const project of [sanguine, loom]) {
    const title = `${iona.existing?.name || "Iona Keel"} assignment · ${project.name}`;
    await add(workforce, `assignment-${project.key}`, title, [
      { kind: "project-assignment", employeeId: iona.id, projectId: project.id },
    ], {
      kind: "project-assignment", name: title, employeeId: iona.id, supervisorId: barnaby.id,
      roleId: director.id, projectId: project.id, projectName: project.name, objectiveId: clothing.id,
      status: "paused", activationSource: "foundation-objective", responsibilities: mandate,
    }, [authorization, trouserEvidence, garmentGates], (entry) => entry.kind === "project-assignment" &&
      entry.employeeId === iona.id && entry.projectId === project.id && entry.objectiveId === clothing.id,
    [iona, project, clothing]);
  }

  const [departments, employees, projectCount, objectiveCount] = await Promise.all([
    workforce().countDocuments({ ownerId, kind: "department" }),
    workforce().countDocuments({ ownerId, kind: "employee" }),
    projects().countDocuments({ ownerId }),
    objectives().countDocuments({ ownerId }),
  ]);
  const plan = actions.map(({ key, name, state, id, reason, sources, revision }) => ({
    key, name, state, id, ...(reason ? { reason } : {}), sources, ...(revision !== undefined ? { revision } : {}),
  }));
  const planId = createHash("sha256").update(JSON.stringify({ initiative, ownerId, plan })).digest("hex");
  return { planId, plan, actions, counts: { departments, employees, projects: projectCount, objectives: objectiveCount } };
}

function createOrganization({ workforce, projects, objectives, owner }) {
  const router = express.Router();
  const stores = { workforce, projects, objectives };
  router.get("/", async (_req, res) => {
    const { planId, plan, counts } = await planFoundation(stores, owner());
    res.json({ planId, plan, counts });
  });
  router.post("/initialize", async (req, res) => {
    const { planId, plan, actions } = await planFoundation(stores, owner());
    if (req.body?.planId !== planId || plan.some((item) => item.state === "conflict")) {
      return res.status(409).json({ message: "The foundation needs a fresh review. Reload the plan and resolve any conflicts." });
    }
    const created = [];
    const retained = plan.filter(item => item.state === "retain").map(({ id }) => id);
    const now = new Date();
    for (const action of actions.filter((entry) => entry.state === "create")) {
      const { _id, ownerId } = action.record;
      try {
        const result = await action.records().updateOne({ _id, ownerId, foundationKey: action.key }, {
          $setOnInsert: { ...action.record, createdAt: now, updatedAt: now },
        }, { upsert: true });
        if (result.upsertedCount) created.push(_id);
        else retained.push(_id);
      } catch (error) {
        if (error.code === 11000) {
          if (await action.records().findOne({ _id, ownerId, foundationKey: action.key }, { projection: { _id: 1 } })) {
            retained.push(_id);
            continue;
          }
          return res.status(409).json({ message: "The foundation changed while applying. Reload the plan." });
        }
        throw error;
      }
    }
    return res.json({ created, retained });
  });
  router.post("/clothing/activate", async (req, res) => {
    const { id, revision } = req.body || {};
    const ownerId = owner();
    if (id !== foundationId(ownerId, clothingKey) || !Number.isSafeInteger(revision) || revision < 0) {
      return res.status(400).json({ message: "Provide the current foundation objective revision." });
    }
    const assignmentIds = ["assignment-project-sanguine", "assignment-project-loom"].map((key) => foundationId(ownerId, key));
    const ready = await workforce().countDocuments({
      _id: { $in: assignmentIds }, ownerId, kind: "project-assignment", objectiveId: id, activationSource: "foundation-objective",
    });
    if (ready !== assignmentIds.length) {
      return res.status(409).json({ message: "Both Art Director project assignments must be in place before activation." });
    }
    const now = new Date();
    const changed = await objectives().updateOne({ _id: id, ownerId, foundationKey: clothingKey, status: "paused", revision }, {
      $set: { status: "active", updatedAt: now, activation: { at: now, by: "owner" } },
      $inc: { revision: 1 },
    });
    return changed.matchedCount ? res.sendStatus(204) :
      res.status(409).json({ message: "The clothing objective changed. Reload before activating." });
  });
  return router;
}

module.exports = { createOrganization };

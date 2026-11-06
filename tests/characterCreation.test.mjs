import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const startingPackages = require("../src/modules/archipelago/system/blueprints/characters/startingEquipment");
function choicesFor(input) {
  const p = startingPackages[input.calling];
  return {
    startingEquipment: {
      packageId: input.calling,
      version: 1,
      choices: Object.fromEntries(
        Object.entries(p.choices).map(([k, v]) => [k, Object.keys(v)[0]])
      ),
    },
    abilitySelections:
      input.calling === "corsair"
        ? {
            "choice:corsair:expertise:1": (Array.isArray(input.training)
              ? input.training
              : []
            )
              .slice(0, 2)
              .map((id) => "corsair:expertise-" + id),
          }
        : input.calling === "gunslinger"
        ? { "choice:gunslinger:style:1": ["gunslinger:style-defense"] }
        : {},
  };
}
import assert from "node:assert/strict";
import { test } from "node:test";
import Character from "../src/modules/archipelago/characters/model.js";
import controller from "../src/modules/archipelago/characters/controller.js";
import validators from "../src/modules/archipelago/characters/validators.js";
import catalog from "../src/modules/archipelago/system/blueprints/catalogs.js";
import pointBuy from "../src/modules/archipelago/system/pointBuy.js";
import origins from "../src/modules/archipelago/system/originBonus.js";
import resources from "../src/modules/archipelago/system/resources.js";

const owner = "507f1f77bcf86cd799439011";
const origin = catalog.origins.find((entry) => entry.bonus === "+1 Might");
const allocation = () => ({
  might: 15,
  agility: 14,
  wit: 13,
  spirit: 12,
  resolve: 10,
  instinct: 8,
});
const body = () => ({
  name: "Regression Sailor",
  calling: catalog.callings[0].id,
  origin: origin.id,
  attributes: allocation(),
  training: ["climb", "perception", "deceive", "navigate"],
});
const copy = (value) => JSON.parse(JSON.stringify(value));
async function validate(middleware, input, method = "POST") {
  if (
    middleware === validators.validateCreateCharacter &&
    input.calling &&
    startingPackages[input.calling]
  )
    input = { ...choicesFor(input), ...input };
  const request = { body: copy(input), method, headers: {} };
  let error;
  await middleware(request, {}, (err) => {
    error = err;
  });
  return { request, error };
}
async function invoke(handler, request) {
  let result,
    error,
    status = 200;
  const response = {
    status(value) {
      status = value;
      return this;
    },
    send(value) {
      result = value;
      return this;
    },
  };
  await handler(
    { ...request, user: { _id: owner }, params: { characterId: owner } },
    response,
    (err) => {
      error = err;
    }
  );
  return { result, error, status };
}
function database(t, seed) {
  let saved = copy(seed ?? {});
  let writes = 0;
  t.mock.method(Character, "countDocuments", async () => 0);
  t.mock.method(Character, "create", async (payload) => {
    const doc = new Character(payload);
    await doc.validate();
    saved = doc.toObject();
    writes += 1;
    return doc;
  });
  t.mock.method(Character, "findById", () => ({
    lean: async () => copy(saved),
  }));
  t.mock.method(Character, "findOneAndUpdate", (_filter, update, options) => {
    assert.equal(options.runValidators, true);
    const error = new Character({ ...saved, ...update }).validateSync();
    if (error) throw error;
    saved = copy({ ...saved, ...update });
    writes += 1;
    return { lean: async () => copy(saved) };
  });
  return { saved: () => saved, writes: () => writes };
}
async function create(t, input = body()) {
  input = { ...input, ...choicesFor(input) };
  const db = database(t);
  const checked = await validate(validators.validateCreateCharacter, input);
  assert.ifError(checked.error);
  const outcome = await invoke(controller.createCharacter, checked.request);
  assert.ifError(outcome.error);
  assert.equal(outcome.status, 201);
  return db.saved();
}
const existing = () => ({
  ...body(),
  _id: owner,
  owner,
  attributes: origins.applyOriginBonus(allocation(), origin.id),
  progression: {
    rank: 1,
    corePoints: 2,
    specialtyPicks: 4,
    advancementPoints: 5,
    coreCheckInvestments: { skirmish: 3 },
    specializationPath: "drydock-ghost",
    unlockedNodes: ["ghost-patch"],
  },
  skills: {
    combat: [{ id: "climb", rank: 1, specialty: "saved investment" }],
    social: [{ id: "command", rank: 1 }],
  },
  resources: {
    health: { current: 15, max: 15 },
    stamina: { current: 15, max: 15 },
    focus: { current: 12, max: 12 },
    wounds: {
      current: 2,
      max: 7,
      active: [{ name: "Scar", severity: "major" }],
    },
    corruption: { current: 3, max: 9 },
  },
  checks: { skirmish: 18 },
  derivedStats: { vitality: 24 },
  notes: "Original",
});
async function patch(t, input, seed = existing()) {
  const before = copy(seed);
  const db = database(t, seed);
  const checked = await validate(
    validators.validateUpdateCharacter,
    input,
    "PATCH"
  );
  assert.ifError(checked.error);
  // This detects defaults accidentally appearing in PATCH, including nested objects.
  assert.deepEqual(checked.request.body, input);
  const outcome = await invoke(controller.updateCharacter, checked.request);
  assert.ifError(outcome.error);
  assert.deepEqual(seed, before);
  return { after: db.saved(), before, db };
}

test("creation persists final attributes, full authoritative resources and no Path ownership", async (t) => {
  const saved = await create(t);
  assert.equal(pointBuy.validatePointBuyAllocation(allocation()).cost, 27);
  assert.deepEqual(saved.attributes, { ...allocation(), might: 16 });
  assert.equal(saved.progression.rank, 1);
  assert.equal(saved.advancement.version, 2);
  assert.equal(saved.advancement.passive.name, "Sea Legs");
  assert.equal(saved.advancement.spends.length, 1);
  assert.equal(saved.trainingRulesVersion, 1);
  assert.equal(saved.progression.specializationPath, "");
  assert.deepEqual(saved.progression.unlockedNodes, []);
  for (const [track, max] of Object.entries(
    resources.calculateResourceMaximums(saved.attributes)
  )) {
    assert.deepEqual(saved.resources[track], { current: max, max });
  }
  assert.equal(saved.resources.wounds.max, 3);
  assert.equal(saved.resources.corruption.max, 6);
  assert.equal(saved.checks, undefined);
});

test("every origin is applied exactly once; resource defaults remain independent", async (t) => {
  const db = database(t);
  for (const entry of catalog.origins) {
    const input = { ...body(), origin: entry.id, resources: {} };
    const checked = await validate(validators.validateCreateCharacter, input);
    assert.ifError(checked.error);
    const outcome = await invoke(controller.createCharacter, checked.request);
    assert.ifError(outcome.error);
    assert.deepEqual(
      db.saved().attributes,
      origins.applyOriginBonus(allocation(), entry.id)
    );
    assert.equal(db.saved().resources.corruption.max, 6);
    assert.equal(db.saved().resources.wounds.max, 3);
  }
});

test("creation rejects invalid allocations, origins, levels, Path ownership and derived input", async () => {
  const invalid = [
    { attributes: {} },
    { attributes: { ...allocation(), might: 7 } },
    { attributes: { ...allocation(), might: 16 } },
    { attributes: { ...allocation(), might: 14.5 } },
    { attributes: { ...allocation(), might: "15" } },
    {
      attributes: Object.fromEntries(
        Object.keys(allocation()).map((key) => [key, 15])
      ),
    },
    { origin: "unknown" },
    { progression: { rank: 2 } },
    { progression: { specializationPath: "drydock-ghost" } },
    { progression: { unlockedNodes: ["ghost-patch"] } },
    ...["checks", "derivedStats", "socialStats", "pairingStats"].map(
      (field) => ({ [field]: {} })
    ),
    ...["health", "stamina", "focus"].map((track) => ({
      resources: { [track]: { current: 999, max: 999 } },
    })),
  ];
  for (const changes of invalid) {
    const checked = await validate(validators.validateCreateCharacter, {
      ...body(),
      ...changes,
    });
    assert.ok(checked.error, JSON.stringify(changes));
  }
});

test("controller independently rejects manipulated creation input", async (t) => {
  const db = database(t);
  for (const input of [
    { ...body(), attributes: { ...allocation(), might: 16 } },
    { ...body(), origin: "unknown" },
    { ...body(), checks: {} },
    { ...body(), resources: { health: { max: 999 } } },
    { ...body(), progression: { rank: 20 } },
  ]) {
    const outcome = await invoke(controller.createCharacter, { body: input });
    assert.equal(outcome.error?.statusCode, 400);
  }
  assert.equal(db.writes(), 0);
});

test("maximum decreases clamp all affected currents and preserve investments / narrative tracks", async (t) => {
  const { after, before } = await patch(t, {
    attributes: { might: 9, agility: 8, wit: 8, spirit: 8 },
  });
  assert.deepEqual(after.resources.health, { current: 11, max: 11 });
  assert.deepEqual(after.resources.stamina, { current: 8, max: 8 });
  assert.deepEqual(after.resources.focus, { current: 8, max: 8 });
  for (const track of ["wounds", "corruption"])
    assert.deepEqual(after.resources[track], before.resources[track]);
  for (const field of ["progression", "skills", "checks", "derivedStats"])
    assert.deepEqual(after[field], before[field]);
});

test("maximum increases do not heal, and low current stays unchanged on decreases", async (t) => {
  const seed = existing();
  seed.attributes = {
    might: 9,
    agility: 8,
    wit: 8,
    spirit: 8,
    resolve: 8,
    instinct: 8,
  };
  for (const [track, max] of Object.entries(
    resources.calculateResourceMaximums(seed.attributes)
  ))
    seed.resources[track] = { current: 2, max };
  const { after } = await patch(
    t,
    { attributes: { might: 15, agility: 12, wit: 12, spirit: 12 } },
    seed
  );
  for (const track of ["health", "stamina", "focus"]) {
    assert.equal(after.resources[track].current, 2);
    assert.ok(after.resources[track].max > seed.resources[track].max);
  }
});

test("maximum decrease above low current preserves that current", async (t) => {
  const seed = existing();
  for (const track of ["health", "stamina", "focus"])
    seed.resources[track].current = 2;
  const { after } = await patch(
    t,
    { attributes: { might: 9, agility: 8, wit: 8, spirit: 8 } },
    seed
  );
  for (const track of ["health", "stamina", "focus"])
    assert.equal(after.resources[track].current, 2);
});

test("partial PATCH changes one resource only and caps explicit current at saved maximum", async (t) => {
  const { after, before } = await patch(t, {
    resources: { stamina: { current: 999 } },
  });
  assert.deepEqual(after, { ...before, documentRevision: 1 });
});

test("name-only PATCH preserves all omitted fields, including historical scores and investments", async (t) => {
  const seed = existing();
  seed.attributes = {
    might: 3,
    agility: 2,
    wit: 4,
    spirit: 1,
    resolve: 2,
    instinct: 0,
  };
  const { after, before } = await patch(t, { name: "Edited Sailor" }, seed);
  assert.deepEqual(after, {
    ...before,
    name: "Edited Sailor",
    documentRevision: 1,
  });
});

test("explicit Training and nested identity PATCH preserve historical siblings", async (t) => {
  const { after, before } = await patch(t, {
    training: ["stealth", "perception", "deceive", "navigate"],
    identity: { background: { pastRole: "Captain" } },
  });
  assert.equal(after.progression.coreCheckInvestments.skirmish, 3);
  assert.deepEqual(after.training, [
    "stealth",
    "perception",
    "deceive",
    "navigate",
  ]);
  assert.equal(after.identity.background.pastRole, "Captain");
  assert.equal(after.progression.advancementPoints, 5);
  assert.deepEqual(after.skills.social, before.skills.social);
  assert.deepEqual(after.resources, before.resources);
});

test("repeated final-score PATCH never reapplies origin; illegal final allocation fails", async (t) => {
  const { after } = await patch(t, { attributes: { might: 16 } });
  assert.equal(after.attributes.might, 16);
  const db = database(t, after);
  const invalid = await invoke(controller.updateCharacter, {
    body: { attributes: { agility: 15 } },
  });
  assert.equal(invalid.error?.statusCode, 400);
  assert.equal(db.writes(), 0);
});

test("origin changes validate merged final scores without applying another bonus", async (t) => {
  const next = catalog.origins.find((entry) => entry.bonus === "+1 Agility");
  const { after } = await patch(t, {
    origin: next.id,
    attributes: { might: 15, agility: 15 },
  });
  assert.equal(after.attributes.might, 15);
  assert.equal(after.attributes.agility, 15);
  assert.equal(after.origin, next.id);
});

test("historical rank changes require explicit upgrade", async (t) => {
  database(t, existing());
  const rejected = await invoke(controller.updateCharacter, {
    body: { progression: { rank: 3 } },
  });
  assert.match(rejected.error.message, /reviewed upgrade/);
  const invalid = await validate(
    validators.validateUpdateCharacter,
    { progression: { rank: 21 } },
    "PATCH"
  );
  assert.ok(invalid.error);
});

test("PATCH rejects derived maximum and check manipulation", async () => {
  for (const input of [
    { resources: { health: { max: 900 } } },
    { checks: {} },
    { attributes: { might: 21 } },
    { origin: "unknown" },
  ]) {
    assert.ok(
      (await validate(validators.validateUpdateCharacter, input, "PATCH")).error
    );
  }
});

test("one current-resource PATCH preserves sibling resource values and maxima", async (t) => {
  const { after, before } = await patch(t, {
    resources: { health: { current: 4 } },
  });
  assert.deepEqual(after.resources.health, {
    current: 4,
    max: before.resources.health.max,
  });
  for (const track of ["stamina", "focus", "wounds", "corruption"])
    assert.deepEqual(after.resources[track], before.resources[track]);
  assert.deepEqual(after.progression, before.progression);
});

test("Wounds and Corruption change only when explicitly patched", async (t) => {
  const { after, before } = await patch(t, {
    resources: { wounds: { current: 1 }, corruption: { current: 4 } },
  });
  assert.deepEqual(after.resources.wounds, {
    ...before.resources.wounds,
    current: 1,
  });
  assert.deepEqual(after.resources.corruption, {
    ...before.resources.corruption,
    current: 4,
  });
  for (const track of ["health", "stamina", "focus"])
    assert.deepEqual(after.resources[track], before.resources[track]);
});

test("empty PATCH performs no database write", async (t) => {
  const db = database(t, existing());
  const checked = await validate(
    validators.validateUpdateCharacter,
    {},
    "PATCH"
  );
  assert.ifError(checked.error);
  const outcome = await invoke(controller.updateCharacter, checked.request);
  assert.ifError(outcome.error);
  assert.equal(db.writes(), 0);
});

test("Training validates exactly four distinct canonical IDs at creation and PATCH", async () => {
  const valid = ["climb", "perception", "deceive", "navigate"];
  for (const training of [
    undefined,
    valid.slice(0, 3),
    [...valid, "stealth"],
    ["climb", "climb", "perception", "stealth"],
    ["climb", "perception", "stealth", "guile"],
    [{ id: "climb", rank: 1 }, ...valid.slice(1)],
    "climb",
  ]) {
    const checked = await validate(validators.validateCreateCharacter, {
      ...body(),
      training,
    });
    assert.ok(checked.error, JSON.stringify(training));
    if (training !== undefined)
      assert.ok(
        (
          await validate(
            validators.validateUpdateCharacter,
            { training },
            "PATCH"
          )
        ).error
      );
  }
  assert.ifError(
    (
      await validate(validators.validateCreateCharacter, {
        ...body(),
        training: valid,
      })
    ).error
  );
  for (const input of [
    { skills: {} },
    { specialties: {} },
    { progression: { corePoints: 1 } },
    { progression: { specialtyPicks: 1 } },
    { progression: { coreCheckInvestments: {} } },
    { proficiencyBonus: 10 },
  ]) {
    assert.ok(
      (
        await validate(validators.validateCreateCharacter, {
          ...body(),
          ...input,
        })
      ).error
    );
    assert.ok(
      (await validate(validators.validateUpdateCharacter, input, "PATCH")).error
    );
  }
});

test("Training survives creation serialization, reload, omission and explicit changes", async (t) => {
  const saved = await create(t);
  assert.deepEqual(saved.training, body().training);
  const reloaded = Character.hydrate(
    JSON.parse(JSON.stringify(saved))
  ).toObject();
  assert.deepEqual(reloaded.training, body().training);
  t.mock.method(Character, "findOne", () => ({
    lean: async () => copy(saved),
  }));
  const fetched = await invoke(controller.getCharacterById, {});
  assert.ifError(fetched.error);
  assert.deepEqual(fetched.result.training, body().training);
});

test("PATCH preserves omitted Training and updates four IDs without resetting nested resources or identity", async (t) => {
  const seed = existing();
  seed.identity = {
    background: { pastRole: "Courier", definingEvent: "Saved event" },
    tags: [{ key: "mark", label: "Mark" }],
  };
  seed.resources.health.current = 1;
  const { after, before } = await patch(
    t,
    {
      training: ["stealth", "perception", "deceive", "navigate"],
      identity: { background: { pastRole: "Captain" } },
    },
    seed
  );
  assert.deepEqual(after.training, [
    "stealth",
    "perception",
    "deceive",
    "navigate",
  ]);
  assert.equal(
    after.identity.background.definingEvent,
    before.identity.background.definingEvent
  );
  assert.deepEqual(after.identity.tags, before.identity.tags);
  assert.deepEqual(after.resources, before.resources);
  assert.deepEqual(after.progression, before.progression);
  assert.deepEqual(after.skills, before.skills);
});

test("omitted Training is preserved and legacy ownership is never silently converted", async (t) => {
  const modern = await patch(t, { notes: "Changed" });
  assert.deepEqual(modern.after.training, modern.before.training);
  const historical = existing();
  delete historical.training;
  const { after, db } = await patch(t, { notes: "Changed" }, historical);
  assert.equal("training" in after, false);
  assert.deepEqual(after.skills, historical.skills);
  assert.equal(db.writes(), 1);
});

test("historical missing resources remain missing on unrelated PATCH; Path advancement stays disabled", async (t) => {
  const seed = existing();
  delete seed.resources.health;
  delete seed.resources.focus;
  const { after } = await patch(t, { notes: "Still historical" }, seed);
  assert.equal(after.resources.health, undefined);
  assert.equal(after.resources.focus, undefined);
  for (const input of [
    { progression: { specializationPath: "storm-broker" } },
    { progression: { unlockedNodes: ["ghost-patch"] } },
  ]) {
    assert.ok(
      (await validate(validators.validateUpdateCharacter, input, "PATCH")).error
    );
  }
});

test("missing historical resource maximum rejects current edits explicitly", async (t) => {
  const seed = existing();
  delete seed.resources.health;
  database(t, seed);
  const checked = await validate(
    validators.validateUpdateCharacter,
    { resources: { health: { current: 1 } } },
    "PATCH"
  );
  assert.ifError(checked.error);
  const outcome = await invoke(controller.updateCharacter, checked.request);
  assert.ok(outcome.error.message.includes("capacity is unavailable"));
});

test("Calling skills, free choices and substitutions persist through creation and API reads", async (t) => {
  const packages = (
    await import(
      "../src/modules/archipelago/system/blueprints/startingProficiencies.js"
    )
  ).default;
  for (const [calling, pkg] of Object.entries(packages.callings)) {
    const free = ["bargain", "deceive", "perform", "persuade"]
      .filter((id) => !pkg.skills.includes(id))
      .slice(0, 2);
    const saved = await create(t, {
      ...body(),
      calling,
      training: [...pkg.skills, ...free],
    });
    assert.deepEqual(saved.training, [...pkg.skills, ...free]);
    assert.deepEqual(saved.advancement.savingThrows, pkg.saves);
    t.mock.method(Character, "findOne", () => ({
      lean: async () => copy(saved),
    }));
    const read = await invoke(controller.getCharacterById, {});
    assert.ifError(read.error);
    assert.deepEqual(read.result.training, saved.training);
    const replacement = ["read", "stealth", "investigate"].find(
      (id) => !saved.training.includes(id)
    );
    const selected = [replacement, ...saved.training.slice(1)];
    const changed = await create(t, { ...body(), calling, training: selected });
    assert.deepEqual(changed.training, selected);
    assert.ok(!changed.training.includes(pkg.skills[0]));
  }
});

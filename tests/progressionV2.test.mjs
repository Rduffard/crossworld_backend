import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const registry = require("../src/modules/archipelago/system/blueprints/abilities");
const engine = require("../src/modules/archipelago/system/advancement");
const packages = require("../src/modules/archipelago/system/blueprints/characters/startingEquipment");
const starting = require("../src/modules/archipelago/equipment/startingEquipment");
const equipment = require("../src/modules/archipelago/equipment");
const playtest = require("../src/modules/archipelago/system/playtest");
const { fromCharacter } = require("../src/modules/archipelago/combat/snapshot");
const { applyCommand } = require("../src/modules/archipelago/combat/state");
const attributes = {
    might: 10,
    agility: 10,
    wit: 10,
    spirit: 10,
    resolve: 10,
    instinct: 10,
  },
  training = ["climb", "read", "lore", "attune"];
function selection(calling) {
  return calling === "corsair"
    ? {
        "choice:corsair:expertise:1": [
          "corsair:expertise-climb",
          "corsair:expertise-read",
        ],
      }
    : calling === "gunslinger"
    ? { "choice:gunslinger:style:1": ["gunslinger:style-defense"] }
    : {};
}
function pack(calling) {
  return {
    packageId: calling,
    version: 1,
    choices: Object.fromEntries(
      Object.entries(packages[calling].choices).map(([k, v]) => [
        k,
        Object.keys(v)[0],
      ])
    ),
  };
}
function spendGroup(group, selected, scores) {
  if (group.kind === "attribute")
    return {
      rewardId: group.id,
      kind: "attribute",
      increases: { [Object.keys(attributes).find((k) => scores[k] <= 18)]: 2 },
    };
  return {
    rewardId: group.id,
    kind: "selection",
    abilityIds: group.options
      .filter(
        (id) =>
          !selected.includes(id) &&
          (!id.includes("expertise-") ||
            training.some((s) => id.endsWith("expertise-" + s)))
      )
      .slice(0, group.count),
  };
}
test("every Calling resolves every intermediate level with complete supported choices and immutable ledger", () => {
  assert.equal(registry.validate(), true);
  assert.equal(
    new Set(registry.items.map((a) => a.id)).size,
    registry.items.length
  );
  for (const calling of Object.keys(registry.tables)) {
    let ledger = engine.initialize(
      calling,
      attributes,
      selection(calling),
      training
    );
    let selected = Object.values(selection(calling)).flat();
    for (let level = 1; level <= 20; level++) {
      const before = structuredClone(ledger);
      if (level > 1) {
        const spends = engine
          .rewardsAt(level, calling)
          .filter((r) => r.level === level && r.required)
          .map((g) =>
            spendGroup(
              g,
              selected,
              engine.summarize(ledger, level - 1, { training }).attributes
            )
          );
        const next = engine.advance(
          ledger,
          level - 1,
          { expectedRevision: ledger.revision, level, spends },
          { training }
        );
        assert.deepEqual(ledger, before);
        ledger = next.ledger;
        selected = next.summary.callingAbilities;
      }
      const summary = engine.summarize(ledger, level, { training });
      assert.equal(summary.complete, true, calling + " " + level);
      assert.equal(summary.trainingBonus, 2 + Math.floor((level - 1) / 4));
      assert.ok(summary.callingAbilities.includes(calling + ":passive"));
      assert.equal(summary.progression.length, 20);
      assert.deepEqual(
        summary.rewards.filter((r) => r.kind === "path").map((r) => r.level),
        [3, 6, 11, 16].filter((n) => n <= level)
      );
    }
  }
});
test("required choices, cross-Calling IDs, duplicate grants, forged fields and prerequisites fail", () => {
  const empty = engine.initialize("corsair", attributes, {}, training);
  assert.equal(engine.summarize(empty, 1, { training }).complete, false);
  assert.throws(() =>
    engine.initialize(
      "corsair",
      attributes,
      {
        "choice:corsair:expertise:1": [
          "corsair:expertise-climb",
          "corsair:expertise-stealth",
        ],
      },
      training
    )
  );
  assert.throws(() =>
    engine.initialize(
      "corsair",
      attributes,
      {
        "choice:corsair:expertise:1": [
          "gunslinger:style-defense",
          "corsair:expertise-read",
        ],
      },
      training
    )
  );
  const ledger = engine.initialize(
    "corsair",
    attributes,
    selection("corsair"),
    training
  );
  assert.throws(() =>
    engine.advance(ledger, 1, { expectedRevision: 99, level: 2 }, { training })
  );
  assert.throws(() =>
    engine.advance(
      ledger,
      1,
      {
        expectedRevision: 0,
        level: 2,
        spends: [
          {
            rewardId: "choice:corsair:expertise:1",
            kind: "selection",
            abilityIds: ["corsair:expertise-climb", "corsair:expertise-read"],
          },
        ],
      },
      { training }
    )
  );
  assert.throws(() =>
    engine.advance(
      ledger,
      1,
      { expectedRevision: 0, level: 2, attributes: { might: 20 } },
      { training }
    )
  );
});
test("all starting alternatives create owned instances, valid defaults, correct firearm Training and no silent mechanics", () => {
  for (const [calling, p] of Object.entries(packages)) {
    let choices = [{}];
    for (const [key, opts] of Object.entries(p.choices))
      choices = choices.flatMap((c) =>
        Object.keys(opts).map((id) => ({ ...c, [key]: id }))
      );
    for (const choice of choices) {
      const resolved = starting.resolve(calling, {
        packageId: calling,
        version: 1,
        choices: choice,
      });
      assert.equal(
        new Set(resolved.inventory.map((i) => i.instanceId)).size,
        resolved.inventory.length
      );
      const c = {
        calling,
        attributes,
        training,
        progression: { rank: 1 },
        ...resolved,
      };
      const result = equipment.derive(c);
      assert.ok(result.guard >= 10);
      if (calling === "gunslinger") {
        const firearm = resolved.inventory.find((i) =>
          ["pistol", "musket"].includes(i.definitionId)
        );
        const loadout = { ...resolved.loadout, mainHand: firearm.instanceId };
        const firearmAttack = equipment.derive({ ...c, loadout }).attacks[0];
        assert.equal(firearmAttack.trained, true);
        assert.equal(firearmAttack.supported, false);
      }
    }
    assert.throws(() =>
      starting.resolve(calling, { packageId: "wrong", version: 1, choices: {} })
    );
  }
  const p = pack("corsair"),
    preview = starting.resolve("corsair", p, { preview: true });
  assert.ok(
    preview.inventory.every((i) => i.instanceId.startsWith("preview:"))
  );
  assert.throws(() =>
    starting.resolve("corsair", {
      ...p,
      equipped: {
        mainHand: "foreign",
        offHand: null,
        armor: null,
        grip: "one",
      },
    })
  );
});
test("development plans replay decisions, never mutate source, and can initialize multi-attack snapshots", () => {
  const source = {
    _id: "0123456789abcdef01234567",
    owner: "owner",
    name: "Test Gunslinger",
    calling: "gunslinger",
    attributes,
    training,
    progression: { rank: 1 },
    advancement: engine.initialize(
      "gunslinger",
      attributes,
      selection("gunslinger"),
      training
    ),
    resources: {
      health: { current: 6, max: 12 },
      stamina: { current: 4, max: 10 },
      focus: { current: 3, max: 10 },
    },
    ...starting.resolve("gunslinger", pack("gunslinger")),
  };
  const before = structuredClone(source);
  const plan = {
    level: 5,
    decisions: [
      {
        level: 4,
        spends: [
          {
            rewardId: "attribute:4",
            kind: "attribute",
            increases: { might: 2 },
          },
        ],
      },
    ],
  };
  const build = playtest.build(source, plan);
  assert.equal(build.complete, true);
  assert.deepEqual(source, before);
  assert.equal(build.character.resources.health.current, 6);
  assert.equal(build.character.progression.rank, 5);
  let state = fromCharacter(build.character, "owner");
  assert.equal(state.combatants[0].attacksPerAction, 2);
  const weapon = state.combatants[0].attackOptions[0].id;
  state = applyCommand(
    state,
    {
      id: "test-first-attack",
      expectedRevision: 0,
      type: "attack",
      actor: "player",
      weapon,
      target: "enemy",
    },
    "owner",
    () => 1
  );
  assert.equal(state.combatants[0].actions, 0);
  assert.equal(state.combatants[0].attacksRemaining, 1);
  state = applyCommand(
    state,
    {
      id: "test-second-attack",
      expectedRevision: 1,
      type: "attack",
      actor: "player",
      weapon,
      target: "enemy",
    },
    "owner",
    () => 1
  );
  assert.equal(state.combatants[0].attacksRemaining, 0);
  assert.throws(() =>
    applyCommand(
      state,
      {
        id: "test-third-attack",
        expectedRevision: 2,
        type: "attack",
        actor: "player",
        weapon,
        target: "enemy",
      },
      "owner",
      () => 1
    )
  );
  assert.equal(playtest.build(source, { level: 5 }).complete, false);
  assert.throws(() => playtest.build(source, { level: 21 }));
  assert.deepEqual(source, before);
});
test("production and default development environments deny level playtests", () => {
  const oldMode = process.env.NODE_ENV,
    oldFlag = process.env.ARCHIPELAGO_PLAYTEST_ENABLED;
  try {
    delete process.env.ARCHIPELAGO_PLAYTEST_ENABLED;
    assert.equal(playtest.enabled(), false);
    process.env.ARCHIPELAGO_PLAYTEST_ENABLED = "true";
    process.env.NODE_ENV = "production";
    assert.equal(playtest.enabled(), false);
    process.env.NODE_ENV = "development";
    assert.equal(playtest.enabled(), true);
  } finally {
    if (oldMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldMode;
    if (oldFlag === undefined) delete process.env.ARCHIPELAGO_PLAYTEST_ENABLED;
    else process.env.ARCHIPELAGO_PLAYTEST_ENABLED = oldFlag;
  }
});
test("Great Weapon Fighting adjusts applicable damage dice while preserving raw results", () => {
  const { resolveAttack } = require("../src/modules/archipelago/combat/attack");
  const [actor, target] =
    require("../src/modules/archipelago/combat/state").createFixture(
      "owner"
    ).combatants;
  actor.greatWeaponFighting = true;
  actor.weaponTraining = ["martial"];
  const weapon = require("../src/modules/archipelago/equipment").definition(
    "greatsword"
  );
  const dice = [20, 1, 2, 4, 6];
  const result = resolveAttack(actor, target, weapon, {}, () => dice.shift());
  assert.deepEqual(result.damageDice, [1, 2, 4, 6]);
  assert.deepEqual(result.adjustedDamageDice, [3, 3, 4, 6]);
  assert.equal(result.damageTotal, 19);
});
test("development HTTP gate denies production and unauthorized access and rejects fabricated stats", async () => {
  const express = require("express"),
    jwt = require("jsonwebtoken");
  const Character = require("../src/modules/archipelago/characters/model"),
    Encounter = require("../src/modules/archipelago/combat/model");
  const { JWT_SECRET } = require("../src/config/env");
  const source = {
    _id: "0123456789abcdef01234567",
    owner: "owner",
    name: "Development Sailor",
    calling: "gunslinger",
    attributes,
    training,
    progression: { rank: 1 },
    advancement: engine.initialize(
      "gunslinger",
      attributes,
      selection("gunslinger"),
      training
    ),
    resources: {
      health: { current: 8, max: 12 },
      stamina: { current: 8, max: 10 },
      focus: { current: 8, max: 10 },
    },
    ...starting.resolve("gunslinger", pack("gunslinger")),
  };
  const before = structuredClone(source),
    oldFind = Character.findOne,
    oldCreate = Encounter.create,
    oldMode = process.env.NODE_ENV,
    oldFlag = process.env.ARCHIPELAGO_PLAYTEST_ENABLED;
  Character.findOne = (filter) => ({
    lean: async () =>
      filter.owner === "owner" ? structuredClone(source) : null,
  });
  let encounterWrites = 0;
  Encounter.create = async (snapshot) => {
    encounterWrites++;
    return { ...snapshot, _id: "temporary-encounter" };
  };
  const app = express();
  app.use(express.json());
  app.use("/archipelago", require("../src/modules/archipelago/routes"));
  app.use((e, _req, res, _next) =>
    res
      .status(e.statusCode ?? (e.details ? 400 : 500))
      .json({ message: e.message })
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const post = async (suffix, body, owner = "owner") => {
    const res = await fetch(
      "http://127.0.0.1:" +
        server.address().port +
        "/archipelago/characters/" +
        source._id +
        "/" +
        suffix,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(owner
            ? {
                Authorization: "Bearer " + jwt.sign({ _id: owner }, JWT_SECRET),
              }
            : {}),
        },
        body: JSON.stringify(body),
      }
    );
    return { status: res.status, body: await res.json() };
  };
  try {
    process.env.ARCHIPELAGO_PLAYTEST_ENABLED = "true";
    process.env.NODE_ENV = "production";
    assert.equal((await post("playtest-preview", { level: 1 })).status, 403);
    process.env.NODE_ENV = "development";
    assert.equal(
      (await post("playtest-preview", { level: 1 }, null)).status,
      401
    );
    assert.equal(
      (await post("playtest-preview", { level: 1 }, "stranger")).status,
      404
    );
    assert.equal(
      (await post("playtest-preview", { level: 1, attributes: { might: 99 } }))
        .status,
      400
    );
    assert.equal((await post("playtest-preview", { level: 1 })).status, 200);
    assert.equal(encounterWrites, 0);
    assert.equal((await post("playtest-encounter", { level: 5 })).status, 400);
    const result = await post("playtest-encounter", {
      level: 5,
      decisions: [
        {
          level: 4,
          spends: [
            {
              rewardId: "attribute:4",
              kind: "attribute",
              increases: { might: 2 },
            },
          ],
        },
      ],
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.combatants[0].attacksPerAction, 2);
    assert.equal(encounterWrites, 1);
    assert.deepEqual(source, before);
  } finally {
    Character.findOne = oldFind;
    Encounter.create = oldCreate;
    if (oldMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldMode;
    if (oldFlag === undefined) delete process.env.ARCHIPELAGO_PLAYTEST_ENABLED;
    else process.env.ARCHIPELAGO_PLAYTEST_ENABLED = oldFlag;
    await new Promise((resolve) => server.close(resolve));
  }
});
test("canonical catalog validation rejects duplicates, unknown references and prerequisite cycles", () => {
  const a = structuredClone(registry.items[0]),
    b = { ...structuredClone(a), id: "other" };
  assert.throws(() => registry.validate([a, a], {}), /Duplicate/);
  assert.throws(
    () =>
      registry.validate(
        [{ ...a, prerequisites: { abilities: ["missing"] } }],
        {}
      ),
    /Unknown/
  );
  assert.throws(
    () =>
      registry.validate(
        [
          { ...a, prerequisites: { abilities: ["other"] } },
          { ...b, prerequisites: { abilities: [a.id] } },
        ],
        {}
      ),
    /Cyclic/
  );
});
test("incomplete canonical characters cannot bypass required choices by entering combat", () => {
  const character = {
    _id: "0123456789abcdef01234567",
    owner: "owner",
    name: "Incomplete",
    calling: "corsair",
    attributes,
    training,
    progression: { rank: 1 },
    advancement: engine.initialize("corsair", attributes, {}, training),
    resources: { health: { current: 10, max: 12 } },
    ...starting.resolve("corsair", pack("corsair")),
  };
  assert.throws(
    () => fromCharacter(character, "owner"),
    /Complete required advancement/
  );
});

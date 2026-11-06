import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const catalog = require("../src/modules/archipelago/system/blueprints/equipment");
const gear = require("../src/modules/archipelago/equipment");
const {
  resolveTraining,
  weaponTrained,
} = require("../src/modules/archipelago/equipment/training");
const {
  resolveAttack,
  allowedAttributes,
} = require("../src/modules/archipelago/combat/attack");
const { fromCharacter } = require("../src/modules/archipelago/combat/snapshot");
const {
  applyCommand,
  createFixture,
} = require("../src/modules/archipelago/combat/state");
const attrs = {
  might: 16,
  agility: 14,
  wit: 10,
  spirit: 10,
  resolve: 12,
  instinct: 10,
};
const character = (calling = "corsair") => ({
  _id: "0123456789abcdef01234567",
  owner: "owner",
  name: "Sailor",
  calling,
  attributes: { ...attrs },
  progression: { rank: 1 },
  training: ["climb", "read", "lore", "attune"],
  resources: { health: { current: 12, max: 20 } },
  documentRevision: 0,
  ...gear.startingEquipment(),
});
const roll =
  (...values) =>
  () => {
    assert.ok(values.length);
    return values.shift();
  };
test("catalog contains every SRD table weapon and original cutlass, with unique immutable definitions", () => {
  const expected = [
    "club",
    "dagger",
    "greatclub",
    "handaxe",
    "javelin",
    "light-hammer",
    "mace",
    "quarterstaff",
    "sickle",
    "spear",
    "dart",
    "light-crossbow",
    "shortbow",
    "sling",
    "battleaxe",
    "flail",
    "glaive",
    "greataxe",
    "greatsword",
    "halberd",
    "lance",
    "longsword",
    "maul",
    "morningstar",
    "pike",
    "rapier",
    "scimitar",
    "shortsword",
    "trident",
    "warhammer",
    "war-pick",
    "whip",
    "blowgun",
    "hand-crossbow",
    "heavy-crossbow",
    "longbow",
    "musket",
    "pistol",
    "cutlass",
  ];
  assert.deepEqual(
    catalog.items.filter((i) => i.kind === "weapon").map((i) => i.id),
    expected
  );
  assert.equal(catalog.items.length, 52);
  assert.equal(new Set(catalog.items.map((i) => i.id)).size, 52);
  const damage = [
    "1d4",
    "1d4",
    "1d8",
    "1d6",
    "1d6",
    "1d4",
    "1d6",
    "1d6",
    "1d4",
    "1d6",
    "1d4",
    "1d8",
    "1d6",
    "1d4",
    "1d8",
    "1d8",
    "1d10",
    "1d12",
    "2d6",
    "1d10",
    "1d10",
    "1d8",
    "2d6",
    "1d8",
    "1d10",
    "1d8",
    "1d6",
    "1d6",
    "1d8",
    "1d8",
    "1d8",
    "1d4",
    "1",
    "1d6",
    "1d10",
    "1d8",
    "1d12",
    "1d10",
    "1d6",
  ];
  const weights = [
    2,
    1,
    10,
    2,
    2,
    2,
    4,
    4,
    2,
    3,
    0.25,
    5,
    2,
    null,
    4,
    2,
    6,
    7,
    6,
    6,
    6,
    3,
    10,
    4,
    18,
    2,
    3,
    2,
    4,
    5,
    2,
    3,
    1,
    3,
    18,
    2,
    10,
    3,
    null,
  ];
  const costs = [
    10,
    200,
    20,
    500,
    50,
    200,
    500,
    20,
    100,
    100,
    5,
    2500,
    2500,
    10,
    1000,
    1000,
    2000,
    3000,
    5000,
    2000,
    1000,
    1500,
    1000,
    1500,
    500,
    2500,
    2500,
    1000,
    500,
    1500,
    500,
    200,
    1000,
    7500,
    5000,
    5000,
    50000,
    25000,
    null,
  ];
  expected.forEach((id, index) => {
    const d = gear.definition(id);
    assert.equal(
      d.damage.fixed
        ? String(d.damage.fixed)
        : d.damage.count + "d" + d.damage.sides,
      damage[index]
    );
    assert.equal(d.weightLb, weights[index]);
    assert.equal(d.costCp, costs[index]);
    assert.ok(Object.isFrozen(d));
    for (const p of d.properties)
      assert.ok(
        [
          "finesse",
          "light",
          "heavy",
          "two-handed",
          "versatile",
          "reach",
          "thrown",
          "ammunition",
          "loading",
        ].includes(p.id)
      );
  });
  const props = [
    "light",
    "finesse light thrown",
    "two-handed",
    "light thrown",
    "thrown",
    "light thrown",
    "",
    "versatile",
    "light",
    "thrown versatile",
    "finesse thrown",
    "ammunition loading two-handed",
    "ammunition two-handed",
    "ammunition",
    "versatile",
    "",
    "heavy reach two-handed",
    "heavy two-handed",
    "heavy two-handed",
    "heavy reach two-handed",
    "heavy reach two-handed",
    "versatile",
    "heavy two-handed",
    "",
    "heavy reach two-handed",
    "finesse",
    "finesse light",
    "finesse light",
    "thrown versatile",
    "versatile",
    "versatile",
    "finesse reach",
    "ammunition loading",
    "ammunition light loading",
    "ammunition heavy loading two-handed",
    "ammunition heavy two-handed",
    "ammunition loading two-handed",
    "ammunition loading",
    "finesse light",
  ];
  const masteries = [
    "slow",
    "nick",
    "push",
    "vex",
    "slow",
    "nick",
    "sap",
    "topple",
    "nick",
    "sap",
    "vex",
    "slow",
    "vex",
    "slow",
    "topple",
    "sap",
    "graze",
    "cleave",
    "graze",
    "cleave",
    "topple",
    "sap",
    "topple",
    "sap",
    "push",
    "vex",
    "nick",
    "vex",
    "topple",
    "push",
    "sap",
    "slow",
    "vex",
    "vex",
    "push",
    "slow",
    "slow",
    "vex",
    null,
  ];
  expected.forEach((id, i) => {
    const d = gear.definition(id);
    assert.equal(d.properties.map((p) => p.id).join(" "), props[i]);
    assert.equal(d.mastery, masteries[i]);
    assert.equal(d.category, i < 14 ? "simple" : "martial");
    assert.equal(
      d.type,
      (i >= 10 && i <= 13) || (i >= 32 && i <= 37) ? "ranged" : "melee"
    );
    assert.equal(d.hands, props[i].includes("two-handed") ? 2 : 1);
    assert.equal(
      d.reachFeet,
      d.type === "ranged" ? null : props[i].includes("reach") ? 10 : 5
    );
  });
  assert.deepEqual(gear.definition("dagger").rangeFeet, {
    normal: 20,
    long: 60,
  });
  assert.deepEqual(gear.definition("musket").rangeFeet, {
    normal: 40,
    long: 120,
  });
  assert.equal(gear.definition("cutlass").mastery, null);
});
test("armor and shields exactly cover SRD Guard, requirements, weight, prices and timing", () => {
  const ids = [
    "padded-armor",
    "leather-armor",
    "studded-leather-armor",
    "hide-armor",
    "chain-shirt",
    "scale-mail",
    "breastplate",
    "half-plate-armor",
    "ring-mail",
    "chain-mail",
    "splint-armor",
    "plate-armor",
  ];
  const bases = [11, 11, 12, 12, 13, 14, 14, 15, 14, 16, 17, 18],
    weights = [8, 10, 13, 12, 20, 45, 20, 40, 40, 55, 60, 65],
    prices = [
      500, 1000, 4500, 1000, 5000, 5000, 40000, 75000, 3000, 7500, 20000,
      150000,
    ];
  assert.deepEqual(
    catalog.items.filter((d) => d.kind === "armor").map((d) => d.id),
    ids
  );
  ids.forEach((id, i) => {
    const d = gear.definition(id);
    assert.equal(d.base, bases[i]);
    assert.equal(d.weightLb, weights[i]);
    assert.equal(d.costCp, prices[i]);
    assert.equal(d.agility, i < 8);
    assert.equal(d.agilityCap, i >= 3 && i < 8 ? 2 : null);
    assert.equal(d.mightRequirement, i === 9 ? 13 : i >= 10 ? 15 : null);
    assert.equal(d.stealthDisadvantage, [0, 5, 7, 8, 9, 10, 11].includes(i));
    assert.equal(d.don.amount, i < 3 ? 1 : i < 8 ? 5 : 10);
    assert.equal(d.doff.amount, i < 8 ? 1 : 5);
  });
  const shield = gear.definition("shield");
  assert.equal(shield.guardBonus, 2);
  assert.equal(shield.don.unit, "utilize-action");
  assert.equal(shield.costCp, 1000);
});
test("inventory instances, forbidden mechanics, quantity and loadout validation", () => {
  const c = character();
  const copy = gear.issue({ definitionId: "cutlass" });
  assert.notEqual(copy.instanceId, c.inventory[0].instanceId);
  assert.throws(() => gear.issue({ definitionId: "cutlass", damage: 999 }));
  assert.throws(() => gear.issue({ definitionId: "unknown" }));
  assert.throws(() => gear.validateInventory([...c.inventory, c.inventory[0]]));
  assert.throws(() => gear.validateInventory([{ ...copy, quantity: 2 }]));
  assert.throws(() => gear.validateInventory([{ ...copy, quantity: 0 }]));
  assert.throws(() =>
    gear.validateLoadout(c.inventory, {
      ...c.loadout,
      offHand: c.loadout.mainHand,
    })
  );
  assert.throws(() =>
    gear.validateLoadout(c.inventory, { ...c.loadout, mainHand: "foreign" })
  );
  assert.throws(() =>
    gear.validateLoadout(c.inventory, {
      ...c.loadout,
      armor: c.loadout.mainHand,
    })
  );
  const sword = gear.issue({ definitionId: "greatsword" }),
    shield = gear.issue({ definitionId: "shield" });
  const inventory = [sword, shield];
  assert.throws(() =>
    gear.validateLoadout(inventory, {
      mainHand: sword.instanceId,
      offHand: shield.instanceId,
      armor: null,
      grip: "two",
    })
  );
  assert.doesNotThrow(() =>
    gear.validateLoadout(inventory, {
      mainHand: sword.instanceId,
      offHand: null,
      armor: null,
      grip: "two",
    })
  );
  const note = gear.issue({ customName: "Map", notes: "No mechanics" });
  assert.throws(() =>
    gear.validateLoadout([note], {
      mainHand: note.instanceId,
      offHand: null,
      armor: null,
      grip: "one",
    })
  );
});
test("Calling weapon/armor Training is explicit and never duplicated or granted by skills", () => {
  for (const calling of [
    "corsair",
    "gunslinger",
    "navigator",
    "tidecaller",
    "warden",
    "reaver",
  ]) {
    const t = resolveTraining(calling);
    assert.ok(weaponTrained(t, gear.definition("dagger")));
    assert.equal(
      weaponTrained(t, gear.definition("cutlass")),
      ["corsair", "warden"].includes(calling)
    );
    assert.equal(t.armor.includes("heavy"), calling === "warden");
  }
  const t = resolveTraining("corsair", [
    { categories: ["simple"], weapons: ["cutlass"] },
  ]);
  assert.equal(t.weapons.length, 1);
  const c = character("gunslinger");
  c.training = ["cutlass"];
  assert.equal(gear.derive(c).attacks[0].trained, false);
});
test("equipped armor and shield determine Guard, untrained consequences and negative Agility", () => {
  for (const calling of ["warden", "tidecaller"]) {
    const c = character(calling),
      armor = gear.issue({ definitionId: "chain-mail" }),
      shield = gear.issue({ definitionId: "shield" });
    c.inventory.push(armor, shield);
    c.loadout.armor = armor.instanceId;
    c.loadout.offHand = shield.instanceId;
    const data = gear.derive(c);
    assert.equal(data.guard, calling === "warden" ? 18 : 16);
    assert.equal(
      data.restrictions.physicalD20Disadvantage,
      calling === "tidecaller"
    );
    assert.equal(
      data.restrictions.spellcastingBlocked,
      calling === "tidecaller"
    );
  }
  const c = character();
  const armor = gear.issue({ definitionId: "half-plate-armor" });
  c.inventory.push(armor);
  c.loadout.armor = armor.instanceId;
  c.attributes.agility = 8;
  assert.equal(gear.derive(c).guard, 14);
});
test("finesse permits lower Might/Agility selection, ordinary melee uses Might and unsupported attacks fail", () => {
  const a = createFixture("owner").combatants[0],
    t = createFixture("owner").combatants[1];
  assert.equal(
    resolveAttack(
      a,
      t,
      gear.definition("cutlass"),
      { attribute: "agility" },
      roll(10, 3)
    ).attributeModifier,
    2
  );
  assert.equal(
    resolveAttack(
      a,
      t,
      gear.definition("cutlass"),
      { attribute: "might" },
      roll(10, 3)
    ).damageTotal,
    6
  );
  assert.throws(() =>
    resolveAttack(
      a,
      t,
      gear.definition("mace"),
      { attribute: "agility" },
      roll(10)
    )
  );
  assert.deepEqual(allowedAttributes(gear.definition("shortbow")), ["agility"]);
  assert.deepEqual(allowedAttributes(gear.definition("dagger"), "thrown"), [
    "might",
    "agility",
  ]);
  assert.deepEqual(allowedAttributes(gear.definition("javelin"), "thrown"), [
    "might",
  ]);
  assert.throws(() =>
    resolveAttack(a, t, gear.definition("shortbow"), {}, roll(10))
  );
  assert.throws(() =>
    resolveAttack(a, t, gear.definition("dagger"), { mode: "thrown" }, roll(10))
  );
});
test("snapshot uses owned weapon option, armor restrictions, frozen mechanics, revisions and duplicate protection", () => {
  const c = character();
  const state = fromCharacter(c, "owner");
  const option = state.combatants[0].attackOptions[0];
  const cmd = {
    id: "equipment-attack-01",
    expectedRevision: 0,
    type: "attack",
    actor: "player",
    weapon: option.id,
    target: "enemy",
    attribute: "agility",
  };
  c.loadout.mainHand = null;
  c.attributes.agility = 8;
  assert.equal(option.weapon.id, "cutlass");
  assert.equal(option.definitionVersion, 1);
  const next = applyCommand(state, cmd, "owner", roll(20, 2, 3));
  assert.equal(next.events[0].damageTotal, 7);
  assert.equal(next.events[0].proficiency, 2);
  assert.equal(next.events[0].instanceId, option.id);
  assert.strictEqual(applyCommand(next, cmd, "owner"), next);
  assert.throws(() =>
    applyCommand(next, { ...cmd, id: "stale-equipment" }, "owner")
  );
  const heavy = character("tidecaller");
  const armor = gear.issue({ definitionId: "chain-mail" });
  heavy.inventory.push(armor);
  heavy.loadout.armor = armor.instanceId;
  const st = fromCharacter(heavy, "owner");
  const result = applyCommand(
    st,
    { ...cmd, weapon: st.combatants[0].attackOptions[0].id },
    "owner",
    roll(19, 1)
  );
  assert.equal(result.events[0].result, "miss");
});
test("equipment operations issue server IDs, preserve immutable definitions, and enforce revisions", () => {
  const c = character();
  const result = gear.update(c, {
    expectedRevision: 0,
    add: [{ definitionId: "dagger" }],
  });
  assert.equal(result.inventory.length, 2);
  assert.equal(c.inventory.length, 1);
  assert.throws(() => gear.update(c, { expectedRevision: 1 }));
  assert.throws(() =>
    gear.update(c, {
      expectedRevision: 0,
      add: [{ definitionId: "cutlass", trained: true }],
    })
  );
  assert.throws(() =>
    gear.update(c, { expectedRevision: 0, remove: [c.loadout.mainHand] })
  );
});

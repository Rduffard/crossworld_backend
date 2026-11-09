import { build } from './helpers/rules2024.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const gear = require("../src/modules/archipelago/equipment");
const { fromCharacter } = require("../src/modules/archipelago/combat/snapshot");
const {
  applyCommand,
  createFixture,
} = require("../src/modules/archipelago/combat/state");
const { resolveAttack } = require("../src/modules/archipelago/combat/attack");
test("Heavy melee threshold imposes disadvantage and versatile grip changes critical damage dice", () => {
  const [actor, target] = createFixture("owner").combatants;
  actor.weaponTraining = ["martial"];
  actor.attributes.might = 12;
  const dice = [19, 5];
  const miss = resolveAttack(
    actor,
    target,
    gear.definition("greatsword"),
    {},
    () => dice.shift()
  );
  assert.deepEqual(miss.attackDice, [19, 5]);
  assert.equal(miss.selectedD20, 5);
  const item = gear.issue({ definitionId: "quarterstaff" });
  const c = {
    _id: "0123456789abcdef01234567",
    owner: "owner",
    name: "Warden",
    calling: "warden",
    attributes: {
      might: 16,
      agility: 14,
      wit: 10,
      spirit: 10,
      resolve: 12,
      instinct: 10,
    },
    progression: { rank: 1 },
    resources: { health: { current: 12, max: 20 } },
    inventory: [item],
    loadout: {
      mainHand: item.instanceId,
      offHand: null,
      armor: null,
      grip: "two",
    },
  };
  Object.assign(c, build(c.calling, 1, c.attributes));
  const state = fromCharacter(c, "owner"),
    values = [20, 2, 3],
    sides = [];
  const result = applyCommand(
    state,
    {
      id: "versatile-critical",
      type: "attack",
      expectedRevision: 0,
      actor: "player",
      target: "enemy",
      weapon: item.instanceId,
    },
    "owner",
    (side) => {
      sides.push(side);
      return values.shift();
    }
  );
  assert.deepEqual(sides, [20, 8, 8]);
  assert.equal(result.events[0].damageTotal, 8);
});
test("all SRD ranged/thrown ranges and ammunition types are retained as metadata", () => {
  const expected = {
    dagger: [20, 60],
    handaxe: [20, 60],
    javelin: [30, 120],
    "light-hammer": [20, 60],
    spear: [20, 60],
    dart: [20, 60],
    "light-crossbow": [80, 320, "bolt"],
    shortbow: [80, 320, "arrow"],
    sling: [30, 120, "bullet"],
    trident: [20, 60],
    blowgun: [25, 100, "needle"],
    "hand-crossbow": [30, 120, "bolt"],
    "heavy-crossbow": [100, 400, "bolt"],
    longbow: [150, 600, "arrow"],
    musket: [40, 120, "bullet"],
    pistol: [30, 90, "bullet"],
  };
  for (const [id, [normal, long, ammo]] of Object.entries(expected)) {
    const d = gear.definition(id);
    assert.deepEqual(d.rangeFeet, { normal, long });
    assert.equal(d.ammunitionType, ammo ?? null);
    if (d.type === "ranged") assert.equal(d.automation.ranged, false);
  }
});

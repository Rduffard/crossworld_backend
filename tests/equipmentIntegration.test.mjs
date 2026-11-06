import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Character = require("../src/modules/archipelago/characters/model");
const controller = require("../src/modules/archipelago/characters/controller");
const validators = require("../src/modules/archipelago/characters/validators");
const owner = "507f1f77bcf86cd799439011";
const origin = require("../src/modules/archipelago/system/blueprints/catalogs")
  .origins[0].id;
async function invoke(handler, body = {}, user = owner) {
  let result, error;
  await handler(
    { body, user: { _id: user }, params: { characterId: owner } },
    {
      status() {
        return this;
      },
      send(value) {
        result = value;
      },
    },
    (e) => {
      error = e;
    }
  );
  return { result, error };
}
test("create, equip, unequip and patch use server inventory with revision and ownership protections", async (t) => {
  let saved,
    writes = 0;
  t.mock.method(Character, "countDocuments", async () => 0);
  t.mock.method(Character, "create", async (payload) => {
    const doc = new Character(payload);
    await doc.validate();
    saved = JSON.parse(JSON.stringify(doc.toObject()));
    writes++;
    return doc;
  });
  t.mock.method(Character, "findById", () => ({
    lean: async () => structuredClone(saved),
  }));
  t.mock.method(Character, "findOne", (filter) => ({
    lean: async () => (filter.owner === owner ? structuredClone(saved) : null),
  }));
  t.mock.method(Character, "findOneAndUpdate", (filter, update) => ({
    lean: async () => {
      if (filter.documentRevision !== (saved.documentRevision ?? 0))
        return null;
      saved = { ...saved, ...JSON.parse(JSON.stringify(update)) };
      writes++;
      return structuredClone(saved);
    },
  }));
  const made = await invoke(controller.createCharacter, {
    startingEquipment: {
      packageId: "corsair",
      version: 1,
      choices: { secondary: "dagger" },
    },
    abilitySelections: {
      "choice:corsair:expertise:1": [
        "corsair:expertise-climb",
        "corsair:expertise-read",
      ],
    },
    name: "Equipment Sailor",
    calling: "corsair",
    origin,
    attributes: {
      might: 15,
      agility: 14,
      wit: 13,
      spirit: 12,
      resolve: 10,
      instinct: 8,
    },
    training: ["climb", "read", "lore", "attune"],
  });
  assert.ifError(made.error);
  assert.equal(saved.inventory.length, 3);
  assert.equal(saved.inventory[0].definitionId, "cutlass");
  assert.equal(saved.loadout.mainHand, saved.inventory[0].instanceId);
  assert.equal(made.result.equipmentDerived.attacks[0].trained, true);
  const initial = saved.inventory[0].instanceId;
  const added = await invoke(controller.updateCharacter, {
    equipmentOperation: {
      expectedRevision: 0,
      add: [
        { definitionId: "shield" },
        { definitionId: "leather-armor" },
        { definitionId: "dagger" },
      ],
    },
  });
  assert.ifError(added.error);
  assert.equal(saved.inventory.length, 6);
  assert.equal(saved.documentRevision, 1);
  const shield = saved.inventory.find((i) => i.definitionId === "shield"),
    armor = saved.inventory.find((i) => i.definitionId === "leather-armor");
  const equip = await invoke(controller.updateCharacter, {
    equipmentOperation: {
      expectedRevision: 1,
      loadout: {
        mainHand: initial,
        offHand: shield.instanceId,
        armor: armor.instanceId,
        grip: "one",
      },
    },
  });
  assert.ifError(equip.error);
  assert.equal(equip.result.equipmentDerived.guard, 15);
  const before = structuredClone(saved),
    count = writes;
  assert.ok(
    (
      await invoke(controller.updateCharacter, {
        equipmentOperation: { expectedRevision: 1, remove: [initial] },
      })
    ).error
  );
  assert.deepEqual(saved, before);
  assert.equal(writes, count);
  assert.ok(
    (
      await invoke(controller.updateCharacter, {
        equipmentOperation: {
          expectedRevision: 2,
          add: [{ definitionId: "cutlass", damage: 99 }],
        },
      })
    ).error
  );
  assert.ok(
    (
      await invoke(
        controller.updateCharacter,
        { equipmentOperation: { expectedRevision: 2 } },
        "other-owner"
      )
    ).error
  );
  assert.equal(writes, count);
  const clear = await invoke(controller.updateCharacter, {
    equipmentOperation: {
      expectedRevision: 2,
      loadout: { mainHand: null, offHand: null, armor: null, grip: "one" },
    },
  });
  assert.ifError(clear.error);
  assert.equal(clear.result.equipmentDerived.attacks.length, 0);
  assert.equal(clear.result.equipmentDerived.guard, 12);
  const snapshot = structuredClone(saved);
  const notes = await invoke(controller.updateCharacter, {
    notes: "Unrelated field",
  });
  assert.ifError(notes.error);
  assert.deepEqual(saved.inventory, snapshot.inventory);
  assert.deepEqual(saved.loadout, snapshot.loadout);
  assert.deepEqual(saved.advancement, snapshot.advancement);
  const info = await invoke(controller.getEquipment);
  assert.ifError(info.error);
  assert.equal(info.result.inventory.length, 6);
});
test("HTTP validators reject obsolete direct inventory and forged mechanics", async () => {
  for (const body of [
    { inventory: [] },
    { loadout: {} },
    { equipment: {} },
    {
      equipmentOperation: {
        expectedRevision: 0,
        add: [{ definitionId: "cutlass", trained: true }],
      },
    },
  ]) {
    let err;
    await validators.validateUpdateCharacter(
      { body, method: "PATCH", headers: {} },
      {},
      (e) => {
        err = e;
      }
    );
    assert.ok(err);
  }
});

const { randomUUID } = require("node:crypto");
const catalog = require("../system/blueprints/equipment");
const { resolveTraining, weaponTrained } = require("./training");
const { calculateCheckModifier } = require("../system/checkModifier");
const { proficiencyBonus } = require("../system/trainingChecks");
const { calculateGuard } = require("../combat/guard");
function fail(message) {
  const e = new Error(message);
  e.statusCode = 400;
  throw e;
}
function definition(id) {
  const d = catalog.items.find((item) => item.id === id);
  if (!d) fail("Unknown item definition");
  return d;
}
function keys(value, allowed) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !allowed.includes(k))
  )
    fail("Invalid equipment fields");
}
function issue(input) {
  keys(input, ["definitionId", "quantity", "customName", "notes"]);
  if (!Number.isSafeInteger(input.quantity ?? 1) || (input.quantity ?? 1) < 1)
    fail("Invalid item quantity");
  if (input.definitionId) {
    definition(input.definitionId);
    if ((input.quantity ?? 1) !== 1)
      fail("Canonical equipment needs individual instances");
  } else if (!input.customName?.trim())
    fail("Descriptive items require a name");
  return {
    instanceId: randomUUID(),
    definitionId: input.definitionId ?? null,
    quantity: input.quantity ?? 1,
    customName: input.customName ?? "",
    notes: input.notes ?? "",
  };
}
function validateInventory(inventory) {
  if (!Array.isArray(inventory) || inventory.length > 200)
    fail("Invalid inventory");
  const ids = new Set();
  for (const i of inventory) {
    keys(i, ["instanceId", "definitionId", "quantity", "customName", "notes"]);
    if (
      typeof i.instanceId !== "string" ||
      !i.instanceId ||
      ids.has(i.instanceId)
    )
      fail("Duplicate or missing item instance ID");
    ids.add(i.instanceId);
    if (!Number.isSafeInteger(i.quantity) || i.quantity < 1)
      fail("Invalid item quantity");
    if (i.definitionId) {
      definition(i.definitionId);
      if (i.quantity !== 1)
        fail("Weapons and armor must have individual instances");
    } else if (!i.customName?.trim()) fail("Descriptive item requires name");
    for (const k of ["customName", "notes"])
      if (typeof i[k] !== "string" || i[k].length > (k === "notes" ? 500 : 100))
        fail("Invalid item text");
  }
  return inventory;
}
function validateLoadout(inventory, loadout) {
  validateInventory(inventory);
  keys(loadout, ["mainHand", "offHand", "armor", "grip"]);
  const used = new Set();
  const resolved = {};
  for (const slot of ["mainHand", "offHand", "armor"]) {
    const id = loadout[slot];
    if (id === null) {
      resolved[slot] = null;
      continue;
    }
    if (typeof id !== "string" || used.has(id))
      fail("Conflicting equipped item");
    used.add(id);
    const i = inventory.find((i) => i.instanceId === id);
    if (!i || !i.definitionId)
      fail("Equipped item is not an owned canonical item");
    const d = definition(i.definitionId);
    if (
      slot === "armor"
        ? d.kind !== "armor"
        : !["weapon", "shield"].includes(d.kind)
    )
      fail("Invalid item slot");
    resolved[slot] = { ...i, definition: d };
  }
  if (!["one", "two"].includes(loadout.grip)) fail("Invalid weapon grip");
  const held = [resolved.mainHand, resolved.offHand].filter(Boolean);
  if (held.filter((i) => i.definition.kind === "shield").length > 1)
    fail("Only one shield can be equipped");
  if (held.some((i) => i.definition.hands === 2) && held.length !== 1)
    fail("Two-handed weapon conflicts with occupied hand");
  if (
    loadout.grip === "two" &&
    (!resolved.mainHand ||
      resolved.offHand ||
      !(
        resolved.mainHand.definition.hands === 2 ||
        resolved.mainHand.definition.versatileDamage
      ))
  )
    fail("Invalid two-hand grip");
  return resolved;
}
function derive(character) {
  if (!character.loadout)
    fail("Equipment schema changed: recreate this experimental character");
  const slots = validateLoadout(character.inventory, character.loadout),
    training = resolveTraining(character.calling);
  const armor = slots.armor?.definition ?? null;
  const shield = [slots.mainHand, slots.offHand].some(
    (i) => i?.definition.kind === "shield"
  );
  const untrainedArmor = Boolean(
    armor && !training.armor.includes(armor.category)
  );
  const guardInputs = {
    armor,
    shield: shield && training.armor.includes("shield"),
  };
  const restrictions = {
    untrainedArmor,
    untrainedShield: shield && !training.armor.includes("shield"),
    physicalD20Disadvantage: untrainedArmor,
    spellcastingBlocked: untrainedArmor,
    stealthDisadvantage: armor?.stealthDisadvantage ?? false,
    speedPenaltyFeet:
      armor?.mightRequirement &&
      character.attributes.might < armor.mightRequirement
        ? 10
        : 0,
    pending: ["movement-speed", "donning-doffing-time", "spellcasting"],
  };
  const attacks = [slots.mainHand, slots.offHand]
    .filter((i) => i?.definition.kind === "weapon")
    .map((i) => {
      const d = i.definition;
      const trained = weaponTrained(training, d);
      const allowedAttributes = d.properties.some((p) => p.id === "finesse")
        ? ["might", "agility"]
        : [d.type === "ranged" ? "agility" : "might"];
      const attributes = Object.fromEntries(
        allowedAttributes.map((key) => [
          key,
          calculateCheckModifier(character.attributes, key),
        ])
      );
      const attribute = allowedAttributes.reduce((a, b) =>
        attributes[b] > attributes[a] ? b : a
      );
      const damage =
        character.loadout.grip === "two" && d.versatileDamage
          ? { ...d.versatileDamage, type: d.damage.type }
          : d.damage;
      return {
        id: i.instanceId,
        instanceId: i.instanceId,
        definitionId: d.id,
        definitionVersion: d.version,
        name: i.customName || d.name,
        weapon: structuredClone({ ...d, damage }),
        trained,
        allowedAttributes,
        attribute,
        attackModifier:
          attributes[attribute] +
          (trained ? proficiencyBonus(character.progression.rank) : 0),
        supported: d.automation.melee,
        unsupportedReason: d.automation.melee
          ? null
          : "Range, ammunition, thrown state, or mounted combat is not implemented",
        restrictions,
      };
    });
  return {
    inventory: character.inventory,
    loadout: character.loadout,
    slots,
    training,
    guardInputs,
    guard: calculateGuard(character.attributes, guardInputs),
    attacks,
    restrictions,
  };
}
function startingEquipment() {
  const item = issue({ definitionId: "cutlass" });
  return {
    inventory: [item],
    loadout: {
      mainHand: item.instanceId,
      offHand: null,
      armor: null,
      grip: "one",
    },
  };
}
function update(character, operation) {
  keys(operation, ["expectedRevision", "add", "remove", "loadout", "edit"]);
  if (operation.expectedRevision !== (character.documentRevision ?? 0))
    fail("Character changed; reload equipment");
  if (!character.loadout)
    fail("Recreate experimental character for the equipment schema");
  const inventory = structuredClone(character.inventory);
  if (operation.remove) {
    if (
      !Array.isArray(operation.remove) ||
      operation.remove.some((id) => !inventory.some((i) => i.instanceId === id))
    )
      fail("Invalid removed item");
  }
  const next = inventory.filter(
    (i) => !(operation.remove ?? []).includes(i.instanceId)
  );
  if (operation.add) {
    if (!Array.isArray(operation.add) || operation.add.length > 50)
      fail("Invalid item additions");
    next.push(...operation.add.map(issue));
  }
  if (operation.edit) {
    if (!Array.isArray(operation.edit)) fail("Invalid item edits");
    for (const change of operation.edit) {
      keys(change, ["instanceId", "quantity", "customName", "notes"]);
      const item = next.find((i) => i.instanceId === change.instanceId);
      if (!item) fail("Cannot edit unowned item");
      for (const key of ["quantity", "customName", "notes"])
        if (change[key] !== undefined) item[key] = change[key];
    }
  }
  const loadout = structuredClone(operation.loadout ?? character.loadout);
  validateLoadout(next, loadout);
  return { inventory: next, loadout };
}
module.exports = {
  definition,
  issue,
  validateInventory,
  validateLoadout,
  derive,
  startingEquipment,
  update,
};

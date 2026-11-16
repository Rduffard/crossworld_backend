const { randomUUID } = require("node:crypto");
const { equipmentSlots, equipmentSlotEligible, equipmentGripError } = require('@crossworld/sanguine-engine/equipment/loadout-rules');
const catalog = require("../system/blueprints/equipment");
const { spells } = require("../system/rules");

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
  keys(input, ["definitionId", "quantity", "customName", "notes",'spellId']);
  if (!Number.isSafeInteger(input.quantity ?? 1) || (input.quantity ?? 1) < 1)
    fail("Invalid item quantity");
  if (input.definitionId) {
    definition(input.definitionId);
    if(definition(input.definitionId).purchaseScrollLevel!==undefined)fail('Choose an identified spell-scroll instance; priced scroll entries are purchase options only');
    if ((input.quantity ?? 1) !== 1 && !definition(input.definitionId).stackable)
      fail("Canonical equipment needs individual instances");
  } else if (!input.customName?.trim())
    fail("Descriptive items require a name");
  if(input.definitionId==='spell-scroll'?!spells.some(s=>s.id===input.spellId):input.spellId!==undefined)fail('A Spell Scroll requires one registered spell identity');
  return {
    instanceId: randomUUID(),
    definitionId: input.definitionId ?? null,
    quantity: input.quantity ?? 1,
    customName: input.customName ?? "",
    notes: input.notes ?? "",
    ...(input.definitionId==='spell-scroll'?{spellId:input.spellId}:{}),
    ...(input.definitionId&&definition(input.definitionId).profile?.charges?{chargesCurrent:definition(input.definitionId).profile.charges}:{}),
    ...(/healer.?s?\s*kit/i.test(input.customName??input.definitionId??'')||input.definitionId==='healer-kit'?{chargesCurrent:10}:{}),
  };
}
function validateInventory(inventory) {
  if (!Array.isArray(inventory) || inventory.length > 1000)
    fail("Invalid inventory");
  const ids = new Set();
  for (const i of inventory) {
    keys(i, ["instanceId", "definitionId", "quantity", "customName", "notes", 'chargesCurrent','spellId','attuned','worn']);
    if(i.definitionId==='spell-scroll'?!spells.some(s=>s.id===i.spellId):i.spellId!==undefined)fail('Invalid Spell Scroll identity');
    if(i.attuned!==undefined&&(typeof i.attuned!=='boolean'||!definition(i.definitionId).profile?.requiresAttunement)||i.worn!==undefined&&(typeof i.worn!=='boolean'||!definition(i.definitionId).profile?.wearSlot))fail('Invalid magic item wearing or attunement');
    if(i.chargesCurrent!==undefined&&(!Number.isSafeInteger(i.chargesCurrent)||i.chargesCurrent<0||i.chargesCurrent>(i.definitionId?definition(i.definitionId).profile?.charges??10:10)))fail('Invalid item charges');
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
      if(definition(i.definitionId).purchaseScrollLevel!==undefined)fail('Priced scroll purchase options cannot be stored as unidentified inventory');
      if (i.quantity !== 1 && !definition(i.definitionId).stackable)
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
  for (const slot of equipmentSlots) {
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
    if (!equipmentSlotEligible(slot, d)) fail("Invalid item slot");
    resolved[slot] = { ...i, definition: d };
  }
  const gripError = equipmentGripError(loadout.grip, resolved.mainHand?.definition, resolved.offHand?.definition);
  if (gripError) fail(gripError);
  return resolved;
}

module.exports = { definition, issue, validateInventory, validateLoadout, keys, fail };

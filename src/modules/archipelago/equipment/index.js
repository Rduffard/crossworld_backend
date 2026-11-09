const { randomUUID } = require("node:crypto");
const catalog = require("../system/blueprints/equipment");
const { weaponTrained } = require("./training");
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
  if(input.definitionId==='spell-scroll'?!require('../system/rules2024/rules').spells.some(s=>s.id===input.spellId):input.spellId!==undefined)fail('A Spell Scroll requires one registered spell identity');
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
    if(i.definitionId==='spell-scroll'?!require('../system/rules2024/rules').spells.some(s=>s.id===i.spellId):i.spellId!==undefined)fail('Invalid Spell Scroll identity');
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
        : !["weapon", "shield"].includes(d.kind)&&!d.profile?.held
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
  const rules=require('../system/rules2024');
  const baseProgression=rules.replay(character.rulesLedger);
  const progression=character.rulesRuntime?rules.runtime.project(baseProgression,character.rulesRuntime,character):baseProgression;
  character = { ...character, attributes: progression.attributes, progression: { rank: progression.totalLevel } };
  if (!character.loadout)
    fail("Equipment schema changed: recreate this experimental character");
  const slots = validateLoadout(character.inventory, character.loadout),
    training = (() => {
          const grants = progression.equipmentTraining;
          return { categories: grants.weapons.filter(w => ["simple", "martial"].includes(w)),
            weapons: grants.weapons.filter(w => !["simple", "martial"].includes(w)),
            groups: grants.weapons.includes("martial:finesse-or-light") ? ["martial:finesse-or-light"] : [],
            armor: grants.armor };
        })();
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
  const defenseBonus =
    progression?.fightingStyles.includes("defense") && armor ? 1 : 0;
    if (!armor && progression) {
      const agility = progression.attributeModifiers.agility;
      const alternatives = [10 + agility];
      if (progression.callingLevels.reaver) alternatives.push(10 + agility + progression.attributeModifiers.resolve);
      if (progression.paths.tidecaller === "omen-diver") alternatives.push(10 + agility + progression.attributeModifiers.spirit);
      if (alternatives.length > 1) guardInputs.unarmoredBase = Math.max(...alternatives);
    }
  guardInputs.bonus = defenseBonus + require('../system/rules2024/covenantOperations').guardBonus(character)+(progression.magicGuardBonus??0);
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
  if(progression.paths.reaver==='reef-colossus'&&progression.callingLevels.reaver>=6&&progression.raging&&!progression.reefSkinSuppressed&&armor?.category!=='heavy')restrictions.speedPenaltyFeet+=5;
  if(progression.paths.gunslinger==='brass-outrider'&&progression.callingLevels.gunslinger>=7&&armor?.category==='heavy')restrictions.speedPenaltyFeet+=10;
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
        weapon: structuredClone({
          ...d,
          damage,
          heldHands: character.loadout.grip === "two" || d.hands === 2 ? 2 : 1,
        }),
        trained,
        allowedAttributes,
        attribute,
        attackModifier:
          attributes[attribute] +
          (character.rulesRuntime?.effects.some(e=>e.sacredWeaponId===i.instanceId&&require('../system/rules2024/clock').active(character.rulesRuntime,e))?Math.max(1,progression.attributeModifiers.spirit):0) +
          (trained ? proficiencyBonus(character.progression.rank) : 0) +
          (d.type === "ranged" && progression.fightingStyles.includes("archery") ? 2 : 0) - 2*(progression.exhaustion??0),
        damageModifier: attributes[attribute],
        damageTypeOptions:character.rulesRuntime?.effects.some(e=>e.sacredWeaponId===i.instanceId&&require('../system/rules2024/clock').active(character.rulesRuntime,e))?[d.damage.type,'radiant']:[d.damage.type],
        mastery: progression.weaponMastery.includes(d.baseWeaponId??d.id) ? d.mastery : null,
        heavyDisadvantage: d.properties.some(p=>p.id==='heavy')&&character.attributes[d.type==='ranged'?'agility':'might']<13,
        requiresTwoHandGrip: d.hands===2&&character.loadout.grip!=='two',
        maxShotsPerAction: d.loading && !(progression.feats.includes('powder-drill')&&['pistol','musket'].includes(d.id)) ? 1 : progression.attacksPerAction,
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
    carrying:{capacityLb:15*character.attributes.might*(progression.colossus?.carryingMultiplier??1),pushDragLiftLb:30*character.attributes.might*(progression.colossus?.carryingMultiplier??1),
      knownWeightLb:character.inventory.reduce((total,item)=>{const d=item.definitionId?definition(item.definitionId):null;return total+(d?.weightLb??0)*item.quantity/(d?.units??1);},0),
      unknownWeightInstances:character.inventory.filter(i=>!i.definitionId||definition(i.definitionId).weightLb===null).map(i=>i.instanceId)},
    restrictions,
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
  const changes={ inventory: next, loadout };
  if(character.rulesRuntime?.effects.some(e=>e.featureId==='path:iron-covenant:covenant-of-steel:3')){
    const updated={...character,inventory:next,loadout,rulesRuntime:structuredClone(character.rulesRuntime)};
    require('../system/rules2024/covenantOperations').prune(updated);
    if(updated.rulesRuntime.effects.length!==character.rulesRuntime.effects.length)changes.rulesRuntime=updated.rulesRuntime;
  }
  return changes;
}
module.exports = {
  definition,
  issue,
  validateInventory,
  validateLoadout,
  derive,
  update,
};

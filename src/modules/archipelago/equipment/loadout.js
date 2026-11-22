const { sizeCarryingCapacity, totalEquipmentWeight } = require('@crossworld/sanguine-engine/equipment/carrying');
const { projectWeapon } = require('@crossworld/sanguine-engine/equipment/weapon-projection');
const { armorRestrictions } = require('@crossworld/sanguine-engine/equipment/restrictions');
const { armorTrained } = require("@crossworld/sanguine-engine/training");
const { trainingProfile } = require("./training");
const { definition, validateLoadout, fail } = require("./inventory");
const { calculateGuard, loadoutGuardInputs } = require('@crossworld/sanguine-engine/equipment/guard');

function deriveLoadout(character, progression, { weaponGroups, covenantGuardBonus, hasSacredWeapon }) {
  const { attributes } = progression;
  if (!character.loadout)
    fail("Equipment schema changed: recreate this experimental character");
  const slots = validateLoadout(character.inventory, character.loadout);
  // Keep group grant IDs in the existing public training.weapons field.
  const training = trainingProfile(progression.equipmentTraining, weaponGroups, { includeGroupIds: true });
  const armor = slots.armor?.definition ?? null;
  const shield = [slots.mainHand, slots.offHand].some(
    (i) => i?.definition.kind === "shield"
  );
  const untrainedArmor = Boolean(
    armor && !armorTrained(training, armor.category)
  );
  const shieldTrained = armorTrained(training, "shield");
  const guardInputs = loadoutGuardInputs(armor, shield && shieldTrained, progression, covenantGuardBonus());
  const restrictions = armorRestrictions(armor, shield, shieldTrained, untrainedArmor, progression);
  const attacks = [slots.mainHand, slots.offHand]
    .filter((i) => i?.definition.kind === "weapon")
    .map((i) => {
      const d = i.definition;
      const { damage, heldHands, ...mechanics } = projectWeapon(d, progression, {
        training, weaponGroups, grip: character.loadout.grip, sacredWeapon: hasSacredWeapon(i.instanceId),
      });
      return {
        id: i.instanceId,
        instanceId: i.instanceId,
        definitionId: d.id,
        definitionVersion: d.version,
        name: i.customName || d.name,
        weapon: structuredClone({
          ...d,
          damage,
          heldHands,
        }),
        ...mechanics,
        restrictions,
      };
    });
  const carried = character.inventory.map(item => ({
    definition: item.definitionId ? definition(item.definitionId) : null,
    instanceId: item.instanceId,
    quantity: item.quantity,
  }));
  return {
    inventory: character.inventory,
    loadout: character.loadout,
    slots,
    training,
    guardInputs,
    guard: calculateGuard(attributes, guardInputs),
    attacks,
    carrying:{...sizeCarryingCapacity(attributes.might, progression.colossus?.effectiveSize ?? progression.size ?? progression.creation?.size),
      knownWeightLb:totalEquipmentWeight(carried),
      unknownWeightInstances:carried.filter(item=>!item.definition||item.definition.weightLb===null).map(item=>item.instanceId)},
    restrictions,
  };
}

module.exports = { deriveLoadout };

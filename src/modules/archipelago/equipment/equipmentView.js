const { replay } = require('../characters/advancement/ledger');
const { project } = require('../characters/runtime/selections');
const { active } = require('../combat/effects/effectTime');
const { guardBonus } = require('../characters/abilities/covenantState');
const weaponGroups = require('@crossworld/sanguine-engine/equipment/weapon-groups');
const { deriveLoadout } = require('./loadout');

function derive(character, progression) {
  // Command handlers may need a fresh view after mutating live effects or gear.
  if (progression === undefined) {
    const base = replay(character.rulesLedger);
    progression = character.rulesRuntime ? project(base, character.rulesRuntime, character) : base;
  }
  const view = deriveLoadout(character, progression, {
    weaponGroups,
    covenantGuardBonus: () => guardBonus(character),
    hasSacredWeapon: instanceId => character.rulesRuntime?.effects.some(
      effect => effect.sacredWeaponId === instanceId && active(character.rulesRuntime, effect)
    ),
  });
  if (progression.animalForm) {
    view.guard = progression.animalForm.guard;
    view.attacks = [];
    view.equipmentMerged = true;
    view.restrictions = { ...view.restrictions, spellcastingBlocked: true };
  }
  return view;
}

module.exports = { derive };

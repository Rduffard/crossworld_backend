import { createRequire } from 'node:module';
import { build } from './phase2.mjs';

const require = createRequire(import.meta.url);
const gear = require('../../src/modules/archipelago/equipment');
const { trainingProfile } = require('../../src/modules/archipelago/equipment/training');
const { aggregateEquipmentTraining } = require('@crossworld/sanguine-engine/training');
const weaponGroups = require('@crossworld/sanguine-engine/equipment/weapon-groups');
const { callings } = require('../../src/modules/archipelago/system/catalog');
const starting = require('../../src/modules/archipelago/equipment/startingEquipment');
const { fromCharacter } = require('../../src/modules/archipelago/combat/snapshot');
const { applyCommand } = require('../../src/modules/archipelago/combat/state');

function equipped(calling, mainHand, offHand, armor) {
  const { character } = build(calling, 3);
  const grip = mainHand === 'musket' ? 'two' : 'one';
  const loadout = { mainHand, offHand, armor, grip };
  const inventory = Object.entries({ mainHand, offHand, armor }).flatMap(([slot, definitionId]) => {
    if (!definitionId) return [];
    const instanceId = 'fixture-' + slot;
    loadout[slot] = instanceId;
    return [{ ...gear.issue({ definitionId }), instanceId }];
  });
  return { ...character, inventory, loadout, _id: '0123456789abcdef01234567', owner: 'fixture-owner' };
}

function projection(character) {
  const { inventory, loadout, slots, training, guardInputs, guard, attacks, restrictions, carrying } = gear.derive(character);
  return {
    inventory, loadout,
    slots: Object.fromEntries(Object.entries(slots).map(([key, item]) => [key, item?.instanceId ?? null])),
    training, guard,
    guardInputs: { ...guardInputs, armor: guardInputs.armor?.id ?? null },
    attacks: attacks.map(({ weapon, restrictions: _restrictions, ...attack }) => ({
      ...attack, damage: weapon.damage, heldHands: weapon.heldHands,
    })),
    restrictions, carrying,
  };
}

export function equipmentBaseline() {
  const warden = equipped('warden', 'longsword', 'shield', 'chain-mail');
  const corsair = equipped('corsair', 'rapier', 'shield', 'chain-mail');
  const gunslinger = equipped('gunslinger', 'musket', null, null);
  const encounter = fromCharacter(warden, warden.owner);
  const result = applyCommand(encounter, {
    id: 'pass2-fixture-attack', expectedRevision: 0, type: 'attack', actor: 'player',
    target: 'enemy', weapon: warden.loadout.mainHand,
  }, warden.owner, sides => sides === 20 ? 15 : 4);
  const event = result.events[0];
  const { inventory, loadout, goldCp } = starting.issue('gunslinger', 'pack-c');
  return {
    weaponGroups,
    corsairTraining: aggregateEquipmentTraining(trainingProfile(callings.corsair.starting, weaponGroups),
      [{ weapons: ['cutlass', 'cutlass'], armor: ['shield'] }]),
    starting: { items: inventory.map(({ definitionId, quantity }) => ({ definitionId, quantity })), loadout, goldCp },
    warden: projection(warden),
    corsair: projection(corsair),
    gunslinger: projection(gunslinger),
    practice: {
      source: encounter.initialCharacterSnapshot.source,
      guard: encounter.initialCharacterSnapshot.guard,
      weaponTraining: encounter.initialCharacterSnapshot.weaponTraining,
      loadout: encounter.initialCharacterSnapshot.equipmentSnapshot.loadout,
      attack: {
        proficiency: event.proficiency, attackTotal: event.attackTotal, damageTotal: event.damageTotal,
        attackDice: event.attackDice, selectedD20: event.selectedD20,
        damageDice: event.damageDice, attributeModifier: event.attributeModifier, result: event.result,
      },
    },
  };
}

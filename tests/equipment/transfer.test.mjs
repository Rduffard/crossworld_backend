import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { take } = require('../../src/modules/archipelago/equipment/transfer');
const { issue } = require('../../src/modules/archipelago/equipment');
const terms = { targetId: '222222222222222222222222', expectedTargetRevision: 0, quantity: 1 };
function source() {
  return {
    _id: '111111111111111111111111',
    inventory: [],
    loadout: { mainHand: null, offHand: null, armor: null, grip: 'one' },
    rulesRuntime: { effects: [] },
  };
}

test('transferring held gear clears its loadout slot and referenced presets', () => {
  const character = source();
  const pistol = issue({ definitionId: 'pistol' });
  character.inventory.push(pistol);
  character.loadout = { mainHand: pistol.instanceId, offHand: null, armor: null, grip: 'one' };
  character.presets = [
    { id: 'pistol-ready', loadout: { ...character.loadout } },
    { id: 'stowed', loadout: { ...character.loadout, mainHand: null } },
  ];
  const payload = { ...terms, instanceId: pistol.instanceId };
  assert.throws(() => take(character, payload), /Confirm removing equipped gear/);
  const { received, transfer } = take(character, { ...payload, unequip: true });
  assert.deepEqual(received, pistol);
  assert.deepEqual(transfer.unequippedSlots, ['mainHand']);
  assert.equal(character.loadout.mainHand, null);
  assert.deepEqual(character.presets.map(preset => preset.id), ['stowed']);
});

test('charged or attuned gear conserves its remaining charges and is received unattuned', () => {
  const character = source();
  const kit = issue({ customName: 'Healer’s kit', quantity: 2 });
  kit.chargesCurrent = 3;
  character.inventory.push(kit);
  const payload = { ...terms, instanceId: kit.instanceId };
  assert.throws(() => take(character, payload), /Only carried stacks without charges/);
  assert.deepEqual(take(character, { ...payload, quantity: 2 }).received, kit);

  const wand = issue({ definitionId: 'wand-of-magic-missiles' });
  wand.chargesCurrent = 2;
  wand.attuned = true;
  character.inventory.push(wand);
  assert.throws(() => take(character, { ...terms, instanceId: wand.instanceId }), /ending attunement/);
  const { received, transfer } = take(character, { ...terms, instanceId: wand.instanceId, unequip: true });
  assert.deepEqual(received, { ...wand, attuned: false });
  assert.equal(transfer.endedAttunement, true);
});

test('a recoverable deployment must be resolved before its remaining stack moves', () => {
  const character = source();
  const gear = issue({ customName: 'Deployable gear', quantity: 2 });
  character.inventory.push(gear);
  character.rulesRuntime.effects.push({ deployedItem: gear, sourceInstanceId: gear.instanceId });
  assert.throws(() => take(character, { ...terms, instanceId: gear.instanceId }), /Resolve the item’s active/);
  assert.equal(character.inventory.at(-1).quantity, 2);
});

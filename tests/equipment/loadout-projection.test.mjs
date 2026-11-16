import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { equipmentBaseline } from '../helpers/phase3-equipment.mjs';

const require = createRequire(import.meta.url);
const gear = require('../../src/modules/archipelago/equipment');
const baseline = JSON.parse(readFileSync(new URL('../fixtures/phase3-equipment.json', import.meta.url)));

test('starting equipment, grants, equipped stats and practice attacks match the pre-split fixture', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(equipmentBaseline())), baseline);
});

test('loadout validation preserves item identity and rejects invalid references and slots', () => {
  const { inventory, loadout } = baseline.warden;
  const slots = gear.validateLoadout(inventory, loadout);
  assert.equal(slots.mainHand.instanceId, 'fixture-mainHand');
  assert.equal(slots.offHand.definition.id, 'shield');
  assert.throws(() => gear.validateLoadout(inventory, { ...loadout, mainHand: 'missing' }), { statusCode: 400 });
  assert.throws(() => gear.validateLoadout(inventory, { ...loadout, offHand: loadout.mainHand }), { statusCode: 400 });
  assert.throws(() => gear.validateLoadout(inventory, { ...loadout, armor: loadout.offHand }), { statusCode: 400 });
});

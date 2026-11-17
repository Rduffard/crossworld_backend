import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { baselineCharacters } from '../helpers/phase3-baseline.mjs';

const require = createRequire(import.meta.url);
const { blueprint } = require('../../src/modules/archipelago/system/characterSystem');
const { proficiencyBonus } = require('../../src/modules/archipelago/system/trainingChecks');
const { weaponTrained } = require('@crossworld/sanguine-engine/training');
const weaponGroups = require('@crossworld/sanguine-engine/equipment/weapon-groups');
const gear = require('../../src/modules/archipelago/equipment');
const { d20 } = require('../../src/modules/archipelago/combat/dice');
const snapshot = JSON.parse(readFileSync(new URL('../fixtures/phase3-characters.json', import.meta.url)));

test('serialized creation, Path and spent-resource reconciliation match the audited implementation', () => {
  assert.deepEqual(baselineCharacters(), snapshot);
});

test('the Lineage catalog keeps the protocol and capability flag', () => {
  assert.equal(blueprint.version, 4);
  assert.equal(blueprint.rulesVersion, 'SA-CHAR-1');
  assert.equal(blueprint.tabletopReady, false);
  assert.equal(blueprint.contentHash, 'd248164329ba23072e3332d66f4de3909b94f93ceb53c02bfda65fe23d9cce07');
});

test('Training follows the expected total-level schedule from 1 through 20', () => {
  assert.deepEqual(Array.from({ length: 20 }, (_, index) => proficiencyBonus(index + 1)),
    [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6]);
  for (const level of [0, 21, 1.5, '1']) assert.throws(() => proficiencyBonus(level), /Level must be 1–20/);
});

test('weapon Training distinguishes exact, category and group matches', () => {
  const profile = { categories: ['simple'], weapons: ['cutlass'], groups: ['martial:finesse-or-light'] };
  for (const id of ['dagger', 'cutlass', 'rapier']) assert.equal(weaponTrained(profile, gear.definition(id), weaponGroups), true);
  assert.equal(weaponTrained(profile, gear.definition('greatsword'), weaponGroups), false);
});

test('practice dice preserve roll order, cancellation and selected die', () => {
  for (const [advantage, disadvantage, dice, selected] of [
    [false, false, [4], 4], [true, true, [4], 4],
    [true, false, [4, 17], 17], [false, true, [4, 17], 4],
  ]) {
    const input = [4, 17];
    assert.deepEqual(d20({ advantage, disadvantage }, () => input.shift()), { dice, selected });
    assert.equal(input.length, 2 - dice.length);
  }
  assert.throws(() => d20({}, () => 0), /Invalid die result/);
});

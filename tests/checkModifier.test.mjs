import assert from 'node:assert/strict';
import { test } from 'node:test';
import helper from '../src/modules/archipelago/system/checkModifier.js';
const { calculateCheckModifier } = helper;

const keys = ['might', 'agility', 'wit', 'spirit', 'resolve', 'instinct'];
test('specified scores and odd scores for every attribute', () => {
  for (const key of keys) {
    for (const [score, expected] of [[8,-1],[10,0],[12,1],[14,2],[18,4],[7,-2],[9,-1],[11,0],[13,1],[17,3],[19,4]]) {
      assert.equal(calculateCheckModifier({ [key]: score }, key), expected);
    }
  }
});
test('reject invalid identifiers', () => {
  for (const key of ['strength', 'Might', '', '__proto__', 'constructor', undefined, null, 1]) {
    assert.throws(() => calculateCheckModifier({ might: 12 }, key), RangeError);
  }
});
test('reject missing and malformed scores without coercion', () => {
  for (const score of [undefined, null, '12', NaN, Infinity, 12.5, 0, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => calculateCheckModifier({ might: score }, 'might'), TypeError);
  }
  assert.throws(() => calculateCheckModifier(null, 'might'), TypeError);
});
test('only selected score matters and input stays unchanged', () => {
  const attributes = Object.freeze({ might: 14, agility: 18 });
  assert.equal(calculateCheckModifier(attributes, 'might'), 2);
  assert.equal(calculateCheckModifier(attributes, 'agility'), 4);
});

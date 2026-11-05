import assert from 'node:assert/strict';
import { test } from 'node:test';
import helper from '../src/modules/archipelago/system/originBonus.js';
import catalog from '../src/modules/archipelago/system/blueprints/catalogs.js';
const apply = helper.applyOriginBonus;
const base = () => ({ might: 8, agility: 8, wit: 8, spirit: 8, resolve: 8, instinct: 8 });
test('every registered origin applies exactly its existing bonus without mutation', () => {
  assert.equal(catalog.origins.length, 18);
  for (const origin of catalog.origins) {
    const [amount, label] = origin.bonus.split(' ');
    const key = label.toLowerCase();
    const allocation = Object.freeze({ ...base(), [key]: 15 });
    const expected = { ...allocation, [key]: 15 + Number(amount) };
    assert.deepEqual(apply(allocation, origin.id), expected);
    assert.equal(allocation[key], 15);
    assert.notEqual(apply(allocation, origin.id), allocation);
    assert.equal(expected[key], 16);
    assert.deepEqual(apply(base(), origin.id), { ...base(), [key]: 8 + Number(amount) });
  }
});
test('unknown identifiers rejected', () => {
  for (const id of ['unknown','Yuma','__proto__',undefined,null,1]) assert.throws(() => apply(base(), id), RangeError);
});
test('invalid pre-origin allocations rejected', () => {
  for (const allocation of [null,{}, { ...base(), might: 7 },{ ...base(), might: 16 },{ ...base(), might: 8.5 },{ ...base(), might: '8' },Object.fromEntries(Object.keys(base()).map(k => [k,15]))]) {
    assert.throws(() => apply(allocation, catalog.origins[0].id));
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import helper from '../src/modules/archipelago/system/pointBuy.js';
const { createPointBuyAttributes, calculatePointBuyCost, calculateRemainingPointBuyPoints, validatePointBuyAllocation } = helper;
const exact = { might: 15, agility: 15, wit: 15, spirit: 8, resolve: 8, instinct: 8 };
test('fresh defaults cost zero and have 27 remaining', () => {
  const base = createPointBuyAttributes();
  assert.deepEqual(Object.values(base), [8,8,8,8,8,8]);
  assert.equal(calculatePointBuyCost(base), 0);
  assert.equal(calculateRemainingPointBuyPoints(base), 27);
  base.might = 15;
  assert.equal(createPointBuyAttributes().might, 8);
});
test('exact budget and nonlinear costs', () => {
  assert.deepEqual(validatePointBuyAllocation(Object.freeze(exact)), { cost: 27, remaining: 0 });
  for (const [score, cost] of [[8,0],[9,1],[10,2],[11,3],[12,4],[13,5],[14,7],[15,9]]) {
    assert.equal(calculatePointBuyCost({ ...createPointBuyAttributes(), might: score }), cost);
  }
});
test('over budget is rejected; remaining exposes deficit', () => {
  const over = { ...exact, spirit: 9 };
  assert.equal(calculatePointBuyCost(over), 28);
  assert.equal(calculateRemainingPointBuyPoints(over), -1);
  assert.throws(() => validatePointBuyAllocation(over), RangeError);
});
test('illegal scores rejected', () => {
  for (const score of [7,16]) assert.throws(() => validatePointBuyAllocation({ ...exact, might: score }), RangeError);
  for (const score of [8.5,'8',null,undefined,NaN,Infinity,true]) assert.throws(() => validatePointBuyAllocation({ ...exact, might: score }), TypeError);
});
test('missing, inherited, extra and malformed allocations rejected', () => {
  for (const key of Object.keys(exact)) {
    const missing = { ...exact }; delete missing[key];
    assert.throws(() => validatePointBuyAllocation(missing), TypeError);
  }
  for (const value of [null,undefined,[],8,Object.create(exact),{ ...exact, strength: 8 }]) {
    assert.throws(() => validatePointBuyAllocation(value), TypeError);
  }
});

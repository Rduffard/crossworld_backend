import assert from 'node:assert/strict';
import { test } from 'node:test';
import calculator from '../src/modules/archipelago/system/resources.js';
const { calculateResourceMaximums: calculate } = calculator;
const scores = (value) => Object.fromEntries(['might', 'agility', 'wit', 'spirit', 'resolve', 'instinct'].map((key) => [key, value]));

test('level 1, 3, 10 and 20 capacities use current modifiers', () => {
  const attributes = { might: 16, agility: 14, wit: 12, spirit: 10, resolve: 8, instinct: 8 };
  for (const [level, expected] of [[1, [14, 15, 11]], [3, [30, 35, 23]], [10, [86, 105, 65]], [20, [166, 205, 125]]]) {
    assert.deepEqual(Object.values(calculate(attributes, level)), expected);
  }
});

test('negative modifiers and independent minimum initial capacity / growth', () => {
  assert.deepEqual(calculate(scores(8), 1), { health: 10, stamina: 8, focus: 8 });
  assert.deepEqual(calculate(scores(8), 20), { health: 86, stamina: 65, focus: 65 });
  assert.deepEqual(calculate(scores(1), 1), { health: 2, stamina: 1, focus: 1 });
  assert.deepEqual(calculate(scores(1), 20), { health: 21, stamina: 20, focus: 20 });
  assert.deepEqual(calculate(scores(2), 3), { health: 6, stamina: 4, focus: 4 });
});

test('malformed scores and levels fail explicitly', () => {
  for (const level of [0, 21, -1, 1.5, '1', NaN]) assert.throws(() => calculate(scores(10), level));
  assert.throws(() => calculate({}));
  assert.throws(() => calculate({ ...scores(10), might: '10' }));
});

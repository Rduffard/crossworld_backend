import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build, rules } from '../helpers/phase2.mjs';

const require = createRequire(import.meta.url);
const { reconcile } = require('../../src/modules/archipelago/characters/persistence');
const { plan } = require('../../src/modules/archipelago/characters/rebuild');
const definitions = maxima => Object.fromEntries(Object.entries(maxima).map(([id, max]) => [id, { max }]));

test('advancement preserves spent uses across simultaneous maximum and grant changes', () => {
  const { summary, character } = build('gunslinger', 3);
  const before = { ...summary, resources: definitions({
    unchanged: 2, increased: 2, full: 5, partial: 5, depleted: 5, belowSpent: 5, zero: 2, removed: 2,
  }) };
  const after = { ...summary, resources: definitions({
    newGrant: 3, unchanged: 2, full: 3, partial: 4, depleted: 3, increased: 3, belowSpent: 1, zero: 0,
  }) };
  const previous = {
    ...character.rulesRuntime,
    pools: { unchanged: 1, increased: 0, full: 5, partial: 3, depleted: 0, belowSpent: 2, zero: 2, removed: 1 },
    counters: { initiativeRecoveries: ['old-combat:removed'] },
  };
  const snapshot = structuredClone({ previous, before, after });
  const next = reconcile(previous, before, after);
  assert.equal(JSON.stringify(next.pools),
    '{"newGrant":3,"unchanged":1,"full":3,"partial":2,"depleted":0,"increased":1,"belowSpent":0,"zero":0}');
  assert.deepEqual(next.counters, previous.counters);
  assert.deepEqual({ previous, before, after }, snapshot);
});

test('advancement retains the existing clamp and missing-balance fallback', () => {
  const { summary, character } = build('gunslinger', 3);
  const before = { ...summary, resources: definitions({ overMax: 2, negative: 2, missing: 2 }) };
  const after = { ...summary, resources: definitions({ overMax: 3, negative: 2, missing: 3 }) };
  const previous = { ...character.rulesRuntime, pools: { overMax: 4, negative: -1, unknown: 10 } };
  assert.deepEqual(reconcile(previous, before, after).pools, { overMax: 3, negative: 0, missing: 1 });
});

test('rebuild keeps its lower cap, starts new grants empty, and preserves prior journal keys', () => {
  const { character, summary } = build('gunslinger', 3, 'iron-suppressor');
  character.rulesRuntime.pools['gunslinger:second-wind'] = 1;
  character.rulesRuntime.counters.initiativeRecoveries = ['old-combat:iron-suppressor:suppression'];
  const after = { ...summary, resources: definitions({
    'brass-outrider:outrider': 2, 'gunslinger:second-wind': 4, 'gunslinger:action-surge': 0,
  }) };
  const before = structuredClone(character);
  const result = plan(character, after);
  assert.equal(JSON.stringify(result.runtime.pools),
    '{"brass-outrider:outrider":0,"gunslinger:second-wind":1,"gunslinger:action-surge":0}');
  assert.deepEqual(result.consequences.pools, result.runtime.pools);
  assert.deepEqual(result.runtime.counters, character.rulesRuntime.counters);
  assert.deepEqual(character, before);
  delete character.rulesRuntime.pools['gunslinger:second-wind'];
  assert.throws(() => plan(character, after), { message: 'Invalid saved pools', statusCode: 400 });
});

test('persisted validation rejects invalid balances, unknown active IDs, and unusable maxima', () => {
  const { character, summary } = build('gunslinger', 3);
  const poolId = 'gunslinger:second-wind';
  for (const pools of [
    { ...character.rulesRuntime.pools, [poolId]: -1 },
    { ...character.rulesRuntime.pools, [poolId]: 3 },
    { ...character.rulesRuntime.pools, [poolId]: 0.5 },
    { ...character.rulesRuntime.pools, [poolId]: '1' },
    { ...character.rulesRuntime.pools, unknown: 0 },
    {}, null,
  ]) {
    assert.throws(() => rules.runtime.validate(summary, { ...character.rulesRuntime, pools }),
      { message: 'Invalid saved pools', statusCode: 400 });
  }
  for (const max of [-1, undefined]) {
    assert.throws(() => plan(character, { ...summary, resources: { [poolId]: { max } } }),
      { message: 'Invalid saved pools', statusCode: 400 });
  }
});

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build, rules } from '../helpers/phase2.mjs';

const require = createRequire(import.meta.url);
const { reconcile } = require('../../src/modules/archipelago/characters/persistence');
const { plan } = require('../../src/modules/archipelago/characters/rebuild');
const { apply } = require('../../src/modules/archipelago/characters/commands');

test('ordinary spell slots keep expenditure and use distinct advancement and rebuild caps', () => {
  const { character, summary } = build('tidecaller', 5);
  assert.deepEqual(summary.spellSlots, [4, 3, 2]);
  for (const [saved, maxima, advanced, rebuilt] of [
    [[4, 1, 0], [4, 3, 2], [4, 1, 0], [4, 1, 0]],
    [[4, 1, 0], [5, 4, 3, 1], [5, 2, 1, 1], [4, 1, 0, 0]],
    [[4, 1, 0], [3, 1, 0], [3, 0, 0], [3, 0, 0]],
    [[2, 3, 1], [3], [1], [1]],
    [[2, 3, 1], [], [], []],
  ]) {
    const prior = { ...character.rulesRuntime, slots: saved, restHistory: ['earlier-rest'] };
    const after = { ...summary, spellSlots: maxima };
    const snapshot = structuredClone(prior);
    const advancement = reconcile(prior, summary, after);
    const rebuild = plan({ ...character, rulesRuntime: prior }, after);
    assert.deepEqual(advancement.slots, advanced);
    assert.deepEqual(rebuild.runtime.slots, rebuilt);
    assert.deepEqual(rebuild.consequences.slots, rebuilt);
    assert.deepEqual(advancement.restHistory, ['earlier-rest']);
    assert.deepEqual(rebuild.runtime.restHistory, ['earlier-rest']);
    assert.deepEqual(prior, snapshot);
  }
});

test('saved spell-slot validation rejects malformed serialized balances', () => {
  const { character, summary } = build('tidecaller', 5);
  for (const slots of [
    null, undefined, { 0: 4, 1: 3, 2: 2 }, [], [4, 3], [4, 3, 2, 0],
    [-1, 3, 2], [1.5, 3, 2], ['1', 3, 2], [null, 3, 2], [5, 3, 2],
  ]) {
    assert.throws(() => rules.runtime.validate(summary, { ...character.rulesRuntime, slots }),
      { message: 'Invalid saved spell slots', statusCode: 400 });
  }
});

test('created slots retain Pass 6 conversion, advancement, rebuild and rest behavior', () => {
  const hour = 3600000;
  const pool = 'tidecaller:sorcery-points';
  const { character: initial, summary } = build('tidecaller', 4);
  let character = initial;
  function run(type, payload) {
    const { changes, result } = apply(character, {
      operationId: 'spell-slot-fixture', rulesVersion: 'SA-CHAR-1',
      expectedRevision: character.documentRevision, type, payload,
    });
    character = { ...character, ...changes };
    return result;
  }
  function slots(total, created) {
    assert.deepEqual(character.rulesRuntime.slots, total);
    assert.deepEqual(character.rulesRuntime.createdSlots, created);
  }
  const convert = type => run('resource.convert', { type, slotLevel: 1 });
  const spend = () => run('resource.adjust', { type: 'spend-slot', slotLevel: 1 });

  convert('sorcery-to-slot');
  slots([5, 3], [1, 0]);
  assert.equal(character.rulesRuntime.pools[pool], 2);
  assert.throws(() => plan(character, summary), { message: 'Invalid saved spell slots', statusCode: 400 });
  convert('slot-to-sorcery');
  slots([4, 3], [0, 0]);
  assert.equal(character.rulesRuntime.pools[pool], 3);
  spend();
  spend();
  convert('sorcery-to-slot');
  slots([3, 3], [1, 0]);
  spend();
  slots([2, 3], [0, 0]);
  assert.equal(character.rulesRuntime.pools[pool], 1);
  convert('slot-to-sorcery');
  convert('sorcery-to-slot');
  run('rest.start', { restId: 'short-slots', kind: 'short-rest', startedAt: 0 });
  run('rest.complete', { restId: 'short-slots', completedAt: hour });
  slots([2, 3], [1, 0]);
  run('advance', { level: 5, choices: build('tidecaller', 5).ledger.levels[4].choices });
  character = JSON.parse(JSON.stringify(character));
  slots([2, 3, 2], [1, 0, 0]);
  assert.equal(character.rulesRuntime.pools[pool], 1);
  assert.deepEqual(character.rulesRuntime.restHistory, ['short-slots']);
  const preview = run('rebuild.preview', { ledger: character.rulesLedger, reason: 'Keep current choices' });
  assert.deepEqual(preview.consequences.slots, [2, 3, 2]);
  assert.deepEqual(preview.consequences.createdSlotsLost, [1, 0, 0]);
  slots([2, 3, 2], [1, 0, 0]);
  const commit = run('rebuild.commit', { proposalId: preview.proposalId, acceptConsequences: true });
  assert.deepEqual(commit.consequences, preview.consequences);
  character = JSON.parse(JSON.stringify(character));
  slots([2, 3, 2], [0, 0, 0]);
  convert('slot-to-sorcery');
  convert('sorcery-to-slot');
  slots([2, 3, 2], [1, 0, 0]);
  run('rest.start', { restId: 'long-slots', kind: 'long-rest', startedAt: hour });
  run('rest.complete', { restId: 'long-slots', completedAt: 9 * hour });
  slots([4, 3, 2], [0, 0, 0]);
  assert.deepEqual(character.rulesRuntime.restHistory, ['short-slots', 'long-slots']);
});

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build, rules } from '../helpers/phase2.mjs';

const require = createRequire(import.meta.url);
const { reconcile } = require('../../src/modules/archipelago/characters/persistence');
const { plan } = require('../../src/modules/archipelago/characters/rebuild');
const { apply } = require('../../src/modules/archipelago/characters/commands');

test('advancement and rebuild preserve distinct Hit Dice caps for earned count changes', () => {
  const { character, summary } = build('gunslinger', 5);
  for (const [available, nextMax, advanced, rebuilt] of [
    [5, 5, 5, 5], [3, 5, 3, 3], [0, 5, 0, 0],
    [5, 6, 6, 5], [3, 6, 4, 3], [0, 6, 1, 0],
    [5, 3, 3, 3], [3, 4, 2, 2], [3, 3, 1, 1], [3, 2, 0, 0], [3, 1, 0, 0],
    [0, 4, 0, 0], [5, 0, 0, 0],
  ]) {
    const prior = { ...character, rulesRuntime: { ...character.rulesRuntime, hitDice: { d10: available } } };
    const next = { ...summary, hitDice: { d10: nextMax } };
    const snapshot = structuredClone(prior);
    assert.deepEqual(reconcile(prior.rulesRuntime, summary, next).hitDice, { d10: advanced });
    assert.deepEqual(plan(prior, next).runtime.hitDice, { d10: rebuilt });
    assert.deepEqual(prior, snapshot);
  }
});

test('synthetic allocation changes keep next order and omit removed die types', () => {
  const { character, summary } = build('gunslinger', 3);
  const next = { ...summary, hitDice: { d8: 2, d10: 4, d12: 1 } };
  const prior = { ...character.rulesRuntime, hitDice: { d6: 1, d10: 1 }, restHistory: ['earlier-rest'] };
  const old = { ...summary, hitDice: { d6: 1, d10: 3 } };
  const advanced = reconcile(prior, old, next);
  assert.equal(JSON.stringify(advanced.hitDice), '{"d8":2,"d10":2,"d12":1}');
  assert.deepEqual(advanced.restHistory, ['earlier-rest']);
  const rebuilt = plan({ ...character, rulesRuntime: prior }, next);
  assert.equal(JSON.stringify(rebuilt.runtime.hitDice), '{"d8":0,"d10":1,"d12":0}');
  assert.deepEqual(rebuilt.consequences.hitDice, rebuilt.runtime.hitDice);
  assert.deepEqual(rebuilt.runtime.restHistory, ['earlier-rest']);
});

test('saved validation rejects malformed Hit Dice and reconciliation retains its missing-balance fallback', () => {
  const { character, summary } = build('gunslinger', 3);
  for (const hitDice of [undefined, null, {}, [], { d10: -1 }, { d10: 4 }, { d10: 0.5 }, { d10: '1' }, { d8: 1 }]) {
    assert.throws(() => rules.runtime.validate(summary, { ...character.rulesRuntime, hitDice }),
      { message: 'Invalid saved hitDice', statusCode: 400 });
  }
  const prior = { ...character.rulesRuntime, hitDice: {} };
  const next = { ...summary, hitDice: { d10: 4 } };
  assert.deepEqual(reconcile(prior, summary, next).hitDice, { d10: 1 });
  assert.deepEqual(plan({ ...character, rulesRuntime: prior }, next).runtime.hitDice, { d10: 0 });
  const negative = { ...prior, hitDice: { d10: -2 } };
  assert.deepEqual(reconcile(negative, summary, next).hitDice, { d10: 0 });
  assert.deepEqual(plan({ ...character, rulesRuntime: negative }, next).runtime.hitDice, { d10: 0 });
  const choices = build('gunslinger', 4).ledger.levels[3].choices;
  assert.throws(() => apply({ ...character, rulesRuntime: { ...prior, hitDice: { d10: 4 } } }, {
    operationId: 'hit-dice-invalid-advance', rulesVersion: 'SA-CHAR-1', expectedRevision: 0,
    type: 'advance', payload: { level: 4, choices },
  }), { message: 'Invalid saved hitDice', statusCode: 400 });
});

test('recorded Short Rest spending survives advancement, reload, and rebuild until Long Rest recovery', () => {
  const hour = 3600000;
  let { character } = build('gunslinger', 3);
  character.rulesRuntime.health.current = 1;
  function run(type, payload) {
    const { changes, result } = apply(character, {
      operationId: 'hit-dice-rest-fixture', rulesVersion: 'SA-CHAR-1', expectedRevision: character.documentRevision,
      type, payload,
    });
    character = { ...character, ...changes };
    return result;
  }
  const options = { hitDice: [{ die: 'd10', roll: 4 }, { die: 'd10', roll: 4 }] };
  run('rest.start', { restId: 'short-fixture', kind: 'short-rest', startedAt: 0, options });
  assert.deepEqual(character.rulesRuntime.hitDice, { d10: 3 });
  run('rest.complete', { restId: 'short-fixture', completedAt: hour });
  assert.deepEqual(character.rulesRuntime.hitDice, { d10: 1 });
  assert.equal(character.rulesRuntime.health.current, 13);
  const choices = build('gunslinger', 4).ledger.levels[3].choices;
  run('advance', { level: 4, choices });
  character = JSON.parse(JSON.stringify(character));
  assert.deepEqual(character.rulesRuntime.hitDice, { d10: 2 });
  assert.deepEqual(character.rulesRuntime.health, { current: 21, max: 36 });
  const preview = run('rebuild.preview', { ledger: character.rulesLedger, reason: 'Keep current choices' });
  assert.deepEqual(preview.consequences.hitDice, { d10: 2 });
  assert.deepEqual(preview.consequences.health, { before: 21, after: 21, max: 36 });
  run('rebuild.commit', { proposalId: preview.proposalId, acceptConsequences: true });
  assert.deepEqual(character.rulesRuntime.hitDice, { d10: 2 });
  assert.deepEqual(character.rulesRuntime.health, { current: 21, max: 36 });
  assert.deepEqual(character.rulesRuntime.restHistory, ['short-fixture']);
  assert.throws(() => run('rest.start', { restId: 'invalid-short', kind: 'short-rest', startedAt: hour,
    options: { hitDice: Array(3).fill({ die: 'd10', roll: 4 }) } }), /Unavailable Hit Die/);
  run('rest.start', { restId: 'long-fixture', kind: 'long-rest', startedAt: hour });
  run('rest.complete', { restId: 'long-fixture', completedAt: 9 * hour });
  assert.deepEqual(character.rulesRuntime.hitDice, { d10: 4 });
  assert.deepEqual(character.rulesRuntime.restHistory, ['short-fixture', 'long-fixture']);
  assert.equal(rules.runtime.validate(rules.replay(character.rulesLedger), character.rulesRuntime), true);
});

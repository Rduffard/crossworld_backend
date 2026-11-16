import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build, rules } from '../helpers/phase2.mjs';

const require = createRequire(import.meta.url);
const { reconcile } = require('../../src/modules/archipelago/characters/persistence');
const { apply } = require('../../src/modules/archipelago/characters/commands');

test('advancement retains ordered rest selections, adds grants, then fills and caps ordinary preparations', () => {
  const { character, summary } = build('doctor', 2);
  const { summary: next } = build('doctor', 3);
  const after = count => ({
    ...next, spellcasting: { doctor: { ...next.spellcasting.doctor, preparedCount: count } },
  });
  const base = ['detect-evil-and-good', 'detect-magic', 'detect-poison-and-disease', 'bane', 'command', 'create-or-destroy-water'];
  for (const [saved, capacity, expected] of [
    [undefined, 6, next.spellcasting.doctor.prepared],
    [[], 6, base],
    [['command'], 6, ['command', ...base.filter(id => id !== 'command')]],
    [['bless', 'command', 'cure-wounds', 'bane', 'command'], 4, ['command', 'bane', 'detect-evil-and-good', 'detect-magic']],
    [['cure-wounds', 'command'], 1, ['command']],
    [['command', 'bane'], 2, ['command', 'bane']],
    [['command'], 0, []],
  ]) {
    const state = { ...character.rulesRuntime, preparations: saved === undefined ? {} : { doctor: saved } };
    const snapshot = structuredClone(state);
    assert.deepEqual(reconcile(state, summary, after(capacity)).preparations.doctor, expected);
    assert.deepEqual(state, snapshot);
  }
});

test('saved preparation validation rejects malformed arrays, duplicate IDs and unsupported spells', () => {
  const { character, summary } = build('doctor', 2);
  const valid = character.rulesRuntime.preparations.doctor;
  for (const prepared of [undefined, null, 'bane', {}, [], [...valid.slice(1), valid[1]]]) {
    assert.throws(() => rules.runtime.validate(summary, {
      ...character.rulesRuntime, preparations: { doctor: prepared },
    }), { message: 'Invalid preparation count', statusCode: 400 });
  }
  for (const id of ['not-a-spell', 'guidance', 'animate-dead']) {
    assert.throws(() => rules.runtime.validate(summary, {
      ...character.rulesRuntime, preparations: { doctor: [id, ...valid.slice(1)] },
    }), { message: 'Invalid prepared spell', statusCode: 400 });
  }
  assert.throws(() => rules.runtime.validate(summary, { ...character.rulesRuntime, preparations: {} }),
    { message: 'Invalid saved preparations', statusCode: 400 });
  assert.throws(() => rules.runtime.validate({
    ...summary, spellcasting: { doctor: { ...summary.spellcasting.doctor, preparedCount: '5' } },
  }, character.rulesRuntime), { message: 'Invalid preparation count', statusCode: 400 });
});

test('Shipwright advancement rejects an unavailable selected spell after the cap, and honors folio memory', () => {
  const { character, summary } = build('shipwright', 5);
  const { ledger } = build('shipwright', 6);
  const saved = character.rulesRuntime.preparations.shipwright[0];
  const addition = 'blindness-deafness';
  const command = {
    operationId: 'prep-folio-advance', rulesVersion: 'SA-CHAR-1', expectedRevision: 0,
    type: 'advance', payload: { level: 6, choices: ledger.levels[5].choices },
  };
  character.rulesRuntime.folioUnavailable = [saved, addition];
  character.rulesRuntime.folioMemory = [saved];
  assert.equal(rules.runtime.validate(summary, character.rulesRuntime), true);
  assert.throws(() => apply(character, command), { message: 'Invalid prepared spell', statusCode: 400 });
  character.rulesRuntime.folioUnavailable = [saved];
  const { changes } = apply(character, command);
  assert.deepEqual(changes.rulesRuntime.preparations.shipwright, [
    'detect-magic', 'protection-from-evil-and-good', 'alarm', 'fog-cloud', 'jump', 'longstrider',
    'burning-hands', 'charm-person', 'augury', addition,
  ]);
  assert.deepEqual(changes.rulesRuntime.folioMemory, [saved]);
  assert.equal(rules.runtime.validate(rules.replay(changes.rulesLedger), changes.rulesRuntime), true);
});

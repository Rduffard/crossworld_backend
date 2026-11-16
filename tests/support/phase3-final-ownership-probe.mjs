import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mock } from 'node:test';

const require = createRequire(import.meta.url);
const root = '../../src/modules/archipelago/';
mock.method(require('node:crypto'), 'randomInt', (minimum) => minimum);
const { build, rules } = await import('../helpers/phase2.mjs');
const commands = require(root + 'characters/commands');
const gear = require(root + 'equipment');
const rows = [];
const uuid = /[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi;
function normalize(row) {
  const ids = new Map();
  return JSON.stringify(row).replace(uuid, id => {
    if (!ids.has(id)) ids.set(id, 'generated-' + ids.size);
    return ids.get(id);
  });
}
function command(character, type, payload) {
  character.rulesRuntime.worldTime = 100;
  const request = { operationId: 'execution-probe', expectedRevision: character.documentRevision,
    rulesVersion: 'SA-CHAR-1', type, payload };
  const before = structuredClone(character);
  const result = commands.apply(character, request);
  rows.push(normalize({ before, request, result }));
}
const { targetEffects } = require(root + 'combat/effects/healingEffects');
for (const current of [0, 3, 5, 6, 11]) {
  for (const healing of [1, 2, 10]) {
    const { character, summary } = build('doctor', 6, 'sanctuary-hand');
    const state = character.rulesRuntime;
    state.health = { current, max: 11 };
    state.conditions = [{ conditionId: 'poisoned', source: 'probe' }];
    const before = structuredClone(state);
    let error;
    try { targetEffects(state, { healing, requireBloodied: true, healingCapFraction: 0.5, endsCondition: 'poisoned' }, summary); }
    catch (failure) { error = [failure.statusCode, failure.message]; }
    rows.push(normalize({ before, state, error }));
  }
}
for (const level of [3, 9, 17]) {
  for (const originalRoll of [1, 12, 20]) {
    const { character, summary } = build('corsair', level, 'saltglass-duelist');
    const option = summary.abilityOptions.find(value => value.handler === 'duelist-parry');
    command(character, 'ability.activate', { optionId: option.id, targetIds: ['foe'],
      parameters: { confirmed: true, eventId: 'hit', attackTotal: gear.derive(character, summary).guard, originalRoll } });
  }
}
for (const [calling, path, level, key] of [['doctor','field-surgeon',3,'clinicalAttribute'], ['navigator','storm-broker',7,'stormResistance']]) {
  const { ledger } = build(calling, level, path);
  for (const change of ['original','missing','invalid','duplicate','multiclass','early','reordered']) {
    const input = structuredClone(ledger);
    const entry = input.levels[level - 1];
    const original = entry.choices[key];
    if (change === 'missing') delete entry.choices[key];
    if (change === 'invalid') entry.choices[key] = ['invalid'];
    if (change === 'duplicate') entry.choices[key] = [original[0], original[0]];
    if (change === 'multiclass') entry.callingId = 'reaver';
    if (change === 'early') input.levels[level - 2].choices[key] = original;
    if (change === 'reordered') entry.choices = Object.fromEntries(Object.entries(entry.choices).reverse());
    try { rows.push(normalize(rules.replay(input))); }
    catch (error) { rows.push(normalize([error.constructor.name, error.statusCode, error.message])); }
  }
}
console.log(rows.length, createHash('sha256').update(JSON.stringify(rows)).digest('hex'));

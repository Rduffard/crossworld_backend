import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { build } from '../helpers/phase2.mjs';
const require = createRequire(import.meta.url);
const commands = require('../../src/modules/archipelago/characters/commands');
const rows = [];
for (const layout of ['missing', 'mixed', 'distinct', 'duplicate', 'expired', 'removed', 'replacement']) {
  const { character } = build('doctor', 3);
  const state = character.rulesRuntime;
  state.worldTime = 100;
  const effect = { featureId: 'spell:guidance', concentration: true };
  state.effects = {
    missing: [effect, effect],
    mixed: [effect, { ...effect, id: 'one' }],
    distinct: [{ ...effect, id: 'one' }, { ...effect, id: 'two' }],
    duplicate: [{ ...effect, id: 'one' }, { ...effect, id: 'one' }],
    expired: [{ ...effect, id: 'one', expiresAt: 99 }],
    removed: [],
    replacement: [{ ...effect, id: 'replacement' }],
  }[layout];
  for (const reference of ['one', 'spell:guidance']) {
    state.concentrationChecks = [{ id: 'check', dc: 30, effects: [reference] }];
    for (const [type, payload, expectedRevision] of [
      ['concentration.resolve', { checkId: 'check', rolls: [1], confirmed: true }, 0],
      ['concentration.resolve', { checkId: 'check', rolls: [1], confirmed: true }, 1],
      ['effect.end', { effectId: reference }, 0],
      ['effect.end', { featureId: reference }, 0],
    ]) {
      const key = { layout, reference, type, payload, expectedRevision };
      try {
        const { changes, result } = commands.apply(character, { expectedRevision, type, payload, operationId: 'identity-probe', rulesVersion: 'SA-CHAR-1' });
        rows.push({ ...key, result, effects: changes.rulesRuntime.effects, checks: changes.rulesRuntime.concentrationChecks, revision: changes.documentRevision });
      } catch (error) {
        rows.push({ ...key, error: [error.constructor.name, error.statusCode, error.code, error.message] });
      }
    }
  }
}
const json = JSON.stringify(rows, null, 2);
console.log(rows.length, createHash('sha256').update(json).digest('hex'));
if (process.argv[2]) (await import('node:fs')).writeFileSync(process.argv[2], json);

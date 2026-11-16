import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build, rules } from '../helpers/phase2.mjs';

const require = createRequire(import.meta.url);
const abilities = require('../../src/modules/archipelago/characters/abilities/abilityOperations');

test('ability envelope validation wins before lookup and leaves the character untouched', () => {
  const { character, summary } = build('reaver');
  const before = structuredClone(character);
  assert.throws(
    () => abilities.activate(character, summary, { optionId: 'unknown', unexpected: true }),
    { message: 'Invalid ability fields', statusCode: 422 },
  );
  assert.deepEqual(character, before);
});

test('a pending first level blocks later events across the Calling roster', () => {
  for (const calling of ['reaver', 'corsair', 'navigator', 'warden', 'tidecaller', 'doctor', 'shipwright', 'gunslinger']) {
    const { ledger } = build(calling, 3);
    const first = { ...ledger.levels[0], choices: {} };
    const incomplete = { ...ledger, revision: 0, levels: [first] };
    assert.equal(rules.replay(incomplete).decisionsComplete, false, calling);
    assert.throws(
      () => rules.replay({ ...incomplete, revision: 1, levels: [first, ledger.levels[1]] }),
      /complete|choices/i,
      calling,
    );
  }
});

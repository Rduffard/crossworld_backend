import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build, creation, scores } from '../helpers/phase2.mjs';

const require = createRequire(import.meta.url);
const rules = require('../../src/modules/archipelago/system/characterSystem');
const backgrounds = require('../../src/modules/archipelago/characters/advancement/creation');

for (const backgroundId of ['custom', 'deckhand']) {
  test(backgroundId + ' Background eligibility is separate from point-buy and bonus allocation', () => {
    const { ledger, summary } = build('corsair', 1, undefined, 'yuma-core', backgroundId);
    const origin = backgrounds.origins.find(entry => entry.id === ledger.creation.originId);
    const [[attribute, amount]] = Object.entries(ledger.creation.increases);
    assert.deepEqual(ledger.baseAttributes, scores);
    assert.equal(Object.values(summary.attributes).reduce((total, score) => total + score, 0) -
      Object.values(ledger.baseAttributes).reduce((total, score) => total + score, 0), 3);
    assert.equal(summary.attributes[attribute], scores[attribute] + amount + Number(attribute === origin.attribute));

    const eligible = ledger.creation.custom?.attributes ??
      backgrounds.backgrounds.find(entry => entry.id === backgroundId).attributes;
    const draft = structuredClone(ledger);
    draft.creation.increases = Object.fromEntries(eligible.map(id => [id, 1]));
    assert.throws(() => rules.replay(draft), /Background increases must be/);
  });
}
test('Custom Background requires three distinct eligible attributes, even when only one receives points', () => {
  const draft = creation('yuma-core', 'custom');
  draft.custom.attributes = ['might', 'agility', 'might'];
  assert.throws(() => backgrounds.validate(draft, { ...scores }), /Invalid custom attributes/);
});

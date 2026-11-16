import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build, rules } from '../helpers/rules2024.mjs';
const require = createRequire(import.meta.url);
const { reconcile } = require('../../src/modules/archipelago/characters/persistence');
const inventory = require('../fixtures/phase3-generic-activation-inventory.json');
for (const path of rules.blueprint.paths.filter(p => p.design)) {
  test(`${path.name}: distinct choices, parent inheritance, typed feature coverage`, () => {
    const character = build(path.callingId, 20, undefined, path.id);
    const summary = rules.replay(character.rulesLedger);
    assert.ok(summary.features.some(f => f.ownerType === 'calling' && f.ownerId === path.callingId));
    assert.equal(summary.pathSelections[path.callingId].pathDiscipline, path.design.choice[0]);
    for (const feature of inventory.filter(entry => entry.path === path.id)) {
      assert.ok(summary.features.some(entry => entry.id === feature.id));
      if (feature.command === 'ability.activate') {
        assert.ok(summary.abilityOptions.some(option => option.featureId === feature.id), feature.id);
      } else {
        assert.equal(feature.command, 'health.damage');
        assert.ok(summary.resources['sanguine-conduit:unbroken-current']);
      }
    }
  });
}
test('advancement preserves rest preparations, temporary Health, counters and current mastery', () => {
  const current = build('doctor', 2);
  const before = rules.replay(current.rulesLedger);
  const selected = [...before.spellcasting.doctor.prepared];
  selected[0] = rules.blueprint.spells.find(s => s.level === 1 && s.callings.includes('doctor') && !selected.includes(s.id)).id;
  let state = rules.runtime.update(before, current.rulesRuntime, { expectedRevision: 0, type: 'long-rest', preparations: { doctor: selected } });
  state = rules.runtime.update(before, state, { expectedRevision: state.revision, type: 'temporary-health', value: 7 });
  const after = rules.replay(build('doctor', 3).rulesLedger);
  const result = reconcile(state, before, after);
  assert.ok(result.preparations.doctor.includes(selected[0]));
  assert.equal(result.temporaryHealth, 7);
  rules.runtime.validate(after, result);
});
test('mastery and cantrip replacements enforce rest timing and survive replay projection', () => {
  const summary = rules.replay(build('gunslinger', 5).rulesLedger);
  let state = rules.runtime.initialize(summary);
  const old = summary.pathSelections.gunslinger.mastery;
  const replacement = rules.blueprint.equipment.items.find(w => w.kind === 'weapon' && w.mastery && !old.includes(w.id)).id;
  const selected = [replacement, ...old.slice(1)];
  const selections = { gunslinger: { mastery: selected } };
  assert.throws(() => rules.runtime.update(summary, state, { expectedRevision: 0, type: 'short-rest', selections }));
  state = rules.runtime.update(summary, state, { expectedRevision: 0, type: 'long-rest', selections });
  assert.deepEqual(rules.runtime.project(summary, state).weaponMastery, selected);
  assert.deepEqual(summary.pathSelections.gunslinger.mastery, old);
});
test('temporary Health does not stack and alternate feature recovery spends the exact cost', () => {
  const summary = rules.replay(build('tidecaller', 14).rulesLedger);
  let state = rules.runtime.initialize(summary);
  for (const value of [10, 3]) state = rules.runtime.update(summary, state, { expectedRevision: state.revision, type: 'temporary-health', value });
  assert.equal(state.temporaryHealth, 10);
  state = rules.runtime.update(summary, state, { expectedRevision: state.revision, type: 'spend-pool', poolId: 'omen-diver:wings', amount: 1 });
  state = rules.runtime.update(summary, state, { expectedRevision: state.revision, type: 'restore-feature', poolId: 'omen-diver:wings' });
  assert.equal(state.pools['omen-diver:wings'], 1);
  assert.equal(state.pools['tidecaller:sorcery-points'], 11);
});

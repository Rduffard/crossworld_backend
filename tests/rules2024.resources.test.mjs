import test from 'node:test';
import assert from 'node:assert/strict';
import { build, rules } from './helpers/rules2024.mjs';

test('intended roster is complete and every Path has its owning Calling schedule', () => {
  const roster = {
    corsair: ['reef-knife', 'black-flag-envoy', 'hollow-lantern', 'saltglass-duelist'],
    gunslinger: ['deadeye', 'iron-suppressor', 'brass-outrider', 'cinder-artillerist'],
    navigator: ['gray-net', 'storm-broker', 'starwake-pilot', 'mangrove-stalker'],
    tidecaller: ['omen-diver', 'memory-echo', 'tempest-heart', 'sanguine-conduit'],
    warden: ['leviathan-anchor', 'oath-of-the-free-port', 'iron-covenant', 'lantern-vigil'],
    reaver: ['bloodwake', 'thunderhide', 'chainbreaker', 'reef-colossus'],
    doctor: ['sanctuary-hand', 'field-surgeon', 'plaguewarden', 'keeper-of-last-breaths'],
    shipwright: ['powder-saint', 'drydock-ghost', 'breakwater', 'sparkwrite-aetherist'],
  };
  assert.equal(rules.blueprint.paths.length, 32);
  for (const [id, paths] of Object.entries(roster)) {
    assert.deepEqual(rules.blueprint.paths.filter(p => p.callingId === id).map(p => p.id).sort(), paths.sort());
    for (const pathId of paths) {
      const path = rules.blueprint.paths.find(p => p.id === pathId);
      assert.equal(path.status, 'available');
      assert.deepEqual(path.featureLevels, rules.blueprint.callings.find(c => c.id === id).pathLevels);
    }
  }
});

test('Path selections persist and influence derived casting, tools and resistances', () => {
  for (const [id, path] of [['navigator', 'gray-net'], ['tidecaller', 'omen-diver'], ['doctor', 'field-surgeon'], ['shipwright', 'drydock-ghost']]) {
    const c = build(id, 20, undefined, path), summary = rules.replay(c.rulesLedger);
    if (id === 'navigator') {
      assert.equal(summary.pathSelections.navigator.hunterPrey, 'colossus-slayer');
      assert.equal(summary.pathSelections.navigator.defensiveTactics, 'escape-the-horde');
    } else if (id === 'tidecaller') assert.deepEqual(summary.resistances, ['acid']);
    else if (id === 'doctor') {
      assert.equal(summary.spellcasting.doctor.attribute, 'wit');
      assert.ok(summary.equipmentTraining.tools.includes('herbalism-kit'));
      assert.ok(summary.training.includes('medicine'));
    } else assert.deepEqual(summary.toolExpertise, ['thieves-tools', 'carpenters-tools']);
  }
});

test('level-twenty Signature Spells are always prepared, separately spendable and recover on Short Rest', () => {
  const summary = rules.replay(build('shipwright', 20).rulesLedger);
  assert.equal(summary.spellcasting.shipwright.signatureSpells.length, 2);
  assert.equal(summary.spellcasting.shipwright.spellMastery.length, 2);
  for (const spell of [...summary.spellcasting.shipwright.signatureSpells, ...summary.spellcasting.shipwright.spellMastery])
    assert.ok(summary.spellcasting.shipwright.alwaysPrepared.includes(spell));
  let state = rules.runtime.initialize(summary);
  const poolId = `shipwright:signature:${summary.spellcasting.shipwright.signatureSpells[0]}`;
  state = rules.runtime.update(summary, state, { expectedRevision: state.revision, type: 'spend-pool', poolId, amount: 1 });
  assert.equal(state.pools[poolId], 0);
  const slots = [...state.slots];
  state = rules.runtime.update(summary, state, { expectedRevision: state.revision, type: 'short-rest' });
  assert.equal(state.pools[poolId], 1);
  assert.deepEqual(state.slots, slots);
});

test('Arcane Recovery enforces individual Calling level, spent slots, level-five cap and once per Long Rest', () => {
  const summary = rules.replay(build('shipwright', 10).rulesLedger);
  let state = rules.runtime.initialize(summary);
  state = rules.runtime.update(summary, state, { expectedRevision: state.revision, type: 'spend-slot', slotLevel: 5 });
  const before = structuredClone(state);
  assert.throws(() => rules.runtime.update(summary, state, { expectedRevision: state.revision, type: 'short-rest', recoverSlots: [5, 1] }));
  assert.deepEqual(state, before);
  state = rules.runtime.update(summary, state, { expectedRevision: state.revision, type: 'short-rest', recoverSlots: [5] });
  assert.equal(state.slots[4], summary.spellSlots[4]);
  assert.equal(state.pools['shipwright:arcane-recovery'], 0);
  assert.throws(() => rules.runtime.update(summary, state, { expectedRevision: state.revision, type: 'short-rest', recoverSlots: [1] }));
});

test('sorcery conversion costs, temporary slots, restoration limits and Long Rest expiry are enforced', () => {
  const summary = rules.replay(build('tidecaller', 10).rulesLedger);
  let state = rules.runtime.initialize(summary);
  state = rules.runtime.update(summary, state, { expectedRevision: 0, type: 'sorcery-to-slot', slotLevel: 3 });
  assert.equal(state.pools['tidecaller:sorcery-points'], 5);
  assert.equal(state.slots[2], summary.spellSlots[2] + 1);
  assert.equal(state.createdSlots[2], 1);
  assert.throws(() => rules.runtime.update(summary, state, { expectedRevision: state.revision, type: 'sorcery-to-slot', slotLevel: 6 }));
  state = rules.runtime.update(summary, state, { expectedRevision: state.revision, type: 'short-rest', restoreSorcery: true });
  assert.equal(state.pools['tidecaller:sorcery-points'], 10);
  assert.throws(() => rules.runtime.update(summary, state, { expectedRevision: state.revision, type: 'short-rest', restoreSorcery: true }));
  state = rules.runtime.update(summary, state, { expectedRevision: state.revision, type: 'long-rest' });
  assert.deepEqual(state.slots, summary.spellSlots);
  assert.equal(state.createdSlots[2], 0);
  const forged = structuredClone(state); forged.health.max++;
  assert.throws(() => rules.runtime.validate(summary, forged));
});

test('preparation changes respect class lists, rest type and the one-spell replacement limit', () => {
  for (const id of ['doctor', 'shipwright', 'navigator', 'warden', 'tidecaller']) {
    const summary = rules.replay(build(id, 5).rulesLedger);
    const state = rules.runtime.initialize(summary);
    const casting = summary.spellcasting[id];
    const available = rules.blueprint.spells.filter(s => !casting.alwaysPrepared.includes(s.id) && s.callings.includes(id) && s.level > 0 &&
      s.level <= casting.slots.length && (id !== 'shipwright' || casting.folio.includes(s.id))).map(s => s.id);
    const fresh = available.find(s => !casting.prepared.includes(s));
    assert.ok(fresh);
    const next = [...casting.prepared.slice(1), fresh];
    const operation = { expectedRevision: 0, type: 'long-rest', preparations: { [id]: next } };
    if (id === 'tidecaller') assert.throws(() => rules.runtime.update(summary, state, operation));
    else {
      const updated = rules.runtime.update(summary, state, operation);
      assert.deepEqual(updated.preparations[id], next);
      assert.deepEqual(state.preparations[id], casting.prepared);
    }
    if (id === 'shipwright') assert.deepEqual(rules.runtime.update(summary, state, { ...operation, type: 'short-rest' }).preparations[id], next);
    else assert.throws(() => rules.runtime.update(summary, state, { ...operation, type: 'short-rest' }));
    assert.throws(() => rules.runtime.update(summary, state, { ...operation, preparations: { [id]: ['wish'] } }));
  }
});

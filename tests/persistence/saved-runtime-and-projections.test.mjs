import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build, rules } from '../helpers/phase2.mjs';

const require = createRequire(import.meta.url);
const root = '../../src/modules/archipelago/';
const clock = require(root + 'combat/effects/clock');
const commands = require(root + 'characters/commands');
const gear = require(root + 'equipment');

test('persisted feat and folio validation accepts a JSON reload without mutating its inputs', () => {
  const { summary, character } = build('shipwright', 5);
  const spellId = summary.spellcasting.shipwright.folio.find(id =>
    character.rulesRuntime.preparations.shipwright.includes(id));
  const state = JSON.parse(JSON.stringify({
    ...character.rulesRuntime,
    worldTime: 1000,
    featState: { legacy: { featId: 'savage-attacker', spent: false, events: ['hit-1'], turns: ['turn-1'] } },
    folioUnavailable: [spellId],
    folioMemory: [spellId],
    spellDiscoveries: [{ spellId, discoveryId: 'wreck', authorizedBy: 'fixture-gm' }],
  }));
  const before = structuredClone({ summary, state });
  assert.equal(rules.runtime.validate(summary, state), true);
  const casting = rules.runtime.project(summary, state).spellcasting.shipwright;
  assert.ok(casting.memorized.includes(spellId));
  assert.ok(!casting.folio.includes(spellId));
  assert.deepEqual({ summary, state }, before);
  assert.throws(() => rules.runtime.validate(summary, {
    ...state, featState: { legacy: { ...state.featState.legacy, turns: ['turn-1', 'turn-1'] } },
  }), { message: 'Invalid saved feat event history', statusCode: 422 });
  assert.throws(() => rules.runtime.validate(summary, {
    ...state, spellDiscoveries: [{ ...state.spellDiscoveries[0], spellId: 'unknown-spell' }],
  }), { message: 'Invalid saved discoveries', statusCode: 422 });
  assert.throws(() => rules.runtime.validate(summary, {
    ...state, folioMemory: [],
  }), { message: 'Invalid prepared spell', statusCode: 400 });
});

test('expiry at the world-time boundary runs before stable recovery and prunes temporary Health and checks', () => {
  const state = {
    worldTime: 999, health: { current: 0, max: 12 },
    deathSaves: { stable: true, dead: false, stableUntil: 1000 },
    temporaryHealth: 4, temporaryHealthMetadata: { source: 'fixture', expiresAt: 1000 },
    pendingRelentlessRage: { dc: 10 },
    effects: [
      { id: 'focus', expiresAt: 1000, concentration: true },
      { id: 'until-recovery', endsOnCasterIncapacitated: true },
      { id: 'future', expiresAt: 1001 },
    ],
    concentrationChecks: [{ id: 'check', effects: ['focus'] }],
  };
  assert.equal(clock.active(state, state.effects[0]), true);
  clock.advance(state, 1000);
  assert.equal(state.worldTime, 1000);
  assert.deepEqual(state.effects.map(effect => effect.id), ['future']);
  assert.equal(state.health.current, 1);
  assert.deepEqual(state.deathSaves, { successes: 0, failures: 0, stable: false, dead: false });
  assert.equal(state.pendingRelentlessRage, null);
  assert.equal(state.temporaryHealth, 0);
  assert.equal(state.temporaryHealthMetadata, null);
  assert.deepEqual(state.concentrationChecks, []);
});

test('a worn attuned item affects a fresh loadout view without mutating the saved sheet', () => {
  const { summary, character } = build('warden', 3);
  const cloak = { ...gear.issue({ definitionId: 'cloak-of-protection' }), instanceId: 'fixture-cloak', worn: true, attuned: true };
  character.inventory.push(cloak);
  const before = structuredClone({ summary, character });
  const projected = rules.runtime.project(summary, character.rulesRuntime, character);
  assert.equal(projected.magicGuardBonus, 1);
  assert.equal(projected.savingThrowModifiers.might, summary.savingThrowModifiers.might + 1);
  assert.equal(gear.derive(character).guardInputs.bonus, 1);
  assert.deepEqual({ summary, character }, before);
  cloak.worn = false;
  assert.equal(gear.derive(character).guardInputs.bonus, 0);
});

test('rest clears feat journals but retains the active turn casting journal across a JSON reload', () => {
  const { summary, character } = build('warden', 3);
  const state = character.rulesRuntime;
  state.worldTime = 1000;
  state.health.current -= 3;
  state.temporaryHealth = 4;
  state.inCombat = true;
  state.ownerTurn = { id: 'turn-active', open: true };
  state.turnCasting = { 'turn-active': { slotSpent: true }, 'turn-old': { slotSpent: true } };
  state.featState = { legacy: { featId: 'savage-attacker', spent: false, events: ['hit'], turns: ['turn-active'] } };
  const before = structuredClone(state);
  const rested = rules.runtime.update(summary, state, { type: 'short-rest', expectedRevision: 0, hitDice: [{ die: 'd10', roll: 1 }] });
  assert.deepEqual(state, before);
  assert.deepEqual(rested.turnCasting, { 'turn-active': { slotSpent: true } });
  assert.deepEqual(rested.featState.legacy, { featId: 'savage-attacker', spent: false, events: [], turns: [] });
  assert.equal(rested.temporaryHealth, 4);
  assert.equal(rested.hitDice.d10, state.hitDice.d10 - 1);
  assert.equal(rested.revision, 1);
  assert.equal(rules.runtime.validate(summary, JSON.parse(JSON.stringify(rested))), true);
});

test('health damage consumes temporary Health before healing restores actual Health', () => {
  const { character } = build('warden', 3);
  character.rulesRuntime.worldTime = 1000;
  character.rulesRuntime.temporaryHealth = 4;
  const envelope = { operationId: 'phase3-health-fixture', rulesVersion: 'SA-CHAR-1', expectedRevision: character.documentRevision };
  const damage = commands.apply(character, { ...envelope, type: 'health.damage', payload: { amount: 6, damageType: 'force', confirmed: true } });
  assert.equal(damage.result.absorbed, 4);
  assert.equal(damage.result.healthLost, 2);
  assert.equal(damage.changes.rulesRuntime.health.current, character.rulesRuntime.health.current - 2);
  const summary = rules.replay(character.rulesLedger);
  const healed = rules.runtime.update(summary, damage.changes.rulesRuntime, {
    type: 'health', healthDelta: 1, expectedRevision: damage.changes.rulesRuntime.revision,
  });
  assert.equal(healed.health.current, character.rulesRuntime.health.current - 1);
  assert.equal(healed.temporaryHealth, 0);
});

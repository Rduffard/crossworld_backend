const { isDeepStrictEqual } = require('node:util');
const { calculateResourceMaximums } = require('../system/resources');
const { resolveAttack } = require('./attack');
const weapons = require('./weapons');
const { calculateGuard } = require('./guard');
function createFixture(owner) {
  const attributes = { might: 16, agility: 14, wit: 10, spirit: 10, resolve: 12, instinct: 10 };
  const health = calculateResourceMaximums(attributes, 1).health;
  return { owner: String(owner), status: 'active', revision: 0, round: 1, activeCombatant: 'corsair', spatialMode: 'fixed-in-range', combatants: [
    { id: 'corsair', name: 'Test Corsair', source: { type: 'fixture', id: 'corsair-level-one' }, calling: 'corsair', level: 1, attributes, health: { current: health, max: health }, weapon: 'cutlass', weaponTraining: ['cutlass'], guardInputs: {}, actions: 1 },
    { id: 'enemy', name: 'Practice opponent', source: { type: 'npc-fixture', id: 'practice-opponent' }, level: 1, attributes: { ...attributes, might: 10, agility: 10 }, health: { current: 18, max: 18 }, weapon: null, weaponTraining: [], guardInputs: {}, actions: 1 }
  ].map(combatant => ({ ...combatant, guard: calculateGuard(combatant.attributes, combatant.guardInputs) })), events: [] };
}
function validateCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('Invalid command');
  const fields = command.type === 'attack' ? ['id', 'expectedRevision', 'type', 'actor', 'weapon', 'target'] : ['id', 'expectedRevision', 'type', 'actor'];
  if (!['attack', 'end-turn', 'pause', 'resume'].includes(command.type) || Object.keys(command).some(k => !fields.includes(k)) || fields.some(k => command[k] === undefined)) throw new Error('Invalid command fields');
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(command.id) || typeof command.id !== 'string' || !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0 || typeof command.actor !== 'string') throw new Error('Invalid command identifiers');
  if (command.type === 'attack' && (typeof command.weapon !== 'string' || typeof command.target !== 'string')) throw new Error('Invalid attack identifiers');
}
function transition(state, command, owner, roll) {
  if (String(state.owner) !== String(owner)) throw new Error('Encounter is not controlled by this user');
  validateCommand(command);
  const prior = state.events.find(e => e.commandId === command.id);
  if (prior) {
    if (!isDeepStrictEqual(prior.command, command)) throw new Error('Command ID already used for a different command');
    return state;
  }
  if (state.revision !== command.expectedRevision) throw new Error('Encounter changed; reload before acting');
  if (state.status === 'completed') throw new Error('Encounter is complete');
  const actor = state.combatants.find(c => c.id === command.actor);
  if (!actor || actor.id !== state.activeCombatant || actor.health.current <= 0) throw new Error('Actor is not active');
  const next = structuredClone(state);
  let event;
  if (command.type === 'pause' || command.type === 'resume') {
    if (state.status !== (command.type === 'pause' ? 'active' : 'paused')) throw new Error('Invalid encounter status');
    next.status = command.type === 'pause' ? 'paused' : 'active';
    event = { actor: actor.id, result: command.type };
  } else {
    if (state.status !== 'active') throw new Error('Encounter is paused');
    if (command.type === 'end-turn') {
      const index = state.combatants.findIndex(c => c.id === actor.id);
      const nextIndex = (index + 1) % state.combatants.length;
      next.activeCombatant = next.combatants[nextIndex].id;
      next.combatants[nextIndex].actions = 1;
      if (nextIndex === 0) next.round += 1;
      event = { actor: actor.id, result: 'end-turn', nextActor: next.activeCombatant };
    } else {
      const target = state.combatants.find(c => c.id === command.target);
      if (actor.id !== 'corsair' || actor.actions !== 1) throw new Error('Attack Action unavailable');
      if (!target || target.id === actor.id || target.health.current <= 0) throw new Error('Invalid target');
      if (state.spatialMode !== 'fixed-in-range' || command.weapon !== actor.weapon || !weapons[command.weapon]) throw new Error('Invalid weapon or unsupported spatial configuration');
      event = resolveAttack(actor, target, weapons[command.weapon], {}, roll);
      next.combatants.find(c => c.id === actor.id).actions = 0;
      next.combatants.find(c => c.id === target.id).health.current = event.healthAfter;
      if (event.healthAfter === 0) next.status = 'completed';
    }
  }
  next.revision += 1;
  next.events.push({ ...event, commandId: command.id, command: { ...command }, revision: next.revision });
  return next;
}
function applyCommand(state, command, owner, roll) {
  try { return transition(state, command, owner, roll); }
  catch (error) { error.statusCode = error.message.startsWith('Encounter changed') ? 409 : 400; throw error; }
}
module.exports = { createFixture, applyCommand, validateCommand };

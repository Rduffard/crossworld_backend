const { randomInt, randomUUID } = require('node:crypto');
const { lineageActivationTerms, deriveBeastshifterForm, LineageRuleError } = require('@crossworld/sanguine-engine/lineages');
const { fail } = require('../commandEnvelope');
const animal = require('./animalHealth');
const clock = require('../../combat/effects/effectTime');

const fields = {
  'lineage:beastshifters:transform': ['formId', 'legalPlacement'],
  'lineage:beastshifters:revert': ['confirmed'],
  'lineage:beastshifters:primal-recovery': ['formId', 'hitDie'],
  'lineage:stoneborn:stone-listening': [],
  'lineage:changelings:shapechange': ['operation', 'size', 'description', 'voice', 'appearanceEligible'],
};

function record(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => keys.includes(key));
}

function validVoice(voice) {
  return voice === undefined || (typeof voice === 'string' && voice.trim().length > 0 && voice.length <= 200);
}

const actionFields = { action: 'actionSpent', 'bonus-action': 'bonusActionSpent', reaction: 'reactionSpent' };

function spendTurnAction(turn, action) {
  const key = actionFields[action];
  if (turn[key]) fail('The recorded turn has already spent this action');
  turn[key] = true;
}

function activate(character, summary, payload) {
  const { optionId, turnId, parameters = {} } = payload;
  if (!Object.hasOwn(fields, optionId) || !record(payload, ['optionId', 'turnId', 'parameters']) || !record(parameters, fields[optionId]))
    fail('Invalid Lineage activation fields');
  const state = character.rulesRuntime;
  const turn = state.ownerTurn;
  const onTurn = turn?.open && turn.id === turnId;
  if ((turn?.open || state.inCombat || turnId !== undefined) && !onTurn)
    fail('Use your open owner turn');
  const shapechange = optionId === 'lineage:changelings:shapechange';
  const reversion = optionId === 'lineage:beastshifters:revert';
  const recovering = optionId === 'lineage:beastshifters:primal-recovery';
  const actionField = actionFields[shapechange ? 'action' : 'bonus-action'];
  if (reversion && parameters.confirmed !== true) fail('Confirm voluntary reversion');
  if (recovering && state.animalForms?.activeFormId && parameters.formId !== undefined)
    fail('Primal Recovery targets the active form');
  if (shapechange && (
    !['transform', 'revert'].includes(parameters.operation) ||
    !validVoice(parameters.voice) ||
    (parameters.operation === 'revert' && Object.keys(parameters).length !== 1)
  )) fail('Choose a valid appearance change or reversion');
  const available = !onTurn || turn[actionField] !== true;
  const facts = {
    ...parameters,
    level: summary.totalLevel,
    lineageId: summary.lineage?.id,
    state: animal.engineState(summary, state),
    vitality: state,
    pools: state.pools,
    hitDice: state.hitDice,
    canTakeAction: available,
    canTakeBonusAction: available,
    disguised: Boolean(state.lineageAppearance),
    revert: parameters.operation === 'revert',
  };
  let terms, roll;
  try {
    terms = lineageActivationTerms(optionId, facts);
    if (terms.hitDieSpend) {
      roll = randomInt(1, terms.sides + 1);
      terms = lineageActivationTerms(optionId, { ...facts, roll });
    }
  } catch (error) {
    if (!(error instanceof LineageRuleError)) throw error;
    fail(error.message, 422, { code: error.code, fieldPath: 'payload.parameters.' + error.field });
  }
  require('./featState').action(state);
  if (onTurn) spendTurnAction(turn, terms.action);
  if (terms.poolSpend) state.pools[terms.poolSpend.poolId] -= terms.poolSpend.amount;
  if (terms.hitDieSpend) state.hitDice[terms.hitDieSpend.die] -= terms.hitDieSpend.amount;
  if (terms.state) animal.save(state, terms.state);
  if (shapechange) {
    if (terms.appearance) {
      state.lineageAppearance = { ...terms.appearance };
      if (parameters.voice !== undefined) state.lineageAppearance.voice = parameters.voice.trim();
    } else delete state.lineageAppearance;
  }
  const result = { type: 'ability.activate', optionId, action: terms.action };
  if (terms.effect) {
    const createdAt = clock.now(state);
    const { durationMinutes, ...sense } = terms.effect;
    const effect = {
      id: randomUUID(), featureId: optionId, createdAt, uncancelable: true,
      expiresAt: createdAt + durationMinutes * 60_000, stoneListening: sense,
    };
    state.effects = [...state.effects.filter(entry => entry.featureId !== optionId), effect];
    result.effect = effect;
  }
  if (terms.state) result.activeFormId = terms.state.activeFormId;
  if (terms.hitDieSpend) Object.assign(result, { roll, healed: terms.healed, hitDie: terms.hitDieSpend.die });
  if (shapechange) result.appearance = state.lineageAppearance ?? null;
  state.revision++;
  return result;
}

function form(summary, state) {
  return state.animalForms?.activeFormId
    ? deriveBeastshifterForm(state.animalForms.activeFormId, summary.totalLevel) : null;
}

function validate(summary, state) {
  const appearance = state.lineageAppearance;
  if (appearance !== undefined && (summary.lineage?.id !== 'changelings' ||
    !record(appearance, ['size', 'description', 'voice']) ||
    !['small', 'medium'].includes(appearance.size) ||
    typeof appearance.description !== 'string' || !appearance.description.trim() ||
    appearance.description.length > 500 || !validVoice(appearance.voice)))
    fail('Invalid saved Changeling appearance');
}

function endOnDeath(state) {
  if (!state.deathSaves?.dead) return;
  if (state.animalForms) state.animalForms.activeFormId = null;
  delete state.lineageAppearance;
}

module.exports = { activate, form, validate, endOnDeath, spendTurnAction, supports: id => Object.hasOwn(fields, id) };

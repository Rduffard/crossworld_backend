const { fail } = require('./commandEnvelope');

const silentKeelId = 'path:drydock-ghost:silent-keel:10';
function removeShroudedTarget(state, effect, targetId) {
  effect.targetIds = effect.targetIds.filter((id) => id !== targetId);
  if (!effect.targetIds.length) {
    state.effects = state.effects.filter((active) => active !== effect);
    require('../combat/effects/clock').expire(state);
  }
}
function endSilentKeelTarget(state, payload, result) {
  if (
    Object.keys(payload).some(
      (key) => !['effectId', 'targetId', 'trigger', 'confirmed'].includes(key),
    ) ||
    payload.confirmed !== true ||
    !['attack', 'spell'].includes(payload.trigger) ||
    typeof payload.effectId !== 'string' ||
    typeof payload.targetId !== 'string'
  )
    fail('Confirm a shrouded creature attacked or cast a spell');
  const effect = state.effects.find(
    (e) =>
      e.id === payload.effectId &&
      e.featureId === silentKeelId &&
      e.mode === 'creatures' &&
      e.targetIds?.includes(payload.targetId),
  );
  if (!effect)
    fail('Choose a creature still covered by your active Silent Keel');
  removeShroudedTarget(state, effect, payload.targetId);
  state.revision++;
  return {
    ...result,
    effectId: payload.effectId,
    targetId: payload.targetId,
    trigger: payload.trigger,
    remainingTargets: [...effect.targetIds],
  };
}

function endEffect(state, payload) {
  if (
    Object.keys(payload).length !== 1 ||
    typeof payload.effectId !== 'string' ||
    !payload.effectId.trim()
  )
    fail('Choose an owned effect');
  const effect = state.effects.find((e) => e.id === payload.effectId);
  if (!effect) fail('Choose an owned effect');
  if (effect.uncancelable) fail('This effect must finish its printed duration');
  state.effects = state.effects.filter((e) => e.id !== payload.effectId);
  state.revision++;
}

function endSelfShroud(character) {
  const self = String(character._id ?? 'self');
  const shroud = character.rulesRuntime.effects.find(
    (e) =>
      e.featureId === silentKeelId &&
      e.mode === 'creatures' &&
      e.targetIds?.includes(self),
  );
  if (shroud) removeShroudedTarget(character.rulesRuntime, shroud, self);
}

module.exports = { endSilentKeelTarget, endEffect, endSelfShroud };

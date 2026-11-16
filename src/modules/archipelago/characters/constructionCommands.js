const {
  resolveConstructedObjectDamage,
  drydockSalvageUnlocked,
} = require('@crossworld/sanguine-engine/callings');
const { damageTypes } = require('@crossworld/sanguine-engine/vitality');
const { fail } = require('./commandEnvelope');

function damageObject(state, payload, summary) {
  if (
    Object.keys(payload).some(
      (k) => !['effectId', 'amount', 'damageType', 'siege'].includes(k),
    ) ||
    !Number.isSafeInteger(payload.amount) ||
    payload.amount < 0 ||
    payload.amount > 100000 ||
    !damageTypes.includes(payload.damageType) ||
    (payload.siege !== undefined && typeof payload.siege !== 'boolean')
  )
    fail('Invalid object damage');
  const object = state.effects.find(
    (e) =>
      e.id === payload.effectId &&
      ['relay', 'barrier'].includes(e.objectType) &&
      require('../combat/effects/clock').active(state, e),
  );
  if (!object) fail('Choose a live owned object');
  const { damage, remainingHealth } = resolveConstructedObjectDamage({
    kind: object.objectType,
    level: summary.callingLevels.shipwright,
    amount: payload.amount,
    damageType: payload.damageType,
    siege: payload.siege,
    health: object.health.current,
  });
  object.health.current = remainingHealth;
  if (object.health.current === 0)
    state.effects = state.effects.filter((e) => e.id !== object.id);
  state.revision++;
  return {
    type: 'object.damage',
    damage,
    remainingHealth: object.health.current,
  };
}

function spendSalvage(state, payload, summary) {
  if (
    Object.keys(payload).some(
      (k) => !['amountCp', 'projectId', 'kind', 'confirmed'].includes(k),
    ) ||
    !drydockSalvageUnlocked(
      summary.paths.shipwright,
      summary.callingLevels.shipwright,
    ) ||
    !Number.isSafeInteger(payload.amountCp) ||
    payload.amountCp < 1 ||
    payload.amountCp > (state.salvageCp ?? 0) ||
    !['repair', 'craft'].includes(payload.kind) ||
    typeof payload.projectId !== 'string' ||
    !payload.projectId.trim() ||
    payload.projectId.length > 100 ||
    payload.confirmed !== true
  )
    fail(
      'Spend available salvage only on an identified, GM-confirmed repair or crafting project',
    );
  state.salvageCp -= payload.amountCp;
  state.revision++;
  return {
    type: 'craft.spend-salvage',
    spentCp: payload.amountCp,
    projectId: payload.projectId,
    kind: payload.kind,
  };
}

module.exports = { damageObject, spendSalvage };

const rules = require('../system/characterSystem');
const { isSpellSlotLevel } = require('@crossworld/sanguine-engine/spell-slots');
const { restorationSlotLevel } = require('./abilities/featureOperations');

function fail(message) {
  throw Object.assign(new Error(message), { statusCode: 422 });
}

function fields(payload, allowed) {
  if (Object.keys(payload).some(key => key !== 'type' && !allowed.includes(key))) {
    fail('Unexpected resource command fields');
  }
}

function pool(payload) {
  if (typeof payload.poolId !== 'string' || !payload.poolId.trim()) {
    fail('Choose a resource pool by ID');
  }
  return payload.poolId;
}

function slot(payload) {
  if (!isSpellSlotLevel(payload.slotLevel)) {
    fail('Choose an integer spell slot level from one to nine');
  }
  return payload.slotLevel;
}

function apply(summary, state, commandType, payload) {
  const type = payload.type;
  const expectedRevision = state.revision;
  if (commandType === 'resource.adjust') {
    switch (type) {
      case 'spend-pool': {
        fields(payload, ['poolId', 'amount']);
        const poolId = pool(payload);
        if (!Number.isSafeInteger(payload.amount) || payload.amount < 1) {
          fail('Choose a positive integer resource amount');
        }
        return rules.runtime.update(summary, state, { type, expectedRevision, poolId, amount: payload.amount });
      }
      case 'spend-slot':
        fields(payload, ['slotLevel']);
        return rules.runtime.update(summary, state, { type, expectedRevision, slotLevel: slot(payload) });
      case 'initiative-recovery': {
        fields(payload, ['poolId']);
        const poolId = pool(payload);
        const combatId = state.initiative?.combatId;
        const key = combatId + ':' + poolId;
        if (!state.inCombat || !combatId || state.counters.initiativeRecoveries?.includes(key)) {
          fail('Initiative recovery requires a saved combat Initiative and can resolve only once for this pool in that combat');
        }
        const next = rules.runtime.update(summary, state, { type, expectedRevision, poolId });
        next.counters.initiativeRecoveries ??= [];
        next.counters.initiativeRecoveries.push(key);
        return next;
      }
      default:
        fail('Choose a registered manual expenditure or Initiative recovery');
    }
  }

  switch (type) {
    case 'slot-to-sorcery':
    case 'sorcery-to-slot':
      fields(payload, ['slotLevel']);
      return rules.runtime.update(summary, state, { type, expectedRevision, slotLevel: slot(payload) });
    case 'restore-feature': {
      const poolId = pool(payload);
      const slotLevel = restorationSlotLevel(poolId);
      if (slotLevel === undefined) {
        fields(payload, ['poolId']);
        return rules.runtime.update(summary, state, { type, expectedRevision, poolId });
      }
      fields(payload, ['poolId', 'slotLevel']);
      if (payload.slotLevel !== slotLevel) fail('Level five slot required');
      return rules.runtime.update(summary, state, { type, expectedRevision, poolId, slotLevel });
    }
    default:
      fail('Choose a registered conversion');
  }
}

module.exports = { apply };

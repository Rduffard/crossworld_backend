const {
  ResourceTransitionError,
  spendPool,
  recoverInitiativePool,
  reconcilePools,
} = require('@crossworld/sanguine-engine/resources');
const { HitDiceReconciliationError, reconcileHitDice } = require('@crossworld/sanguine-engine/hit-dice');

const initiativeGrants = {
  'reaver:rage': { reservePoolId: 'reaver:persistent-reserve', mode: 'all' },
  'storm-broker:squall': { reservePoolId: 'storm-broker:eye-reserve', mode: 'one-if-empty' },
  'reef-colossus:colossus': { reservePoolId: 'reef-colossus:colossus-reserve', mode: 'one-if-empty' },
};

function translateResourceError(transition) {
  try {
    return transition();
  } catch (error) {
    if (error instanceof HitDiceReconciliationError) {
      throw Object.assign(new Error('Invalid saved hitDice'), { statusCode: 400 });
    }
    if (!(error instanceof ResourceTransitionError)) throw error;
    const messages = {
      POOL_SPEND_UNAVAILABLE: 'Unavailable feature resource',
      INITIATIVE_RECOVERY_UNAVAILABLE: 'Unavailable initiative recovery',
      RECOVERY_POOL_NOT_EMPTY: 'Pool must be empty',
      INSUFFICIENT_RESERVE: 'Insufficient feature resource: ' + error.poolId,
      INVALID_POOL_RECONCILIATION: 'Invalid saved pools',
    };
    const message = messages[error.code];
    if (!message) throw error;
    throw Object.assign(new Error(message), { statusCode: 400 });
  }
}

function spend(pools, definitions, { poolId, amount }) {
  // Saved pool keys historically used JavaScript property-key coercion.
  return translateResourceError(() => spendPool(pools, definitions, { poolId: String(poolId), amount })).pools;
}

function recoverInitiative(pools, definitions, { poolId }) {
  const id = String(poolId);
  const grant = Object.hasOwn(initiativeGrants, id) ? initiativeGrants[id] : undefined;
  return translateResourceError(() => recoverInitiativePool(pools, definitions, { poolId: id, ...grant })).pools;
}

function reconcileBalances(previousDefinitions, previousPools, nextDefinitions, policy) {
  return translateResourceError(() => reconcilePools(previousDefinitions, previousPools, nextDefinitions, policy));
}

function reconcileDice(previousAllocation, previousState, nextAllocation, policy) {
  return translateResourceError(() => reconcileHitDice(previousAllocation, previousState, nextAllocation, policy));
}

module.exports = { spend, recoverInitiative, reconcileBalances, reconcileDice };

const { canResolveRelentlessRage, resolveRelentlessRage, trackTemporaryHealth } = require('@crossworld/sanguine-engine/vitality');
const { featureRestoration, restorationSlotLevel, featureRestorationError } = require('@crossworld/sanguine-engine/resources/feature-restoration');
const { overchannelUnlocked, nextOverchannelUse } = require('@crossworld/sanguine-engine/callings');
// Character-state operations only; targets, positioning and encounter outcomes remain GM adjudicated.
const { recoverInitiative } = require('../runtime/resourceTransitions');
const { spendSlot } = require('../../spells/spellSlotState');

function fail(message) { throw Object.assign(new Error(message), { statusCode: 400 }); }
function apply(summary, state, op) {
  const allowed = ['expectedRevision', 'type', 'featureId', 'poolId', 'slotLevel', 'value'];
  if (Object.keys(op).some(k => !allowed.includes(k))) fail('Invalid feature operation fields');
  state.effects ??= [];
  state.counters ??= {};
  state.temporaryHealth ??= 0;
  if (op.type === 'end-feature-effects') {
    state.effects = state.effects.filter(e => e.featureId !== op.featureId);
  } else if (op.type === 'temporary-health') {
    if (!Number.isSafeInteger(op.value) || op.value < 0 || op.value > 10000) fail('Invalid temporary Health');
    // New temporary Health replaces the previous amount only when larger; zero explicitly clears it.
    state.temporaryHealth = trackTemporaryHealth(state.temporaryHealth, op.value);
  } else if (op.type === 'restore-feature') {
    const restoration = featureRestoration(op.poolId);
    const error=featureRestorationError(restoration,{poolId:op.poolId,resources:summary.resources,pools:state.pools,
      slots:state.slots,tidecallerLevel:summary.callingLevels.tidecaller,slotLevel:op.slotLevel});
    if(error)fail(error);
    if (restoration.costPoolId) state.pools[restoration.costPoolId] -= restoration.cost;
    else {
      if(restoration.bonusAction){
        if(require('../../combat/vitality/healthState').incapacitated(state))fail('Cannot use a Bonus Action to restore this feature while Incapacitated');
        require('../runtime/featState').action(state);
      }
      spendSlot(state, op.slotLevel);
    }
    state.pools[op.poolId] = 1;
  } else if (op.type === 'initiative-recovery') {
    state.pools = recoverInitiative(state.pools, summary.resources, op);
  } else if (op.type === 'relentless-rage') {
    const level = summary.callingLevels.reaver;
    const activeRage = state.effects.some(e => e.featureId === 'calling:reaver:rage:1' && require('../../combat/effects/clock').active(state, e));
    if (!canResolveRelentlessRage({
      level, pending: state.pendingRelentlessRage, current: state.health.current,
      dead: state.deathSaves?.dead, activeRage,
    })) fail('Relentless Rage requires Reaver eleven and active Rage confirmed at the table');
    if (!Number.isSafeInteger(op.value) || op.value < -100 || op.value > 200) fail('Record the Resolve save total');
    const outcome = resolveRelentlessRage({ total: op.value, attempts: state.counters.relentlessRage ?? 0, level });
    state.counters.relentlessRage = outcome.attempts;
    if (outcome.restoredHealth !== null) require('../../combat/vitality/healthState').revive(state, outcome.restoredHealth);
    else state.effects=state.effects.filter(e=>e.featureId!=='calling:reaver:rage:1');
    state.pendingRelentlessRage=null;
  } else if (op.type === 'overchannel') {
    if (!overchannelUnlocked(summary.paths.shipwright, summary.callingLevels.shipwright)) fail('Overchannel unavailable');
    state.counters.overchannel = nextOverchannelUse(state.counters.overchannel ?? 0);
  } else fail('Unknown feature operation');
}
module.exports = { apply, restorationSlotLevel };

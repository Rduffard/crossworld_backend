const {
  heroicRallyHealing,
  heroicWarriorInspirationAvailable,
} = require('@crossworld/sanguine-engine/callings');
const {
  encounterMovementTotals,
} = require('@crossworld/sanguine-engine/combat/encounter');
const {
  persistentRageUnlocked,
  rageExtensionReasons,
} = require('@crossworld/sanguine-engine/callings');
const {
  coverLevels,
  stealthCoverEligible,
} = require('@crossworld/sanguine-engine/dice');
const { fail } = require('./commandEnvelope');
function endTriggerTurn(state, payload) {
  if (
    Object.keys(payload).some((k) => !['turnId', 'confirmed'].includes(k)) ||
    payload.confirmed !== true ||
    typeof payload.turnId !== 'string' ||
    !payload.turnId.trim() ||
    payload.turnId.length > 100
  )
    fail('Confirm the triggering turn ended');
  state.effects = state.effects.filter(
    (e) => !e.endsAtTriggerTurnEnd || e.turnId !== payload.turnId,
  );
  state.revision++;
}
function recordMovement(state, payload, type) {
  if (
    Object.keys(payload).some(
      (k) => !['feet', 'voluntarySpeed', 'eventId', 'confirmed'].includes(k),
    ) ||
    payload.confirmed !== true ||
    typeof payload.voluntarySpeed !== 'boolean' ||
    !Number.isSafeInteger(payload.feet) ||
    payload.feet < 1 ||
    payload.feet > 10000 ||
    !state.ownerTurn?.open ||
    typeof payload.eventId !== 'string' ||
    !payload.eventId.trim() ||
    payload.eventId.length > 100
  )
    fail('Record confirmed movement on your open owner turn');
  if (payload.voluntarySpeed && state.effects.some((e) => e.steadyAim))
    fail('Steady Aim sets your Speed to zero until this turn ends');
  const turn = state.ownerTurn;
  turn.movementEvents ??= [];
  if (
    turn.movementEvents.includes(payload.eventId) ||
    turn.movementEvents.length >= 200
  )
    fail('Movement event already recorded or turn journal is full');
  turn.movementEvents.push(payload.eventId);
  const totals = encounterMovementTotals(
    turn,
    payload.feet,
    payload.voluntarySpeed,
  );
  turn.movementFeet = totals.movementFeet;
  if (payload.voluntarySpeed)
    turn.voluntarySpeedFeet = totals.voluntarySpeedFeet;
  state.revision++;
  return { type, ...totals };
}
function recordExternalTurn(state, payload) {
  if (
    Object.keys(payload).some((k) => !['turnId', 'confirmed'].includes(k)) ||
    payload.confirmed !== true ||
    !require('../spells/castingTurn').validLabel(payload.turnId) ||
    !state.inCombat ||
    state.ownerTurn?.open
  )
    fail('Confirm an off-turn encounter turn while the owner turn is closed');
  state.externalCastingTurn = payload.turnId;
  state.revision++;
}
function recordOwnerTurn(state, payload, type, summary, result) {
  if (
    Object.keys(payload).some(
      (k) => !['turnId', 'confirmed', 'cover'].includes(k),
    ) ||
    payload.confirmed !== true ||
    !require('../spells/castingTurn').validLabel(payload.turnId) ||
    (payload.cover !== undefined && !coverLevels.includes(payload.cover))
  )
    fail('Record a confirmed owner turn ID and any end-of-turn cover');
  if (state.pendingRelentlessRage)
    fail('Resolve Relentless Rage before progressing the turn');
  if (type === 'turn.start') {
    if (
      state.ownerTurn?.open ||
      state.ownerTurnHistory?.includes(payload.turnId)
    )
      fail('Finish the current turn and use a new turn ID');
    state.ownerTurn = {
      id: payload.turnId,
      number: (state.ownerTurn?.number ?? 0) + 1,
      open: true,
    };
    delete state.externalCastingTurn;
    state.ownerTurnHistory = [
      ...(state.ownerTurnHistory ?? []),
      payload.turnId,
    ];
    if (
      heroicWarriorInspirationAvailable(
        state.inCombat,
        summary.features,
        state.inspiration,
      )
    ) {
      state.inspiration = true;
      state.inspirationSource = {
        source: 'path:deadeye:heroic-warrior:10',
        createdAt: require('../combat/effects/clock').now(state),
        turnId: payload.turnId,
      };
    }
    const rally = heroicRallyHealing(
      summary.paths.gunslinger,
      summary.callingLevels.gunslinger,
      state.health.current,
      state.health.max,
      summary.attributeModifiers.resolve,
    );
    if (rally !== null) {
      const before = state.health.current;
      require('../combat/vitality/vitality').heal(state, rally, summary);
      result.heroicRally = state.health.current - before;
    }
  } else {
    if (!state.ownerTurn?.open || state.ownerTurn.id !== payload.turnId)
      fail('End the matching active turn');
    state.ownerTurn.open = false;
    state.effects = state.effects.filter(
      (e) => !e.endsAtRecordedTurnEnd || e.turnId !== payload.turnId,
    );
    if (state.pendingStealthCover === state.ownerTurn.number) {
      if (!stealthCoverEligible(payload.cover))
        state.conditions = state.conditions.filter(
          (condition) =>
            condition.conditionId !== 'invisible' ||
            condition.source !== 'hide',
        );
      state.pendingStealthCover = null;
    }
  }
  state.effects = state.effects.filter(
    (e) =>
      !(
        e.ends ===
          (type === 'turn.start' ? 'start-of-next-turn' : 'end-of-next-turn') &&
        (e.createdTurn ?? 0) < state.ownerTurn.number
      ),
  );
  require('../combat/effects/clock').expire(state);
  state.revision++;
}
function extendRage(state, payload, summary) {
  if (
    Object.keys(payload).some((k) => !['reason', 'confirmed'].includes(k)) ||
    payload.confirmed !== true ||
    !rageExtensionReasons.includes(payload.reason) ||
    !state.ownerTurn?.open
  )
    fail('Confirm an eligible Rage extension on your active turn');
  const rage = state.effects.find((e) => e.rage);
  if (
    !rage ||
    persistentRageUnlocked(summary.callingLevels.reaver) ||
    require('../combat/vitality/vitality').incapacitated(state)
  )
    fail('No eligible Rage needs extension');
  rage.createdTurn = state.ownerTurn.number;
  state.revision++;
}
module.exports = {
  endTriggerTurn,
  recordMovement,
  recordExternalTurn,
  recordOwnerTurn,
  extendRage,
};

// Counter tracking only. Spending a counter never claims to execute the associated feature.
const { clearTemporaryHealth, recoverRestExhaustion, directHealthReduction } = require('@crossworld/sanguine-engine/vitality');
const { sorcerousRestorationAmount } = require('@crossworld/sanguine-engine/calling-mechanics');
const { recoverWishCooldown } = require('@crossworld/sanguine-engine/callings');
const { HitDiceRecoveryError, recoverHealthWithHitDice } = require('@crossworld/sanguine-engine/hit-dice');
const { restPreparationError } = require('@crossworld/sanguine-engine/preparations');
const { calculateCappedPoolRecovery, recoverRestPools } = require('@crossworld/sanguine-engine/resources');
const { getSpellSlotCreationTerms, projectSorceryPointsFromSlot, calculateCreatedSpellSlotBalances, ArcaneRecoveryError, recoverArcaneSlots } =
  require('@crossworld/sanguine-engine/spell-slots');
const { validate, validateProjected, validatePreparation } = require('./runtimeValidation');
const { recover } = require('./featState');
const { spend } = require('./resourceTransitions');
const { spendSlot } = require('../../spells/spellSlotState');

function fail(message) {
  const e = new Error(message);
  e.statusCode = 400;
  throw e;
}
function initialize(summary) {
  return {
    revision: 0,
    health: { current: summary.health.max, max: summary.health.max },
    hitDice: { ...summary.hitDice },
    pools: Object.fromEntries(
      Object.entries(summary.resources).map(([id, p]) => [id, p.max])
    ),
    slots: [...summary.spellSlots],
    createdSlots: Array(summary.spellSlots.length).fill(0),
    preparations: Object.fromEntries(Object.entries(summary.spellcasting).map(([id, s]) => [id, [...s.prepared]])),
    temporaryHealth: 0,
    effects: [],
    counters: {},
    selections: {},
    folio: [],
    deathSaves:require('../../combat/vitality/healthState').fresh(),
    conditions:[],exhaustion:0,concentrationChecks:[],
    inspiration:false,featState:{},
  };
}
function update(summary, state, operation) {
  validate(summary, state);
  if (!operation || typeof operation !== "object" || Array.isArray(operation))
    fail("Invalid resource operation");
  const allowed = [
    "expectedRevision",
    "type",
    "poolId",
    "amount",
    "slotLevel",
    "healthDelta",
    "hitDice",
    "recoverSlots",
    "restoreSorcery",
    "preparations",
    "featureId", "value",
    "selections",
    'nourished',
  ];
  if (
    Object.keys(operation).some((k) => !allowed.includes(k)) ||
    operation.expectedRevision !== state.revision
  )
    fail("Resource revision changed or invalid fields");
  const next = structuredClone(state);
  if (['end-feature-effects', 'temporary-health', 'restore-feature', 'initiative-recovery', 'relentless-rage'].includes(operation.type)) {
    require('../abilities/featureOperations').apply(summary, next, operation);
  } else if (["slot-to-sorcery", "sorcery-to-slot"].includes(operation.type)) {
    if (Object.keys(operation).some(k => !["expectedRevision", "type", "slotLevel"].includes(k)))
      fail("Mixed conversion operation");
    const level = operation.slotLevel;
    const pool = "tidecaller:sorcery-points";
    if (!Number.isSafeInteger(level) || level < 1 || level > next.slots.length || !summary.resources[pool])
      fail("Unavailable conversion");
    const index = level - 1;
    const points = next.pools[pool];
    if (operation.type === "slot-to-sorcery") {
      const projected = projectSorceryPointsFromSlot({ slotLevel: level, points, maximum: summary.resources[pool].max });
      if (next.slots[index] < 1 || projected === null)
        fail("No slot or Sorcery Point capacity");
      spendSlot(next, level);
      next.pools[pool] = projected;
    } else {
      const terms = getSpellSlotCreationTerms(level);
      if (!terms || summary.callingLevels.tidecaller < terms.minimumCallingLevel || points < terms.cost)
        fail("Insufficient Sorcery Points or Calling level");
      const balances = calculateCreatedSpellSlotBalances({
        available: next.slots[index], created: next.createdSlots[index], points, cost: terms.cost,
      });
      next.pools[pool] = balances.points;
      next.slots[index] = balances.available;
      next.createdSlots[index] = balances.created;
    }
  } else if (operation.type === "spend-pool") {
    if (
      Object.keys(operation).some(
        (k) => !["expectedRevision", "type", "poolId", "amount"].includes(k)
      )
    )
      fail("Mixed resource operation");
    next.pools = spend(next.pools, summary.resources, operation);
  } else if (operation.type === "spend-slot") {
    if (
      Object.keys(operation).some(
        (k) => !["expectedRevision", "type", "slotLevel"].includes(k)
      )
    )
      fail("Mixed resource operation");
    if (
      !Number.isSafeInteger(operation.slotLevel) ||
      operation.slotLevel < 1 ||
      operation.slotLevel > next.slots.length ||
      next.slots[operation.slotLevel - 1] < 1
    )
      fail("Unavailable spell slot");
    spendSlot(next, operation.slotLevel);
  } else if (operation.type === "health") {
    if (
      Object.keys(operation).some(
        (k) => !["expectedRevision", "type", "healthDelta"].includes(k)
      ) ||
      !Number.isSafeInteger(operation.healthDelta)
    )
      fail("Invalid Health adjustment");
    if(operation.healthDelta>=0)require('../../combat/vitality/healthState').heal(next,operation.healthDelta);
    else{next.health.current=directHealthReduction(next.health.current,-operation.healthDelta);if(next.health.current===0)require('../../combat/vitality/healthState').endConcentration(next);}
  } else if (["short-rest", "long-rest"].includes(operation.type)) {
    if (
      Object.keys(operation).some(
        (k) =>
          ![
            "expectedRevision",
            "type",
            "hitDice",
                    "recoverSlots",
            "restoreSorcery",
            "preparations",
            "selections",
            'nourished',
          ].includes(k)
      )
    )
      fail("Mixed rest operation");
    if(operation.nourished!==undefined&&typeof operation.nourished!=='boolean')fail('Confirm food and water with a boolean');
    if (operation.type === "long-rest") {
      if (operation.hitDice !== undefined)
        fail("Long Rest cannot spend Hit Dice");
      require('../../combat/vitality/healthState').heal(next,next.health.max);
      next.slots = [...summary.spellSlots];
      next.createdSlots = Array(summary.spellSlots.length).fill(0);
      next.hitDice = { ...summary.hitDice };
      Object.assign(next, clearTemporaryHealth());
      next.effects = next.effects.filter(e=>!e.concentration&&require('../../combat/effects/effectTime').active(next,e));
      next.concentrationChecks=[];
      const exhaustion = recoverRestExhaustion(next.exhaustion, { kind: operation.type, nourished: operation.nourished });
      if (exhaustion !== undefined) next.exhaustion = exhaustion;
      next.counters = {};
    } else if (operation.hitDice !== undefined) {
      try {
        const { health, hitDice } = recoverHealthWithHitDice({
          health: next.health,
          hitDice: next.hitDice,
          allocation: summary.hitDice,
          resolve: summary.attributes.resolve,
          spends: operation.hitDice,
        });
        next.health = health;
        next.hitDice = hitDice;
      } catch (error) {
        if (error instanceof HitDiceRecoveryError) fail(error.message);
        throw error;
      }
    }
    if (operation.type === "long-rest" && (operation.recoverSlots !== undefined || operation.restoreSorcery !== undefined))
      fail("Short Rest features cannot be invoked during a Long Rest");
    if (operation.selections !== undefined) require('./selectionOperations').replace(summary, next, operation.selections, operation.type);
    if (operation.preparations !== undefined) {
      if (!operation.preparations || typeof operation.preparations !== "object" || Array.isArray(operation.preparations))
        fail("Invalid preparation changes");
      for (const [id, selected] of Object.entries(operation.preparations)) {
        validatePreparation(require('./selections').project(summary, next), id, selected);
        const error = restPreparationError({
          kind: operation.type,
          callingId: id,
          shipwrightLevel: summary.callingLevels.shipwright,
          previous: state.preparations[id],
          selected,
        });
        if (error) fail(error);
        next.preparations[id] = [...selected];
      }
    }
    if (operation.recoverSlots !== undefined) {
      const pool = 'shipwright:arcane-recovery';
      try {
        const recovery = recoverArcaneSlots({
          slots: next.slots,
          maximums: summary.spellSlots,
          slotLevels: operation.recoverSlots,
          shipwrightLevel: summary.callingLevels.shipwright,
          uses: next.pools[pool],
        });
        next.slots = recovery.slots;
        next.pools[pool] = recovery.uses;
      } catch (error) {
        if (error instanceof ArcaneRecoveryError) fail(error.message);
        throw error;
      }
    }
    if (operation.restoreSorcery !== undefined) {
      if (operation.restoreSorcery !== true || !summary.resources["tidecaller:restoration"] ||
          next.pools["tidecaller:restoration"] < 1)
        fail("Sorcerous Restoration unavailable");
      next.pools["tidecaller:restoration"]--;
      const pool = "tidecaller:sorcery-points";
      next.pools[pool] = calculateCappedPoolRecovery({
        current: next.pools[pool],
        maximum: summary.resources[pool].max,
        amount: sorcerousRestorationAmount(summary.callingLevels.tidecaller),
      }).remaining;
    }
    const previousWishCooldown=next.interventionCooldown?.longRestsRemaining;
    const wishCooldown=recoverWishCooldown(previousWishCooldown,operation.type);
    if(wishCooldown!==previousWishCooldown)next.interventionCooldown.longRestsRemaining=wishCooldown;
    next.pools = recoverRestPools(next.pools, summary.resources, {
      kind: operation.type,
      interventionCooldown: next.interventionCooldown?.longRestsRemaining,
    });
    if (operation.type === 'short-rest') {
      next.counters ??= {};
      next.counters.relentlessRage = 0;
      const exhaustion = recoverRestExhaustion(next.exhaustion, {
        kind: operation.type, navigatorLevel: summary.callingLevels.navigator,
      });
      if (exhaustion !== undefined) next.exhaustion = exhaustion;
    }
    const activeTurn=next.ownerTurn?.open?next.ownerTurn.id:next.inCombat?next.externalCastingTurn:null;
    next.turnCasting=activeTurn&&next.turnCasting?.[activeTurn]?{[activeTurn]:next.turnCasting[activeTurn]}:{};
    next.ammunitionActions={};next.strikeHistory=[];next.toolChecks=[];next.gearUses=[];next.forbiddenSneakEvents=[];delete next.counters.rerolledTests;delete next.counters.duelistParries;delete next.counters.duelistAttacks;delete next.counters.ghostTradeTurns;
    recover(next,true);
    next.castings=(next.castings??[]).filter(c=>next.effects.some(e=>e.id===c.castId));
  } else fail("Unknown resource operation");
  if(next.folioMemory){const casting=require('./selections').project(summary,next).spellcasting.shipwright;next.folioMemory=next.folioMemory.filter(id=>(next.preparations.shipwright??[]).includes(id)||casting?.alwaysPrepared.includes(id));}
  next.revision++;
  return next;
}
module.exports = { initialize, update, validate, validateProjected, project: require('./selections').project };

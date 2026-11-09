// Counter tracking only. Spending a counter never claims to execute the associated feature.
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
    deathSaves:require('./vitality').fresh(),
    conditions:[],exhaustion:0,concentrationChecks:[],
    inspiration:false,featState:{},
  };
}
function validate(summary, state) {
  return validateProjected(require('./selections').project(summary, state ?? {}),state);
}
function validateProjected(summary,state) {
  const bounded = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
  if (!state || !bounded(state.revision, Number.MAX_SAFE_INTEGER) ||
      state.health?.max !== summary.health.max || !bounded(state.health.current, summary.health.max))
    fail("Invalid saved Health or resource revision");
  for (const [name, maxima] of [["pools", Object.fromEntries(Object.entries(summary.resources).map(([id, p]) => [id, p.max]))],
    ["hitDice", summary.hitDice]]) {
    if (!state[name] || Object.keys(state[name]).length !== Object.keys(maxima).length ||
        Object.entries(maxima).some(([id, max]) => !bounded(state[name][id], max)))
      fail("Invalid saved " + name);
  }
  if (!Array.isArray(state.slots) || state.slots.length !== summary.spellSlots.length ||
      !Array.isArray(state.createdSlots) || state.createdSlots.length !== state.slots.length ||
      state.slots.some((n, i) => !bounded(state.createdSlots[i], 100) ||
        !bounded(n, summary.spellSlots[i] + state.createdSlots[i]))) fail("Invalid saved spell slots");
  if (!state.preparations || Object.keys(state.preparations).length !== Object.keys(summary.spellcasting).length)
    fail("Invalid saved preparations");
  for (const [id, casting] of Object.entries(summary.spellcasting)) validatePreparation(summary, id, state.preparations[id], casting);
  if (!bounded(state.temporaryHealth ?? 0, 10000) || !Array.isArray(state.effects ?? []) || (state.effects ?? []).length > 200)
    fail('Invalid temporary resources');
  require('./vitality').validate(state);
  require('./conduitOperations').validate(state);
  require('./folioOperations').validate(state);
  if(state.milestones!==undefined&&(!Array.isArray(state.milestones)||state.milestones.length>19||new Set(state.milestones.map(m=>m.level)).size!==state.milestones.length||state.milestones.some(m=>!Number.isInteger(m.level)||m.level<2||m.level>20||typeof m.reason!=='string'||!m.reason.trim()||m.reason.length>500||typeof m.authorizedBy!=='string'||typeof m.used!=='boolean')))fail('Invalid saved milestone authorization');
  require('./featOperations').validate(summary,state);
  if(state.interventionCooldown){
    const cd=state.interventionCooldown;
    if(summary.callingLevels.doctor!==20||!Array.isArray(cd.rolls)||cd.rolls.length!==2||cd.rolls.some(n=>!bounded(n,4)||n<1)||!bounded(cd.longRestsRemaining,cd.rolls[0]+cd.rolls[1]))fail('Invalid saved Greater Intervention cooldown');
  }
  return true;
}
function validatePreparation(summary, id, selected, casting = summary.spellcasting[id]) {
  if (!casting || !Array.isArray(selected) || selected.length !== casting.preparedCount ||
      new Set(selected).size !== selected.length) fail("Invalid preparation count");
  const spells = require("./rules").spells;
  if (selected.some(spellId => {
    const spell = spells.find(s => s.id === spellId);
    return !spell || casting.alwaysPrepared.includes(spellId) || !spell.callings.includes(id) || spell.level < 1 || spell.level > casting.slots.length ||
      (id === "shipwright" && !casting.folio.includes(spellId)&&!casting.memorized?.includes(spellId));
  })) fail("Invalid prepared spell");
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
    "featureId", "note", "value",
    "selections",
    'nourished',
  ];
  if (
    Object.keys(operation).some((k) => !allowed.includes(k)) ||
    operation.expectedRevision !== state.revision
  )
    fail("Resource revision changed or invalid fields");
  const next = structuredClone(state);
  if (['use-feature', 'end-effect', 'temporary-health', 'restore-feature', 'initiative-recovery', 'relentless-rage'].includes(operation.type)) {
    require('./featureOperations').apply(summary, next, operation);
  } else if (["slot-to-sorcery", "sorcery-to-slot"].includes(operation.type)) {
    if (Object.keys(operation).some(k => !["expectedRevision", "type", "slotLevel"].includes(k)))
      fail("Mixed conversion operation");
    const level = operation.slotLevel;
    const pool = "tidecaller:sorcery-points";
    if (!Number.isSafeInteger(level) || level < 1 || level > next.slots.length || !summary.resources[pool])
      fail("Unavailable conversion");
    if (operation.type === "slot-to-sorcery") {
      if (next.slots[level - 1] < 1 || next.pools[pool] + level > summary.resources[pool].max)
        fail("No slot or Sorcery Point capacity");
      next.slots[level - 1]--;
      if (next.createdSlots[level - 1] > 0) next.createdSlots[level - 1]--;
      next.pools[pool] += level;
    } else {
      const cost = [0, 2, 3, 5, 6, 7][level];
      if (!cost || summary.callingLevels.tidecaller < level * 2 - 1 || next.pools[pool] < cost)
        fail("Insufficient Sorcery Points or Calling level");
      next.pools[pool] -= cost;
      next.slots[level - 1]++;
      next.createdSlots ??= Array(summary.spellSlots.length).fill(0);
      next.createdSlots[level - 1]++;
    }
  } else if (operation.type === "spend-pool") {
    if (
      Object.keys(operation).some(
        (k) => !["expectedRevision", "type", "poolId", "amount"].includes(k)
      )
    )
      fail("Mixed resource operation");
    const max = summary.resources[operation.poolId]?.max;
    if (
      !max ||
      !Number.isSafeInteger(operation.amount) ||
      operation.amount < 1 ||
      operation.amount > next.pools[operation.poolId]
    )
      fail("Unavailable feature resource");
    next.pools[operation.poolId] -= operation.amount;
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
    next.slots[operation.slotLevel - 1]--;
    if (next.createdSlots?.[operation.slotLevel - 1] > 0) next.createdSlots[operation.slotLevel - 1]--;
  } else if (operation.type === "health") {
    if (
      Object.keys(operation).some(
        (k) => !["expectedRevision", "type", "healthDelta"].includes(k)
      ) ||
      !Number.isSafeInteger(operation.healthDelta)
    )
      fail("Invalid Health adjustment");
    if(operation.healthDelta>=0)require('./vitality').heal(next,operation.healthDelta);
    else{next.health.current=Math.max(0,next.health.current+operation.healthDelta);if(next.health.current===0)require('./vitality').endConcentration(next);}
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
      require('./vitality').heal(next,next.health.max);
      next.slots = [...summary.spellSlots];
      next.createdSlots = Array(summary.spellSlots.length).fill(0);
      next.hitDice = { ...summary.hitDice };
      next.temporaryHealth = 0;
      next.temporaryHealthMetadata=null;
      next.effects = next.effects.filter(e=>!e.concentration&&require('./clock').active(next,e));
      next.concentrationChecks=[];
      if(operation.nourished===true)next.exhaustion=Math.max(0,(next.exhaustion??0)-1);
      next.counters = {};
    } else if (operation.hitDice !== undefined) {
      if (!Array.isArray(operation.hitDice) || operation.hitDice.length > 20)
        fail("Invalid Hit Dice");
      for (const spend of operation.hitDice) {
        if (
          !spend ||
          Object.keys(spend).some((k) => !["die", "roll"].includes(k)) ||
          !summary.hitDice[spend.die] ||
          next.hitDice[spend.die] < 1 ||
          !Number.isSafeInteger(spend.roll) ||
          spend.roll < 1 ||
          spend.roll > Number(spend.die.slice(1))
        )
          fail("Unavailable Hit Die or invalid GM-recorded roll");
        next.hitDice[spend.die]--;
        next.health.current = Math.min(
          next.health.max,
          next.health.current +
            Math.max(
              0,
              spend.roll + Math.floor((summary.attributes.resolve - 10) / 2)
            )
        );
      }
    }
    if (operation.type === "long-rest" && (operation.recoverSlots !== undefined || operation.restoreSorcery !== undefined))
      fail("Short Rest features cannot be invoked during a Long Rest");
    if (operation.selections !== undefined) require('./selections').replace(summary, next, operation.selections, operation.type);
    if (operation.preparations !== undefined) {
      if (!operation.preparations || typeof operation.preparations !== "object" || Array.isArray(operation.preparations))
        fail("Invalid preparation changes");
      for (const [id, selected] of Object.entries(operation.preparations)) {
        validatePreparation(require('./selections').project(summary, next), id, selected);
        const changed = selected.filter(s => !state.preparations[id].includes(s)).length;
        if (operation.type === "short-rest") {
          if (id !== "shipwright" || summary.callingLevels.shipwright < 5 || changed > 1)
            fail("Memorize Spell requires Shipwright level five and replaces one spell");
        } else if (id === "tidecaller" || (["warden", "navigator"].includes(id) && changed > 1))
          fail("Calling preparation replacement limit exceeded");
        next.preparations[id] = [...selected];
      }
    }
    if (operation.recoverSlots !== undefined) {
      if (!Array.isArray(operation.recoverSlots) || !operation.recoverSlots.length ||
          next.pools["shipwright:arcane-recovery"] < 1 || !summary.callingLevels.shipwright ||
          operation.recoverSlots.some(n => !Number.isSafeInteger(n) || n < 1 || n > 5) ||
          operation.recoverSlots.reduce((a, b) => a + b, 0) > Math.ceil(summary.callingLevels.shipwright / 2))
        fail("Invalid Arcane Recovery");
      for (const level of operation.recoverSlots) {
        if (next.slots[level - 1] >= summary.spellSlots[level - 1] || summary.spellSlots[level - 1] === undefined)
          fail("Arcane Recovery needs expended slots");
        next.slots[level - 1]++;
      }
      next.pools["shipwright:arcane-recovery"]--;
    }
    if (operation.restoreSorcery !== undefined) {
      if (operation.restoreSorcery !== true || !summary.resources["tidecaller:restoration"] ||
          next.pools["tidecaller:restoration"] < 1)
        fail("Sorcerous Restoration unavailable");
      next.pools["tidecaller:restoration"]--;
      next.pools["tidecaller:sorcery-points"] = Math.min(summary.resources["tidecaller:sorcery-points"].max,
        next.pools["tidecaller:sorcery-points"] + Math.floor(summary.callingLevels.tidecaller / 2));
    }
    if(operation.type==='long-rest'&&next.interventionCooldown?.longRestsRemaining>0)next.interventionCooldown.longRestsRemaining--;
    for (const [id, pool] of Object.entries(summary.resources)) {
      if (operation.type === "long-rest") {
        if (
          id === "doctor:intervention" &&
          next.interventionCooldown?.longRestsRemaining > 0
        )
          continue;
        next.pools[id] = pool.max;
      } else {
        const recovery = pool.recovery.shortRest;
        if (recovery === "all") next.pools[id] = pool.max;
        else if (Number.isInteger(recovery))
          next.pools[id] = Math.min(pool.max, next.pools[id] + recovery);
      }
    }
    if (operation.type === 'short-rest') {
      next.counters ??= {};
      next.counters.relentlessRage = 0;
      if(summary.callingLevels.navigator>=10)next.exhaustion=Math.max(0,(next.exhaustion??0)-1);
    }
    const activeTurn=next.ownerTurn?.open?next.ownerTurn.id:next.inCombat?next.externalCastingTurn:null;
    next.turnCasting=activeTurn&&next.turnCasting?.[activeTurn]?{[activeTurn]:next.turnCasting[activeTurn]}:{};
    next.ammunitionActions={};next.strikeHistory=[];next.toolChecks=[];next.gearUses=[];next.forbiddenSneakEvents=[];delete next.counters.rerolledTests;delete next.counters.duelistParries;delete next.counters.duelistAttacks;delete next.counters.ghostTradeTurns;
    require('./featOperations').recover(next,true);
    next.castings=(next.castings??[]).filter(c=>next.effects.some(e=>e.id===c.castId));
  } else fail("Unknown resource operation");
  if(next.folioMemory){const casting=require('./selections').project(summary,next).spellcasting.shipwright;next.folioMemory=next.folioMemory.filter(id=>(next.preparations.shipwright??[]).includes(id)||casting?.alwaysPrepared.includes(id));}
  next.revision++;
  return next;
}
module.exports = { initialize, update, validate, validateProjected, project: require('./selections').project };

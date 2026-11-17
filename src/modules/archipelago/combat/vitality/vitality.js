const {
  applyVitalityDamage,
  resolveDeathSave,
  resolveConcentrationSave,
  mitigateDamage,
  concentrationDamageDC,
  grantTemporaryHealth,
  unbrokenCurrentUnlocked,
  evaluateUnbrokenCurrent,
  pendingRelentlessRage,
  isDamageConcentrationExempt,
  isUnconscious,
  canStabilize,
  canRollDeathSave,
  stabilizationDieSides,
  stabilizationDurationMs,
} = require('@crossworld/sanguine-engine/vitality');
const {
  reefSkinEligible,
  persistentRageUnlocked,
  deadeyeDefiesDeath,
} = require('@crossworld/sanguine-engine/callings');
const { selectD20, d20RollCount } = require('@crossworld/sanguine-engine/dice');
const { randomInt, randomUUID } = require('node:crypto');
const clock = require('../effects/clock');
const {
  conditions,
  damageTypes,
  validExhaustionLevel,
  maximumExhaustionLevel,
} = require('@crossworld/sanguine-engine/vitality');
function fail(message) {
  throw Object.assign(new Error(message), { statusCode: 422 });
}
const {
  fresh,
  incapacitated,
  endConcentration,
  heal,
  revive,
  validate,
} = require('./healthState');
function stabilize(state) {
  if (!canStabilize(state.health.current, state.deathSaves))
    fail('Stabilize a living creature at zero Health');
  state.deathSaves = {
    ...fresh(),
    stable: true,
    stableUntil:
      clock.now(state) +
      stabilizationDurationMs(randomInt(1, stabilizationDieSides + 1)),
  };
}
function damage(character, summary, p, { ignoreMitigation = false } = {}) {
  if (
    Object.keys(p).some(
      (k) =>
        ![
          'amount',
          'damageType',
          'attack',
          'critical',
          'confirmed',
          'unbrokenCurrent',
          'agilityHalfSave',
        ].includes(k),
    ) ||
    !Number.isSafeInteger(p.amount) ||
    p.amount < 0 ||
    p.amount > 1000000 ||
    !damageTypes.includes(p.damageType) ||
    p.confirmed !== true ||
    (p.attack !== undefined && typeof p.attack !== 'boolean') ||
    (p.critical !== undefined && typeof p.critical !== 'boolean') ||
    (p.unbrokenCurrent !== undefined &&
      typeof p.unbrokenCurrent !== 'boolean') ||
    (p.agilityHalfSave !== undefined &&
      !['success', 'failure'].includes(p.agilityHalfSave))
  )
    fail(
      'Record confirmed damage, type, save outcome and attack/critical flags',
    );
  const state = character.rulesRuntime;
  if (state.deathSaves?.dead) fail('Creature is already dead');
  if (
    p.unbrokenCurrent &&
    !unbrokenCurrentUnlocked(
      summary.paths.tidecaller,
      summary.callingLevels.tidecaller,
    )
  )
    fail('Unbroken Current requires Sanguine Conduit eighteen');
  const before = state.health.current,
    canReact = !incapacitated(state),
    tempSource = structuredClone(state.temporaryHealthMetadata ?? null);
  let reefSkinReduction = 0;
  if (
    !ignoreMitigation &&
    reefSkinEligible({
      attack: p.attack,
      damageType: p.damageType,
      path: summary.paths.reaver,
      level: summary.callingLevels.reaver,
      raging: summary.raging,
      suppressed: summary.reefSkinSuppressed,
    })
  ) {
    const armor = character.inventory.find(
      (i) => i.instanceId === character.loadout.armor,
    );
    if (
      !armor ||
      require('../../equipment/inventory').definition(armor.definitionId)
        .category !== 'heavy'
    )
      reefSkinReduction = summary.trainingBonus;
  }
  const { damage: amount, evasionApplied } = ignoreMitigation
    ? { damage: p.amount, evasionApplied: false }
    : mitigateDamage(p.amount, {
        agilityHalfSave: p.agilityHalfSave,
        evasion: summary.evasion,
        immune: summary.immunities?.includes(p.damageType),
        resistant: summary.resistances.includes(p.damageType),
        reefSkinReduction,
      });
  let unbrokenCurrent;
  const formId = state.animalForms?.activeFormId;
  const animalBefore = state.animalForms?.healthByForm[formId];
  const vitalityDamage = formId
    ? require('../../characters/runtime/animalHealth').transition(summary, state, {
        type: 'damage', amount, critical: p.critical,
      })
    : applyVitalityDamage(state, amount, p.critical);
  const { absorbed = 0, ...vitality } = vitalityDamage;
  Object.assign(state, vitality);
  const current = evaluateUnbrokenCurrent({
    declared: p.unbrokenCurrent,
    before,
    current: state.health.current,
    dead: state.deathSaves.dead,
    canReact,
    uses: state.pools['sanguine-conduit:unbroken-current'],
    level: summary.callingLevels.tidecaller,
  });
  if (current.kind === 'unavailable')
    fail('Unbroken Current requires an available Reaction and unspent use');
  if (current.kind === 'restore') {
    state.pools['sanguine-conduit:unbroken-current'] = current.remainingUses;
    state.health.current = current.health;
    state.deathSaves = fresh();
    Object.assign(
      state,
      grantTemporaryHealth(state.temporaryHealth, current.temporaryHealth, {
        source: 'path:sanguine-conduit:unbroken-current:18',
      }),
    );
    unbrokenCurrent = {
      health: current.health,
      temporaryHealth: current.temporaryHealth,
      reactionSpent: true,
    };
  }
  const pending = pendingRelentlessRage({
    before,
    current: state.health.current,
    dead: state.deathSaves.dead,
    raging: summary.raging,
    level: summary.callingLevels.reaver,
    attempts: state.counters.relentlessRage ?? 0,
  });
  if (pending) state.pendingRelentlessRage = pending;
  if (incapacitated(state)) {
    endConcentration(state);
    state.effects = state.effects.filter(
      (e) =>
        e.featureId !== 'calling:reaver:rage:1' ||
        state.pendingRelentlessRage ||
        (state.health.current > 0 &&
          persistentRageUnlocked(summary.callingLevels.reaver)),
    );
  } else if (
    amount > 0 &&
    state.effects.some((e) => e.concentration && clock.active(state, e))
  ) {
    const effects = state.effects
      .filter(
        (e) =>
          e.concentration &&
          clock.active(state, e) &&
          !isDamageConcentrationExempt({
            navigatorLevel: summary.callingLevels.navigator,
            spellId:
              e.featureId === 'spell:hunter-s-mark'
                ? 'hunter-s-mark'
                : undefined,
          }),
      )
      .map((e) => e.id);
    if (effects.length) {
      state.concentrationChecks ??= [];
      state.concentrationChecks.push({
        id: randomUUID(),
        dc: concentrationDamageDC(amount),
        damage: amount,
        effects,
      });
    }
  }
  const bloodPriceLoss =
    absorbed > 0 &&
    tempSource?.source ===
      require('../../characters/abilities/conduitOperations').bloodPrice
      ? { ...tempSource, amount: absorbed }
      : undefined;
  return {
    type: 'health.damage',
    damage: amount,
    absorbed,
    ...(formId ? {
      animalHealthLost: animalBefore - state.animalForms.healthByForm[formId],
      activeFormId: state.animalForms.activeFormId,
    } : {}),
    healthLost: before - state.health.current,
    deathSaves: structuredClone(state.deathSaves),
    ...(p.agilityHalfSave
      ? { agilityHalfSave: p.agilityHalfSave, evasionApplied }
      : {}),
    ...(bloodPriceLoss ? { bloodPriceLoss } : {}),
    ...(unbrokenCurrent ? { unbrokenCurrent } : {}),
  };
}
function apply(character, summary, type, p) {
  const state = character.rulesRuntime;
  let result = { type };
  if (type === 'health.damage') result = damage(character, summary, p);
  else if (type === 'condition.record') {
    if (
      Object.keys(p).some(
        (k) =>
          !['conditionId', 'source', 'active', 'level', 'confirmed'].includes(
            k,
          ),
      ) ||
      p.confirmed !== true ||
      typeof p.source !== 'string' ||
      !p.source.trim() ||
      p.source.length > 100
    )
      fail('Record a confirmed condition and its source');
    if (p.conditionId === 'exhaustion') {
      if (!validExhaustionLevel(p.level))
        fail('Exhaustion level must be zero through six');
      state.exhaustion = p.level;
      if (p.level === maximumExhaustionLevel) {
        state.health.current = 0;
        state.deathSaves = { ...fresh(), dead: true, cause: 'exhaustion' };
      }
    } else {
      if (
        !conditions.includes(p.conditionId) ||
        typeof p.active !== 'boolean' ||
        p.level !== undefined
      )
        fail('Choose a known condition and whether its source is active');
      if (p.active && summary.conditionImmunities?.includes(p.conditionId))
        fail('Your active feature grants Immunity to this condition');
      state.conditions = (state.conditions ?? []).filter(
        (c) => c.conditionId !== p.conditionId || c.source !== p.source,
      );
      if (p.active)
        state.conditions.push({ conditionId: p.conditionId, source: p.source });
    }
    if (incapacitated(state)) {
      endConcentration(state);
      state.effects = state.effects.filter((e) => !e.endsOnCasterIncapacitated);
    }
    if (
      isUnconscious(state) ||
      (incapacitated(state) &&
        !persistentRageUnlocked(summary.callingLevels.reaver ?? 0))
    )
      state.effects = state.effects.filter(
        (e) => e.featureId !== 'calling:reaver:rage:1',
      );
  } else if (type === 'temp-health.choose') {
    if (
      Object.keys(p).some(
        (k) => !['amount', 'source', 'expiresAt', 'confirmed'].includes(k),
      ) ||
      p.confirmed !== true ||
      !Number.isSafeInteger(p.amount) ||
      p.amount < 0 ||
      p.amount > 10000 ||
      typeof p.source !== 'string' ||
      !p.source.trim() ||
      p.source.length > 100 ||
      (p.expiresAt !== undefined &&
        (!Number.isSafeInteger(p.expiresAt) || p.expiresAt <= clock.now(state)))
    )
      fail(
        'Choose one confirmed temporary Health pool, source and optional future expiry',
      );
    state.temporaryHealth = p.amount;
    state.temporaryHealthMetadata = p.amount
      ? {
          source: p.source,
          ...(p.expiresAt !== undefined ? { expiresAt: p.expiresAt } : {}),
        }
      : null;
  } else if (type === 'death-save.roll') {
    if (
      Object.keys(p).some((k) => !['naturalRoll', 'confirmed'].includes(k)) ||
      (p.naturalRoll !== undefined &&
        (p.confirmed !== true ||
          !Number.isInteger(p.naturalRoll) ||
          p.naturalRoll < 1 ||
          p.naturalRoll > 20))
    )
      fail('Record a GM-confirmed d20 or request a server roll');
    if (state.pendingRelentlessRage) fail('Resolve Relentless Rage first');
    if (!canRollDeathSave(state.health.current, state.deathSaves))
      fail('Death save requires an unstable living creature at zero Health');
    const defyDeath = deadeyeDefiesDeath(
      summary.paths.gunslinger,
      summary.callingLevels.gunslinger,
    );
    const rolls =
      p.naturalRoll !== undefined
        ? [p.naturalRoll]
        : Array.from({ length: d20RollCount(defyDeath) }, () =>
            randomInt(1, 21),
          );
    const outcome = resolveDeathSave(
      state.deathSaves,
      selectD20(rolls, true, false),
      { defyDeath },
    );
    result.rolls = rolls;
    result.defyDeath = defyDeath;
    if (outcome.kind === 'restore-health') revive(state, 1);
    else if (outcome.kind === 'stabilize') stabilize(state);
    else state.deathSaves = outcome.deathSaves;
    result.deathSaves = structuredClone(state.deathSaves);
  } else if (type === 'concentration.resolve') {
    if (
      Object.keys(p).some((k) => !['checkId', 'rolls', 'confirmed'].includes(k))
    )
      fail('Invalid Concentration save fields');
    const check = state.concentrationChecks?.find((c) => c.id === p.checkId);
    if (!check) fail('No matching pending Concentration save');
    const count = d20RollCount(Boolean(summary.concentrationSaveAdvantage));
    if (
      p.rolls !== undefined &&
      (p.confirmed !== true ||
        !Array.isArray(p.rolls) ||
        p.rolls.length !== count ||
        p.rolls.some((r) => !Number.isInteger(r) || r < 1 || r > 20))
    )
      fail('Record the correct number of GM-confirmed d20 rolls');
    const rolls =
      p.rolls ?? Array.from({ length: count }, () => randomInt(1, 21));
    const { total, success } = resolveConcentrationSave({
      rolls,
      resolveModifier: summary.savingThrowModifiers.resolve,
      dc: check.dc,
    });
    state.concentrationChecks = state.concentrationChecks.filter(
      (c) => c.id !== check.id,
    );
    if (!success) {
      state.effects = state.effects.filter(
        (e) => !check.effects.includes(e.id),
      );
      clock.expire(state);
    }
    result = { type, rolls, total, dc: check.dc, success };
  } else fail('Unknown character-state operation');
  state.revision++;
  validate(state);
  return result;
}
module.exports = {
  conditions,
  damageTypes,
  fresh,
  heal,
  revive,
  stabilize,
  incapacitated,
  endConcentration,
  validate,
  damage,
  apply,
};

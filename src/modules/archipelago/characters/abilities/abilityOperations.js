const {
  abilityEffectDuration,
  abilityFlightSpeed,
  veilEffect,
  sacredWeaponLighting,
  intimidatingPresenceEffect,
  turningConditions,
  nonnegativeAbilityAmount,
} = require('@crossworld/sanguine-engine/callings');
const {
  damageOnSuccessfulSave,
  halfDamageOutcome,
} = require('@crossworld/sanguine-engine/combat/save-damage');
const { checkSucceeded } = require('@crossworld/sanguine-engine/dice');
const {
  abilityTargetError,
  abilityNeedsRage,
  fixedAbilityRolls,
  abilityRollTotal,
  abilityTakesAction,
} = require('@crossworld/sanguine-engine/callings');
const {
  borrowedSquall,
  captainsCreditHealth,
  rageActivation,
  sacredWeaponAttackBonus,
  holyNimbusPulse,
} = require('@crossworld/sanguine-engine/callings');
const {
  abjureFoesTargetLimit,
  leviathanBurden,
  searUndeadUnlocked,
} = require('@crossworld/sanguine-engine/callings');

const { strokeOfLuckTotal } = require('@crossworld/sanguine-engine/callings');
const {
  indomitableTotal,
  tacticalShiftMovement,
} = require('@crossworld/sanguine-engine/callings');
const {
  silentKeelTargetsEligible,
  silentKeelVehicleEligible,
} = require('@crossworld/sanguine-engine/callings');
const {
  actionSurgeAdditionalActions,
  tacticalMindOutcome,
  divineChannelRange,
  divineSparkDamageTypes,
} = require('@crossworld/sanguine-engine/callings');
const {
  readyMeleeWeapon,
} = require('@crossworld/sanguine-engine/equipment/weapon-projection');

const {
  searUndeadOutcome,
  unseenPassageCollisionTerms,
} = require('@crossworld/sanguine-engine/callings');
const { randomInt } = require('node:crypto');
function fail(message) {
  throw Object.assign(new Error(message), { statusCode: 422 });
}
const { list, availableKit } = require('./abilityOptions');
function spend(state, pool, amount) {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    (state.pools[pool] ?? 0) < amount
  )
    fail('Insufficient resource: ' + pool);
  state.pools[pool] -= amount;
}
function dice(count, sides) {
  return Array.from({ length: count }, () => randomInt(1, sides + 1));
}
function rollAbility(option, result) {
  const terms = option.preview.roll;
  result.rolls = fixedAbilityRolls(terms) ?? dice(terms.count, terms.sides);
  return abilityRollTotal(result.rolls, terms.bonus);
}
function kit(character, charges) {
  const item = availableKit(character, charges);
  if (!item) fail('Healer kit requires ' + charges + ' available charges');
  item.chargesCurrent -= charges;
}
function activate(character, summary, p, context = {}) {
  if (
    Object.keys(p).some(
      (k) =>
        !['optionId', 'targetIds', 'parameters', 'note', 'turnId'].includes(k),
    )
  )
    fail('Invalid ability fields');
  const option = list(summary).find((o) => o.id === p.optionId);
  if (!option) fail('Ability option is unavailable');
  if (
    abilityTakesAction(option.action) &&
    require('../../combat/vitality/vitality').incapacitated(
      character.rulesRuntime,
    )
  )
    fail('Incapacitated creatures cannot take this action');
  if (typeof (p.note ?? '') !== 'string' || (p.note ?? '').length > 500)
    fail('Invalid ability note');
  if (
    !Array.isArray(p.targetIds ?? []) ||
    (p.targetIds ?? []).length > 30 ||
    (p.targetIds ?? []).some((id) => typeof id !== 'string' || id.length > 100)
  )
    fail('Invalid target IDs');
  const targets = p.targetIds ?? [],
    self = String(character._id ?? 'self');
  if (
    new Set(targets).size !== targets.length ||
    targets.some((id) => !id.trim())
  )
    fail('Choose distinct stable targets');
  const targetError = abilityTargetError(option.handler, targets, self);
  if (targetError) fail(targetError);
  const state = structuredClone(character.rulesRuntime),
    inventory = structuredClone(character.inventory);
  if (
    abilityNeedsRage(option.featureId) &&
    !state.effects.some((e) => e.featureId === 'calling:reaver:rage:1')
  )
    fail('This ability requires active Rage');
  const c = { ...character, inventory, rulesRuntime: state },
    params = p.parameters ?? {};
  if (
    !params ||
    typeof params !== 'object' ||
    Array.isArray(params) ||
    Object.keys(params).some(
      (k) =>
        ![
          'conditionSource',
          'magical',
          'undead',
          'indices',
          'attackTotal',
          'saveAttribute',
          'originalRoll',
          'damageType',
          'sear',
          'amount',
          'incomingDamage',
          'targetRestEpoch',
          'confirmed',
          'mode',
          'targetId',
          'bodyIntact',
          'deathSeconds',
          'consent',
          'objectId',
          'replaceObjectId',
          'distanceFeet',
          'withinTenFeet',
          'passers',
          'widthFeet',
          'heightFeet',
          'bend',
          'areas',
          'exemptTargets',
          'advantageTargets',
          'objectTargets',
          'radiusFeet',
          'eventId',
          'checkTotal',
          'dc',
          'extraAction',
          'ammunitionId',
          'conditions',
          'allocations',
          'roundNumber',
          'vehicleLengthFeet',
          'objectMissingHealth',
          'salvageMinutes',
        ].includes(k),
    )
  )
    fail('Invalid ability parameters');
  const feature = summary.features.find((f) => f.id === option.featureId),
    level =
      summary.callingLevels[
        feature.ownerType === 'calling'
          ? feature.ownerId
          : require('../../system/rules').paths.find(
              (path) => path.id === feature.ownerId,
            ).callingId
      ];
  const effect = {
    id: randomInt(1, 2147483647).toString(16),
    featureId: feature.id,
    optionId: option.id,
    name: option.name,
    note: p.note ?? '',
    targetIds: p.targetIds ?? [],
    createdAt: require('../../combat/effects/clock').now(state),
    createdTurn: state.ownerTurn?.number ?? 0,
  };
  const result = {
    type: 'ability.activate',
    optionId: option.id,
    description: feature.description,
  };
  for (const cost of option.costs) spend(state, cost.poolId, cost.amount);
  const temp = (amount) => {
    if (amount > state.temporaryHealth) {
      state.temporaryHealth = nonnegativeAbilityAmount(amount);
      state.temporaryHealthMetadata = { source: feature.id };
    }
    result.temporaryHealth = amount;
  };
  const heal = (amount) => {
    if (targets.length > 1) fail('Healing requires exactly one creature');
    result.healing = nonnegativeAbilityAmount(amount);
    if (!targets.length || targets.includes(self))
      require('../../combat/vitality/vitality').heal(state, result.healing);
  };
  switch (option.handler) {
    case 'rider-inoculate':
    case 'rider-mark-secondary':
    case 'rider-mark':
    case 'rider-mark-transfer':
    case 'rider-radiant':
    case 'rider-divine':
    case 'rider-potent':
    case 'rider-vitality':
    case 'rider-affinity':
    case 'rider-cantrip-half':
    case 'rider-evocation':
      require('../../combat/damageRiders').apply(
        c,
        summary,
        option,
        params,
        targets,
        effect,
        result,
        p.turnId,
      );
      break;
    case 'corsair-dash':
    case 'corsair-disengage':
    case 'corsair-hide':
    case 'corsair-aim':
    case 'corsair-aim-attack':
    case 'corsair-finesse':
    case 'gray-defense':
    case 'broker-resist':
      require('./utilityOperations').apply(
        c,
        summary,
        option,
        params,
        targets,
        effect,
        result,
        p.turnId,
      );
      break;
    case 'suppressor-hit':
    case 'suppressor-crossing':
    case 'suppressor-hold':
    case 'outrider-recoil':
    case 'outrider-passing':
    case 'outrider-break':
    case 'outrider-horizon':
      require('./gunslingerOperations').apply(
        c,
        summary,
        option,
        params,
        targets,
        effect,
        result,
        p.turnId,
      );
      break;
    case 'echo-link':
    case 'echo-save':
    case 'echo-pattern':
    case 'echo-share':
    case 'echo-unwritten':
    case 'tempest-pulse':
    case 'tempest-convert':
    case 'tempest-damage':
    case 'tempest-live':
      require('./casterPathOperations').apply(
        c,
        summary,
        option,
        params,
        targets,
        effect,
        result,
        p.turnId,
      );
      break;
    case 'starwake-guide':
    case 'starwake-hit':
    case 'starwake-home':
    case 'mangrove-hit':
    case 'mangrove-predator':
    case 'mangrove-vanish':
      require('./navigatorOperations').apply(
        c,
        summary,
        option,
        params,
        targets,
        effect,
        result,
        p.turnId,
      );
      break;
    case 'stormhide-leap':
    case 'stormhide-retaliate':
    case 'stormhide-walking':
    case 'stormhide-pulse':
    case 'reaver-path-hit':
    case 'chainbreaker-escape':
    case 'chainbreaker-rally':
    case 'chainbreaker-kneel':
    case 'colossus-stance':
    case 'colossus-suppress':
    case 'colossus-deck':
      require('./reaverOperations').apply(
        c,
        summary,
        option,
        params,
        targets,
        effect,
        result,
        p.turnId,
      );
      break;
    case 'freeport-break':
    case 'freeport-reroll':
    case 'freeport-harbor':
    case 'vigil-watch':
    case 'vigil-hit':
    case 'vigil-cure':
    case 'vigil-dawn':
    case 'vigil-dawn-damage':
      require('./wardenOperations').apply(
        c,
        summary,
        option,
        params,
        targets,
        effect,
        result,
        p.turnId,
      );
      break;
    case 'covenant-steel':
    case 'covenant-sentinel':
    case 'covenant-standard':
    case 'covenant-grant':
      require('./covenantOperations').apply(
        c,
        summary,
        option,
        params,
        targets,
        effect,
        result,
        p.turnId,
      );
      break;
    case 'conduit-price':
    case 'conduit-sacrifice':
    case 'conduit-circuit':
      require('./conduitOperations').apply(
        c,
        summary,
        option,
        params,
        targets,
        effect,
        result,
        p.turnId,
        context,
      );
      break;
    case 'envoy-move':
    case 'envoy-save':
    case 'envoy-parley':
    case 'envoy-all':
    case 'lantern-study':
    case 'lantern-detect':
    case 'lantern-search':
    case 'lantern-mark':
    case 'lantern-reroll':
    case 'duelist-parry':
    case 'duelist-answer':
    case 'duelist-footwork':
    case 'duelist-perfect':
      require('./corsairOperations').apply(
        c,
        summary,
        option,
        params,
        targets,
        effect,
        result,
        p.turnId,
      );
      break;
    case 'burden': {
      if (option.handler === 'burden') {
        if (
          params.confirmed !== true ||
          targets.length !== 1 ||
          targets.includes(self) ||
          !Number.isSafeInteger(params.incomingDamage) ||
          params.incomingDamage < 1 ||
          params.incomingDamage > 1000000
        )
          fail(
            'Confirm one ally in your active aura and its post-mitigation incoming damage',
          );
        Object.assign(result, leviathanBurden(params.incomingDamage));
        result.damageOutcome = require('../../combat/vitality/vitality').damage(
          c,
          summary,
          {
            amount: result.transferredDamage,
            damageType: 'force',
            confirmed: true,
          },
          { ignoreMitigation: true },
        );
      }
      result.recordOnly = true;
      break;
    }
    case 'uncanny-dodge': {
      if (
        params.confirmed !== true ||
        !Number.isSafeInteger(params.incomingDamage) ||
        params.incomingDamage < 1 ||
        params.incomingDamage > 1000000
      )
        fail('Confirm a visible attacker hit and its damage before Resistance');
      Object.assign(result, halfDamageOutcome(params.incomingDamage));
      result.recordOnly = true;
      break;
    }
    case 'indomitable':
    case 'stroke-luck': {
      if (
        params.confirmed !== true ||
        typeof params.eventId !== 'string' ||
        !params.eventId.trim() ||
        params.eventId.length > 100 ||
        !Number.isSafeInteger(params.checkTotal) ||
        !Number.isSafeInteger(params.dc) ||
        params.dc < 1 ||
        params.dc > 1000 ||
        params.checkTotal >= params.dc
      )
        fail(
          'Confirm a failed D20 Test, its original total, DC and stable event ID',
        );
      state.counters.rerolledTests ??= [];
      if (state.counters.rerolledTests.includes(params.eventId))
        fail('This failed test has already been resolved');
      if (state.counters.rerolledTests.length >= 200)
        fail('Too many resolved tests; complete a rest');
      if (option.handler === 'indomitable') {
        if (!Object.hasOwn(summary.savingThrowModifiers, params.saveAttribute))
          fail('Choose the failed saving throw attribute');
        result.rolls = dice(1, 20);
        result.checkTotal = indomitableTotal(
          result.rolls[0],
          summary.savingThrowModifiers[params.saveAttribute],
          level,
        );
        result.levelBonus = level;
      } else {
        if (
          !Number.isSafeInteger(params.originalRoll) ||
          params.originalRoll < 1 ||
          params.originalRoll > 20
        )
          fail('Record the original d20 for Stroke of Luck');
        result.naturalRoll = 20;
        result.checkTotal = strokeOfLuckTotal(
          params.checkTotal,
          params.originalRoll,
        );
      }
      state.counters.rerolledTests.push(params.eventId);
      result.success = checkSucceeded(result.checkTotal, params.dc);
      result.mustUseNewRoll = true;
      result.recordOnly = true;
      break;
    }
    case 'spark-damage':
    case 'turn-undead':
    case 'abjure': {
      if (params.confirmed !== true || !targets.length)
        fail('Confirm eligible visible creatures and the stated range');
      if (
        !inventory.some(
          (i) =>
            i.definitionId &&
            require('../../equipment/inventory').definition(i.definitionId)
              .focus === 'holy',
        ) &&
        !(
          option.handler === 'abjure' &&
          [character.loadout.mainHand, character.loadout.offHand].some((id) =>
            inventory.find(
              (i) =>
                i.instanceId === id &&
                i.definitionId &&
                require('../../equipment/inventory').definition(i.definitionId)
                  .kind === 'weapon',
            ),
          )
        )
      )
        fail('Present a Holy Symbol or, for Abjure Foes, a held weapon');
      result.save = { ...option.preview.save };
      result.rangeFeet = divineChannelRange(option.handler);
      if (option.handler === 'spark-damage') {
        if (
          targets.length !== 1 ||
          targets[0] === self ||
          !divineSparkDamageTypes.includes(params.damageType)
        )
          fail(
            'Divine Spark requires one other creature and Radiant or Necrotic damage',
          );
        result.damage = nonnegativeAbilityAmount(rollAbility(option, result));
        result.damageType = params.damageType;
        result.save.successDamage = damageOnSuccessfulSave(
          result.damage,
          'half',
        );
        result.recordOnly = true;
      } else {
        if (
          option.handler === 'abjure' &&
          targets.length >
            abjureFoesTargetLimit(summary.attributeModifiers.spirit)
        )
          fail('Abjure Foes target limit exceeded');
        effect.expiresAt =
          effect.createdAt + abilityEffectDuration(option.handler) * 1000;
        Object.assign(effect, turningConditions(option.handler));
        if (option.handler === 'turn-undead') {
          effect.fleeCaster = true;
          effect.endsOnCasterIncapacitated = true;
          if (params.sear !== undefined && typeof params.sear !== 'boolean')
            fail('Choose whether to apply Sear Undead');
          if (params.sear) {
            if (!searUndeadUnlocked(level))
              fail('Sear Undead requires Doctor five');
            Object.assign(
              result,
              searUndeadOutcome(rollAbility(option, result)),
            );
          }
        } else
          effect.targetTurnRestriction =
            'Choose only movement, one Action or one Bonus Action';
      }
      break;
    }
    case 'keeper-stabilize':
    case 'keeper-heal':
    case 'keeper-dawn':
    case 'plague-antidote':
    case 'plague-quarantine':
    case 'clean-bill':
    case 'lay-poison':
    case 'spark-heal':
    case 'lay-heal':
    case 'warden-touch':
    case 'triage':
    case 'triage-antidote':
    case 'impossible-operation':
    case 'preserve-life':
      require('./treatmentAbilities').apply({
        payload: p,
        feature,
        c,
        summary,
        option,
        params,
        targets,
        effect,
        result,
        state,
        self,
        level,
        heal,
        kit,
        rollAbility,
        spend,
      });
      break;
    case 'measured-charge':
    case 'grand-battery':
      Object.assign(
        result,
        require('./cinderOperations').activate(
          c,
          summary,
          option,
          params,
          targets,
          effect,
        ),
      );
      break;
    case 'relay-place':
    case 'relay-move':
    case 'relay-proximity':
    case 'relay-discharge':
    case 'salvage':
    case 'ghost-repair':
    case 'ghost-sabotage':
    case 'barrier':
    case 'barrier-hour':
    case 'barrier-reduce':
      require('./constructedObjectAbilities').apply({
        c,
        summary,
        option,
        params,
        targets,
        effect,
        result,
        state,
        self,
        level,
        temp,
        rollAbility,
      });
      break;
    case 'tactical-mind': {
      if (
        params.confirmed !== true ||
        typeof params.eventId !== 'string' ||
        !params.eventId.trim() ||
        params.eventId.length > 100 ||
        !Number.isSafeInteger(params.checkTotal) ||
        params.checkTotal < -100 ||
        params.checkTotal > 1000 ||
        !Number.isSafeInteger(params.dc) ||
        params.dc < 1 ||
        params.dc > 1000 ||
        params.checkTotal >= params.dc
      )
        fail('Record one GM-confirmed failed ability check, its total and DC');
      state.counters.tacticalMindChecks ??= [];
      if (state.counters.tacticalMindChecks.includes(params.eventId))
        fail('Tactical Mind already resolved this check');
      Object.assign(
        result,
        tacticalMindOutcome(
          params.checkTotal,
          rollAbility(option, result),
          params.dc,
        ),
      );
      if (result.refunded) state.pools['gunslinger:second-wind']++;
      state.counters.tacticalMindChecks.push(params.eventId);
      result.recordOnly = true;
      break;
    }
    case 'action-surge': {
      const ownerTurn = state.ownerTurn?.open ? state.ownerTurn.id : null;
      const turnId =
        ownerTurn ?? (typeof p.turnId === 'string' ? p.turnId.trim() : null);
      if (
        (state.inCombat && !ownerTurn) ||
        (ownerTurn && p.turnId !== undefined && p.turnId !== ownerTurn)
      )
        fail('Action Surge requires your current recorded owner turn');
      if (
        params.confirmed !== true ||
        !require('../../spells/castingTurn').validLabel(turnId) ||
        !actionSurgeAdditionalActions.includes(params.extraAction)
      )
        fail('Choose a non-Magic action and confirm it is your turn');
      state.counters.actionSurgeTurns ??= [];
      if (state.counters.actionSurgeTurns.includes(turnId))
        fail('Action Surge is limited to once on a turn');
      state.counters.actionSurgeTurns.push(turnId);
      result.additionalAction = params.extraAction;
      result.recordOnly = true;
      break;
    }
    case 'second-wind': {
      heal(rollAbility(option, result));
      const movement = tacticalShiftMovement(level, summary.movement.walk);
      if (movement) result.tacticalShift = movement;
      break;
    }
    case 'tireless':
      temp(rollAbility(option, result));
      break;

    case 'rage': {
      const armor = character.inventory.find(
        (i) => i.instanceId === character.loadout.armor,
      );
      if (
        armor &&
        require('../../equipment/inventory').definition(armor.definitionId)
          .category === 'heavy'
      )
        fail('Heavy armor prevents Rage');
      const rage = rageActivation(
        level,
        summary.paths.reaver,
        summary.movement.walk,
      );
      state.effects = state.effects.filter(
        (e) => !e.concentration && !e.rage && !e.walkingStorm,
      );
      state.concentrationChecks = [];
      effect.expiresAt =
        effect.createdAt + abilityEffectDuration(option.handler) * 1000;
      effect.rage = true;
      if (rage.cleansedConditions.length)
        state.conditions = state.conditions.filter(
          (c) => !rage.cleansedConditions.includes(c.conditionId),
        );
      if (rage.pounce) result.instinctivePounce = rage.pounce;
      if (rage.ends) effect.ends = rage.ends;
      break;
    }
    case 'innate':
      effect.expiresAt =
        effect.createdAt + abilityEffectDuration(option.handler) * 1000;
      break;
    case 'veil':
      Object.assign(effect, veilEffect());
      break;
    case 'wings':
      effect.expiresAt =
        effect.createdAt + abilityEffectDuration(option.handler) * 1000;
      effect.flySpeed = abilityFlightSpeed(option.handler);
      break;
    case 'sense':
      effect.expiresAt =
        effect.createdAt + abilityEffectDuration(option.handler) * 1000;
      break;
    case 'sacred': {
      const attack = require('../../equipment/equipmentView')
        .derive(c)
        .attacks.find(
          (a) => a.instanceId === params.objectId && readyMeleeWeapon(a),
        );
      if (params.confirmed !== true || targets.length || !attack)
        fail('Confirm taking the Attack action with one held Melee weapon');
      state.effects = state.effects.filter((e) => !e.sacredWeaponId);
      effect.sacredWeaponId = params.objectId;
      effect.expiresAt =
        effect.createdAt + abilityEffectDuration(option.handler) * 1000;
      Object.assign(effect, sacredWeaponLighting());
      result.sacredWeaponAttackBonus = sacredWeaponAttackBonus(
        summary.attributeModifiers.spirit,
      );
      break;
    }
    case 'nimbus':
      if (params.confirmed !== true || targets.length)
        fail('Confirm activating Holy Nimbus on your own Aura of Protection');
      state.effects = state.effects.filter((e) => !e.holyNimbus);
      effect.holyNimbus = true;
      effect.expiresAt =
        effect.createdAt + abilityEffectDuration(option.handler) * 1000;
      break;
    case 'nimbus-pulse': {
      if (
        params.confirmed !== true ||
        targets.length !== 1 ||
        targets.includes(self) ||
        !state.effects.some((e) => e.holyNimbus) ||
        !summary.auraOfProtection ||
        require('../../combat/vitality/vitality').incapacitated(state) ||
        typeof p.turnId !== 'string' ||
        !p.turnId.trim() ||
        p.turnId.length > 100
      )
        fail(
          'Confirm one enemy starts its turn inside your conscious active Holy Nimbus aura',
        );
      state.counters.nimbusPulses ??= [];
      const key = targets[0] + ':' + p.turnId;
      if (
        state.counters.nimbusPulses.includes(key) ||
        state.counters.nimbusPulses.length >= 200
      )
        fail(
          'Holy Nimbus already resolved this enemy turn or its journal is full',
        );
      state.counters.nimbusPulses.push(key);
      Object.assign(
        result,
        holyNimbusPulse(
          level,
          summary.attributeModifiers.spirit,
          summary.trainingBonus,
        ),
      );
      result.recordOnly = true;
      break;
    }
    case 'presence':
      if (params.confirmed !== true || !targets.length)
        fail('Confirm chosen visible creatures in your thirty-foot Emanation');
      effect.expiresAt =
        effect.createdAt + abilityEffectDuration(option.handler) * 1000;
      result.save = { ...option.preview.save };
      Object.assign(effect, intimidatingPresenceEffect(result.save));
      break;
    case 'bloodwake-retaliation': {
      if (
        params.confirmed !== true ||
        targets.length !== 1 ||
        typeof params.eventId !== 'string' ||
        !params.eventId.trim() ||
        params.eventId.length > 100
      )
        fail(
          'Confirm damage taken from this one creature within five feet and a stable trigger ID',
        );
      const attack =
        params.mode === 'unarmed'
          ? null
          : require('../../equipment/equipmentView')
              .derive(c)
              .attacks.find(
                (a) => a.instanceId === params.objectId && readyMeleeWeapon(a),
              );
      if (params.mode !== 'unarmed' && !attack)
        fail('Choose an equipped melee weapon or Unarmed Strike');
      state.counters.bloodwakeRetaliation ??= [];
      if (
        state.counters.bloodwakeRetaliation.includes(params.eventId) ||
        state.counters.bloodwakeRetaliation.length >= 200
      )
        fail(
          'Retaliation already resolved this damage trigger or journal is full',
        );
      state.counters.bloodwakeRetaliation.push(params.eventId);
      result.grantedAttack = {
        targetId: targets[0],
        weaponId: attack?.instanceId ?? null,
        unarmed: !attack,
        actionType: 'reaction',
      };
      result.recordOnly = true;
      break;
    }
    case 'silent-keel': {
      if (
        params.confirmed !== true ||
        !silentKeelTargetsEligible(params.mode, targets.length)
      )
        fail(
          'Confirm one vehicle or up to six willing creatures within 30 feet',
        );
      if (params.mode === 'creatures') {
        effect.targetIds = targets.map((id) => (id === 'self' ? self : id));
        if (new Set(effect.targetIds).size !== effect.targetIds.length)
          fail('Choose distinct Silent Keel creatures');
      } else {
        if (!silentKeelVehicleEligible(params.vehicleLengthFeet))
          fail('Silent Keel covers a vehicle up to 100 feet long');
        effect.vehicleLengthFeet = params.vehicleLengthFeet;
      }
      effect.concentration = true;
      effect.expiresAt =
        effect.createdAt + abilityEffectDuration(option.handler) * 1000;
      effect.mode = params.mode;
      break;
    }
    case 'unseen-passage':
      effect.expiresAt =
        effect.createdAt + abilityEffectDuration(option.handler) * 1000;
      break;
    case 'unseen-consequence': {
      if (
        params.confirmed !== true ||
        typeof p.turnId !== 'string' ||
        !p.turnId.trim() ||
        p.turnId.length > 100 ||
        !state.effects.some(
          (e) =>
            e.featureId === feature.id &&
            e.optionId.endsWith('#main') &&
            e.expiresAt > require('../../combat/effects/clock').now(state),
        )
      )
        fail(
          'Confirm ending this turn inside a structure during Unseen Passage',
        );
      state.counters.unseenTurns ??= [];
      if (state.counters.unseenTurns.includes(p.turnId))
        fail('This turn consequence was already applied');
      state.counters.unseenTurns.push(p.turnId);
      result.damage = rollAbility(option, result);
      const terms = unseenPassageCollisionTerms();
      result.damageOutcome = require('../../combat/vitality/vitality').damage(
        c,
        summary,
        {
          amount: result.damage,
          damageType: terms.damageType,
          confirmed: true,
        },
      );
      result.damage = result.damageOutcome.damage;
      Object.assign(result, terms);
      result.recordOnly = true;
      break;
    }
    case 'squall': {
      const squall = borrowedSquall(
        level,
        summary.attributeModifiers.instinct,
        option.key,
      );
      const exempt = params.exemptTargets ?? [];
      if (
        params.confirmed !== true ||
        targets.length ||
        !Array.isArray(exempt) ||
        new Set(exempt).size !== exempt.length ||
        exempt.length > squall.exemptionLimit ||
        exempt.some(
          (id) => typeof id !== 'string' || !id.trim() || id.length > 100,
        )
      )
        fail(
          "Confirm a Squall center within sixty feet and distinct visible exemptions within Borrowed Squall's limit",
        );
      effect.radius = squall.radius;
      effect.zone = option.key;
      effect.exemptTargets = exempt;
      effect.ends = squall.ends;
      effect.heavilyObscured = squall.heavilyObscured;
      effect.rangedWeaponAttacksThroughDisadvantage =
        squall.rangedWeaponAttacksThroughDisadvantage;
      effect.difficultTerrain = squall.difficultTerrain;
      break;
    }
    case 'broker-credit': {
      const squall = state.effects.find(
        (e) =>
          e.id === params.objectId &&
          e.featureId === 'path:storm-broker:barometer-instinct:3',
      );
      if (
        params.confirmed !== true ||
        !squall ||
        targets.length !== 1 ||
        targets.includes(self) ||
        state.ownerTurn?.open ||
        !state.inCombat ||
        !state.initiative?.combatId ||
        !Number.isSafeInteger(params.roundNumber) ||
        params.roundNumber < 1 ||
        params.roundNumber > 100000 ||
        typeof p.turnId !== 'string' ||
        !p.turnId.trim() ||
        p.turnId.length > 100 ||
        typeof params.eventId !== 'string' ||
        !params.eventId.trim() ||
        params.eventId.length > 100
      )
        fail(
          'Confirm a combat round and one visible ally within sixty feet succeeded inside your active Squall outside your turn',
        );
      state.counters.brokerCredits ??= [];
      const combatId = state.initiative.combatId,
        key = combatId + ':' + params.roundNumber,
        history = state.counters.brokerCredits;
      if (
        history.some((r) => r.key === key || r.eventId === params.eventId) ||
        history.length >= 200 ||
        history.some(
          (r) => r.combatId === combatId && r.roundNumber > params.roundNumber,
        )
      )
        fail(
          "Captain's Credit already granted this round, success already used, round moved backward or journal is full",
        );
      history.push({
        key,
        eventId: params.eventId,
        combatId,
        roundNumber: params.roundNumber,
      });
      result.temporaryHealthGrant = {
        amount: captainsCreditHealth(
          summary.trainingBonus,
          summary.attributeModifiers.instinct,
        ),
        targetIds: targets,
        metadata: { source: option.featureId, sourceCharacterId: self },
      };
      result.creditRound = params.roundNumber;
      result.recordOnly = true;
      break;
    }

    default:
      fail('Ability handler is not implemented');
  }
  if (effect.concentration)
    state.effects = state.effects.filter((e) => !e.concentration);
  if (
    (result.saveAdvantageEffect ||
      result.endsCondition ||
      result.endsConditions ||
      result.stabilize ||
      result.restoresHealthTo !== undefined) &&
    (!targets.length || targets.includes(self))
  )
    require('../../combat/effects/healingEffects').targetEffects(state, {
      ...result,
      healing: 0,
    });
  if (option.handler === 'squall')
    state.effects = state.effects.filter((e) => e.featureId !== feature.id);
  if (!result.recordOnly) state.effects.push(effect);
  if (state.effects.length > 200)
    fail('Too many active effects; end expired effects first');
  state.revision++;
  require('../runtime/runtimeValidation').validateProjected(summary, state);
  character.rulesRuntime = state;
  character.inventory = c.inventory;
  return { ...result, effect };
}
module.exports = { list, activate, availableKit };

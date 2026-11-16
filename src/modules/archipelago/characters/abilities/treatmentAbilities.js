const {
  abilityEffectDuration,
  keeperTreatmentTerms,
  quarantineEffect,
  plagueTargetLimit,
} = require('@crossworld/sanguine-engine/callings');

const { impossibleOperation } = require('@crossworld/sanguine-engine/callings');
const {
  preserveLife,
  triageConditionOutcome,
} = require('@crossworld/sanguine-engine/callings');

const { restoringTouchCost } = require('@crossworld/sanguine-engine/callings');
const {
  cleanBillEndedConditions,
} = require('@crossworld/sanguine-engine/callings');

const {
  healingAllocationTotal,
} = require('@crossworld/sanguine-engine/spells/healing');
const { poisonCureOutcome } = require('@crossworld/sanguine-engine/callings');
const { fail } = require('../commandEnvelope');

function apply({
  payload,
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
}) {
  switch (option.handler) {
    case 'keeper-stabilize':
    case 'keeper-heal':
    case 'keeper-dawn': {
      if (
        params.confirmed !== true ||
        targets.length !== 1 ||
        targets[0] === self
      )
        fail(
          'Confirm one other creature and the stated zero-Health or failed-death-save trigger',
        );
      const { temporaryHealth, rangeFeet, ...benefits } = keeperTreatmentTerms(
        option.handler,
        {
          level,
          discipline: summary.pathSelections.doctor.pathDiscipline,
          instinctModifier: summary.attributeModifiers.instinct,
        },
      );
      Object.assign(result, benefits);
      if (temporaryHealth !== undefined)
        result.temporaryHealthGrant = {
          amount: temporaryHealth,
          targetIds: targets,
        };
      result.rangeFeet = rangeFeet;
      result.recordOnly = true;
      break;
    }
    case 'plague-antidote':
    case 'plague-quarantine': {
      if (
        params.confirmed !== true ||
        targets.length < 1 ||
        targets.length > plagueTargetLimit(option.handler)
      )
        fail('Confirm eligible targets within 30 feet');
      if (option.handler === 'plague-antidote') {
        Object.assign(result, poisonCureOutcome());
        result.recordOnly = true;
      } else {
        effect.expiresAt =
          effect.createdAt + abilityEffectDuration(option.handler) * 1000;
        Object.assign(effect, quarantineEffect());
        result.save = { ...option.preview.save };
      }
      break;
    }
    case 'clean-bill':
      if (params.confirmed !== true || targets.length > 1)
        fail('Confirm one creature within reach');
      kit(c, option.preview.kitCharges);
      heal(rollAbility(option, result));
      result.endsConditions = [...cleanBillEndedConditions];
      result.recordOnly = true;
      break;
    case 'lay-poison':
      if (targets.length > 1) fail('Choose one creature to cure Poisoned');
      Object.assign(result, poisonCureOutcome());
      result.recordOnly = true;
      break;
    case 'spark-heal':
      heal(rollAbility(option, result));
      break;
    case 'lay-heal':
      spend(state, 'warden:lay-on-hands', params.amount);
      heal(params.amount);
      break;
    case 'warden-touch': {
      const chosen = params.conditions,
        cost = restoringTouchCost(chosen);
      if (targets.length !== 1 || cost === null || params.confirmed !== true)
        fail('Choose one touched creature and distinct eligible conditions');
      spend(state, 'warden:lay-on-hands', cost);
      result.endsConditions = chosen;
      result.recordOnly = true;
      break;
    }
    case 'triage':
    case 'triage-antidote': {
      if (params.confirmed !== true)
        fail(
          'Confirm you can see and touch the Triage recipient within 5 feet',
        );
      const target = payload.targetIds?.[0];
      if (
        !target ||
        payload.targetIds.length !== 1 ||
        typeof params.targetRestEpoch !== 'string' ||
        !params.targetRestEpoch.trim()
      )
        fail('Triage requires one stable target and its rest epoch');
      state.targetLocks ??= {};
      const key = target + ':' + params.targetRestEpoch;
      if (state.targetLocks[key])
        fail('Target already received Triage since its last rest');
      kit(c, option.preview.kitCharges);
      state.targetLocks[key] = option.id;
      const endsCondition = triageConditionOutcome(
        option.handler,
        level,
        summary.pathSelections.doctor.surgicalDiscipline,
      );
      if (option.handler === 'triage') {
        heal(rollAbility(option, result));
        if (endsCondition) result.endsCondition = endsCondition;
      } else {
        result.endsCondition = endsCondition;
        result.saveAdvantageEffect = {
          id: require('node:crypto').randomUUID(),
          featureId: feature.id,
          name: 'Toxicology: Advantage on saves against Poisoned',
          poisonedSaveAdvantage: true,
          createdAt: effect.createdAt,
          expiresAt: effect.createdAt + 60000,
        };
      }
      break;
    }
    case 'impossible-operation': {
      const outcome = impossibleOperation({
        ...params,
        selfTarget: targets.includes(self),
      });
      if (!outcome)
        fail('Confirm another consenting, intact body dead within one minute');
      kit(c, option.preview.kitCharges);
      Object.assign(result, outcome);
      break;
    }
    case 'preserve-life': {
      const treatment = preserveLife(level);
      const allocations = params.allocations,
        error =
          'Allocate positive healing to distinct Bloodied creatures within thirty feet, up to five times Doctor level';
      if (
        params.confirmed !== true ||
        !targets.length ||
        !Array.isArray(allocations) ||
        allocations.length !== targets.length ||
        allocations.some(
          (a, i) =>
            !a ||
            Object.keys(a).some((k) => !['targetId', 'amount'].includes(k)) ||
            a.targetId !== targets[i] ||
            !Number.isSafeInteger(a.amount) ||
            a.amount < 1,
        )
      )
        fail(error);
      const healingBudget = healingAllocationTotal(allocations);
      if (healingBudget > treatment.maximumHealing) fail(error);
      if (
        !c.inventory.some(
          (i) =>
            i.definitionId &&
            require('../../equipment/inventory').definition(i.definitionId)
              .focus === 'holy',
        )
      )
        fail('Preserve Life requires presenting a carried Holy Symbol');
      result.healingAllocations = allocations;
      result.healingBudget = healingBudget;
      result.healingCapFraction = treatment.healingCapFraction;
      result.requireBloodied = true;
      result.recordOnly = true;
      const personal = allocations.find((a) => a.targetId === self);
      if (personal)
        require('../../combat/effects/healingEffects').targetEffects(state, {
          ...result,
          healing: personal.amount,
        });
      break;
    }
  }
}
module.exports = { apply };

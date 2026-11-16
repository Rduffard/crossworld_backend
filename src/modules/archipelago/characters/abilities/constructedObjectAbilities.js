const {
  abilityEffectDuration,
} = require('@crossworld/sanguine-engine/callings');
const {
  damageOnSuccessfulSave,
} = require('@crossworld/sanguine-engine/combat/save-damage');

const {
  ghostRepairAmount,
  ghostService,
} = require('@crossworld/sanguine-engine/callings');
const {
  breakwaterBarrier,
  aetherRelay,
  salvageCredit,
} = require('@crossworld/sanguine-engine/callings');
const {
  barrierDamageReduction,
} = require('@crossworld/sanguine-engine/callings');

const { relayDischargeTerms } = require('@crossworld/sanguine-engine/callings');
const { fail } = require('../commandEnvelope');

function apply({
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
}) {
  switch (option.handler) {
    case 'relay-place': {
      if (params.confirmed !== true)
        fail('Confirm unoccupied relay placement within 30 feet');
      const relays = state.effects.filter(
        (e) =>
          e.objectType === 'relay' &&
          e.health.current > 0 &&
          e.expiresAt > require('../../combat/effects/clock').now(state),
      );
      const device = aetherRelay(
        level,
        summary.pathSelections.shipwright.pathDiscipline,
      );
      const cap = device.capacity;
      if (relays.length >= cap) {
        const replaced =
          cap === 1
            ? relays[0]
            : relays.find((e) => e.id === params.replaceObjectId);
        if (!replaced) fail('Choose which relay to dismiss');
        state.effects = state.effects.filter((e) => e.id !== replaced.id);
      } else if (params.replaceObjectId !== undefined)
        fail('No relay needs replacement');
      effect.objectType = 'relay';
      effect.objectId = effect.id;
      effect.guard = device.guard;
      effect.health = {
        current: device.maximumHealth,
        max: device.maximumHealth,
      };
      effect.immunities = device.immunities;
      effect.mobile = device.mobile;
      effect.sizeFeet = device.sizeFeet;
      effect.expiresAt =
        effect.createdAt + abilityEffectDuration(option.handler) * 1000;
      effect.withinTenFeet = false;
      break;
    }
    case 'relay-move':
    case 'relay-proximity':
    case 'relay-discharge': {
      const relay = state.effects.find(
        (e) =>
          e.objectType === 'relay' &&
          e.id === params.objectId &&
          e.health.current > 0 &&
          e.expiresAt > require('../../combat/effects/clock').now(state),
      );
      if (!relay) fail('Choose a live owned relay');
      if (option.handler === 'relay-move') {
        const { movementFeet } = aetherRelay(
          level,
          summary.pathSelections.shipwright.pathDiscipline,
        );
        if (
          !relay.mobile ||
          params.confirmed !== true ||
          !Number.isSafeInteger(params.distanceFeet) ||
          params.distanceFeet < 0 ||
          params.distanceFeet > movementFeet
        )
          fail(
            'Mobile relay movement is at most 15 feet, staying within 60 feet of you',
          );
        relay.withinTenFeet = false;
        relay.lastMovementFeet = params.distanceFeet;
      } else if (option.handler === 'relay-proximity') {
        if (typeof params.withinTenFeet !== 'boolean')
          fail('Record whether you are within ten feet of this relay');
        relay.withinTenFeet = params.withinTenFeet;
      } else {
        if (params.confirmed !== true)
          fail(
            'Confirm all creatures within ten feet are included, without exempting allies',
          );
        const terms = relayDischargeTerms();
        result.damage = rollAbility(option, result);
        result.damageType = terms.damageType;
        result.save = {
          ...option.preview.save,
          success: terms.successfulSave,
          successDamage: damageOnSuccessfulSave(
            result.damage,
            terms.successfulSave,
          ),
        };
        result.radiusFeet = terms.radiusFeet;
        result.discharge = { relayId: relay.id, targetIds: [...targets] };
        state.effects = state.effects.filter((e) => e.id !== relay.id);
      }
      // Movement/proximity are changes to the existing object, not new persistent effects.
      result.recordOnly = true;
      break;
    }
    case 'salvage': {
      if (
        params.confirmed !== true ||
        typeof params.objectId !== 'string' ||
        !params.objectId.trim() ||
        params.objectId.length > 100
      )
        fail('Confirm a salvageable wreck with its stable ID');
      if (
        !Number.isSafeInteger(params.salvageMinutes) ||
        params.salvageMinutes < 10
      )
        fail('Confirm at least ten completed minutes of salvage');
      const credit = salvageCredit(level);
      state.salvageCp = (state.salvageCp ?? 0) + credit;
      result.salvageCp = credit;
      effect.wreckId = params.objectId;
      effect.salvageMinutes = params.salvageMinutes;
      break;
    }
    case 'ghost-repair':
    case 'ghost-sabotage': {
      if (
        params.confirmed !== true ||
        typeof params.objectId !== 'string' ||
        !params.objectId.trim() ||
        params.objectId.length > 100
      )
        fail('Confirm a nonmagical object touched, identified by stable ID');
      const repairing = option.handler === 'ghost-repair';
      const { tool, discoveryDC } = ghostService(
        option.handler,
        summary.spellcasting.shipwright.saveDC,
      );
      if (
        !c.inventory.some(
          (item) => item.definitionId === tool && item.quantity > 0,
        )
      )
        fail(
          repairing
            ? "Ghost Patch requires carried carpenter's tools"
            : "Concealing tampering requires carried thieves' tools",
        );
      effect.objectId = params.objectId;
      if (repairing) {
        if (
          !Number.isSafeInteger(params.objectMissingHealth) ||
          params.objectMissingHealth < 1
        )
          fail("Record the object's missing Health");
        result.objectHealing = ghostRepairAmount(
          params.objectMissingHealth,
          rollAbility(option, result),
        );
        effect.objectHealing = result.objectHealing;
      } else effect.discoveryDC = discoveryDC;
      break;
    }
    case 'barrier':
    case 'barrier-hour': {
      if (params.confirmed !== true)
        fail(
          'Confirm unoccupied barrier placement within 30 feet without trapping creatures',
        );
      const barrier = breakwaterBarrier(
        level,
        summary.trainingBonus,
        summary.pathSelections.shipwright.fortification,
        summary.attributeModifiers.wit,
      );
      const passers = params.passers ?? [];
      if (
        !Array.isArray(passers) ||
        new Set(passers).size !== passers.length ||
        passers.some(
          (id) => typeof id !== 'string' || !id.trim() || id.length > 100,
        ) ||
        passers.length > barrier.maximumPassers
      )
        fail('Barrier passers exceed Harbor Geometry limit');
      effect.objectId = params.objectId ?? effect.id;
      effect.width = barrier.width;
      effect.height = barrier.height;
      for (const [key, field] of [
        ['widthFeet', 'width'],
        ['heightFeet', 'height'],
      ])
        if (params[key] !== undefined) {
          if (
            !Number.isSafeInteger(params[key]) ||
            params[key] < 1 ||
            params[key] > effect[field]
          )
            fail('Invalid barrier dimensions');
          effect[field] = params[key];
        }
      if (
        params.bend !== undefined &&
        (typeof params.bend !== 'boolean' || (params.bend && !barrier.canBend))
      )
        fail('Barrier bend requires Harbor Geometry');
      effect.passers = passers;
      effect.bend = params.bend ?? false;
      effect.thickness = 1;
      effect.immunities = ['poison', 'psychic'];
      effect.resistance = barrier.resistance;
      effect.guard = barrier.guard;
      effect.health = {
        current: barrier.maximumHealth,
        max: barrier.maximumHealth,
      };
      effect.cover = barrier.cover;
      effect.expiresAt =
        effect.createdAt + abilityEffectDuration(option.handler) * 1000;
      if (
        summary.pathSelections.shipwright.fortification === 'shelter' &&
        targets.length
      ) {
        result.temporaryHealthGrant = {
          amount: summary.trainingBonus,
          targetIds: targets,
        };
        if (targets.includes(self)) temp(summary.trainingBonus);
      }
      state.effects = state.effects.filter((e) => e.objectType !== 'barrier');
      effect.objectType = 'barrier';
      break;
    }
    case 'barrier-reduce':
      if (
        params.confirmed !== true ||
        targets.length !== 1 ||
        !state.effects.some(
          (e) =>
            e.objectType === 'barrier' &&
            e.expiresAt > require('../../combat/effects/clock').now(state) &&
            e.health.current > 0,
        )
      )
        fail(
          'Confirm one damaged creature within five feet of your live barrier',
        );
      result.damageReduction = barrierDamageReduction(
        rollAbility(option, result),
      );
      break;
  }
}
module.exports = { apply };

const {
  potentSpellcastingVitality,
  riderDamageDice,
  damagingCantrip,
  damageRiderSpellEligible,
  inoculatedSaveEffect,
  divineStrikeDamageTypes,
  riderRolledDamage,
  riderModifierDamage,
  potentCantripOutcome,
} = require('@crossworld/sanguine-engine/callings');
const {
  grantTemporaryHealth,
} = require('@crossworld/sanguine-engine/vitality');
const { randomInt } = require('node:crypto');
function fail(message) {
  throw Object.assign(new Error(message), { statusCode: 422 });
}
function apply(c, s, o, p, targets, effect, result, turnId) {
  if (
    p.confirmed !== true ||
    require('./vitality/vitality').incapacitated(c.rulesRuntime)
  )
    fail(
      'Confirm the actual spell damage or weapon hit and its eligible target',
    );
  const state = c.rulesRuntime,
    self = String(c._id ?? 'self'),
    clinical = s.pathSelections.doctor?.clinicalAttribute ?? 'instinct';
  if (
    typeof p.eventId !== 'string' ||
    !p.eventId.trim() ||
    p.eventId.length > 100
  )
    fail('Record a stable hit or spell damage event ID');
  const journal = (key) => {
    state.counters.damageRiders ??= [];
    if (
      state.counters.damageRiders.some((r) => r.key === key) ||
      state.counters.damageRiders.length >= 200
    )
      fail('This damage rider already resolved or the journal is full');
    state.counters.damageRiders.push({
      key,
      eventId: p.eventId,
      source: o.featureId,
      sourceId: p.objectId,
      targetIds: [...targets],
    });
  };
  const casting = () => {
    const cast = state.castings?.find((x) => x.castId === p.objectId),
      spell = require('../system/rules').spells.find(
        (x) => x.id === cast?.spellId,
      );
    if (!cast || !spell) fail('Choose your recorded source casting');
    return { cast, spell };
  };
  const rollRiderDice = () => {
    const { count, sides } = riderDamageDice(o.handler, p.mode, {
      doctorLevel: s.callingLevels?.doctor,
      huntersMarkDie: s.mechanics?.navigator?.huntersMarkDie,
    });
    return Array.from({ length: count }, () => randomInt(1, sides + 1));
  };
  result.recordOnly = true;
  switch (o.handler) {
    case 'rider-inoculate': {
      const cast = state.castings?.find((c) => c.castId === p.objectId),
        healing = cast?.healingUses?.find((h) => h.eventId === p.eventId);
      if (
        !cast ||
        cast.slotLevel < 1 ||
        targets.length !== 1 ||
        !healing?.targetIds.includes(targets[0])
      )
        fail(
          'Choose a recorded level-one-or-higher spell healing event and one recipient whose Health it restored',
        );
      journal('inoculated:' + cast.castId + ':' + p.eventId);
      const createdAt = require('./effects/clock').now(state),
        { durationSeconds, ...terms } = inoculatedSaveEffect();
      result.saveAdvantageEffect = {
        id: require('node:crypto').randomUUID(),
        featureId: o.featureId,
        name: 'Inoculated: next Poisoned save (end after rolling)',
        ...terms,
        createdAt,
        expiresAt: createdAt + durationSeconds * 1000,
      };
      break;
    }
    case 'rider-mark-secondary': {
      const mark = state.effects.find(
        (e) =>
          e.id === p.objectId &&
          e.featureId === 'spell:hunter-s-mark' &&
          require('./effects/clock').active(state, e),
      );
      if (
        targets.length !== 2 ||
        !mark?.targets?.includes(targets[0]) ||
        targets[0] === targets[1] ||
        typeof turnId !== 'string' ||
        !turnId.trim() ||
        turnId.length > 100 ||
        !state.counters.damageRiders?.some(
          (r) =>
            r.key === 'rider-mark:' + p.eventId &&
            r.sourceId === p.objectId &&
            r.targetIds.includes(targets[0]),
        )
      )
        fail(
          'Choose the same recorded Mark damage event, its marked creature and a different visible creature within thirty feet on a stable turn',
        );
      journal('mark-secondary:' + turnId);
      result.rolls = rollRiderDice();
      Object.assign(result, riderRolledDamage(o.handler, result.rolls));
      result.secondaryTargetId = targets[1];
      break;
    }
    case 'rider-mark':
    case 'rider-mark-transfer': {
      const mark = state.effects.find(
        (e) =>
          e.id === p.objectId &&
          e.featureId === 'spell:hunter-s-mark' &&
          require('./effects/clock').active(state, e),
      );
      if (!mark || targets.length !== 1)
        fail(
          "Choose your active Hunter's Mark casting and one eligible target",
        );
      journal(o.handler + ':' + p.eventId);
      if (o.handler === 'rider-mark') {
        if (!mark.targets?.includes(targets[0]))
          fail(
            "Hunter's Mark damage requires hitting its current marked target",
          );
        result.rolls = rollRiderDice();
        Object.assign(result, riderRolledDamage(o.handler, result.rolls));
      } else {
        if (
          !state.ownerTurn?.open ||
          state.ownerTurn.id !== turnId ||
          p.mode !== 'marked-target-zero-health' ||
          mark.targets?.includes(targets[0])
        )
          fail(
            'Confirm the previous marked target dropped to zero Health; choose another visible creature within range as a Bonus Action on your turn',
          );
        mark.targets = [targets[0]];
        const cast = state.castings?.find((c) => c.castId === mark.id);
        if (cast) cast.targets = [targets[0]];
        result.markMovedTo = targets[0];
        result.originalExpiry = mark.expiresAt;
        result.noSlotSpent = true;
      }
      break;
    }
    case 'rider-divine':
    case 'rider-radiant': {
      if (targets.length !== 1) fail('Choose one creature hit');
      const attack =
        p.mode === 'unarmed' || p.mode === 'unarmed-critical'
          ? null
          : require('../equipment/equipmentView')
              .derive(c)
              .attacks.find(
                (a) => a.instanceId === p.objectId && !a.requiresTwoHandGrip,
              );
      if (
        (o.handler === 'rider-divine' && !attack) ||
        (o.handler === 'rider-radiant' &&
          attack?.weapon.type !== 'melee' &&
          !['unarmed', 'unarmed-critical'].includes(p.mode))
      )
        fail(
          'Choose an eligible equipped weapon hit or a Warden Unarmed Strike',
        );
      if (o.handler === 'rider-divine') {
        if (
          !state.ownerTurn?.open ||
          state.ownerTurn.id !== turnId ||
          !divineStrikeDamageTypes.includes(p.damageType)
        )
          fail(
            'Divine Strike requires your owner turn and Radiant or Necrotic damage',
          );
        journal('divine:' + turnId);
      } else journal('radiant:' + p.eventId);
      result.rolls = rollRiderDice();
      Object.assign(
        result,
        riderRolledDamage(o.handler, result.rolls, p.damageType),
      );
      break;
    }
    case 'rider-potent':
    case 'rider-vitality': {
      const { cast, spell } = casting();
      if (
        cast.callingId !== 'doctor' ||
        !damagingCantrip(spell.level, cast.management.damageTypes)
      )
        fail('Choose a recorded damaging Doctor cantrip');
      if (o.handler === 'rider-potent') {
        journal('potent:' + cast.castId + ':' + p.eventId);
        Object.assign(
          result,
          riderModifierDamage(o.handler, s.attributeModifiers, { clinical }),
        );
      } else {
        if (targets.length !== 1)
          fail('Choose yourself or one other creature within sixty feet');
        journal('vitality:' + cast.castId);
        const amount = potentSpellcastingVitality(
          s.attributeModifiers[clinical],
        );
        result.temporaryHealthGrant = {
          amount,
          targetIds: targets,
          metadata: { source: o.featureId, sourceCharacterId: self },
        };
        if (targets.includes(self))
          Object.assign(
            state,
            grantTemporaryHealth(
              state.temporaryHealth,
              amount,
              result.temporaryHealthGrant.metadata,
            ),
          );
      }
      break;
    }
    case 'rider-affinity':
    case 'rider-evocation': {
      const { cast, spell } = casting(),
        affinity = s.pathSelections.tidecaller?.element;
      if (
        !damageRiderSpellEligible(
          o.handler,
          cast.callingId,
          spell.school,
          cast.management.damageTypes,
          affinity,
        )
      )
        fail(
          'Choose an eligible recorded spell dealing the feature damage type or Shipwright Evocation damage',
        );
      journal(o.handler + ':' + cast.castId);
      Object.assign(
        result,
        riderModifierDamage(o.handler, s.attributeModifiers, { affinity }),
      );
      break;
    }
    case 'rider-cantrip-half': {
      const { cast, spell } = casting();
      if (
        !damagingCantrip(spell.level, cast.management.damageTypes) ||
        targets.length !== 1 ||
        !cast.targets?.includes(targets[0]) ||
        !['miss', 'successful-save'].includes(p.mode) ||
        !Number.isSafeInteger(p.amount) ||
        p.amount < 0 ||
        p.amount > 1000000
      )
        fail(
          'Choose a damaged cantrip target that avoided the spell, its original damage and attack/save result',
        );
      journal('potent-half:' + cast.castId + ':' + targets[0]);
      Object.assign(result, potentCantripOutcome(p.amount));
      break;
    }
    default:
      fail('Unknown damage rider');
  }
}
module.exports = { apply };

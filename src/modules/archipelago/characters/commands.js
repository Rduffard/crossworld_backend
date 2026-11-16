const constructionCommands = require('./constructionCommands');
const {
  d20Total,
  checkSucceeded,
} = require('@crossworld/sanguine-engine/dice');
const rules = require('../system/characterSystem');
const { fail, validateEnvelope } = require('./commandEnvelope');
const bindTransaction = require('./commandTransaction');
const turnCommands = require('./turnCommands');
const advanceCharacter = require('./advanceCharacter');
const effectCommands = require('./effectCommands');

function apply(character, body, context = {}) {
  validateEnvelope(body);
  if (!Number.isSafeInteger(character.goldCp) || character.goldCp < 0)
    fail(
      'Recreate this experimental character using integer-copper storage',
      409,
    );
  if (body.expectedRevision !== character.documentRevision)
    fail('Character changed; reload before saving', 409, {
      code: 'revision_conflict',
      fieldPath: 'expectedRevision',
      currentRevision: character.documentRevision,
    });
  const c = structuredClone(character),
    summary = rules.replay(c.rulesLedger),
    p = body.payload;
  if (
    require('./authority').gmCommands.includes(body.type) &&
    c.campaignId &&
    !context.gmAllowed
  )
    fail('This operation requires the campaign GM', 403);
  if (character._id !== undefined) c._id = String(character._id);
  require('./runtime/runtimeValidation').validateEffectIds(
    c.rulesRuntime.effects,
  );
  if (body.type !== 'identity.patch')
    require('../combat/effects/clock').expire(c.rulesRuntime);
  let result = { type: body.type };
  if (body.type === 'attack.record') {
    result = require('../combat/attackRecords').apply(
      c,
      rules.runtime.project(summary, c.rulesRuntime, c),
      p,
    );
  } else if (body.type === 'navigator.prey') {
    result = require('./abilities/grayNetOperations').apply(
      c,
      rules.runtime.project(summary, c.rulesRuntime, c),
      p,
    );
  } else if (body.type === 'equipment.utilize') {
    result = require('../equipment/utilization').apply(
      c,
      rules.runtime.project(summary, c.rulesRuntime, c),
      p,
    );
  } else if (body.type === 'equipment.recover') {
    result = require('../equipment/utilization').recover(c, p);
  } else if (body.type === 'equipment.flame') {
    result = require('../equipment/utilization').flame(c, p);
  } else if (body.type === 'equipment.poison-hit') {
    result = require('../equipment/utilization').poisonHit(c, p);
  } else if (body.type === 'spell.heal') {
    result = require('../spells/healingSpells').apply(
      c,
      rules.runtime.project(summary, c.rulesRuntime, c),
      p,
    );
  } else if (body.type === 'equipment.wear') {
    result = require('../equipment/magic').wear(c, summary, p);
  } else if (body.type === 'scroll.cast') {
    result = require('../equipment/scrolls').cast(
      c,
      rules.runtime.project(summary, c.rulesRuntime, c),
      p,
    );
  } else if (body.type === 'item.cast') {
    result = require('../equipment/chargedItems').cast(
      c,
      rules.runtime.project(summary, c.rulesRuntime, c),
      p,
    );
  } else if (body.type === 'equipment.dawn') {
    if (c.campaignId && !context.gmAllowed)
      fail('Only the campaign GM can record dawn', 403);
    result = require('../equipment/chargedItems').dawn(c, p);
  } else if (
    ['rebuild.preview', 'rebuild.approve', 'rebuild.commit'].includes(body.type)
  ) {
    result = require('./rebuild').apply(c, body.type, p, context);
  } else if (
    ['milestone.authorize', 'equipment.award', 'equipment.sell'].includes(
      body.type,
    )
  ) {
    result = require('./authority').apply(c, summary, body.type, p, {
      ...context,
      gmAllowed: !c.campaignId || context.gmAllowed,
      userId: context.userId ?? String(c.owner ?? 'solo-owner'),
    });
  } else if (body.type === 'spells.discover') {
    result = require('./authority').apply(c, summary, body.type, p, {
      ...context,
      gmAllowed: !c.campaignId || context.gmAllowed,
      userId: context.userId ?? String(c.owner ?? 'solo-owner'),
    });
  } else if (
    ['spells.copy', 'folio.lose', 'folio.rebuild'].includes(body.type)
  ) {
    result = require('../spells/folioOperations').apply(
      c,
      rules.runtime.project(summary, c.rulesRuntime, c),
      body.type,
      p,
      body.operationId,
      summary.spellcasting.shipwright?.folio,
    );
  } else if (body.type === 'tool.check') {
    result = require('../equipment/toolChecks').apply(
      c,
      rules.runtime.project(summary, c.rulesRuntime, c),
      p,
    );
  } else if (body.type === 'strike.resolve') {
    result = require('../combat/strikeOperations').apply(
      c,
      rules.runtime.project(summary, c.rulesRuntime, c),
      p,
    );
  } else if (
    [
      'inspiration.grant',
      'inspiration.spend',
      'initiative.record',
      'scene.record',
      'action.record',
      'feat.use',
    ].includes(body.type)
  ) {
    const projected = rules.runtime.project(summary, c.rulesRuntime, c);
    // Resolve a weapon only after the feat has accepted the trigger and turn.
    const findAttack = (instanceId) =>
      require('../equipment/equipmentView')
        .derive(c, projected)
        .attacks.find((attack) => attack.instanceId === instanceId);
    result = require('./abilities/featOperations').apply(
      c,
      projected,
      body.type,
      p,
      findAttack,
    );
    if (body.type === 'initiative.record')
      require('./runtime/resting').interrupt(c, summary, {
        at: require('../combat/effects/clock').now(c.rulesRuntime),
        reason: 'initiative',
      });
  } else if (
    [
      'condition.record',
      'temp-health.choose',
      'death-save.roll',
      'concentration.resolve',
      'health.damage',
    ].includes(body.type)
  ) {
    result = require('../combat/vitality/vitality').apply(
      c,
      rules.runtime.project(summary, c.rulesRuntime, c),
      body.type,
      p,
    );
    if (body.type === 'health.damage' && result.bloodPriceLoss)
      result.bloodPriceLoss.eventId = body.operationId;
    if (body.type === 'health.damage' && result.damage > 0)
      require('./runtime/resting').interrupt(c, summary, {
        at: require('../combat/effects/clock').now(c.rulesRuntime),
        reason: 'damage',
      });
  } else if (body.type === 'relentless-rage.resolve') {
    if (
      Object.keys(p).some((k) => !['total', 'confirmed'].includes(k)) ||
      (p.total !== undefined &&
        (p.confirmed !== true ||
          !Number.isSafeInteger(p.total) ||
          p.total < -100 ||
          p.total > 200))
    )
      fail('Choose a server Resolve save or a GM-confirmed total');
    const rolls =
      p.total === undefined ? [require('node:crypto').randomInt(1, 21)] : [];
    const total =
      p.total ??
      d20Total(
        rolls[0],
        rules.runtime.project(summary, c.rulesRuntime, c).savingThrowModifiers
          .resolve,
      );
    const dc = c.rulesRuntime.pendingRelentlessRage?.dc;
    require('./abilities/featureOperations').apply(summary, c.rulesRuntime, {
      type: 'relentless-rage',
      value: total,
    });
    c.rulesRuntime.revision++;
    result = {
      type: body.type,
      rolls,
      total,
      dc,
      success: checkSucceeded(total, dc),
    };
  } else if (body.type === 'time.advance') {
    if (
      Object.keys(p).some((k) => !['worldTime', 'confirmed'].includes(k)) ||
      p.confirmed !== true
    )
      fail('Confirm the new world time');
    require('../combat/effects/clock').advance(c.rulesRuntime, p.worldTime);
    c.rulesRuntime.revision++;
  } else if (body.type === 'turn.trigger-end') {
    turnCommands.endTriggerTurn(c.rulesRuntime, p);
  } else if (body.type === 'movement.record') {
    result = turnCommands.recordMovement(c.rulesRuntime, p, body.type);
  } else if (body.type === 'turn.external') {
    turnCommands.recordExternalTurn(c.rulesRuntime, p);
  } else if (body.type === 'turn.start' || body.type === 'turn.end') {
    turnCommands.recordOwnerTurn(c.rulesRuntime, p, body.type, summary, result);
  } else if (body.type === 'rage.extend') {
    turnCommands.extendRage(c.rulesRuntime, p, summary);
  } else if (body.type === 'advance') {
    advanceCharacter(c, p, summary, context);
  } else if (body.type === 'identity.patch') {
    if (Object.keys(p).some((k) => !require('./identity').fields.includes(k)))
      fail('Only narrative fields may be edited');
    Object.assign(c, require('./identity').validate(p));
  } else if (body.type === 'spell.reroll') {
    result = require('../spells/spellRerolls').apply(
      c,
      rules.runtime.project(summary, c.rulesRuntime, c),
      p,
    );
  } else if (body.type === 'contingency.trigger') {
    result = require('../spells/contingency').trigger(
      c,
      rules.runtime.project(summary, c.rulesRuntime, c),
      p,
    );
  } else if (body.type === 'spell.cast') {
    require('./runtime/featState').action(c.rulesRuntime);
    result = require('../spells/spellOperations').cast(c, summary, p);
    if (result.slotLevel > 0)
      require('./runtime/resting').interrupt(c, summary, {
        at: require('../combat/effects/clock').now(c.rulesRuntime),
        reason: 'non-cantrip-spell',
      });
  } else if (body.type === 'ability.activate') {
    if (
      [
        'Action',
        'Bonus Action',
        'Reaction',
        'Magic action',
        'Attack action rider',
      ].includes(
        summary.abilityOptions.find((o) => o.id === p.optionId)?.action,
      )
    )
      require('./runtime/featState').action(c.rulesRuntime);
    result = require('./abilities/abilityOperations').activate(
      c,
      rules.runtime.project(summary, c.rulesRuntime, c),
      p,
      context,
    );
    if (result.damageOutcome?.damage > 0)
      require('./runtime/resting').interrupt(c, summary, {
        at: require('../combat/effects/clock').now(c.rulesRuntime),
        reason: 'damage',
      });
  } else if (body.type === 'silent-keel.end-target') {
    result = effectCommands.endSilentKeelTarget(c.rulesRuntime, p, result);
  } else if (body.type === 'effect.end') {
    effectCommands.endEffect(c.rulesRuntime, p);
  } else if (body.type === 'object.damage') {
    result = constructionCommands.damageObject(c.rulesRuntime, p, summary);
  } else if (
    body.type === 'resource.adjust' ||
    body.type === 'resource.convert'
  ) {
    c.rulesRuntime = require('./resourceCommands').apply(
      summary,
      c.rulesRuntime,
      body.type,
      p,
    );
  } else if (body.type === 'craft.spend-salvage') {
    result = constructionCommands.spendSalvage(c.rulesRuntime, p, summary);
  } else if (
    ['rest.start', 'rest.cancel', 'rest.interrupt', 'rest.complete'].includes(
      body.type,
    )
  ) {
    result = require('./runtime/resting').apply(c, summary, body.type, p);
  } else if (body.type === 'health.apply') {
    if (Object.keys(p).some((k) => !['healthDelta'].includes(k)))
      fail('Invalid Health tracking fields');
    if (!Number.isSafeInteger(p.healthDelta) || p.healthDelta < 0)
      fail('Use the typed damage operation for damage');
    c.rulesRuntime = rules.runtime.update(summary, c.rulesRuntime, {
      expectedRevision: c.rulesRuntime.revision,
      type: 'health',
      ...p,
    });
  } else if (body.type === 'equipment.equip') {
    if (Object.keys(p).some((k) => !['loadout'].includes(k)))
      fail('Invalid equipment fields');
    Object.assign(
      c,
      require('../equipment').update(c, {
        expectedRevision: c.documentRevision,
        ...p,
      }),
    );
  } else if (
    [
      'equipment.buy',
      'equipment.fire',
      'equipment.consume',
      'equipment.split',
      'equipment.merge',
      'equipment.preset.save',
      'equipment.preset.apply',
    ].includes(body.type)
  ) {
    result = require('../equipment/commands').apply(c, body.type, p, summary);
  } else fail('Unsupported character command: ' + body.type);
  if (body.type.startsWith('equipment.')) {
    require('./abilities/covenantOperations').prune(c);
    const armor = c.inventory.find((i) => i.instanceId === c.loadout.armor);
    if (
      armor &&
      require('../equipment').definition(armor.definitionId).category ===
        'heavy'
    ) {
      c.rulesRuntime.effects = c.rulesRuntime.effects.filter(
        (e) => e.featureId !== 'calling:reaver:rage:1',
      );
      c.rulesRuntime.pendingRelentlessRage = null;
    }
  }
  if (
    ['attack.record', 'strike.resolve', 'spell.cast', 'item.cast'].includes(
      body.type,
    ) ||
    (body.type === 'scroll.cast' && result.castId)
  ) {
    effectCommands.endSelfShroud(c);
  }
  c.documentRevision++;
  require('../spells/contingency').prune(c);
  rules.runtime.validate(rules.replay(c.rulesLedger), c.rulesRuntime);
  require('../equipment/magic').validate(c, rules.replay(c.rulesLedger));
  c.rulesRuntime.effects = c.rulesRuntime.effects.filter(
    (e) =>
      !e.sacredWeaponId ||
      c.inventory.some((i) => i.instanceId === e.sacredWeaponId),
  );
  const changes = Object.fromEntries(
    [
      ...require('./identity').fields,
      'origin',
      'calling',
      'attributes',
      'rulesLedger',
      'rulesRuntime',
      'inventory',
      'loadout',
      'presets',
      'goldCp',
      'documentRevision',
    ]
      .filter((k) => c[k] !== undefined)
      .map((k) => [k, c[k]]),
  );
  return { changes, result };
}
function handler(Character, Receipt, Treatment, Campaign) {
  return bindTransaction(apply, Character, Receipt, Treatment, Campaign);
}
module.exports = { apply, handler, validateEnvelope };

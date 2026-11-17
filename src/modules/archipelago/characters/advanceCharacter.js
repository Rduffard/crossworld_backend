const rules = require('../system/characterSystem');
const { fail } = require('./commandEnvelope');
function advanceOne(character, payload, summary, context) {
  if (
    !payload || typeof payload !== 'object' || Array.isArray(payload) ||
    Object.keys(payload).some((k) => !['choices', 'level',
      ...(character.rulesLedger.version === 4 ? ['lineageForm'] : [])].includes(k)) ||
    payload.level !== summary.totalLevel + 1
  )
    fail('Advance exactly one level');
  if (character.campaignId) {
    const milestone = character.rulesRuntime.milestones?.find(
      (m) => m.level === payload.level && !m.used,
    );
    if (!context.campaignRegistered || !milestone)
      fail(
        'Campaign advancement requires an unused GM-authorized milestone',
        403,
      );
    milestone.used = true;
    milestone.usedAt = Date.now();
    milestone.usedBy = context.userId;
  }
  const persistence = require('./persistence');
  const next = rules.advance(
    character.rulesLedger,
    {
      expectedRevision: character.rulesLedger.revision,
      callingId: character.calling,
      choices: payload.choices,
      ...(Object.hasOwn(payload, 'lineageForm') ? { lineageForm: payload.lineageForm } : {}),
    },
    persistence.folioAtSpellGrant(character, summary),
  );
  character.rulesRuntime = persistence.reconcile(
    character.rulesRuntime,
    summary,
    next.summary,
  );
  character.rulesLedger = next.ledger;
  character.attributes = next.summary.attributes;
  return next.summary;
}

function advanceCharacter(character, payload, summary, context) {
  if (character.rulesRuntime.deathSaves?.dead)
    fail('A dead character cannot advance');
  if (!Object.hasOwn(payload, 'levels')) return advanceOne(character, payload, summary, context);

  const { levels } = payload;
  if (character.rulesLedger.version !== 4 || Object.keys(payload).length !== 1 ||
      !Array.isArray(levels) || levels.length < 2 || levels.length > 20 - summary.totalLevel)
    fail('Submit an ordered list of consecutive levels within the level cap');
  // Campaign authorization remains attached to the next individual level.
  if (character.campaignId) fail('Campaign advancement requires one GM-authorized level at a time', 403);
  const draft = { ...character };
  for (const level of levels) summary = advanceOne(draft, level, summary, context);
  Object.assign(character, draft);
  return summary;
}
module.exports = advanceCharacter;

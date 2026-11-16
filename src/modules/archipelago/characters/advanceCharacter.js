const rules = require('../system/characterSystem');
const { fail } = require('./commandEnvelope');
function advanceCharacter(character, payload, summary, context) {
  if (character.rulesRuntime.deathSaves?.dead)
    fail('A dead character cannot advance');
  if (
    Object.keys(payload).some((k) => !['choices', 'level'].includes(k)) ||
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
}
module.exports = advanceCharacter;

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from '../helpers/phase2.mjs';
const require = createRequire(import.meta.url),
  commands = require('../../src/modules/archipelago/characters/commands');
function run(b, type, payload, context = {}) {
  const r = commands.apply(
    b.character,
    {
      operationId: 'rebuild-command',
      rulesVersion: 'SA-CHAR-1',
      expectedRevision: b.character.documentRevision,
      type,
      payload,
    },
    context
  );
  b.character = { ...b.character, ...r.changes };
  return r.result;
}
test('rebuild previews full choices without granting levels or changing saved mechanics', () => {
  const b = build('gunslinger', 3, 'iron-suppressor'),
    next = build('gunslinger', 3, 'brass-outrider'),
    ledger = structuredClone(b.character.rulesLedger),
    r = run(b, 'rebuild.preview', { ledger: next.ledger, reason: 'Change specialization' });
  assert.equal(r.complete, true);
  assert.deepEqual(b.character.rulesLedger, ledger);
  assert.ok(r.consequences.newPoolsStartEmpty);
  assert.throws(
    () =>
      run(b, 'rebuild.preview', {
        ledger: build('gunslinger', 4, 'brass-outrider').ledger,
        reason: 'More levels',
      }),
    /additional levels/
  );
});
test('campaign commit requires exact registered GM approval and acknowledges resource consequences', () => {
  const b = build('gunslinger', 3, 'iron-suppressor');
  b.character.campaignId = 'campaign';
  const r = run(b, 'rebuild.preview', {
    ledger: build('gunslinger', 3, 'brass-outrider').ledger,
    reason: 'Specialize',
  });
  assert.throws(() => run(b, 'rebuild.approve', { proposalId: r.proposalId }), /campaign GM/);
  assert.throws(
    () => run(b, 'rebuild.commit', { proposalId: r.proposalId, acceptConsequences: true }),
    /GM must approve/
  );
  run(b, 'rebuild.approve', { proposalId: r.proposalId }, { gmAllowed: true, userId: 'gm' });
  assert.throws(() => run(b, 'rebuild.commit', { proposalId: r.proposalId }), /Accept/);
  const committed = run(b, 'rebuild.commit', { proposalId: r.proposalId, acceptConsequences: true });
  assert.equal(committed.approvedBy, 'gm');
  assert.equal(b.character.rulesLedger.levels[2].choices.pathId[0], 'brass-outrider');
  assert.equal(b.character.rulesRuntime.pools['brass-outrider:outrider'], 0);
  assert.equal(b.character.rulesRuntime.rebuildProposal, undefined);
});
test('a rejected campaign rebuild records the GM reason and requires a distinct preview', () => {
  const b = build('gunslinger', 3, 'iron-suppressor');
  b.character.campaignId = 'campaign';
  const request = { ledger: build('gunslinger', 3, 'brass-outrider').ledger, reason: 'Change Path' };
  const { proposalId } = run(b, 'rebuild.preview', request);
  const gm = { gmAllowed: true, userId: 'gm' };
  assert.throws(() => run(b, 'rebuild.reject', { proposalId }), /campaign GM/);
  const decision = run(b, 'rebuild.reject', { proposalId, reason: '  Keep the current Path  ' }, gm);
  assert.equal(decision.reason, 'Keep the current Path');
  assert.equal(b.character.rulesRuntime.rebuildProposal.rejectedBy, 'gm');
  assert.throws(() => run(b, 'rebuild.reject', { proposalId }, gm), /was rejected/);
  assert.throws(() => run(b, 'rebuild.commit', { proposalId, acceptConsequences: true }), /was rejected/);
  const replacement = run(b, 'rebuild.preview', request);
  assert.notEqual(replacement.proposalId, proposalId);
  assert.throws(() => run(b, 'rebuild.approve', { proposalId }, gm), /matching rebuild/);
  run(b, 'rebuild.approve', { proposalId: replacement.proposalId }, gm);
  assert.throws(() => run(b, 'rebuild.approve', { proposalId: replacement.proposalId }, gm), /already approved/);
});

test('a changed character invalidates approval and requires a fresh rebuild preview', () => {
  const b = build('gunslinger', 3, 'iron-suppressor'),
    r = run(b, 'rebuild.preview', {
      ledger: build('gunslinger', 3, 'brass-outrider').ledger,
      reason: 'Change',
    });
  run(b, 'health.damage', { amount: 1, damageType: 'force', confirmed: true });
  assert.throws(
    () => run(b, 'rebuild.commit', { proposalId: r.proposalId, acceptConsequences: true }),
    /changed after/
  );
});
test('solo rebuild preserves expenditure and possessions while ending temporary effects and never healing', () => {
  const b = build('gunslinger', 6, 'iron-suppressor'),
    next = build('gunslinger', 6, 'brass-outrider');
  b.character.rulesRuntime.health.current = 7;
  b.character.rulesRuntime.pools['gunslinger:second-wind'] = 0;
  b.character.rulesRuntime.hitDice.d10 = 1;
  b.character.rulesRuntime.temporaryHealth = 8;
  b.character.rulesRuntime.effects = [
    { id: 'old-effect', featureId: 'path:iron-suppressor:suppressing-fire:3' },
  ];
  const inventory = structuredClone(b.character.inventory),
    gold = b.character.goldCp,
    r = run(b, 'rebuild.preview', { ledger: next.ledger, reason: 'Solo change' });
  assert.deepEqual(r.consequences.endedEffectIds, ['old-effect']);
  run(b, 'rebuild.commit', { proposalId: r.proposalId, acceptConsequences: true });
  assert.equal(b.character.rulesRuntime.health.current, 7);
  assert.equal(b.character.rulesRuntime.pools['gunslinger:second-wind'], 0);
  assert.equal(b.character.rulesRuntime.hitDice.d10, 1);
  assert.equal(b.character.rulesRuntime.temporaryHealth, 0);
  assert.deepEqual(b.character.rulesRuntime.effects, []);
  assert.deepEqual(b.character.inventory, inventory);
  assert.equal(b.character.goldCp, gold);
});
test('partial draft returns required choices but cannot become a committable proposal', () => {
  const b = build('gunslinger', 3, 'iron-suppressor'),
    ledger = structuredClone(b.ledger);
  ledger.levels[2].choices = {};
  const r = run(b, 'rebuild.preview', { ledger, reason: 'Choose new Path' });
  assert.equal(r.complete, false);
  assert.ok(r.summary.requiredChoices.some((c) => c.key === 'pathId'));
  assert.equal(b.character.rulesRuntime.rebuildProposal, undefined);
});

test('personal rebuild reopens an overlapping language and keeps unrelated advancement choices', () => {
  const b = build('gunslinger', 3, 'iron-suppressor');
  b.character.rulesLedger.levels[0].choices.languages = ['language:yayimi'];
  const savedLevels = structuredClone(b.character.rulesLedger.levels);
  const ledger = structuredClone(b.character.rulesLedger);
  ledger.creation.originId = 'yayimi';
  ledger.levels = ledger.levels.slice(0, 1);
  const input = { ledger, reason: 'Change roots', retainSavedLevels: true };

  const preview = run(b, 'rebuild.preview', input);
  assert.equal(preview.complete, false);
  assert.deepEqual(preview.draftLedger.levels[0].choices, Object.fromEntries(
    Object.entries(savedLevels[0].choices).filter(([key]) => key !== 'languages')
  ));
  const language = preview.summary.requiredChoices.find(choice => choice.key === 'languages');
  assert.ok(language);
  assert.ok(!language.options.includes('language:yayimi'));
  assert.deepEqual(b.character.rulesLedger.levels, savedLevels);

  const nextLedger = preview.draftLedger;
  nextLedger.levels[0].choices.languages = [language.options[0]];
  const complete = run(b, 'rebuild.preview', { ...input, ledger: nextLedger });
  assert.equal(complete.complete, true);
  assert.deepEqual(complete.draftLedger.levels.slice(1), savedLevels.slice(1));

  nextLedger.levels[0].choices.languages = ['language:unknown'];
  assert.throws(() => run(b, 'rebuild.preview', { ...input, ledger: nextLedger }), /Invalid languages choice/);
});
test('rebuild rejects combat and active rests without changing state', () => {
  const b = build('gunslinger', 3, 'iron-suppressor');
  b.character.rulesRuntime.inCombat = true;
  const before = structuredClone(b.character);
  assert.throws(
    () => run(b, 'rebuild.preview', { ledger: b.ledger, reason: 'Change' }),
    /Finish combat/
  );
  assert.deepEqual(b.character, before);
});

test('rebuild previews and ends attunement when its spellcaster prerequisite is lost without removing the item', () => {
  const b = build('shipwright', 3, 'powder-saint'),
    gear = require('../../src/modules/archipelago/equipment'),
    item = gear.issue({ definitionId: 'wand-of-the-war-mage-1' });
  item.attuned = true;
  b.character.inventory.push(item);
  const r = run(b, 'rebuild.preview', {
    ledger: build('gunslinger', 3, 'deadeye').ledger,
    reason: 'Change Calling',
  });
  assert.deepEqual(r.consequences.endedAttunementIds, [item.instanceId]);
  assert.equal(b.character.inventory.at(-1).attuned, true);
  assert.deepEqual(r.consequences.hitDice, { d10: 0 });
  run(b, 'rebuild.commit', { proposalId: r.proposalId, acceptConsequences: true });
  assert.equal(b.character.inventory.at(-1).instanceId, item.instanceId);
  assert.equal(b.character.inventory.at(-1).attuned, false);
  assert.deepEqual(b.character.rulesRuntime.hitDice, { d10: 0 });
});

test('same-Calling rebuild preserves lost-folio availability and cannot restore unprepared lost spells', () => {
  const b = build('shipwright', 6, 'powder-saint'),
    before = require('../../src/modules/archipelago/system/characterSystem').replay(b.ledger),
    forgotten = before.spellcasting.shipwright.folio.find(
      (id) =>
        !b.character.rulesRuntime.preparations.shipwright.includes(id) &&
        !before.spellcasting.shipwright.alwaysPrepared.includes(id)
    );
  assert.ok(forgotten);
  run(b, 'folio.lose', { folioId: 'lost-book', confirmed: true });
  const lost = structuredClone(b.character.rulesRuntime.folioUnavailable),
    r = run(b, 'rebuild.preview', { ledger: b.ledger, reason: 'Keep the same Calling' });
  run(b, 'rebuild.commit', { proposalId: r.proposalId, acceptConsequences: true });
  assert.deepEqual(b.character.rulesRuntime.folioUnavailable, lost);
  assert.ok(!b.character.rulesRuntime.folioMemory.includes(forgotten));
  const projected = require('../../src/modules/archipelago/system/characterSystem').runtime.project(
    before,
    b.character.rulesRuntime
  );
  assert.equal(projected.spellcasting.shipwright.folio.length, 0);
});

test('personal rollback preserves retained choices and reconciles lost progression', () => {
  const b = build('gunslinger', 3, 'iron-suppressor');
  const ledger = structuredClone(b.ledger);
  ledger.levels = ledger.levels.slice(0, 2);
  b.character.campaignId = 'campaign';
  assert.throws(() => run(b, 'rebuild.preview', { ledger, reason: 'Reverse advancement', targetLevel: 2 }), /preserve the current level/);
  delete b.character.campaignId;

  const preview = run(b, 'rebuild.preview', { ledger, reason: 'Reverse advancement', targetLevel: 2 });
  assert.equal(preview.complete, true);
  assert.equal(preview.summary.totalLevel, 2);
  assert.equal(preview.summary.paths.gunslinger, undefined);
  assert.equal(b.character.rulesLedger.levels.length, 3);
  run(b, 'rebuild.commit', { proposalId: preview.proposalId, acceptConsequences: true });
  assert.deepEqual(b.character.rulesLedger.levels, ledger.levels);
  assert.equal(b.character.rulesRuntime.health.max, preview.summary.health.max);
  assert.equal(b.character.rulesRuntime.pools['iron-suppressor:suppressing-fire'], undefined);
});

test('character creation validates an entire starting progression before issuing state', () => {
  const persistence = require('../../src/modules/archipelago/characters/persistence');
  const { ledger, summary } = build('gunslinger', 20, 'iron-suppressor');
  const [firstLevel, ...additionalLevels] = ledger.levels;
  const draft = {
    name: 'Veteran Sailor',
    attributes: ledger.baseAttributes,
    creation: ledger.creation,
    firstLevel,
    additionalLevels,
  };
  const created = persistence.build(draft, { equip: true });
  assert.deepEqual(created.rulesLedger, ledger);
  assert.equal(created.documentRevision, 0);
  assert.equal(created.rulesRuntime.health.current, summary.health.max);
  assert.ok(created.loadout.mainHand);
  assert.throws(() => persistence.build({ ...draft, additionalLevels: [...additionalLevels, firstLevel] }), /1 to 20/);
  assert.throws(() => persistence.build({ ...draft, additionalLevels: [{ ...additionalLevels[0], folioAtSpellGrant: [] }] }), /Invalid rules fields/);
  const unchosenPath = { ...additionalLevels[1], choices: {} };
  assert.throws(() => persistence.build({ ...draft, additionalLevels: [additionalLevels[0], unchosenPath] }), /Complete required choices/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build, complete, creation, rules, scores } from '../helpers/phase2.mjs';

const require = createRequire(import.meta.url);
const persistence = require('../../src/modules/archipelago/characters/persistence');
const commands = require('../../src/modules/archipelago/characters/commands');

const beastshifter = {
  id: 'beastshifters', size: 'small', choices: { skill: 'intimidation', formId: 'dock-rat' },
};
const milestoneChoices = {
  3: { learnFormId: 'gray-wolf', replaceForm: { fromFormId: 'dock-rat', toFormId: 'reef-fox' } },
  5: { learnFormId: 'river-otter', replaceForm: { fromFormId: 'reef-fox', toFormId: 'dock-rat' } },
  9: { learnFormId: 'gull' },
  13: { learnFormId: 'black-bear' },
  17: { learnFormId: 'sea-eagle' },
};

function fixture(lineage, level = 1) {
  const { ledger } = build('gunslinger', level);
  const { size, ...roots } = ledger.creation;
  void size;
  const body = {
    name: 'Lineage Test', attributes: ledger.baseAttributes,
    creation: { ...roots, lineage }, firstLevel: ledger.levels[0],
  };
  const levels = ledger.levels.slice(1).map(({ choices }, index) => {
    const level = index + 2;
    return { level, choices, ...(milestoneChoices[level] ? { lineageForm: milestoneChoices[level] } : {}) };
  });
  return { body, levels };
}

function advance(character, payload) {
  const { changes } = commands.apply(character, {
    operationId: 'lineage-advance-test', expectedRevision: character.documentRevision,
    rulesVersion: 'SA-CHAR-1', type: 'advance', payload,
  });
  return { ...character, ...changes };
}

function rebuild(character, type, payload) {
  return commands.apply(character, {
    operationId: type.replace('.', '-') + '-lineage-test', expectedRevision: character.documentRevision,
    rulesVersion: 'SA-CHAR-1', type, payload,
  });
}

test('personal Lineage rebuild removes an active animal form and replays preserved Calling decisions', () => {
  const { body, levels } = fixture(beastshifter, 3);
  let character = persistence.build(body);
  for (const level of levels) character = advance(character, level);
  character.rulesRuntime.animalForms.activeFormId = 'gray-wolf';
  character.rulesRuntime.health.current = 5;
  const ledger = structuredClone(character.rulesLedger);
  ledger.creation.lineage = { id: 'fishmen', choices: { castingAttribute: 'wit' } };
  for (const event of ledger.levels) delete event.lineageForm;
  const preview = rebuild(character, 'rebuild.preview', { ledger, reason: 'Change inherited traits' });
  assert.equal(preview.result.summary.movement.swim, 30);
  assert.equal(preview.result.summary.size, 'medium');
  assert.equal(preview.result.consequences.animalForms.before.activeFormId, 'gray-wolf');
  assert.equal(preview.result.consequences.animalForms.after, null);
  assert.equal(character.rulesRuntime.animalForms.activeFormId, 'gray-wolf');
  assert.throws(() => rebuild({ ...character, campaignId: 'fleet' }, 'rebuild.preview', {
    ledger, reason: 'Campaign change',
  }), /must preserve Lineage/);
  const commit = rebuild({ ...character, ...preview.changes }, 'rebuild.commit', {
    proposalId: preview.result.proposalId, acceptConsequences: true,
  });
  assert.equal(commit.changes.rulesRuntime.animalForms, undefined);
  assert.equal(commit.changes.rulesRuntime.health.current, 5);
  assert.equal(rules.replay(commit.changes.rulesLedger).lineage.id, 'fishmen');
  assert.deepEqual(commit.changes.rulesLedger.levels.map(level => level.choices),
    character.rulesLedger.levels.map(level => level.choices));
});

test('a personal legacy ledger can adopt a Lineage and a partial form milestone cannot be applied', () => {
  const original = build('gunslinger', 3).character;
  const ledger = structuredClone(original.rulesLedger);
  ledger.version = 4;
  delete ledger.creation.size;
  ledger.creation.lineage = beastshifter;
  const partial = rebuild(original, 'rebuild.preview', {
    ledger: { ...ledger, levels: ledger.levels.slice(0, 1) },
    targetLevel: 3, retainSavedLevels: true, reason: 'Adopt a Lineage',
  });
  assert.equal(partial.result.complete, false);
  assert.equal(partial.result.summary.requiredChoices[0].key, 'lineageForm');
  assert.deepEqual(partial.result.draftLedger.levels, ledger.levels);
  assert.equal(partial.changes.rulesRuntime.rebuildProposal, undefined);
  ledger.levels[2].lineageForm = { learnFormId: 'gray-wolf' };
  const preview = rebuild(original, 'rebuild.preview', { ledger, reason: 'Adopt a Lineage' });
  assert.equal(preview.result.complete, true);
  assert.deepEqual(Object.keys(preview.result.consequences.animalForms.after.healthByForm), ['dock-rat', 'gray-wolf']);
  assert.equal(original.rulesLedger.version, 3);
});

test('a personal rebuild cannot select new Calling Training already fixed by its Background', () => {
  const { body } = fixture({ id: 'fishmen', choices: { castingAttribute: 'wit' } });
  const character = persistence.build(body);
  const ledger = structuredClone(character.rulesLedger);
  ledger.levels[0].choices.skills = ['acrobatics', 'athletics'];
  ledger.levels[0].choices.backgroundSkills = ['history', 'survival'];
  assert.throws(() => rebuild(character, 'rebuild.preview', {
    ledger, reason: 'Change Training', retainSavedLevels: true,
  }), /Invalid skills choice/);
});

test('changing the starting form keeps compatible learned forms in a personal rebuild', () => {
  const { body, levels } = fixture(beastshifter, 5);
  let character = persistence.build(body);
  for (const level of levels) character = advance(character, level);
  const ledger = structuredClone(character.rulesLedger);
  ledger.creation.lineage.choices.formId = 'dune-hare';
  ledger.levels = ledger.levels.slice(0, 1);
  const { result } = rebuild(character, 'rebuild.preview', {
    ledger, reason: 'Change first form', retainSavedLevels: true,
  });
  assert.equal(result.complete, true);
  assert.deepEqual(result.summary.lineage.animalForms.knownForms, ['dune-hare', 'gray-wolf', 'river-otter']);
  assert.deepEqual(result.draftLedger.levels[2].lineageForm, { learnFormId: 'gray-wolf' });
  assert.deepEqual(result.draftLedger.levels[4].lineageForm, { learnFormId: 'river-otter' });
});

test('creation persists six distinct Lineages while retaining Roots and v3 replay', () => {
  const legacy = build('gunslinger');
  for (const [selection, expected] of [
    [{ id: 'human', size: 'small', choices: { skill: 'stealth', originFeat: { id: 'alert' } } }, { size: 'small', skill: 'stealth' }],
    [{ id: 'fishmen', choices: { castingAttribute: 'wit' } }, { resistance: 'cold', swim: 30, darkvision: 60 }],
    [{ id: 'stoneborn' }, { resistance: 'poison', darkvision: 120, healthAdjustment: 1 }],
    [{ id: 'fey-touched', choices: { heritage: 'greenwake', skill: 'perception', castingAttribute: 'spirit' } }, { walk: 35, skill: 'perception', darkvision: 60 }],
    [beastshifter, { size: 'small', skill: 'intimidation' }],
    [{ id: 'changelings', size: 'medium', choices: { skills: ['deception', 'persuasion'] } }, { type: 'fey', skill: 'deception' }],
  ]) {
    const saved = persistence.build(fixture(selection).body);
    const { rulesSummary: summary } = persistence.decorate(saved);
    assert.equal(saved.rulesLedger.version, 4);
    assert.equal(summary.lineage.id, selection.id);
    assert.deepEqual(summary.attributes, legacy.summary.attributes);
    assert.equal(summary.size, expected.size ?? 'medium');
    assert.equal(summary.creatureType, expected.type ?? 'humanoid');
    assert.equal(summary.movement.walk, expected.walk ?? 30);
    assert.equal(summary.movement.swim, expected.swim ?? 0);
    assert.equal(summary.senses.darkvision, expected.darkvision ?? 0);
    assert.equal(summary.health.max, legacy.summary.health.max + (expected.healthAdjustment ?? 0));
    if (expected.skill) assert.ok(summary.training.includes(expected.skill));
    if (expected.resistance) assert.ok(summary.resistances.includes(expected.resistance));
    if (selection.id === 'human') {
      assert.equal(summary.lineage.originFeat.grantKey, 'lineage:human:origin-feat');
      assert.equal(summary.initiative.modifier, legacy.summary.initiative.modifier + 2);
    }
    if (selection.id === 'stoneborn') assert.equal(summary.poisonedSaveAdvantage, true);
  }
  assert.equal(legacy.ledger.version, 3);
  assert.equal(rules.replay(legacy.ledger).lineage, undefined);
  assert.throws(() => rules.replay({ ...legacy.ledger, creation: fixture(beastshifter).body.creation }), /Invalid creation contract/);
});

test('creation preview reports required choices and rejects forged Lineage grants', () => {
  const { body } = fixture({ id: 'human' });
  const { summary } = rules.create(body.attributes, body.firstLevel, { creation: body.creation, allowIncomplete: true });
  assert.deepEqual(summary.requiredChoices.map(choice => choice.id), [
    'creation.lineage.size', 'creation.lineage.choices.skill', 'creation.lineage.choices.originFeat',
  ]);
  assert.throws(() => persistence.build(body), { statusCode: 422 });
  for (const invalid of [
    { id: 'constructor' },
    { id: 'stoneborn', size: 'medium' },
    { ...beastshifter, grants: ['fly'] },
    { ...beastshifter, choices: { ...beastshifter.choices, formId: 'gull' } },
    { ...beastshifter, choices: { ...beastshifter.choices, skill: 'athletics' } },
    { id: 'fey-touched', choices: { heritage: 'glasslight', skill: 'insight', castingAttribute: 'wit', cantrip: 'mage-hand' } },
    { id: 'changelings', size: 'small', choices: { skills: ['deception', 'deception'] } },
  ]) {
    assert.throws(() => persistence.build(fixture(invalid).body), { statusCode: 422 });
  }
});

test('Human Corsair Skilled requires distinct Training and persists all eligible selections', () => {
  const { size, ...roots } = creation('yuma-core', 'dock-artisan');
  const draft = rules.create(scores, { callingId: 'corsair', choices: {} }, {
    creation: { ...roots, lineage: { id: 'stoneborn' } }, allowIncomplete: true,
  });
  const startingSkills = draft.summary.requiredChoices.find(choice => choice.key === 'skills');
  assert.equal(startingSkills.options.includes('investigation'), false);
  assert.equal(startingSkills.unavailable.investigation, 'Already granted by your Background.');
  const { ledger, summary } = complete(draft.ledger);
  assert.deepEqual(ledger.levels[0].choices.backgroundSkills, ['investigation', 'history']);
  assert.ok(summary.equipmentTraining.tools.includes('carpenters-tools'));
  const duplicate = structuredClone(ledger.levels[0]);
  duplicate.choices.skills[0] = 'investigation';
  assert.throws(() => rules.create(scores, duplicate, {
    creation: ledger.creation, allowIncomplete: true,
  }), /Invalid skills choice/);
  const options = rules.blueprint.skills.map(skill => skill.id).filter(id => !summary.training.includes(id));
  const [skill, ...additional] = options;
  const training = additional.slice(0, 3).map(id => 'skill:' + id);
  const originFeat = { id: 'skilled', options: { training } };
  const body = {
    name: 'Skilled Human Corsair', attributes: ledger.baseAttributes, firstLevel: ledger.levels[0],
    creation: { ...roots, lineage: { id: 'human', size, choices: { skill, originFeat } } },
  };
  const saved = persistence.build(body);
  const projected = persistence.decorate(saved).rulesSummary;
  assert.deepEqual(projected.lineage.originFeat.options.training, training);
  assert.ok(additional.slice(0, 3).every(id => projected.training.includes(id)));
  originFeat.options = { training: [training[0], training[1], 'skill:' + summary.training[0]] };
  assert.throws(() => persistence.build(body), {
    statusCode: 422, fieldPath: 'creation.lineage.choices.originFeat.options.training',
  });
});

test('Lineage spell sources unlock by total level and Human Origin feats use their own grant', () => {
  const fish = fixture({ id: 'fishmen', choices: { castingAttribute: 'wit' } }, 5);
  const first = persistence.build(fish.body);
  const levels = fish.levels.map(({ level, choices }) => ({ level, choices }));
  const third = advance(first, { levels: levels.slice(0, 2) });
  const fifth = advance(third, { levels: levels.slice(2) });
  assert.deepEqual(Object.keys(third.rulesRuntime.pools).filter(id => id.startsWith('lineage:')), [
    'lineage:fishmen:fog-cloud', 'lineage:fishmen:gust-of-wind',
  ]);
  assert.deepEqual(persistence.decorate(fifth).rulesSummary.innateSpells.map(grant =>
    [grant.spellId, grant.unlockLevel, grant.unlocked, grant.castSupported]), [
    ['fog-cloud', 1, true, true], ['gust-of-wind', 3, true, true], ['water-walk', 5, true, true],
  ]);
  const human = fixture({
    id: 'human', size: 'medium', choices: { skill: 'stealth', originFeat: {
      id: 'magic-initiate', options: {
        list: 'shipwright', attribute: 'wit', cantrips: ['mage-hand', 'prestidigitation'], spell: 'detect-magic',
      },
    } },
  });
  const created = persistence.build(human.body);
  const summary = rules.replay(created.rulesLedger);
  assert.equal(summary.featSpellcasters[0].grantKey, 'lineage:human:origin-feat');
  assert.equal(created.rulesRuntime.pools['feat:magic-initiate:shipwright'], 1);
  const rested = rules.runtime.update(summary, created.rulesRuntime, { type: 'long-rest', expectedRevision: 0 });
  assert.equal(rested.inspiration, true);
  assert.equal(rested.inspirationSource, 'lineage:human:inspiration');
});

test('Beastshifter milestones replay in order and retain dormant and relearned animal Health', () => {
  const { body, levels } = fixture(beastshifter, 20);
  const first = persistence.build(body);
  assert.deepEqual(first.rulesRuntime.animalForms, { activeFormId: null, healthByForm: { 'dock-rat': 3 } });
  first.rulesRuntime.animalForms.healthByForm['dock-rat'] = 1;
  const third = advance(first, { levels: levels.slice(0, 2) });
  assert.deepEqual(rules.replay(third.rulesLedger).lineage.animalForms.knownForms, ['reef-fox', 'gray-wolf']);
  assert.deepEqual(third.rulesRuntime.animalForms.healthByForm, { 'dock-rat': 1, 'reef-fox': 5, 'gray-wolf': 7 });
  const summary = rules.replay(third.rulesLedger);
  const rested = rules.runtime.update(summary, third.rulesRuntime, {
    type: 'long-rest', expectedRevision: third.rulesRuntime.revision,
  });
  assert.deepEqual(rested.animalForms, third.rulesRuntime.animalForms);
  const twentieth = advance(third, { levels: levels.slice(2) });
  const saved = JSON.parse(JSON.stringify(twentieth));
  assert.deepEqual(rules.replay(saved.rulesLedger), rules.replay(twentieth.rulesLedger));
  const projected = persistence.decorate(saved).rulesSummary;
  assert.equal(projected.totalLevel, 20);
  assert.deepEqual(projected.lineage.animalForms.knownForms,
    ['dock-rat', 'gray-wolf', 'river-otter', 'gull', 'black-bear', 'sea-eagle']);
  assert.equal(projected.lineage.animalForms.maximumHealth['dock-rat'], 12);
  assert.equal(saved.rulesRuntime.animalForms.healthByForm['dock-rat'], 1);
  assert.equal(saved.rulesRuntime.animalForms.healthByForm['reef-fox'], 5);
  assert.equal(saved.rulesRuntime.animalForms.healthByForm['sea-eagle'], 15);
  assert.equal(saved.rulesRuntime.health.max, build('gunslinger', 20).summary.health.max);
});

test('missing, reordered or forged form choices and saved runtime records are rejected', () => {
  const { body, levels } = fixture(beastshifter, 3);
  const first = persistence.build(body);
  const initial = structuredClone(first);
  for (const invalid of [
    [levels[1], levels[0]],
    [levels[0], { level: 3, choices: levels[1].choices }],
    [levels[0], { ...levels[1], lineageForm: { learnFormId: 'dock-rat' } }],
    [levels[0], { ...levels[1], lineageForm: { learnFormId: 'sea-eagle' } }],
    [levels[0], { ...levels[1], lineageForm: { learnFormId: 'gray-wolf', level: 17 } }],
  ]) {
    assert.throws(() => advance(first, { levels: invalid }), { statusCode: 422 });
    assert.deepEqual(first, initial);
  }
  const second = advance(first, levels[0]);
  const pending = rules.replay({ ...second.rulesLedger,
    levels: [...second.rulesLedger.levels, { callingId: 'gunslinger', choices: levels[1].choices }],
  });
  assert.equal(pending.decisionsComplete, false);
  assert.deepEqual(pending.lineage.animalForms.pendingChoice.replaceableFormIds, ['dock-rat']);
  assert.ok(pending.lineage.animalForms.pendingChoice.eligibleFormIds.includes('gray-wolf'));
  for (const forged of [
    { ...first.rulesRuntime.animalForms, knownFormIds: ['reef-fox'] },
    { ...first.rulesRuntime.animalForms, activeFormId: 'reef-fox' },
    { ...first.rulesRuntime.animalForms, healthByForm: { 'dock-rat': 3, 'reef-fox': 1 } },
    { ...first.rulesRuntime.animalForms, healthByForm: { 'dock-rat': 4 } },
    { ...first.rulesRuntime.animalForms, healthByForm: {} },
  ]) {
    assert.throws(() => persistence.decorate({ ...first, rulesRuntime: { ...first.rulesRuntime, animalForms: forged } }),
      /Invalid saved animal form Health/);
  }
});

function run(character, type, payload) {
  const { changes, result } = commands.apply(character, {
    operationId: 'lineage-runtime-test', expectedRevision: character.documentRevision,
    rulesVersion: 'SA-CHAR-1', type, payload,
  });
  return { character: { ...character, ...changes }, result };
}

function activate(character, id, parameters = {}, turnId) {
  return run(character, 'ability.activate', { optionId: 'lineage:' + id, parameters, turnId });
}

test('Beastshifter forms keep separate Health, take overflow once, and expend the Calling Hit Die', () => {
  let character = persistence.build(fixture(beastshifter).body);
  const humanoidHealth = character.rulesRuntime.health.current;
  const transform = c => activate(c, 'beastshifters:transform', { formId: 'dock-rat', legalPlacement: true });
  assert.throws(() => activate(character, 'beastshifters:transform', { formId: 'reef-fox', legalPlacement: true }), { statusCode: 422 });
  ({ character } = transform(character));
  const view = persistence.decorate(character);
  assert.equal(view.rulesSummary.creatureType, 'beast');
  assert.equal(view.rulesSummary.size, 'small');
  assert.equal(view.rulesSummary.spaceFeet, 5);
  assert.equal(view.rulesSummary.grappleSize, 'small');
  assert.equal(view.rulesSummary.attributes.agility, 14);
  assert.equal(view.equipment.carrying.capacityLb, view.rulesSummary.attributes.might * 15);
  assert.equal(view.equipment.guard, 12);
  assert.deepEqual(view.equipment.attacks, []);
  assert.throws(() => transform(character), { statusCode: 422 });
  assert.throws(() => run(character, 'spell.cast', { spellId: 'light' }), { statusCode: 422 });
  const attack = run(character, 'attack.record', {
    eventId: 'bite-001', targetId: 'target', naturalAttackId: 'bite', distance: 5,
    turnId: 'outside-combat', attribute: 'agility', hit: true, critical: true, confirmed: true, reckless: false,
  });
  assert.equal(attack.result.naturalAttack.rolls.length, 2);
  assert.equal(attack.result.naturalAttack.attackModifier, 4);
  assert.equal(attack.result.naturalAttack.damageType, 'piercing');
  ({ character } = run(character, 'health.damage', { amount: 1, damageType: 'piercing', confirmed: true }));
  assert.equal(character.rulesRuntime.animalForms.healthByForm['dock-rat'], 2);
  ({ character } = run(character, 'health.apply', { healthDelta: 100 }));
  assert.equal(character.rulesRuntime.animalForms.healthByForm['dock-rat'], 3);
  ({ character } = activate(character, 'beastshifters:revert', { confirmed: true }));
  assert.equal(character.rulesRuntime.animalForms.activeFormId, null);
  ({ character } = transform(character));
  ({ character } = run(character, 'temp-health.choose', { amount: 2, source: 'test', confirmed: true }));
  const damage = run(character, 'health.damage', { amount: 6, damageType: 'piercing', confirmed: true });
  character = damage.character;
  assert.equal(damage.result.absorbed, 2);
  assert.equal(damage.result.animalHealthLost, 3);
  assert.equal(character.rulesRuntime.health.current, humanoidHealth - 1);
  assert.equal(character.rulesRuntime.animalForms.activeFormId, null);
  const [hitDie] = Object.keys(character.rulesRuntime.hitDice);
  const recovery = activate(character, 'beastshifters:primal-recovery', { formId: 'dock-rat', hitDie });
  assert.equal(recovery.character.rulesRuntime.hitDice[hitDie], 0);
  assert.equal(recovery.character.rulesRuntime.animalForms.activeFormId, null);
  assert.equal(recovery.result.healed, Math.min(3, recovery.result.roll));
  assert.equal(recovery.character.rulesRuntime.health.current, humanoidHealth - 1);
});

test('Lineage activation spends the tracked turn and Stone Listening survives reload until its deadline', () => {
  let character = persistence.build(fixture({ id: 'stoneborn' }).body);
  ({ character } = run(character, 'time.advance', { worldTime: 0, confirmed: true }));
  ({ character } = run(character, 'turn.start', { turnId: 'first', confirmed: true }));
  ({ character } = activate(character, 'stoneborn:stone-listening', {}, 'first'));
  assert.equal(character.rulesRuntime.pools['lineage:stoneborn:stone-listening'], 1);
  assert.throws(() => activate(character, 'stoneborn:stone-listening', {}, 'first'), { statusCode: 422 });
  assert.equal(persistence.decorate(structuredClone(character)).rulesSummary.stoneListening.expiresAt, 600_000);
  ({ character } = run(character, 'time.advance', { worldTime: 600_000, confirmed: true }));
  assert.equal(persistence.decorate(character).rulesSummary.stoneListening, undefined);
});

test('a Large animal form projects the actual footprint and increased carrying capacity', () => {
  const { body, levels } = fixture(beastshifter, 13);
  let character = persistence.build(body);
  for (const level of levels) character = advance(character, level);
  ({ character } = activate(character, 'beastshifters:transform', { formId: 'black-bear', legalPlacement: true }));
  const { rulesSummary, equipment } = persistence.decorate(character);
  assert.equal(rulesSummary.size, 'large');
  assert.equal(rulesSummary.spaceFeet, 10);
  assert.equal(rulesSummary.grappleSize, 'large');
  assert.equal(equipment.carrying.capacityLb, 480);
  assert.equal(equipment.carrying.pushDragLiftLb, 960);
});

test('Changeling appearance changes effective size and preserves saved identity', () => {
  let character = persistence.build(fixture({
    id: 'changelings', size: 'medium', choices: { skills: ['deception', 'persuasion'] },
  }).body);
  const form = { operation: 'transform', size: 'small', description: 'A dockhand', voice: 'Soft', appearanceEligible: true };
  assert.throws(() => activate(character, 'changelings:shapechange', { ...form, attributes: { might: 20 } }), { statusCode: 422 });
  ({ character } = activate(character, 'changelings:shapechange', form));
  const view = persistence.decorate(structuredClone(character));
  assert.equal(view.name, 'Lineage Test');
  assert.equal(view.rulesSummary.size, 'small');
  assert.deepEqual(view.rulesSummary.appearance, { size: 'small', description: 'A dockhand', voice: 'Soft' });
  ({ character } = activate(character, 'changelings:shapechange', { operation: 'revert' }));
  assert.equal(persistence.decorate(character).rulesSummary.size, 'medium');
});

test('Glasslight changes its source-keyed cantrip only after a completed Waking Reverie', () => {
  let character = persistence.build(fixture({
    id: 'fey-touched', choices: { heritage: 'glasslight', skill: 'perception', castingAttribute: 'wit' },
  }).body);
  const source = 'lineage:fey-touched:glasslight:prestidigitation';
  const spell = (spellId, mode) => run(character, 'spell.cast', { spellId, source, mode });
  assert.equal(spell('prestidigitation', 'cantrip').result.source, source);
  assert.throws(() => spell('mage-hand', 'cantrip'), { statusCode: 422 });
  ({ character } = run(character, 'rest.start', {
    restId: 'reverie', kind: 'long-rest', mode: 'waking-reverie', startedAt: 0,
    options: { lineageCantrip: { source, spellId: 'mage-hand' } },
  }));
  assert.throws(() => spell('mage-hand', 'cantrip'), { statusCode: 422 });
  assert.throws(() => run(character, 'rest.complete', { restId: 'reverie', completedAt: 14_399_999 }), { statusCode: 422 });
  ({ character } = run(character, 'rest.complete', { restId: 'reverie', completedAt: 14_400_000 }));
  assert.equal(spell('mage-hand', 'cantrip').result.source, source);
  assert.throws(() => spell('prestidigitation', 'cantrip'), { statusCode: 422 });
});

test('Fishmen can expend a Lineage charge without Calling spellcasting', () => {
  let character = persistence.build(fixture({ id: 'fishmen', choices: { castingAttribute: 'wit' } }).body);
  const source = 'lineage:fishmen:fog-cloud';
  const payload = { source, spellId: 'fog-cloud', mode: 'free' };
  assert.throws(() => run(character, 'spell.cast', { ...payload, mode: 'slot', slotLevel: 1 }), { statusCode: 422 });
  const cast = run(character, 'spell.cast', payload);
  character = cast.character;
  assert.equal(cast.result.freePool, source);
  assert.equal(cast.result.spentSlot, false);
  assert.equal(character.rulesRuntime.pools[source], 0);
  assert.throws(() => run(character, 'spell.cast', payload), { statusCode: 422 });
});

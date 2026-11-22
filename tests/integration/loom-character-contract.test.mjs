import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import contract from '../fixtures/loom-character-contract-v1.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const { calculateCheckModifier } = require('@crossworld/sanguine-engine/attributes');
const { validatePointBuyAllocation } = require('@crossworld/sanguine-engine/point-buy');
const { recoverRestPools } = require('@crossworld/sanguine-engine/resources');
const {
  advanceBeastshifterForms, lineageActivationTerms, transitionBeastshifterHealth,
} = require('@crossworld/sanguine-engine/lineages');
const { apply } = require('../../src/modules/archipelago/characters/commands');
const persistence = require('../../src/modules/archipelago/characters/persistence');

function create(additionalLevels) {
  return persistence.build({ ...contract.creation.input, additionalLevels }, { equip: true });
}

function command(character, type, payload) {
  const { changes, result } = apply(character, {
    operationId: 'loom-contract-' + character.documentRevision,
    rulesVersion: contract.rulesVersion,
    expectedRevision: character.documentRevision,
    type,
    payload,
  });
  return { character: { ...character, ...changes }, result };
}

function progression(character) {
  const { rulesSummary, rulesRuntime } = persistence.decorate(character);
  return {
    totalLevel: rulesSummary.totalLevel,
    pathId: rulesSummary.paths.gunslinger ?? null,
    health: rulesRuntime.health,
    hitDice: rulesRuntime.hitDice,
    pools: rulesRuntime.pools,
  };
}

function lineage(summary) {
  return {
    lineage: summary.lineage.id,
    size: summary.size,
    swimFeet: summary.movement.swim,
    darkvisionFeet: summary.senses.darkvision,
    resistances: summary.resistances,
  };
}

function review(character, input) {
  const { character: previewed, result: preview } = command(character, 'rebuild.preview', input);
  assert.equal(preview.complete, true);
  assert.deepEqual(previewed.rulesLedger, character.rulesLedger);
  assert.deepEqual(previewed.rulesRuntime.health, character.rulesRuntime.health);
  return command(previewed, 'rebuild.commit', {
    proposalId: preview.proposalId,
    acceptConsequences: true,
  }).character;
}

test('Loom fixture matches creation, attribute calculations, lineage, and starting loadout', () => {
  const character = create();
  const { rulesSummary } = persistence.decorate(character);
  const { loadout, inventory } = character;
  const definition = instanceId => inventory.find(item => item.instanceId === instanceId)?.definitionId ?? null;
  assert.deepEqual({
    ledgerVersion: character.rulesLedger.version,
    totalLevel: rulesSummary.totalLevel,
    pointBuy: validatePointBuyAllocation(contract.creation.input.attributes),
    attributes: rulesSummary.attributes,
    attributeModifiers: Object.fromEntries(Object.keys(rulesSummary.attributes)
      .map(key => [key, calculateCheckModifier(rulesSummary.attributes, key)])),
    ...lineage(rulesSummary),
    health: character.rulesRuntime.health,
    goldCp: character.goldCp,
    equipped: {
      mainHand: definition(loadout.mainHand),
      offHand: definition(loadout.offHand),
      armor: definition(loadout.armor),
      grip: loadout.grip,
    },
  }, contract.creation.expected);
});

test('Loom fixture matches staged advancement, direct higher-level creation, and reversal', () => {
  const { character: advanced } = command(create(), 'advance', contract.advancement.input);
  assert.deepEqual(progression(advanced), contract.advancement.expected);
  const additionalLevels = contract.advancement.input.levels.map(({ choices }) => ({
    callingId: contract.creation.input.firstLevel.callingId, choices,
  }));
  assert.deepEqual(progression(create(additionalLevels)), contract.advancement.expected);

  const { targetLevel, reason } = contract.reversal.input;
  const ledger = { ...advanced.rulesLedger, levels: advanced.rulesLedger.levels.slice(0, targetLevel) };
  const reversed = review(advanced, { ledger, targetLevel, reason });
  assert.deepEqual(progression(reversed), contract.reversal.expected);
  assert.deepEqual(reversed.rulesLedger.levels, ledger.levels);
});

test('Loom fixture matches Beastshifter activation and damage overflow', () => {
  const { input, expected } = contract.beastshifterForm;
  const { formId, level, formUses, health, damage } = input;
  const traitId = 'lineage:beastshifters:transform';
  const vitality = { health };
  const activation = lineageActivationTerms(traitId, {
    lineageId: 'beastshifters', level, formId, vitality, canTakeBonusAction: true,
    legalPlacement: true, pools: { [traitId]: formUses },
    state: advanceBeastshifterForms(undefined, { level, learnFormId: formId }),
  });
  const aftermath = transitionBeastshifterHealth({
    level, vitality, state: activation.state, event: { type: 'damage', amount: damage },
  });
  assert.deepEqual({
    activatedFormId: activation.state.activeFormId,
    poolSpend: activation.poolSpend,
    activeFormIdAfterDamage: aftermath.state.activeFormId,
    formHealthAfterDamage: aftermath.state.healthByForm[formId],
    humanoidHealthAfterDamage: aftermath.vitalityPatch.health,
  }, expected);
});

test('Loom fixture matches Lineage rebuild, preserving Health and replacing inherited pools', () => {
  const { character: advanced } = command(create(), 'advance', contract.advancement.input);
  const { input, expected } = contract.rebuild;
  const { character } = command(advanced, 'health.damage', input.damage);
  const ledger = structuredClone(character.rulesLedger);
  ledger.creation.lineage = input.lineage;
  const rebuilt = review(character, { ledger, reason: input.reason });
  const { rulesSummary, rulesRuntime } = persistence.decorate(rebuilt);
  assert.deepEqual(lineage(rulesSummary), {
    lineage: expected.lineage, size: expected.size, swimFeet: expected.swimFeet,
    darkvisionFeet: expected.darkvisionFeet, resistances: expected.resistances,
  });
  assert.equal(rulesSummary.totalLevel, expected.totalLevel);
  assert.equal(rulesSummary.paths.gunslinger, expected.pathId);
  assert.deepEqual(rulesRuntime.health, expected.health);
  assert.equal(rulesRuntime.pools[expected.newPool.id], expected.newPool.current);
  for (const id of expected.removedPools) assert.equal(Object.hasOwn(rulesRuntime.pools, id), false);
  assert.deepEqual(rebuilt.rulesLedger.levels, character.rulesLedger.levels);
  assert.deepEqual(rebuilt.inventory, character.inventory);
});

test('Loom fixture matches partial, full, and ineligible Short Rest recovery', () => {
  const { input, expected } = contract.resourceRecovery;
  assert.deepEqual(recoverRestPools(input.pools, input.definitions, input.options), expected);
});

test('Loom fixture matches purchase, split, and merge without duplicating units or currency', () => {
  const { input, expected } = contract.equipmentState;
  const bought = command(create(), 'equipment.buy', input.purchase);
  const item = bought.character.inventory.find(entry => entry.definitionId === input.purchase.definitionId);
  assert.equal(bought.result.costCp, expected.purchaseCostCp);
  assert.equal(bought.character.goldCp, expected.goldCp);
  assert.equal(item.quantity, expected.purchasedQuantity);

  const split = command(bought.character, 'equipment.split', {
    instanceId: item.instanceId, quantity: input.splitQuantity,
  });
  const splitId = split.result.instanceId;
  const quantity = (character, id) => character.inventory.find(entry => entry.instanceId === id)?.quantity;
  assert.deepEqual([quantity(split.character, item.instanceId), quantity(split.character, splitId)],
    expected.splitQuantities);

  const merged = command(split.character, 'equipment.merge', { from: splitId, to: item.instanceId });
  assert.equal(quantity(merged.character, item.instanceId), expected.mergedQuantity);
  assert.equal(quantity(merged.character, splitId), undefined);
  assert.equal(merged.character.goldCp, expected.goldCp);
});

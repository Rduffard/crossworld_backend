import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve('../../src/modules/archipelago/routes'));

test('the catalog and lower equipment services initialize without loading rules execution', () => {
  const { blueprint } = require('../../src/modules/archipelago/system/blueprint');
  require('../../src/modules/archipelago/equipment/loadout');

  assert.equal(blueprint.callings.length, 8);
  assert.equal(blueprint.paths.length, 32);
  assert.equal(blueprint.spells.length, 316);
  assert.ok(blueprint.callings.every(calling => calling.progression.length === 20));

  const loaded = Object.keys(require.cache).map(filename => path.relative(root, filename).split(path.sep).join('/'));
  for (const filename of [
    'system/characterSystem.js', 'characters/advancement/ledger.js', 'characters/runtime/runtime.js',
    'equipment/equipmentView.js', 'characters/runtime/selections.js',
    'characters/abilities/abilityOperations.js', 'combat/vitality/vitality.js',
    'spells/contingency.js', 'spells/spellMaterials.js',
    'equipment/index.js', 'equipment/commands.js', 'equipment/utilization.js',
    'characters/model.js', 'routes.js',
  ]) assert.ok(!loaded.includes(filename), `Unexpected execution dependency: ${filename}`);
});

test('saved validation and character equipment projection run without loading command handlers', () => {
  const { creation } = JSON.parse(readFileSync(new URL('../fixtures/phase3-characters.json', import.meta.url)));
  const { replay } = require('../../src/modules/archipelago/characters/advancement/ledger');
  const { validate } = require('../../src/modules/archipelago/characters/runtime/runtimeValidation');
  const { derive } = require('../../src/modules/archipelago/equipment/equipmentView');

  assert.equal(validate(replay(creation.rulesLedger), creation.rulesRuntime), true);
  assert.equal(derive(creation).loadout.grip, 'one');
  const loaded = Object.keys(require.cache).map(filename => path.relative(root, filename).split(path.sep).join('/'));
  for (const filename of [
    'characters/runtime/runtime.js', 'combat/effects/clock.js',
    'characters/abilities/featOperations.js', 'characters/abilities/featureOperations.js',
    'spells/folioOperations.js', 'characters/abilities/conduitOperations.js',
    'characters/abilities/abilityOperations.js', 'combat/vitality/vitality.js',
    'combat/effects/healingEffects.js', 'characters/runtime/selectionOperations.js',
    'equipment/magic.js', 'equipment/commands.js', 'characters/commands.js',
  ]) assert.ok(!loaded.includes(filename), `Unexpected command dependency: ${filename}`);
});

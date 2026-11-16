import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build, rules} from '../helpers/phase2.mjs';
const require = createRequire(import.meta.url);
const {gunslinger, gunslingerResources, roster} = require('@crossworld/sanguine-engine/callings');

test('backend catalog consumes engine instances and replay uses engine resource grants', () => {
  const catalog = require('../../src/modules/archipelago/system/catalog');
  assert.equal(catalog.callings.gunslinger, gunslinger.definition);
  const { feats } = require('@crossworld/sanguine-engine/feats');
  assert.equal(rules.blueprint.feats, feats);
  assert.equal(Object.keys(roster).length, 8);
  for (const [id, calling] of Object.entries(roster)) {
    assert.equal(catalog.callings[id], calling.definition);
    assert.equal(calling.paths.length, 4);
    for (const path of calling.paths) {
      assert.equal(rules.blueprint.paths.find(item => item.id === path.id), path);
    }
    for (const feature of calling.features) {
      assert.equal(rules.blueprint.features.find(item => item.id === feature.id), feature);
    }
  }
  for (const path of gunslinger.paths) {
    assert.equal(rules.blueprint.paths.find(item => item.id === path.id), path);

    const {summary} = build('gunslinger',20,path.id);
    for (const [id,pool] of Object.entries(gunslingerResources(20,path.id))) assert.deepEqual(summary.resources[id],pool);
  }
  for (const feature of gunslinger.features) assert.equal(rules.blueprint.features.find(item => item.id === feature.id),feature);
});

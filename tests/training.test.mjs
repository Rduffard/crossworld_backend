import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import system from '../src/modules/archipelago/system/index.js';
import checks from '../src/modules/archipelago/system/trainingChecks.js';
import { trainingCheckModifier, proficiencyBonus } from '../../archipelago/src/lib/training.js';
import { validateTraining } from '../src/modules/archipelago/system/training.js';
const require = createRequire(import.meta.url);
const attributes = { might: 16, agility: 14, wit: 13, spirit: 12, resolve: 10, instinct: 8 };
test('all levels and attributes add proficiency exactly once for acquired relevant Training', () => {
  const owned = ['board', 'shoot', 'deceive', 'navigate'];
  for (let level = 1; level <= 20; level++) {
    const bonus = [2,3,4,5,6][Math.floor((level - 1) / 4)];
    assert.equal(proficiencyBonus(level), bonus);
    assert.equal(checks.proficiencyBonus(level), bonus);
    for (const [attribute, score] of Object.entries(attributes)) {
      const base = Math.floor((score - 10) / 2);
      for (const fn of [trainingCheckModifier, checks.trainingCheckModifier]) {
        assert.equal(fn(attributes, attribute, level, owned, 'board'), base + bonus);
        assert.equal(fn(attributes, attribute, level, owned, 'cut'), base);
        assert.equal(fn(attributes, attribute, level, owned), base);
        assert.equal(fn(attributes, attribute, level, ['board', 'board'], 'board'), base + bonus);
      }
    }
  }
  for (const level of [0,21,1.5,'1',null]) assert.throws(() => proficiencyBonus(level));
});
test('canonical catalog has 20 General Skills and no executable legacy rules', () => {
  assert.equal(system.training.length,20);
  assert.equal(new Set(system.training.map(e => e.id)).size,20);
  assert.ok(system.training.some(e => e.id === 'deceive'));
  assert.ok(!system.training.some(e => e.id === 'guile'));
  for (const entry of system.training) {
    assert.ok(entry.name && entry.description);
    for (const key of ['ranks','rank','maxRank','relatedChecks','prerequisites']) assert.equal(key in entry,false);
  }
  for (const key of ['checks','specialties','expandedSkillList']) assert.equal(key in system,false);
  for (const path of ['checkHelpers','skillHelpers','skills','checks']) assert.throws(() => require(`../src/modules/archipelago/system/blueprints/${path}.js`));
  assert.throws(() => validateTraining(['board','shoot','deceive',{ id: 'navigate', rank: 2 }]));
});
test('historical effect archive contains every original rank entry; Paths retain all 18 nodes', () => {
  const archive=readFileSync(new URL('../docs/historical-specialty-effects.md',import.meta.url),'utf8');
  assert.equal((archive.match(/^- Rank [1-4] —/gm) ?? []).length,92);
  for (const entry of system.legacyTraining) assert.ok(archive.includes(`## ${entry.name} (`));
  assert.equal(system.catalogs.specializations.length,6);
  for (const path of system.catalogs.specializations) {
    assert.equal(path.nodes.length,3);
    for (const node of path.nodes) assert.ok(node.effect && node.rankRequired && node.cost);
  }
});

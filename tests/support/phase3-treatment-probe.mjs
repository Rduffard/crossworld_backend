import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mock } from 'node:test';

const require = createRequire(import.meta.url);
const root = '../../src/modules/archipelago/';
mock.method(require('node:crypto'), 'randomInt', (minimum) => minimum);
const { build, rules } = await import('../helpers/phase2.mjs');
const commands = require(root + 'characters/commands');
const gear = require(root + 'equipment');
const rows = [];
const uuid = /[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi;
function normalize(row) {
  const ids = new Map();
  return JSON.stringify(row).replace(uuid, id => {
    if (!ids.has(id)) ids.set(id, 'generated-' + ids.size);
    return ids.get(id);
  });
}
function command(character, type, payload) {
  character.rulesRuntime.worldTime = 100;
  const request = { operationId: 'execution-probe', expectedRevision: character.documentRevision,
    rulesVersion: 'SA-CHAR-1', type, payload };
  const before = structuredClone(character);
  const result = commands.apply(character, request);
  rows.push(normalize({ before, request, result }));
}
for (const level of [3, 6, 14, 20]) {
  for (const handler of ['ghost-repair', 'ghost-sabotage']) {
    const { character, summary } = build('shipwright', level, 'drydock-ghost');
    const option = summary.abilityOptions.find(value => value.handler === handler);
    if (!option) continue;
    character.inventory.push(gear.issue({ definitionId: handler === 'ghost-repair' ? 'carpenter-tools' : 'thieves-tools' }));
    command(character, 'ability.activate', { optionId: option.id, parameters: { confirmed: true,
      objectId: 'object', ...(handler === 'ghost-repair' ? { objectMissingHealth: level } : {}) } });
  }
}
for (const deathSeconds of [0, 60]) {
  const { character, summary } = build('doctor', 17, 'field-surgeon');
  const option = summary.abilityOptions.find(value => value.handler === 'impossible-operation');
  character.inventory.push(gear.issue({ definitionId: 'healer-kit' }));
  command(character, 'ability.activate', { optionId: option.id, targetIds: ['ally'],
    parameters: { confirmed: true, bodyIntact: true, consent: true, deathSeconds } });
}
const convert = require(root + 'characters/abilities/casterPathOperations').convert;
for (const damageTypes of [['thunder', 'fire', 'lightning'], ['fire']]) {
  for (const turnId of ['turn', 'other']) {
    const state = { ownerTurn: { open: true, id: 'turn' },
      effects: [{ id: 'pending', turnId: 'turn', tempestConversion: { damageType: 'lightning' } }] };
    const management = { damageTypes };
    convert(state, { paths: { tidecaller: 'tempest-heart' } }, { callingId: 'tidecaller', turnId }, management);
    rows.push(normalize({ state, management }));
  }
}
for (const [calling, path] of [['shipwright','drydock-ghost'], ['shipwright','breakwater'], ['doctor','field-surgeon'], ['navigator','storm-broker']]) {
  const { ledger } = build(calling, 7, path);
  for (const choices of ['original', 'missing', 'invalid', 'duplicate']) {
    const input = structuredClone(ledger);
    if (choices === 'missing') input.levels[2].choices = {};
    if (choices === 'invalid') input.levels[2].choices.path = ['unknown'];
    if (choices === 'duplicate') input.levels[2].choices.path = [path, path];
    try { rows.push(normalize(rules.replay(input))); }
    catch (error) { rows.push(normalize([error.constructor.name, error.statusCode, error.message])); }
  }
}
const magic = require(root + 'equipment/magicProjection');
for (const [calling, path] of [['reaver', 'reef-colossus'], ['navigator', 'storm-broker'], ['gunslinger', 'brass-outrider'], ['tidecaller', 'tempest-heart']]) {
  for (const heavy of [false, true]) {
    const { character, summary } = build(calling, 14, path);
    const projection = structuredClone(summary);
    projection.movement = { ...projection.movement, walk: 30, swim: 'walk', fly: 40 };
    projection.activeEffects = [{ flySpeed: 20 }];
    projection.raging = true;
    if (heavy) {
      const armor = gear.issue({ definitionId: 'plate-armor' });
      character.inventory.push(armor);
      character.loadout.armor = armor.instanceId;
    }
    magic.project(projection, character);
    rows.push(normalize(projection.movement));
  }
}
for (const level of [3, 6, 17]) {
  const { character, summary } = build('doctor', level, 'field-surgeon');
  character.rulesRuntime.health.current = 1;
  character.inventory.push(gear.issue({ definitionId: 'healer-kit' }));
  const option = summary.abilityOptions.find(value => value.handler === 'triage');
  command(character, 'ability.activate', { optionId: option.id, targetIds: ['self'],
    parameters: { confirmed: true, targetRestEpoch: 'first-rest' } });
}
console.log(rows.length, createHash('sha256').update(JSON.stringify(rows)).digest('hex'));




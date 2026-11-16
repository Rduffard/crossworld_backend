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
for (const level of [14, 15, 17, 18, 20]) {
  for (const source of ['slot', 'smite-free']) {
    const { character } = build('warden', level, 'leviathan-anchor');
    command(character, 'spell.cast', { callingId: 'warden', spellId: 'divine-smite',
      source, ...(source === 'slot' ? { slotLevel: 1 } : {}), targets: ['foe'], trigger: { eventId: 'smite-hit', confirmed: true } });
  }
}
for (const [calling, path] of [['warden', 'leviathan-anchor'], ['reaver', 'reef-colossus'], ['gunslinger', 'brass-outrider'], ['corsair', 'reef-knife']]) {
  for (const level of [3, 7, 14, 20]) {
    const { character, summary } = build(calling, level, path);
    for (const itemId of ['shortsword', 'longsword', 'musket']) {
      const item = gear.issue({ definitionId: itemId });
      character.inventory.push(item);
      character.loadout.mainHand = item.instanceId;
      rows.push(normalize(gear.derive(character, summary)));
    }
  }
}
for (const level of [3, 6, 10, 14, 20]) {
  const { character, summary } = build('shipwright', level, 'sparkwrite-aetherist');
  const option = summary.abilityOptions.find(value => value.handler === 'relay-place');
  command(character, 'ability.activate', { optionId: option.id, parameters: { confirmed: true } });
}
for (const [calling, path] of [['doctor','field-surgeon'],['navigator','gray-net'],['navigator','starwake-pilot']]) {
  for (const level of [3, 7, 11, 20]) {
    const { ledger, summary } = build(calling, level, path);
    rows.push(normalize({ training: summary.training, expertise: summary.expertise, replay: rules.replay(ledger) }));
  }
}
for (const level of [6, 10, 14, 20]) {
  const { character, summary } = build('shipwright', level, 'drydock-ghost');
  const option = summary.abilityOptions.find(value => value.handler === 'salvage');
  command(character, 'ability.activate', { optionId: option.id,
    parameters: { confirmed: true, objectId: 'wreck-one', salvageMinutes: 10 } });
}
for (const level of [6, 12, 17, 20]) {
  const { character, ledger } = build('doctor', level, 'field-surgeon');
  ledger.levels[2].choices.surgicalDiscipline = ['toxicology'];
  character.rulesLedger = ledger;
  character.inventory.push(gear.issue({ definitionId: 'healer-kit' }));
  const option = rules.replay(ledger).abilityOptions.find(value => value.handler === 'triage-antidote');
  command(character, 'ability.activate', { optionId: option.id, targetIds: ['self'],
    parameters: { confirmed: true, targetRestEpoch: 'first-rest' } });
}
for (const level of [5, 11, 14, 20]) {
  for (const critical of [false, true]) {
    const { character } = build('corsair', level, 'reef-knife');
    const weapon = character.inventory.find(item => item.definitionId === 'shortsword');
    character.loadout.mainHand = weapon.instanceId;
    character.loadout.grip = 'one';
    command(character, 'strike.resolve', { kind: 'cunning', options: ['trip'], weaponId: weapon.instanceId,
      targetId: 'foe', targetSize: 'medium', turnId: 'turn-one', eventId: 'hit-one', confirmed: true, critical });
  }
}
console.log(rows.length, createHash('sha256').update(JSON.stringify(rows)).digest('hex'));



import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { build, rules } from '../helpers/phase2.mjs';

const require = createRequire(import.meta.url);
const root = '../../src/modules/archipelago/';
const vitality = require(root + 'combat/vitality/vitality');
const commands = require(root + 'characters/commands');
const { definition, issue } = require(root + 'equipment/inventory');
const { bloodPrice } = require(root + 'characters/abilities/conduitOperations');
const rows = [];
function capture(fn) {
  try {
    rows.push(fn());
  } catch (error) {
    rows.push([error.constructor.name, error.statusCode, error.code, error.message]);
  }
}
function dispatch(character, type, payload) {
  return commands.apply(character, {
    operationId: 'mitigation-probe',
    expectedRevision: character.documentRevision,
    rulesVersion: 'SA-CHAR-1',
    type,
    payload,
  });
}

const reef = build('reaver', 11, 'reef-colossus');
const navigator = build('navigator', 13, 'gray-net');
const conduit = build('tidecaller', 18, 'sanguine-conduit');
const plate = issue({ definitionId: 'plate-armor' });
if (definition(plate.definitionId).category !== 'heavy') throw new Error('Expected heavy armor fixture');
for (const [fixture, context] of [
  [reef, {}], [reef, { heavy: true }], [reef, { suppressed: true }],
  [navigator, {}], [conduit, {}],
]) {
  for (const current of [0, 3, fixture.character.rulesRuntime.health.max]) {
    for (const temporaryHealth of [0, 2, 100]) {
      const base = structuredClone(fixture.character);
      const state = base.rulesRuntime;
      state.health.current = current;
      state.temporaryHealth = temporaryHealth;
      state.temporaryHealthMetadata = temporaryHealth ? { source: bloodPrice, grantId: 'grant-probe' } : null;
      state.worldTime = 0;
      state.effects = [
        { id: 'focus', featureId: 'spell:guidance', concentration: true },
        { id: 'mark', featureId: 'spell:hunter-s-mark', concentration: true },
        ...(fixture === reef ? [{ id: 'rage-instance', featureId: 'calling:reaver:rage:1', rage: true }] : []),
      ];
      if (context.heavy) {
        base.inventory.push(plate);
        base.loadout.armor = plate.instanceId;
      }
      for (const damageType of ['slashing', 'force', 'fire']) {
        for (const [immune, resistant, evasion, ignoreMitigation] of [
          [false, false, false, false], [false, true, false, false],
          [true, true, true, false], [false, true, true, false], [true, true, true, true],
        ]) {
          const summary = {
            ...fixture.summary,
            evasion,
            immunities: immune ? [damageType] : [],
            resistances: resistant ? [damageType] : [],
            raging: fixture === reef,
            reefSkinSuppressed: context.suppressed,
          };
          for (const agilityHalfSave of [undefined, 'success', 'failure']) {
            for (const amount of [0, 11, current + temporaryHealth, current + temporaryHealth + state.health.max]) {
              const payload = { damageType, agilityHalfSave, amount, attack: true, critical: agilityHalfSave === 'failure', confirmed: true };
              if (fixture === conduit) payload.unbrokenCurrent = true;
              capture(() => {
                const character = structuredClone(base);
                const result = vitality.damage(character, summary, payload, { ignoreMitigation });
                return [result, character.rulesRuntime];
              });
            }
          }
        }
      }
      for (const amount of [0, 2, 8, 101, -1, '8']) {
        capture(() => rules.runtime.update(fixture.summary, state, {
          type: 'temporary-health', value: amount, expectedRevision: state.revision,
        }));
        capture(() => dispatch(base, 'temp-health.choose', { amount, source: 'probe', expiresAt: 100, confirmed: true }));
      }
      for (const payload of [
        { amount: 11, damageType: 'force', confirmed: true },
        { amount: 5, damageType: 'slashing', attack: true, confirmed: true, agilityHalfSave: 'failure' },
        { amount: '5', damageType: 'force', confirmed: true },
        { amount: 5, damageType: 'bad', confirmed: true },
        { amount: 5, damageType: 'force', confirmed: false },
        { amount: 5, damageType: 'force', confirmed: true, critical: 'yes' },
      ]) capture(() => dispatch(base, 'health.damage', payload));
    }
  }
}

const json = JSON.stringify(rows.map(row => {
  const ids = new Map();
  return JSON.parse(JSON.stringify(row, (_, value) => {
    if (typeof value !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) return value;
    if (!ids.has(value)) ids.set(value, 'generated-' + ids.size);
    return ids.get(value);
  }));
}));
if (process.argv[2]) (await import('node:fs')).writeFileSync(process.argv[2], json);
console.log(rows.length, createHash('sha256').update(json).digest('hex'));

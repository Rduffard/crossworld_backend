import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { build, rules } from '../helpers/phase2.mjs';

const require = createRequire(import.meta.url);
const commands = require('../../src/modules/archipelago/characters/commands');
const observations = [];
function capture(run) {
  try {
    const ids = new Map();
    observations.push(JSON.parse(JSON.stringify(run(), (_, value) => {
      if (typeof value !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) return value;
      if (!ids.has(value)) ids.set(value, 'generated-' + ids.size);
      return ids.get(value);
    })));
  } catch (error) {
    observations.push([error.constructor.name, error.statusCode, error.code, error.message]);
  }
}
function run(character, type, payload, expectedRevision = character.documentRevision) {
  return commands.apply(character, { type, payload, expectedRevision, operationId: 'damage-feature-probe', rulesVersion: 'SA-CHAR-1' });
}
for (const [calling, level, path] of [
  ['tidecaller',17,'sanguine-conduit'], ['tidecaller',18,'sanguine-conduit'],
  ['tidecaller',19,'sanguine-conduit'], ['tidecaller',18,'tempest-heart'],
  ['reaver',10,'bloodwake'], ['reaver',11,'bloodwake'], ['reaver',12,'bloodwake'],
  ['navigator',12,'gray-net'], ['navigator',13,'gray-net'], ['navigator',14,'gray-net'],
]) {
  const { character, summary } = build(calling, level, path);
  for (const health of [0, 2, summary.health.max]) {
    for (const temporaryHealth of [0, 4]) {
      for (const active of [false, true]) {
        for (const available of [0, 1]) {
          const c = structuredClone(character);
          const state = c.rulesRuntime;
          Object.assign(state, { worldTime: 100, temporaryHealth });
          state.health.current = health;
          state.counters.relentlessRage = available;
          if (calling === 'tidecaller' && Object.hasOwn(state.pools, 'sanguine-conduit:unbroken-current')) state.pools['sanguine-conduit:unbroken-current'] = available;
          state.effects = [
            { id:'mark', featureId:'spell:hunter-s-mark', concentration:true, expiresAt:active ? 200 : 99 },
            { id:'other', featureId:'spell:guidance', concentration:true, expiresAt:200 },
            { id:'third', featureId:'spell:fly', concentration:true, expiresAt:200 },
          ];
          if (calling === 'reaver') state.effects.push({ id: 'rage-instance', featureId: 'calling:reaver:rage:1', rage:true, expiresAt:active ? 200 : 99 });
          if (calling === 'tidecaller' && !active) state.conditions = [{ conditionId:'stunned', source:'probe' }];
          for (const unbrokenCurrent of [undefined, true, 'yes']) {
            for (const amount of [1, health + temporaryHealth, health + temporaryHealth + summary.health.max]) {
              const payload = { amount, damageType:'force', confirmed:true, unbrokenCurrent };
              capture(() => run(c, 'health.damage', payload));
            }
          }
          if (calling === 'reaver' && health === 0) {
            state.pendingRelentlessRage = { dc: 10 + 5 * available };
            for (const total of [9, 10, 15, 20, '15']) {
              capture(() => run(c, 'relentless-rage.resolve', { total, confirmed:true }));
              capture(() => rules.runtime.update(summary, state, { type:'relentless-rage', value:total, expectedRevision:state.revision }));
            }
          }
        }
      }
    }
  }
  capture(() => run(character, 'health.damage', { amount: 1, damageType:'force', confirmed:true }, -1 + 2));
}
const json = JSON.stringify(observations);
if (process.argv[2]) writeFileSync(process.argv[2], json);
console.log(observations.length, createHash('sha256').update(json).digest('hex'));

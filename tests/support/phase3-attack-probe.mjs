import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createFixture, applyCommand } = require('../../src/modules/archipelago/combat/state');
const rows = [];
for (const roll of [1, 4, 5, 18, 19, 20]) {
  for (const health of [1, 18]) {
    const initial = createFixture('owner');
    initial.combatants[1].health.current = health;
    const input = { id: 'command-0001', expectedRevision: 0, type: 'attack', actor: 'corsair', weapon: 'cutlass', target: 'enemy' };
    const dice = [roll, 2, 4];
    let index = 0;
    const result = applyCommand(initial, input, 'owner', () => dice[index++]);
    rows.push({ input, health, result, consumed: index });
  }
}
const ids = new Map();
const normalized = JSON.stringify(rows).replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi, id => {
  if (!ids.has(id)) ids.set(id, 'generated-' + ids.size);
  return ids.get(id);
});
console.log(rows.length, createHash('sha256').update(normalized).digest('hex'));

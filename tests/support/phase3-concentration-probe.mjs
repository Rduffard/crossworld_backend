import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { build } from '../helpers/phase2.mjs';

const require = createRequire(import.meta.url);
const commands = require('../../src/modules/archipelago/characters/commands');
const vitality = require('../../src/modules/archipelago/combat/vitality/vitality');
const rows = [];
function capture(run) {
  try {
    const ids = new Map();
    rows.push(JSON.parse(JSON.stringify(run(), (_, value) => {
      if (typeof value !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) return value;
      if (!ids.has(value)) ids.set(value, 'generated-' + ids.size);
      return ids.get(value);
    })));
  } catch (e) {
    rows.push([e.constructor.name, e.statusCode, e.code, e.message]);
  }
}
function command(c, type, payload, expectedRevision = c.documentRevision) {
  return commands.apply(c, { type, payload, expectedRevision, operationId: 'concentration-probe', rulesVersion: 'SA-CHAR-1' });
}

for (const [calling, level, path] of [['navigator', 12], ['navigator', 13], ['doctor', 3], ['shipwright', 6, 'sparkwrite-aetherist']]) {
  const { character, summary } = build(calling, level, path);
  for (const source of ['navigator', 'scroll:scroll-one', 'item:wand-one', 'ready']) {
    for (const layout of ['single', 'mixed', 'expired', 'fallback', 'replacement', 'missing']) {
      const c = structuredClone(character);
      const state = c.rulesRuntime;
      const mark = { id: 'mark', featureId: 'spell:hunter-s-mark', source, concentration: true, expiresAt: 200 };
      const other = { id: 'other', featureId: 'spell:guidance', source, concentration: true, expiresAt: 200 };
      Object.assign(state, { worldTime: 100, temporaryHealth: 100, effects: [mark] });
      if (source === 'ready') mark.featureId = 'spell:guidance';
      if (layout === 'mixed') state.effects.push(other);
      if (layout === 'expired') { mark.expiresAt = 99; state.effects.push(other); }
      if (layout === 'fallback') state.effects = [{ ...mark, id: 'fallback-one' }, { ...mark, id: 'fallback-two', source: 'scroll:duplicate' }, { ...mark, id: 'exact' }];
      if (layout === 'replacement') state.effects = [{ ...mark, id: 'replacement' }];
      if (layout === 'missing') state.effects = [];
      const refs = layout === 'fallback' ? ['fallback-one', 'fallback-two'] : ['mark', 'other'];
      for (const amount of [0, 1, 20, 22, 100]) {
        capture(() => command(c, 'health.damage', { amount, damageType: 'force', confirmed: true }));
      }
      for (const dc of [10, 15, 30]) {
        state.concentrationChecks = [{ id: 'check', dc, damage: 30, effects: refs }, { id: 'overlap', dc, damage: 30, effects: refs }];
        for (const rolls of [[1], [20], [dc - summary.savingThrowModifiers.resolve], [1, 20], [20, 1], [], ['20'], [21], null]) {
          const payload = { checkId: 'check', rolls, confirmed: true };
          capture(() => command(c, 'concentration.resolve', payload));
          for (const advantage of [false, true]) capture(() => {
            const copy = structuredClone(c);
            const projected = { ...summary, concentrationSaveAdvantage: advantage };
            const result = vitality.apply(copy, projected, 'concentration.resolve', payload);
            return [result, copy.rulesRuntime];
          });
        }
      }
      capture(() => command(c, 'concentration.resolve', { checkId: 'missing' }));
      capture(() => command(c, 'concentration.resolve', { checkId: 'check' }, c.documentRevision + 1));
      capture(() => {
        const copy = structuredClone(c);
        const result = vitality.apply(copy, { ...summary, concentrationSaveAdvantage: true }, 'concentration.resolve', { checkId: 'check' });
        return [result.rolls.length, result.rolls.every(n => n >= 1 && n <= 20), result.total === Math.max(...result.rolls) + summary.savingThrowModifiers.resolve, result.success === (result.total >= result.dc)];
      });
    }
  }
}

const json = JSON.stringify(rows);
if (process.argv[2]) writeFileSync(process.argv[2], json);
console.log(rows.length, createHash('sha256').update(json).digest('hex'));

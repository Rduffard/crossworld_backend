import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { build, rules } from '../helpers/phase2.mjs';

const require = createRequire(import.meta.url);
const commands = require('../../src/modules/archipelago/characters/commands');
const vitality = require('../../src/modules/archipelago/combat/vitality/vitality');
const { issue } = require('../../src/modules/archipelago/equipment/inventory');
const rows = [];
function capture(fn) {
  try {
    const ids = new Map();
    rows.push(JSON.parse(JSON.stringify(fn(), (_, value) => {
      if (typeof value !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) return value;
      if (!ids.has(value)) ids.set(value, 'generated-' + ids.size);
      return ids.get(value);
    })));
  } catch (error) {
    rows.push([error.constructor.name, error.statusCode, error.code, error.message]);
  }
}
function dispatch(character, type, payload, expectedRevision = character.documentRevision) {
  return commands.apply(character, { type, payload, expectedRevision, operationId: 'save-projection-probe', rulesVersion: 'SA-CHAR-1' });
}

for (const [calling, level, path] of [
  ['warden', 5], ['warden', 6], ['warden', 7, 'iron-covenant'], ['warden', 18, 'lantern-vigil'],
  ['reaver', 11, 'bloodwake'], ['doctor', 3], ['shipwright', 6, 'sparkwrite-aetherist'], ['navigator', 20],
]) {
  const { character, summary } = build(calling, level, path);
  for (const exhaustion of [0, 1, 5, 6, '2']) {
    for (const armorState of ['none', 'unattuned', 'unworn', 'ring', 'both']) {
      for (const condition of ['clear', 'stunned', 'zero']) {
        const c = structuredClone(character);
        const state = c.rulesRuntime;
        state.worldTime = 100;
        state.exhaustion = exhaustion;
        state.conditions = condition === 'stunned' ? [{ conditionId: 'stunned', source: 'probe' }] : [];
        if (condition === 'zero') state.health.current = 0;
        state.effects = [
          { id: 'focus', featureId: 'spell:guidance', concentration: true },
          { id: 'other-aura', featureId: 'calling:warden:aura-of-protection:6', source: 'other', auraOfProtection: 5 },
          ...(calling === 'shipwright' ? [{ id: 'relay-instance', objectType: 'relay', withinTenFeet: true, health: { current: 2, max: 2 } }] : []),
        ];
        if (armorState !== 'none') {
          const ring = issue({ definitionId: 'ring-of-protection' });
          Object.assign(ring, { worn: armorState !== 'unworn', attuned: armorState !== 'unattuned' });
          c.inventory.push(ring);
        }
        if (armorState === 'both') c.inventory.push({ ...issue({ definitionId: 'cloak-of-protection' }), worn: true, attuned: true });
        state.concentrationChecks = [{ id: 'check', dc: 15, damage: 30, effects: ['focus'] }];
        const projected = rules.runtime.project(summary, state, c);
        capture(() => ({
          attributes: summary.attributes, attributeModifiers: summary.attributeModifiers,
          training: summary.savingThrows, trainingBonus: summary.trainingBonus,
          base: summary.savingThrowModifiers, rawAura: summary.auraOfProtection,
          liveAura: projected.auraOfProtection, projected: projected.savingThrowModifiers,
          activeItems: projected.activeMagicItems, advantage: projected.concentrationSaveAdvantage,
          exhaustion: projected.exhaustion, skillModifiers: projected.skillModifiers,
          initiative: projected.initiative, spellcasting: projected.spellcasting,
        }));
        for (const rolls of [[12], [1, 12], [21]]) {
          const payload = { checkId: 'check', rolls, confirmed: true };
          capture(() => dispatch(c, 'concentration.resolve', payload));
          capture(() => {
            const copy = structuredClone(c);
            return [vitality.apply(copy, projected, 'concentration.resolve', payload), copy.rulesRuntime];
          });
        }
        if (calling === 'reaver' && condition === 'zero') {
          state.effects.push({ id: 'rage-instance', featureId: 'calling:reaver:rage:1', rage: true });
          state.pendingRelentlessRage = { dc: 10 };
          for (const total of [9, 10, '10']) capture(() => dispatch(c, 'relentless-rage.resolve', { total, confirmed: true }));
        }
      }
    }
  }
}
const json = JSON.stringify(rows);
if (process.argv[2]) writeFileSync(process.argv[2], json);
console.log(rows.length, createHash('sha256').update(json).digest('hex'));

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const rules = require('../../src/modules/archipelago/system/rules2024');
export const scores = { might: 13, agility: 13, resolve: 13, wit: 13, instinct: 13, spirit: 13 };
export function testLoadout() {
  const item = require('../../src/modules/archipelago/equipment').issue({ definitionId: 'cutlass' });
  return { inventory: [item], loadout: { mainHand: item.instanceId, offHand: null, armor: null, grip: 'one' } };
}
export function build(callingId, level = 1, attributes = scores, pathId) {
  const ledger = { version: 3, ruleset: 'srd-5.2.1', revision: level - 1,
    baseAttributes: structuredClone(attributes), levels: [] };
  for (let n = 1; n <= level; n++) {
    const event = { callingId, choices: {} };
    ledger.levels.push(event);
    for (let attempt = 0; attempt < 40; attempt++) {
      const summary = rules.replay(ledger);
      if (summary.decisionsComplete) break;
      const request = summary.requiredChoices[0];
      if (request.key === 'feat') {
        event.choices.feat = 'ability-score-improvement';
        const attribute = Object.keys(attributes).find(id => summary.attributes[id] <= 18);
        event.choices.increases = { [attribute]: 2 };
      } else if (request.key === 'pathId') event.choices.pathId = [pathId ?? request.options[0]];
      else if (request.key === 'spellMastery') event.choices.spellMastery = [1, 2].map(n =>
        request.options.find(id => rules.blueprint.spells.find(s => s.id === id).level === n));
      else if (request.key === 'prepared' && ledger.levels.length > 1) {
        const old = rules.replay({ ...ledger, levels: ledger.levels.slice(0, -1) }).spellcasting[callingId]?.prepared ?? [];
        event.choices.prepared = [...old.filter(id => request.options.includes(id)), ...request.options.filter(id => !old.includes(id))].slice(0, request.count);
      } else event.choices[request.key] = request.options.slice(0, request.count);
    }
    if (!rules.replay(ledger).decisionsComplete) throw Error('Incomplete test fixture');
  }
  const summary = rules.replay(ledger);
  return { rulesLedger: ledger, rulesRuntime: rules.runtime.initialize(summary),
    attributes: summary.attributes, progression: { rank: summary.totalLevel },
    training: summary.training, calling: callingId, documentRevision: 0 };
}

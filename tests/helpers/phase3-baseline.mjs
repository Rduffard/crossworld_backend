import { createRequire } from 'node:module';
import { build } from './phase2.mjs';

const require = createRequire(import.meta.url);
const persistence = require('../../src/modules/archipelago/characters/persistence');

function serializableCharacter(character) {
  // Preserve identity references in the loadout while normalizing generated IDs.
  const ids = new Map(character.inventory.map((item, index) => [item.instanceId, 'item-' + (index + 1)]));
  return JSON.parse(JSON.stringify({
    schemaVersion: character.schemaVersion,
    rulesVersion: character.rulesVersion,
    rulesLedger: character.rulesLedger,
    rulesRuntime: character.rulesRuntime,
    documentRevision: character.documentRevision,
    attributes: character.attributes,
    inventory: character.inventory,
    loadout: character.loadout,
    goldCp: character.goldCp,
  }, (_key, value) => ids.get(value) ?? value));
}

export function baselineCharacters() {
  const start = build('warden');
  const levelTwo = build('warden', 2);
  const path = build('warden', 3, 'iron-covenant');
  const spent = JSON.parse(JSON.stringify(levelTwo.character.rulesRuntime));
  spent.health.current -= 3;
  spent.temporaryHealth = 2;
  spent.slots[0] -= 1;
  spent.hitDice.d10 -= 1;
  const reconciled = persistence.reconcile(spent, levelTwo.summary, path.summary);
  return {
    creation: serializableCharacter(start.character),
    path: {
      ledger: path.ledger,
      paths: path.summary.paths,
      attributes: path.summary.attributes,
      savingThrowModifiers: path.summary.savingThrowModifiers,
      skillModifiers: path.summary.skillModifiers,
      equipmentTraining: path.summary.equipmentTraining,
    },
    spent,
    reconciled,
  };
}

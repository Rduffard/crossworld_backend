const { definition, issue, validateInventory, validateLoadout, keys, fail } = require("./inventory");
const { derive } = require("./equipmentView");

function update(character, operation) {
  keys(operation, ["expectedRevision", "add", "remove", "loadout", "edit"]);
  if (operation.expectedRevision !== (character.documentRevision ?? 0))
    fail("Character changed; reload equipment");
  if (!character.loadout)
    fail("Recreate experimental character for the equipment schema");
  const inventory = structuredClone(character.inventory);
  if (operation.remove) {
    if (
      !Array.isArray(operation.remove) ||
      operation.remove.some((id) => !inventory.some((i) => i.instanceId === id))
    )
      fail("Invalid removed item");
  }
  const next = inventory.filter(
    (i) => !(operation.remove ?? []).includes(i.instanceId)
  );
  if (operation.add) {
    if (!Array.isArray(operation.add) || operation.add.length > 50)
      fail("Invalid item additions");
    next.push(...operation.add.map(issue));
  }
  if (operation.edit) {
    if (!Array.isArray(operation.edit)) fail("Invalid item edits");
    for (const change of operation.edit) {
      keys(change, ["instanceId", "quantity", "customName", "notes"]);
      const item = next.find((i) => i.instanceId === change.instanceId);
      if (!item) fail("Cannot edit unowned item");
      for (const key of ["quantity", "customName", "notes"])
        if (change[key] !== undefined) item[key] = change[key];
    }
  }
  const loadout = structuredClone(operation.loadout ?? character.loadout);
  validateLoadout(next, loadout);
  const changes={ inventory: next, loadout };
  if(character.rulesRuntime?.effects.some(e=>e.featureId==='path:iron-covenant:covenant-of-steel:3')){
    const updated={...character,inventory:next,loadout,rulesRuntime:structuredClone(character.rulesRuntime)};
    require('../characters/abilities/covenantOperations').prune(updated);
    if(updated.rulesRuntime.effects.length!==character.rulesRuntime.effects.length)changes.rulesRuntime=updated.rulesRuntime;
  }
  return changes;
}

module.exports = { definition, issue, validateInventory, validateLoadout, derive, update };

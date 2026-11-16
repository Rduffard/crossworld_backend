const { packages, options, startingEquipment } = require('@crossworld/sanguine-engine/equipment/starting-equipment');
const { goldToCopper } = require('@crossworld/sanguine-engine/equipment/commerce');

function issue(callingId, selection) {
  const selected = startingEquipment(callingId, selection);
  const inventory = selected.items.flatMap(id=>require('./bundles').label(id));
  // Equipping is an explicit player action; packs never silently wield two weapons.
  return { inventory, loadout: { mainHand: null, offHand: null, armor: null, grip: 'one' }, goldCp: goldToCopper(selected.gold) };
}
module.exports = { packages, options, issue };

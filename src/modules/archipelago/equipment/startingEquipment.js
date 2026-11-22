const { packages, options, startingEquipment } = require('@crossworld/sanguine-engine/equipment/starting-equipment');
const { goldToCopper } = require('@crossworld/sanguine-engine/equipment/commerce');

const primaryWeapons = {
  corsair: { 'pack-a': 'shortsword' },
  gunslinger: { 'pack-a': 'greatsword', 'pack-b': 'longbow', 'pack-c': 'pistol' },
  navigator: { 'pack-a': 'longbow' },
  tidecaller: { 'pack-a': 'spear' },
  warden: { 'pack-a': 'longsword' },
  reaver: { 'pack-a': 'greataxe' },
  doctor: { 'pack-a': 'mace' },
  shipwright: { 'pack-a': 'arcane-focus-staff' },
};

function issue(callingId, selection, equip = false) {
  const selected = startingEquipment(callingId, selection);
  const inventory = selected.items.flatMap(id=>require('./bundles').label(id));
  const { definition, validateLoadout } = require('./inventory');
  const weapon = equip ? inventory.find(item => item.definitionId === primaryWeapons[callingId][selection]) : null;
  const armor = equip ? inventory.find(item => item.definitionId && definition(item.definitionId).kind === 'armor') : null;
  // Doctors need a free hand for somatic healing spells.
  const twoHanded = weapon && definition(weapon.definitionId).hands === 2;
  const shield = equip && callingId !== 'doctor' && !twoHanded
    ? inventory.find(item => item.definitionId === 'shield') : null;
  const loadout = {
    mainHand: weapon?.instanceId ?? null,
    offHand: shield?.instanceId ?? null,
    armor: armor?.instanceId ?? null,
    grip: twoHanded ? 'two' : 'one',
  };
  validateLoadout(inventory, loadout);
  return { inventory, loadout, goldCp: goldToCopper(selected.gold) };
}
module.exports = { packages, options, issue };

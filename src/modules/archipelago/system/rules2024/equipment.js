// Starting class packages from SRD 5.2.1 Core Class Traits. Descriptive gear
// stays in inventory even when it has no weapon/armor definition.
const packages = {
  corsair: { gold: 100, a: { gold: 8, items: ['leather-armor', 'dagger', 'dagger', 'shortsword', 'shortbow', '20 Arrows', 'Quiver', "Thieves' Tools", "Burglar's Pack"] } },
  gunslinger: { gold: 155, a: { gold: 4, items: ['chain-mail', 'greatsword', 'flail', ...Array(8).fill('javelin'), "Dungeoneer's Pack"] }, b: { gold: 11, items: ['studded-leather-armor', 'scimitar', 'shortsword', 'longbow', '20 Arrows', 'Quiver', "Dungeoneer's Pack"] } },
  navigator: { gold: 150, a: { gold: 7, items: ['studded-leather-armor', 'scimitar', 'shortsword', 'longbow', '20 Arrows', 'Quiver', 'Druidic Focus', "Explorer's Pack"] } },
  tidecaller: { gold: 50, a: { gold: 28, items: ['spear', 'dagger', 'dagger', 'Arcane Focus (crystal)', "Dungeoneer's Pack"] } },
  warden: { gold: 150, a: { gold: 9, items: ['chain-mail', 'shield', 'longsword', ...Array(6).fill('javelin'), 'Holy Symbol', "Priest's Pack"] } },
  reaver: { gold: 75, a: { gold: 15, items: ['greataxe', ...Array(4).fill('handaxe'), "Explorer's Pack"] } },
  doctor: { gold: 110, a: { gold: 7, items: ['chain-shirt', 'shield', 'mace', 'Holy Symbol', "Priest's Pack"] } },
  shipwright: { gold: 55, a: { gold: 5, items: ['dagger', 'dagger', 'Arcane Focus (quarterstaff)', 'Robe', 'Spellbook', "Scholar's Pack"] } },
};
function options(callingId) {
  return ['pack-a', ...(packages[callingId].b ? ['pack-b'] : []), ...(callingId==='gunslinger'?['pack-c']:[]), 'starting-gold'];
}
function issue(callingId, selection) {
  const spec = packages[callingId];
  if (!spec || !options(callingId).includes(selection)) throw Error('Invalid starting equipment');
  const selected = selection === 'pack-c' ? {gold:0,items:['leather-armor','pistol','20 Bullets','dagger',"Explorer's Pack"]} : selection === 'starting-gold' ? { gold: spec.gold, items: [] }
    : spec[selection === 'pack-a' ? 'a' : 'b'];
  const inventory = selected.items.flatMap(id=>require('../../equipment/bundles').label(id));
  // Equipping is an explicit player action; packs never silently wield two weapons.
  return { inventory, loadout: { mainHand: null, offHand: null, armor: null, grip: 'one' }, goldCp: selected.gold*100 };
}
module.exports = { packages, options, issue };

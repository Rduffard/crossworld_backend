const { equipmentMovement, maximumGrantedMovement } = require('@crossworld/sanguine-engine/equipment/movement');
const { magicModifiers } = require('@crossworld/sanguine-engine/equipment/magic-modifiers');
const { magicAttunementEligible, magicItemActive } = require('@crossworld/sanguine-engine/equipment/item-effects');
const { definition: definitionOf } = require('./inventory');

function profile(item){return item?.definitionId?definitionOf(item.definitionId).profile:null;}
function eligible(item,summary){return magicAttunementEligible(profile(item),summary.spellcasting,summary.featSpellcasters);}

// The character projection owns and passes a fresh summary copy.
function project(summary,c){
  const heldIds=[c.loadout?.mainHand,c.loadout?.offHand];
  const active=c.inventory.filter(item=>magicItemActive(item,profile(item),heldIds,summary.spellcasting,summary.featSpellcasters));
  const { guardBonus, saveBonus, attackBonus, ignoreHalfCover, waterBreathing, swimSpeed } = magicModifiers(active.map(profile));
  summary.magicGuardBonus=guardBonus;
  for(const casting of Object.values(summary.spellcasting))casting.attackModifier+=attackBonus;
  for(const casting of summary.featSpellcasters??[])casting.attackModifier+=attackBonus;
  summary.ignoreHalfCoverOnSpellAttacks=ignoreHalfCover;
  summary.waterBreathing=waterBreathing;
  summary.activeMagicItems=active.map(i=>({instanceId:i.instanceId,definitionId:i.definitionId}));
  const armor=c.inventory.find(i=>i.instanceId===c.loadout.armor),definition=armor?.definitionId?definitionOf(armor.definitionId):null;
  Object.assign(summary.movement, equipmentMovement(summary, definition, {
    swimSpeeds: summary.lineage ? [swimSpeed, summary.lineage.movement.swim] : active.length ? [swimSpeed] : [],
    activeFlySpeed: maximumGrantedMovement(0, summary.activeEffects?.map(effect => effect.flySpeed) ?? []),
  }));
  return saveBonus;
}

module.exports = { profile, eligible, project };

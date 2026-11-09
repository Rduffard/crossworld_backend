function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function profile(item){return item?.definitionId?require('./index').definition(item.definitionId).profile:null;}
function eligible(item,summary){const p=profile(item);return p?.requiresAttunement&&(!p.spellcasterPrerequisite||Object.values(summary.spellcasting).some(c=>c.cantrips.length||c.slots.length)||summary.featSpellcasters?.length);}
function validate(c,summary){
  const attuned=c.inventory.filter(i=>i.attuned),limit=summary.paths.corsair==='reef-knife'&&summary.callingLevels.corsair>=13?4:3;
  if(attuned.length>limit||new Set(attuned.map(i=>profile(i).attunementFamily??i.definitionId)).size!==attuned.length||attuned.some(i=>!eligible(i,summary)))fail('Attunement requires eligible distinct profiles within your limit');
  const cloaks=c.inventory.filter(i=>i.worn&&profile(i)?.wearSlot==='cloak');if(cloaks.length>1)fail('Wear only one cloak at a time');
}
function attune(c,summary,choice){
  if(!choice||typeof choice!=='object'||Array.isArray(choice)||Object.keys(choice).some(k=>!['instanceId','attuned'].includes(k))||typeof choice.attuned!=='boolean')fail('Choose one attunement change for the Short Rest');
  const item=c.inventory.find(i=>i.instanceId===choice.instanceId);if(!item||!profile(item)?.requiresAttunement)fail('Choose an owned attunable item');if(item.attuned===choice.attuned||!item.attuned&&!choice.attuned)fail('Choose a changed attunement state');
  if(choice.attuned&&!eligible(item,summary))fail('This item requires a spellcaster');item.attuned=choice.attuned;validate(c,summary);
}
function wear(c,summary,p){
  if(Object.keys(p).some(k=>!['instanceId','worn','confirmed'].includes(k))||typeof p.worn!=='boolean'||p.confirmed!==true)fail('Confirm wearing or removing the owned magic item');
  const item=c.inventory.find(i=>i.instanceId===p.instanceId);if(!item||!profile(item)?.wearSlot)fail('Choose a wearable magic item');if(require('../system/rules2024/vitality').incapacitated(c.rulesRuntime))fail('Cannot change worn gear while Incapacitated');item.worn=p.worn;validate(c,summary);return {type:'equipment.wear',instanceId:item.instanceId,worn:item.worn};
}
function project(summary,c){
  const active=c.inventory.filter(i=>{const p=profile(i);return p&&(!p.requiresAttunement||i.attuned&&eligible(i,summary))&&(!p.wearSlot||i.worn)&&(!p.held||[c.loadout.mainHand,c.loadout.offHand].includes(i.instanceId));});
  summary.magicGuardBonus=active.reduce((n,i)=>n+(profile(i).guardBonus??0),0);
  const saveBonus=active.reduce((n,i)=>n+(profile(i).saveBonus??0),0),attackBonus=active.reduce((n,i)=>n+(profile(i).spellAttackBonus??0),0);
  for(const id of Object.keys(summary.savingThrowModifiers))summary.savingThrowModifiers[id]+=saveBonus;
  for(const casting of Object.values(summary.spellcasting))casting.attackModifier+=attackBonus;
  for(const casting of summary.featSpellcasters??[])casting.attackModifier+=attackBonus;
  summary.ignoreHalfCoverOnSpellAttacks=active.some(i=>profile(i).ignoreHalfCover);
  summary.waterBreathing=active.some(i=>profile(i).waterBreathing);
  const swim=summary.movement.swim;
  summary.activeMagicItems=active.map(i=>({instanceId:i.instanceId,definitionId:i.definitionId}));
  const armor=c.inventory.find(i=>i.instanceId===c.loadout.armor),definition=armor?.definitionId?require('./index').definition(armor.definitionId):null;
  if(definition?.category==='heavy'){
    const speedBonus=(summary.callingLevels.reaver>=5?10:0)+(summary.callingLevels.navigator>=6?10:0)+(summary.paths.gunslinger==='brass-outrider'&&summary.callingLevels.gunslinger>=7?10:0);summary.movement.walk=Math.max(0,summary.movement.walk-speedBonus);
    if(summary.paths.tidecaller==='tempest-heart'&&summary.callingLevels.tidecaller>=14)summary.movement.fly=summary.activeEffects.reduce((max,e)=>Math.max(max,e.flySpeed??0),0);
  }
  if(definition?.mightRequirement&&summary.attributes.might<definition.mightRequirement)summary.movement.walk=Math.max(0,summary.movement.walk-10);
  if(summary.paths.reaver==='reef-colossus'&&summary.callingLevels.reaver>=6&&summary.raging&&!summary.reefSkinSuppressed&&definition?.category!=='heavy')summary.movement.walk=Math.max(0,summary.movement.walk-5);
  summary.movement.swim=Math.max(swim==='walk'?summary.movement.walk:swim,...active.map(i=>profile(i).swimSpeed??0));
  return summary;
}
module.exports={profile,eligible,validate,attune,wear,project};

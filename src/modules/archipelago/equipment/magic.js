const { reefKnifeAttunementLimit, magicLoadoutError } = require('@crossworld/sanguine-engine/equipment/item-effects');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
const { profile, eligible } = require('./magicProjection');
function validate(c,summary){
  const limit=reefKnifeAttunementLimit(summary.paths.corsair,summary.callingLevels.corsair);
  const error=magicLoadoutError(c.inventory,limit,profile,item=>eligible(item,summary));
  if(error)fail(error);
}
function attune(c,summary,choice){
  if(!choice||typeof choice!=='object'||Array.isArray(choice)||Object.keys(choice).some(k=>!['instanceId','attuned'].includes(k))||typeof choice.attuned!=='boolean')fail('Choose one attunement change for the Short Rest');
  const item=c.inventory.find(i=>i.instanceId===choice.instanceId);if(!item||!profile(item)?.requiresAttunement)fail('Choose an owned attunable item');if(item.attuned===choice.attuned||!item.attuned&&!choice.attuned)fail('Choose a changed attunement state');
  if(choice.attuned&&!eligible(item,summary))fail('This item requires a spellcaster');item.attuned=choice.attuned;validate(c,summary);
}
function wear(c,summary,p){
  if(Object.keys(p).some(k=>!['instanceId','worn','confirmed'].includes(k))||typeof p.worn!=='boolean'||p.confirmed!==true)fail('Confirm wearing or removing the owned magic item');
  const item=c.inventory.find(i=>i.instanceId===p.instanceId);if(!item||!profile(item)?.wearSlot)fail('Choose a wearable magic item');if(require('../combat/vitality/healthState').incapacitated(c.rulesRuntime))fail('Cannot change worn gear while Incapacitated');item.worn=p.worn;validate(c,summary);return {type:'equipment.wear',instanceId:item.instanceId,worn:item.worn};
}
module.exports={profile,eligible,validate,attune,wear};

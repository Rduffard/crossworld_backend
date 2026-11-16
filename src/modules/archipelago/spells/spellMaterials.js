const { requirements, items, allocateSpellMaterials, spellMaterialCopperCost } = require('@crossworld/sanguine-engine/spells').materials;
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function spend(character,spell,materialIds,targets=[]){
  if(!Array.isArray(materialIds)||new Set(materialIds).size!==materialIds.length||materialIds.some(id=>typeof id!=='string'))fail('Choose distinct component instances');
  if(!Object.hasOwn(requirements,spell.id)){
    if(spell.specificMaterial)fail('This spell has no validated material profile');
    if(materialIds.length)fail('This spell needs no priced component');return [];
  }
  const selected=materialIds.map(id=>{const item=character.inventory.find(i=>i.instanceId===id);if(!item?.definitionId)fail('Priced components require catalog inventory');return item;});
  const definition=require('../equipment/inventory').definition;
  const {error,consumed}=allocateSpellMaterials(requirements[spell.id],selected,targets.length,definition);
  if(error)fail(error);
  const copperCost=spellMaterialCopperCost(spell.id);
  if(copperCost){
    const balance=character.goldCp;
    if(!Number.isSafeInteger(balance)||balance<copperCost)fail('Gentle Repose consumes two copper pieces');
    character.goldCp=balance-copperCost;
  }
  const selectedById=new Map(selected.map(item=>[item.instanceId,item]));
  for(const {instanceId,quantity} of consumed)selectedById.get(instanceId).quantity-=quantity;
  character.inventory=character.inventory.filter(i=>i.quantity>0);
  return consumed;
}
module.exports={requirements,items,spend};

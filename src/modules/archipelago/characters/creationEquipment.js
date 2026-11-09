function fail(message,fieldPath){throw Object.assign(new Error(message),{statusCode:422,code:'invalid_creation_equipment',fieldPath});}
function build(ledger,purchases=[],allowIncomplete=false){
  if(!Array.isArray(purchases)||purchases.length>100)fail('Choose at most one hundred catalog purchase rows','purchases');
  const first=ledger.levels[0],selection=first.choices.equipment?.[0];
  if(!selection){if(purchases.length)fail('Choose your Calling package or gold before purchasing','firstLevel.choices.equipment');if(allowIncomplete)return null;fail('Choose your Calling starting equipment','firstLevel.choices.equipment');}
  const starting=require('../system/rules2024/equipment').issue(first.callingId,selection),background=require('../system/rules2024/creation').equipment(ledger.creation,first.choices),character={...starting,inventory:[...starting.inventory,...background.inventory],goldCp:starting.goldCp+background.goldCp};
  for(const [index,purchase]of purchases.entries()){
    try{require('../equipment/commands').apply(character,'equipment.buy',purchase);}catch(error){error.code??='invalid_creation_purchase';error.fieldPath='purchases.'+index;throw error;}
  }
  return character;
}
function display(character){return character?{goldCp:character.goldCp,items:character.inventory.map(i=>({definitionId:i.definitionId,name:i.customName||(i.definitionId?require('../equipment').definition(i.definitionId).name:'Item'),quantity:i.quantity}))}:null;}
module.exports={build,display};

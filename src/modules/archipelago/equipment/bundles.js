const gear=require('./inventory');
const {catalogUnits}=require('@crossworld/sanguine-engine/equipment/commerce');
const {equipmentLabelTerms}=require('@crossworld/sanguine-engine/equipment/starting-equipment');
function issue(id,quantity=1){
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000)throw Object.assign(new Error('Invalid bundle quantity'),{statusCode:422});
  const d=gear.definition(id);
  if(d.contents)return d.contents.flatMap(entry=>issue(entry.definitionId,catalogUnits(entry.quantity,quantity)));
  return d.stackable?[gear.issue({definitionId:id,quantity})]:Array.from({length:quantity},()=>gear.issue({definitionId:id}));
}
function label(name){
  const terms=equipmentLabelTerms(name,require('../system/blueprints/equipment').items);
  if(terms)return issue(terms.definitionId,terms.quantity);
  return [gear.issue({customName:name})];
}
module.exports={issue,label};

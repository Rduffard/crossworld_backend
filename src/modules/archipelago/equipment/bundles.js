const gear=require('./index');
function issue(id,quantity=1){
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000)throw Object.assign(new Error('Invalid bundle quantity'),{statusCode:422});
  const d=gear.definition(id);
  if(d.contents)return d.contents.flatMap(entry=>issue(entry.definitionId,entry.quantity*quantity));
  return d.stackable?[gear.issue({definitionId:id,quantity})]:Array.from({length:quantity},()=>gear.issue({definitionId:id}));
}
function label(name){
  const aliases={'20 Arrows':['arrows',20],'20 Bullets':['bullets',20],'Rope (50 feet)':['rope',1],'10 Paper Sheets':['paper',10],'Healer Kit':['healer-kit',1],'Arcane Focus (crystal)':['arcane-focus-crystal',1],'Druidic Focus':['druidic-focus',1],'Arcane Focus (quarterstaff)':['arcane-focus-staff',1]};
  if(aliases[name])return issue(...aliases[name]);
  const definition=require('../system/blueprints/equipment').items.find(i=>i.id===name||i.name.replaceAll('\u2019',"'")===name);
  if(definition)return issue(definition.id);
  if(name==='Arcane Focus (quarterstaff)')return [gear.issue({definitionId:'quarterstaff',customName:name})];
  return [gear.issue({customName:name})];
}
module.exports={issue,label};

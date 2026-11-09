const historicOrigins = require('../blueprints/characters/origins');
const attributes = ['might','agility','resolve','wit','instinct','spirit'];
const tools = ['thieves-tools','herbalism-kit','navigators-tools','carpenters-tools','masons-tools','smiths-tools','tinkers-tools','poisoners-kit','calligraphers-supplies','musical-instrument','gaming-set'];
const origins = historicOrigins.map(({id,name,summary,lore,bonus}) => ({id,name,summary,lore,attribute:bonus.slice(3).toLowerCase(),language:'language:'+id}));
const backgrounds = [
  {id:'deckhand',name:'Deckhand',attributes:['might','agility','resolve'],skills:['athletics','survival'],tool:'navigators-tools',feat:'savage-attacker',items:['Rope (50 feet)','Common Clothes',"Navigator's Tools"],gold:10},
  {id:'dock-artisan',name:'Dock Artisan',attributes:['might','wit','resolve'],skills:['investigation','history'],tool:'carpenters-tools',feat:'skilled',items:["Carpenter's Tools",'Common Clothes'],gold:10},
  {id:'archive-apprentice',name:'Archive Apprentice',attributes:['wit','instinct','spirit'],skills:['arcana','history'],tool:'calligraphers-supplies',feat:'magic-initiate',list:'shipwright',items:["Calligrapher's Supplies",'Ink','10 Paper Sheets'],gold:10},
  {id:'field-medic',name:'Field Medic',attributes:['wit','instinct','resolve'],skills:['medicine','insight'],tool:'herbalism-kit',feat:'alert',items:['Herbalism Kit','Healer Kit','Common Clothes'],gold:10},
  {id:'free-agent',name:'Free Agent',attributes:['agility','wit','spirit'],skills:['stealth','deception'],tool:'thieves-tools',feat:'skilled',items:["Thieves' Tools",'Common Clothes'],gold:10},
  {id:'oath-witness',name:'Oath Witness',attributes:['might','instinct','spirit'],skills:['religion','persuasion'],tool:'musical-instrument',feat:'magic-initiate',list:'doctor',items:['Musical Instrument','Holy Symbol','Common Clothes'],gold:10},
  {id:'custom',name:'Custom',attributes,skills:[],tool:null,feat:null,items:[],gold:50},
];
function fail(message) { throw Object.assign(new Error(message),{statusCode:422}); }
function exactList(value,count,options,label) { if(!Array.isArray(value)||value.length!==count||new Set(value).size!==count||value.some(x=>!options.includes(x)))fail('Invalid '+label);return value; }
function validate(value,scores) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['originId','backgroundId','method','increases','equipment','custom','size'].includes(k)))fail('Invalid creation contract');
  const origin=origins.find(o=>o.id===value.originId),template=backgrounds.find(b=>b.id===value.backgroundId);
  if(!origin||!template)fail('Choose an established origin and background');
  if(value.method!=='point-buy')fail('SA-CHAR-1 requires point buy');
  const costs={8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9};
  if(Object.keys(scores).length!==6||attributes.some(id=>!Number.isInteger(scores[id])||!Object.hasOwn(costs,scores[id]))||Object.values(scores).reduce((sum,n)=>sum+costs[n],0)>27)fail('Point buy requires six scores 8-15 costing at most 27');
  const background=structuredClone(template);
  if(template.id==='custom') {
    const c=value.custom;if(!c||Object.keys(c).some(k=>!['attributes','skills','tool','feat'].includes(k)))fail('Complete custom background');
    background.attributes=exactList(c.attributes,3,attributes,'custom attributes');
    background.skills=exactList(c.skills,2,require('./catalog').skills.map(s=>s.id),'custom skills');
    if(!tools.includes(c.tool)||!['alert','skilled','savage-attacker','magic-initiate'].includes(c.feat))fail('Invalid custom tool or Origin feat');
    background.tool=c.tool;background.feat=c.feat;
  } else if(value.custom!==undefined)fail('Custom choices require Custom background');
  if(!['pack','gold'].includes(value.equipment)||template.id==='custom'&&value.equipment!=='gold')fail('Choose valid background equipment or gold');
  if(value.size!==undefined&&!['small','medium'].includes(value.size))fail('Choose Small or Medium size');
  const increases=value.increases;if(!increases||typeof increases!=='object'||Array.isArray(increases))fail('Choose background increases');
  const entries=Object.entries(increases);
  if(entries.some(([id,n])=>!background.attributes.includes(id)||!Number.isInteger(n))||!(entries.length===1&&entries[0][1]===2||entries.length===2&&entries.every(([,n])=>n===1)))fail('Background increases must be +2 to one or +1 to two eligible attributes');
  scores[origin.attribute]++;
  for(const[id,n]of entries)scores[id]+=n;
  if(attributes.some(id=>scores[id]>17))fail('Creation score maximum is 17');
  return {...background,origin};
}
function equipment(creation,choices={}) {
  if(!creation)return {inventory:[],goldCp:0};
  const b=backgrounds.find(b=>b.id===creation.backgroundId);if(!b)fail('Unknown background');
  if(creation.equipment==='gold')return {inventory:[],goldCp:5000};
  return {goldCp:b.gold*100,inventory:b.items.flatMap(name=>require('../../equipment/bundles').label(name==='Musical Instrument'&&choices.instrument?.[0]?choices.instrument[0]:name))};
}
module.exports={origins,backgrounds,tools,validate,equipment,originPolicy:'SA-CHAR-1: origin +1, background +2, no nationality restrictions or historical passive penalties.'};


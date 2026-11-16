const { validatePointBuyAllocation } = require('@crossworld/sanguine-engine/point-buy');
const { creationScores, backgroundEquipmentTerms, customBackgroundFeatEligible, backgroundEquipmentEligible,
  creationSizes } = require('@crossworld/sanguine-engine/progression');
const { attributes, tools, origins, backgrounds, originPolicy } = require('./definitions/creation');
function fail(message) { throw Object.assign(new Error(message),{statusCode:422}); }
function exactList(value,count,options,label) { if(!Array.isArray(value)||value.length!==count||new Set(value).size!==count||value.some(x=>!options.includes(x)))fail('Invalid '+label);return value; }
function validate(value,scores) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['originId','backgroundId','method','increases','equipment','custom','size'].includes(k)))fail('Invalid creation contract');
  const origin=origins.find(o=>o.id===value.originId),template=backgrounds.find(b=>b.id===value.backgroundId);
  if(!origin||!template)fail('Choose an established origin and background');
  if(value.method!=='point-buy')fail('SA-CHAR-1 requires point buy');
  try {
    validatePointBuyAllocation(Object.fromEntries(Object.entries(scores)));
  } catch (error) {
    if (!(error instanceof RangeError || error instanceof TypeError)) throw error;
    fail('Point buy requires six scores 8-15 costing at most 27');
  }
  const background=structuredClone(template);
  if(template.id==='custom') {
    const c=value.custom;if(!c||Object.keys(c).some(k=>!['attributes','skills','tool','feat'].includes(k)))fail('Complete custom background');
    background.attributes=exactList(c.attributes,3,attributes,'custom attributes');
    background.skills=exactList(c.skills,2,require('../../system/catalog').skills.map(s=>s.id),'custom skills');
    if(!tools.includes(c.tool)||!customBackgroundFeatEligible(c.feat))fail('Invalid custom tool or Origin feat');
    background.tool=c.tool;background.feat=c.feat;
  } else if(value.custom!==undefined)fail('Custom choices require Custom background');
  if(!backgroundEquipmentEligible(template.id,value.equipment))fail('Choose valid background equipment or gold');
  if(value.size!==undefined&&!creationSizes.includes(value.size))fail('Choose Small or Medium size');
  const increases=value.increases;if(!increases||typeof increases!=='object'||Array.isArray(increases))fail('Choose background increases');
  const adjustment=creationScores(scores,origin.attribute,attributes,background.attributes,increases);
  if(adjustment.error)fail(adjustment.error);
  Object.assign(scores,adjustment.scores);
  return {...background,origin};
}
function equipment(creation,choices={}) {
  if(!creation)return {inventory:[],goldCp:0};
  const b=backgrounds.find(b=>b.id===creation.backgroundId);if(!b)fail('Unknown background');
  const {goldCp,itemLabels}=backgroundEquipmentTerms(b,creation.equipment,choices.instrument?.[0]);
  if(creation.equipment==='gold')return {inventory:[],goldCp};
  return {goldCp,inventory:itemLabels.flatMap(name=>require('../../equipment/bundles').label(name))};
}
module.exports={origins,backgrounds,tools,validate,equipment,originPolicy};


const { cinderExemptionLimit, cinderResolutions, cinderRadiusEligible, cinderAllySaveAdvantageUnlocked, cinderChargeProfile, cinderSmokeProfile, cinderEquipmentError } = require('@crossworld/sanguine-engine/callings');
const {randomInt}=require('node:crypto');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function ids(value,label){
  if(!Array.isArray(value)||value.length>30||new Set(value).size!==value.length||value.some(id=>typeof id!=='string'||!id.trim()||id!==id.trim()||id.length>100))fail('Choose distinct '+label);
  return value;
}
function unavailableReason(character){
  const hasTools=character.inventory.some(item=>item.definitionId==='smith-tools');
  if(!hasTools)return cinderEquipmentError(false,0,null);
  const held=['mainHand','offHand'].map(slot=>character.inventory.find(i=>i.instanceId===character.loadout[slot])).filter(Boolean);
  return cinderEquipmentError(true,held.length,character.loadout.grip);
}
function activate(character,summary,option,params,targets,effect){
  const level=summary.callingLevels.gunslinger,battery=option.handler==='grand-battery';
  const charge=cinderChargeProfile(battery);
  if(params.confirmed!==true)fail('Confirm range, sight, total cover, all affected creatures and unattended object targets with the GM');
  const unavailable=unavailableReason(character);
  if(unavailable)fail(unavailable);
  const areas=params.areas;
  if(!Array.isArray(areas)||areas.length!==charge.areaCount||areas.some(a=>!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['pointId','targetIds'].includes(k))||typeof a.pointId!=='string'||!a.pointId.trim()||a.pointId.length>100)||new Set(areas.map(a=>a.pointId)).size!==areas.length)fail('Choose '+(battery?'two different charge centers':'one charge center'));
  const affected=[...new Set(areas.flatMap(a=>ids(a.targetIds,'area targets')))];
  if(affected.length!==targets.length||affected.some(id=>!targets.includes(id)))fail('Declared targets must match all charge areas');
  const exemptions=ids(params.exemptTargets??[],'exempt targets');
  if(exemptions.length>cinderExemptionLimit(level, summary.attributeModifiers.wit)||exemptions.some(id=>!affected.includes(id)))fail('Shaped Detonation exemption limit exceeded');
  const allies=ids(params.advantageTargets??[],'allied save-advantage targets');
  if(allies.length&&!cinderAllySaveAdvantageUnlocked(level)||allies.some(id=>!affected.includes(id)))fail('Safe Handling requires level seven and affected allies');
  const objects=ids(params.objectTargets??[],'unattended object targets');
  if(objects.some(id=>!affected.includes(id))||objects.some(id=>allies.includes(id)||exemptions.includes(id)))fail('Choose affected unattended objects separately from creatures');
  const radius=params.radiusFeet??5;
  if(!cinderRadiusEligible(level,radius))fail('Charge radius is five feet, or ten with Shaped Detonation');
  const {count,sides}=option.preview.roll;
  const rolls=areas.map(()=>Array.from({length:count},()=>randomInt(1,sides+1)));
  const discipline=summary.pathSelections.gunslinger.pathDiscipline;
  const resolutions = cinderResolutions({
    level, self: String(character._id ?? 'self'), affected, areas, exemptions, objects, allies, rolls, discipline, save: option.preview.save,
  });
  if(discipline==='smoke'){
    const smoke=cinderSmokeProfile(level);
    effect.smokeAreas=areas.map(a=>({pointId:a.pointId,radiusFeet:smoke.radiusFeet,obscurement:smoke.obscurement}));
    effect.exemptTargets=exemptions;effect.dispersalWindMph=smoke.dispersalWindMph;
    if(smoke.durationSeconds)effect.expiresAt=effect.createdAt+smoke.durationSeconds*1000;else effect.ends=smoke.ends;
  }
  return {type:'ability.activate',optionId:option.id,rolls,damageType:'fire',radiusFeet:radius,rangeFeet:charge.rangeFeet,
    targetResolutions:resolutions,overlapRule:'first-declared-area-once',recordOnly:discipline!=='smoke'};
}
module.exports={activate,unavailableReason};

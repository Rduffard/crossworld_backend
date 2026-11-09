const {randomInt}=require('node:crypto');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function ids(value,label){
  if(!Array.isArray(value)||value.length>30||new Set(value).size!==value.length||value.some(id=>typeof id!=='string'||!id.trim()||id!==id.trim()||id.length>100))fail('Choose distinct '+label);
  return value;
}
function unavailableReason(character){
  if(!character.inventory.some(i=>i.definitionId==='smith-tools'))return 'Charges require carried smith tools';
  const held=['mainHand','offHand'].map(slot=>character.inventory.find(i=>i.instanceId===character.loadout[slot])).filter(Boolean);
  return held.length>=2||character.loadout.grip==='two'?'Charges require a free hand':null;
}
function activate(character,summary,option,params,targets,effect){
  const level=summary.callingLevels.gunslinger,battery=option.handler==='grand-battery';
  if(params.confirmed!==true)fail('Confirm range, sight, total cover, all affected creatures and unattended object targets with the GM');
  const unavailable=unavailableReason(character);
  if(unavailable)fail(unavailable);
  const areas=params.areas;
  if(!Array.isArray(areas)||areas.length!==(battery?2:1)||areas.some(a=>!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['pointId','targetIds'].includes(k))||typeof a.pointId!=='string'||!a.pointId.trim()||a.pointId.length>100)||new Set(areas.map(a=>a.pointId)).size!==areas.length)fail('Choose '+(battery?'two different charge centers':'one charge center'));
  const affected=[...new Set(areas.flatMap(a=>ids(a.targetIds,'area targets')))];
  if(affected.length!==targets.length||affected.some(id=>!targets.includes(id)))fail('Declared targets must match all charge areas');
  const exemptions=ids(params.exemptTargets??[],'exempt targets');
  if(exemptions.length>(level>=10?Math.max(1,summary.attributeModifiers.wit):0)||exemptions.some(id=>!affected.includes(id)))fail('Shaped Detonation exemption limit exceeded');
  const allies=ids(params.advantageTargets??[],'allied save-advantage targets');
  if(allies.length&&level<7||allies.some(id=>!affected.includes(id)))fail('Safe Handling requires level seven and affected allies');
  const objects=ids(params.objectTargets??[],'unattended object targets');
  if(objects.some(id=>!affected.includes(id))||objects.some(id=>allies.includes(id)||exemptions.includes(id)))fail('Choose affected unattended objects separately from creatures');
  const radius=params.radiusFeet??5;
  if(![5,10].includes(radius)||radius===10&&level<10)fail('Charge radius is five feet, or ten with Shaped Detonation');
  const {count,sides}=option.preview.roll;
  const rolls=areas.map(()=>Array.from({length:count},()=>randomInt(1,sides+1)));
  const discipline=summary.pathSelections.gunslinger.pathDiscipline;
  const resolutions=affected.map(targetId=>{
    const index=areas.findIndex(a=>a.targetIds.includes(targetId)),exempt=exemptions.includes(targetId),object=objects.includes(targetId);
    const rolled=rolls[index].reduce((a,b)=>a+b,0),damage=exempt?0:rolled*(object&&discipline==='breach'?2:1);
    return {targetId,areaId:areas[index].pointId,damage,damageType:'fire',exempt,
      save:object?null:{...option.preview.save,successDamage:Math.floor(damage/2),advantage:level>=7&&(targetId===String(character._id??'self')||allies.includes(targetId))},
      ignoresFireResistance:object&&discipline==='breach'&&level>=15,
      smokeAffected:!exempt&&discipline==='smoke'};
  });
  if(discipline==='smoke'){
    effect.smokeAreas=areas.map(a=>({pointId:a.pointId,radiusFeet:level>=15?10:5,obscurement:'heavy'}));
    effect.exemptTargets=exemptions;effect.dispersalWindMph=20;
    if(level>=15)effect.expiresAt=effect.createdAt+60000;else effect.ends='start-of-next-turn';
  }
  return {type:'ability.activate',optionId:option.id,rolls,damageType:'fire',radiusFeet:radius,rangeFeet:battery?60:30,
    targetResolutions:resolutions,overlapRule:'first-declared-area-once',recordOnly:discipline!=='smoke'};
}
module.exports={activate,unavailableReason};

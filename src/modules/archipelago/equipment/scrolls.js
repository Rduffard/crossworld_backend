const {randomInt,randomUUID}=require('node:crypto');
const { reefKnifeScrollcasting, scrollNeedsCheck, resolveScrollCheck, scrollCastingModifiers, scrollSourceEligible } = require('@crossworld/sanguine-engine/spells/scrolls');
const rules=require('../system/rules');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function cast(c,summary,p){
  if(Object.keys(p).some(k=>!['instanceId','callingId','targets','turnId','confirmed'].includes(k))||p.confirmed!==true)fail('Confirm completion of the scroll spell normal casting time; interrupted castings leave the scroll intact');
  const item=c.inventory.find(i=>i.instanceId===p.instanceId&&i.definitionId==='spell-scroll'),spell=rules.spells.find(s=>s.id===item?.spellId),state=c.rulesRuntime;
  if(!item||!spell)fail('Choose an owned identified Spell Scroll');
  if(spell.id==='contingency')fail('Contingency requires two spell slots and its statuette; use prepared casting');
  if(require('../combat/vitality/vitality').incapacitated(state)||state.effects.some(e=>e.rage))fail('Cannot read a scroll while Incapacitated or Raging');
  if(state.concentrationChecks?.length)fail('Resolve pending Concentration saves before casting');
  if(state.restSession)fail('Record the rest interruption before casting a scroll');
  const thief=reefKnifeScrollcasting(summary.paths.corsair,summary.callingLevels.corsair),casting=summary.spellcasting[p.callingId];
  if(!scrollSourceEligible(spell,p.callingId,casting,thief))fail('The scroll spell must be on your Calling spell list');
  if(p.targets!==undefined&&(!Array.isArray(p.targets)||p.targets.length>100||new Set(p.targets).size!==p.targets.length||p.targets.some(id=>typeof id!=='string'||!id.trim()||id.length>100)))fail('Choose distinct stable scroll targets');
  const castingTurn=require('../spells/castingTurn'),turnId=castingTurn.resolve(state,p.turnId);
  if(require('./equipmentView').derive(c).restrictions.spellcastingBlocked)fail('Armor prevents scroll spellcasting');
  const management=require('../spells/metamagic').project(spell,[],{},spell.level);management.components=management.components.filter(x=>x!=='M');
  require('../spells/spellComponents').validate(c,spell,management,p.callingId);
  const needsCheck=scrollNeedsCheck(spell.level,casting?.slots.length,thief);
  const check=needsCheck?resolveScrollCheck(spell.level,randomInt(1,21),thief?summary.skillModifiers.arcana:casting.modifier):null;
  const success=check?.success??true;
  if((state.castings??[]).length>=200)fail('Casting history is full; complete a rest');
  if(success)castingTurn.record(state,turnId,{level:spell.level});
  c.inventory=c.inventory.filter(i=>i.instanceId!==item.instanceId);
  if(management.components.includes('V'))state.conditions=state.conditions.filter(e=>e.conditionId!=='invisible'||e.source!=='hide');
  const result={type:'scroll.cast',instanceId:item.instanceId,spellId:spell.id,scrollDestroyed:true,success,...check,description:spell.description};
  if(success){
    const castId=randomUUID(),{saveDC,attackModifier}=scrollCastingModifiers(spell.level);
    const effect={id:castId,featureId:'spell:'+spell.id,name:spell.name,source:'scroll:'+item.instanceId,targets:p.targets??[],concentration:spell.concentration,slotLevel:spell.level,management,createdAt:require('../combat/effects/clock').now(state),createdTurn:state.ownerTurn?.number??0};
    if(management.durationSeconds)effect.expiresAt=effect.createdAt+management.durationSeconds*1000;
    if(spell.concentration){state.effects=state.effects.filter(e=>!e.concentration);state.concentrationChecks=[];}
    if(spell.concentration||management.durationSeconds)state.effects.push(effect);
    const sanguineSurge=require('../characters/abilities/conduitOperations').consumeSurge(state,management,castId,spell.id);
    state.castings??=[];state.castings.push({castId,spellId:spell.id,callingId:thief?'corsair':p.callingId,source:effect.source,slotLevel:spell.level,turnId:turnId??p.turnId,targets:p.targets??[],management,attackModifier,saveDC,createdAt:effect.createdAt,rerolls:[],...(sanguineSurge?{sanguineSurge}:{})});
    Object.assign(result,{castId,slotLevel:spell.level,management,saveDC,attackModifier,sanguineSurge});
  }
  state.revision++;return result;
}
module.exports={cast};

const {randomUUID}=require('node:crypto');
const rules=require('../system/rules');
const clock=require('../combat/effects/clock');
const healing=require('./healingSpells');
const featureId='spell:contingency';

const { eligibleSpellIds, contingentSpellAvailable, contingentSlotEligible } = require('@crossworld/sanguine-engine/spells/contingency');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}

function prepare(c,summary,p,statueId){
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['spellId','callingId','source','slotLevel','trigger','confirmed','materialIds','focusId'].includes(k))||p.confirmed!==true||typeof p.trigger!=='string'||!p.trigger.trim()||p.trigger.length>500)fail('Choose the contingent spell and confirm its trigger, casting time and self-target eligibility');
  const state=c.rulesRuntime,spell=rules.spells.find(s=>s.id===p.spellId),casting=summary.spellcasting[p.callingId],feat=summary.featSpellcasters?.find(f=>f.grantKey===p.source);
  const available=p.source!==undefined
    ?contingentSpellAvailable(p.spellId,{grant:feat?.spell??null})
    :casting&&contingentSpellAvailable(p.spellId,{prepared:state.preparations[p.callingId],alwaysPrepared:casting.alwaysPrepared});
  if(!available)fail('Choose a prepared or granted Action spell of level five or lower that can target you');
  if(!contingentSlotEligible(p.slotLevel,spell.level))fail('Choose an available slot of level five or lower for the contingent spell');
  const management=require('./metamagic').project(spell,[],{},p.slotLevel);
  const self=String(c._id??'self');
  require('./spellComponents').validate(c,spell,management,p.callingId,p.focusId);
  const consumedMaterials=require('./spellMaterials').spend(c,spell,p.materialIds??[],[self]);
  require('./slotCasting').spend(state,p.slotLevel,false);
  return {spellId:spell.id,callingId:p.callingId,source:p.source??p.callingId,slotLevel:p.slotLevel,
    trigger:p.trigger.trim(),statueId,management,consumedMaterials,attackModifier:(feat??casting).attackModifier,
    castingModifier:(feat??casting).modifier,saveDC:(feat??casting).saveDC};
}

function active(c){
  return c.rulesRuntime.effects.find(e=>e.featureId===featureId&&e.contingency&&clock.active(c.rulesRuntime,e)&&c.inventory.some(item=>item.instanceId===e.contingency.statueId));
}

function prune(c){
  const pending=active(c);
  c.rulesRuntime.effects=c.rulesRuntime.effects.filter(e=>e.featureId!==featureId||e===pending);
}

function trigger(c,summary,p){
  const pending=active(c),state=c.rulesRuntime;
  if(Object.keys(p).some(k=>!['effectId','confirmed'].includes(k))||p.confirmed!==true||!pending||pending.id!==p.effectId)fail('Confirm the first occurrence of the active Contingency trigger');
  const stored=pending.contingency,spell=rules.spells.find(s=>s.id===stored.spellId),self=String(c._id??'self');
  const castId=randomUUID(),createdAt=clock.now(state),{management,slotLevel}=stored;
  state.castings??=[];
  if(state.castings.length>=200)fail('Casting history is full; complete a rest before resolving');
  state.effects=state.effects.filter(e=>e!==pending&&!(spell.concentration&&e.concentration));
  if(spell.concentration)state.concentrationChecks=[];
  if(spell.concentration||management.durationSeconds){
    state.effects.push({id:castId,featureId:'spell:'+spell.id,name:spell.name,source:stored.source,targets:[self],
      concentration:spell.concentration,slotLevel,management,createdAt,createdTurn:state.ownerTurn?.number??0,
      ...(management.durationSeconds?{expiresAt:createdAt+management.durationSeconds*1000}:{})});
  }
  state.castings.push({castId,spellId:spell.id,callingId:stored.callingId,source:stored.source,slotLevel,targets:[self],
    management,createdAt,spentSlot:false,usedSlot:true,attackModifier:stored.attackModifier,
    castingModifier:stored.castingModifier,saveDC:stored.saveDC,rerolls:[]});
  const resolvedHealing=healing.profiles[spell.id]?healing.apply(c,summary,{castId,targetIds:[self],confirmed:true,eventId:castId}):null;
  state.revision++;
  return {type:'contingency.trigger',effectId:pending.id,castId,spellId:spell.id,slotLevel,spentSlot:false,trigger:stored.trigger,
    targetIds:[self],management,description:spell.description,resolvedHealing};
}

module.exports={active,eligibleSpellIds,prepare,prune,trigger};

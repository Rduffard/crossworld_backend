const {randomInt,randomUUID}=require('node:crypto');
const {fastHandsUnlocked,chargedSpellLevel,chargedSpellChargeCountEligible,chargeSpendOutcome,rechargeItem,reefKnifeAdvancedMagicUnlocked,
  chargePreservationDieSides,chargeDestructionDieSides,itemDestroyedByChargeRoll,chargedItemCastEligible}=require('@crossworld/sanguine-engine/equipment/item-effects');
const magic=require('./magic');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function cast(c,summary,p){
  if(Object.keys(p).some(k=>!['instanceId','charges','targets','turnId','confirmed','action'].includes(k))||p.confirmed!==true||!chargedSpellChargeCountEligible(p.charges)||p.action!==undefined&&!['magic','bonus'].includes(p.action))fail('Confirm one to three charges and completed item spell casting');
  if(p.action==='bonus'&&!fastHandsUnlocked(summary.paths.corsair,summary.callingLevels.corsair))fail('A Bonus Action magic item activation requires Fast Hands');
  const item=c.inventory.find(i=>i.instanceId===p.instanceId),profile=magic.profile(item),state=c.rulesRuntime;
  if(!chargedItemCastEligible(item,profile,[c.loadout.mainHand,c.loadout.offHand],summary.spellcasting,summary.featSpellcasters))
    fail('Choose a held eligible attuned item when required');
  if(require('../combat/vitality/vitality').incapacitated(state)||state.effects.some(e=>e.rage)||state.restSession||state.concentrationChecks?.length)fail('Cannot use an item spell while Incapacitated, Raging, resting or awaiting Concentration saves');
  if(require('./equipmentView').derive(c).restrictions.spellcastingBlocked)fail('Armor prevents item spellcasting');
  if(!Number.isSafeInteger(item.chargesCurrent)||item.chargesCurrent<p.charges)fail('Insufficient item charges');
  if(p.targets!==undefined&&(!Array.isArray(p.targets)||p.targets.length>100||new Set(p.targets).size!==p.targets.length||p.targets.some(id=>typeof id!=='string'||!id.trim()||id.length>100)))fail('Choose distinct item spell targets');
  const castingTurn=require('../spells/castingTurn'),turnId=castingTurn.resolve(state,p.turnId);
  if((state.castings??[]).length>=200)fail('Casting history is full; complete a rest');
  const spell=require('../system/rules').spells.find(s=>s.id===profile.spellId);
  castingTurn.record(state,turnId,{level:spell.level});
  const thief=reefKnifeAdvancedMagicUnlocked(summary.paths.corsair,summary.callingLevels.corsair),chargeRoll=thief?randomInt(1,chargePreservationDieSides+1):undefined;
  const {preserved,chargesSpent,remaining,requiresDestructionRoll}=chargeSpendOutcome(item.chargesCurrent,p.charges,chargeRoll);
  item.chargesCurrent=remaining;
  const destructionRoll=requiresDestructionRoll?randomInt(1,chargeDestructionDieSides+1):undefined,destroyed=itemDestroyedByChargeRoll(destructionRoll);
  if(destroyed){c.inventory=c.inventory.filter(i=>i.instanceId!==item.instanceId);for(const slot of ['mainHand','offHand'])if(c.loadout[slot]===item.instanceId)c.loadout[slot]=null;if(!c.loadout.mainHand)c.loadout.grip='one';}
  const slotLevel=chargedSpellLevel(profile.baseLevel,p.charges),management=require('../spells/metamagic').project(spell,[],{},slotLevel);management.components=[];
  const castId=randomUUID(),effect={id:castId,featureId:'spell:'+spell.id,name:spell.name,source:'item:'+item.instanceId,targets:p.targets??[],concentration:spell.concentration,slotLevel,management,createdAt:require('../combat/effects/clock').now(state),createdTurn:state.ownerTurn?.number??0};
  if(management.durationSeconds)effect.expiresAt=effect.createdAt+management.durationSeconds*1000;
  if(spell.concentration){state.effects=state.effects.filter(e=>!e.concentration);state.concentrationChecks=[];}if(spell.concentration||management.durationSeconds)state.effects.push(effect);
  const sanguineSurge=require('../characters/abilities/conduitOperations').consumeSurge(state,management,castId,spell.id);
  state.castings??=[];state.castings.push({castId,spellId:spell.id,source:effect.source,slotLevel,turnId:turnId??p.turnId,targets:p.targets??[],management,saveDC:profile.saveDC,createdAt:effect.createdAt,rerolls:[],...(sanguineSurge?{sanguineSurge}:{})});state.revision++;
  return {type:'item.cast',castId,spellId:spell.id,slotLevel,management,action:p.action??'magic',saveDC:profile.saveDC,chargeRoll,chargesPreserved:preserved,chargesSpent,chargesRemaining:item.chargesCurrent,destructionRoll,destroyed,sanguineSurge};
}
function dawn(c,p){
  if(Object.keys(p).some(k=>!['eventId','at','reason'].includes(k))||typeof p.eventId!=='string'||!p.eventId.trim()||p.eventId.length>100||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500||!Number.isSafeInteger(p.at)||p.at<0)fail('Record the GM dawn event, time and reason');
  const state=c.rulesRuntime;state.magicDawns??=[];if(state.magicDawns.includes(p.eventId)||state.lastMagicDawn!==undefined&&p.at<=state.lastMagicDawn)fail('Dawn already resolved or time did not advance');
  require('../combat/effects/clock').advance(state,p.at);const recoveries=[];
  for(const item of c.inventory){
    const profile=magic.profile(item);if(!profile?.recharge)continue;
    const rolls=Array.from({length:profile.recharge.count},()=>randomInt(1,profile.recharge.sides+1));
    const recovery=rechargeItem(item.chargesCurrent,profile,rolls);
    item.chargesCurrent=recovery.chargesRemaining;recoveries.push({instanceId:item.instanceId,...recovery});
  }
  state.magicDawns=[...state.magicDawns,p.eventId].slice(-200);state.lastMagicDawn=p.at;state.revision++;return {type:'equipment.dawn',eventId:p.eventId,at:p.at,reason:p.reason,recoveries};
}
module.exports={cast,dawn};

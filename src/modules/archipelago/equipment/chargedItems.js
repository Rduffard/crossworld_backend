const {randomInt,randomUUID}=require('node:crypto');
const magic=require('./magic');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function cast(c,summary,p){
  if(Object.keys(p).some(k=>!['instanceId','charges','targets','turnId','confirmed','action'].includes(k))||p.confirmed!==true||!Number.isSafeInteger(p.charges)||p.charges<1||p.charges>3||p.action!==undefined&&!['magic','bonus'].includes(p.action))fail('Confirm one to three charges and completed item spell casting');
  if(p.action==='bonus'&&(summary.paths.corsair!=='reef-knife'||summary.callingLevels.corsair<3))fail('A Bonus Action magic item activation requires Fast Hands');
  const item=c.inventory.find(i=>i.instanceId===p.instanceId),profile=magic.profile(item),state=c.rulesRuntime;
  if(!profile?.spellId||!profile.charges||!profile.held||![c.loadout.mainHand,c.loadout.offHand].includes(item.instanceId)||profile.requiresAttunement&&(!item.attuned||!magic.eligible(item,summary)))fail('Choose a held eligible attuned item when required');
  if(require('../system/rules2024/vitality').incapacitated(state)||state.effects.some(e=>e.rage)||state.restSession||state.concentrationChecks?.length)fail('Cannot use an item spell while Incapacitated, Raging, resting or awaiting Concentration saves');
  if(require('./index').derive(c).restrictions.spellcastingBlocked)fail('Armor prevents item spellcasting');
  if(!Number.isSafeInteger(item.chargesCurrent)||item.chargesCurrent<p.charges)fail('Insufficient item charges');
  if(p.targets!==undefined&&(!Array.isArray(p.targets)||p.targets.length>100||new Set(p.targets).size!==p.targets.length||p.targets.some(id=>typeof id!=='string'||!id.trim()||id.length>100)))fail('Choose distinct item spell targets');
  const castingTurn=require('../system/rules2024/castingTurn'),turnId=castingTurn.resolve(state,p.turnId);
  if((state.castings??[]).length>=200)fail('Casting history is full; complete a rest');
  const spell=require('../system/rules2024/rules').spells.find(s=>s.id===profile.spellId);
  castingTurn.record(state,turnId,{level:spell.level});
  const thief=summary.paths.corsair==='reef-knife'&&summary.callingLevels.corsair>=13,chargeRoll=thief?randomInt(1,7):undefined,preserved=chargeRoll===6;
  if(!preserved)item.chargesCurrent-=p.charges;
  const destructionRoll=!preserved&&item.chargesCurrent===0?randomInt(1,21):undefined,destroyed=destructionRoll===1;
  if(destroyed){c.inventory=c.inventory.filter(i=>i.instanceId!==item.instanceId);for(const slot of ['mainHand','offHand'])if(c.loadout[slot]===item.instanceId)c.loadout[slot]=null;if(!c.loadout.mainHand)c.loadout.grip='one';}
  const slotLevel=profile.baseLevel+p.charges-1,management=require('../system/rules2024/metamagic').project(spell,[],{},slotLevel);management.components=[];
  const castId=randomUUID(),effect={id:castId,featureId:'spell:'+spell.id,name:spell.name,source:'item:'+item.instanceId,targets:p.targets??[],concentration:spell.concentration,slotLevel,management,createdAt:require('../system/rules2024/clock').now(state),createdTurn:state.ownerTurn?.number??0};
  if(management.durationSeconds)effect.expiresAt=effect.createdAt+management.durationSeconds*1000;
  if(spell.concentration){state.effects=state.effects.filter(e=>!e.concentration);state.concentrationChecks=[];}if(spell.concentration||management.durationSeconds)state.effects.push(effect);
  const sanguineSurge=require('../system/rules2024/conduitOperations').consumeSurge(state,management,castId,spell.id);
  state.castings??=[];state.castings.push({castId,spellId:spell.id,source:effect.source,slotLevel,turnId:turnId??p.turnId,targets:p.targets??[],management,saveDC:profile.saveDC,createdAt:effect.createdAt,rerolls:[],...(sanguineSurge?{sanguineSurge}:{})});state.revision++;
  return {type:'item.cast',castId,spellId:spell.id,slotLevel,management,action:p.action??'magic',saveDC:profile.saveDC,chargeRoll,chargesPreserved:preserved,chargesSpent:preserved?0:p.charges,chargesRemaining:item.chargesCurrent,destructionRoll,destroyed,sanguineSurge};
}
function dawn(c,p){
  if(Object.keys(p).some(k=>!['eventId','at','reason'].includes(k))||typeof p.eventId!=='string'||!p.eventId.trim()||p.eventId.length>100||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500||!Number.isSafeInteger(p.at)||p.at<0)fail('Record the GM dawn event, time and reason');
  const state=c.rulesRuntime;state.magicDawns??=[];if(state.magicDawns.includes(p.eventId)||state.lastMagicDawn!==undefined&&p.at<=state.lastMagicDawn)fail('Dawn already resolved or time did not advance');
  require('../system/rules2024/clock').advance(state,p.at);const recoveries=[];
  for(const item of c.inventory){const profile=magic.profile(item);if(!profile?.recharge)continue;const rolls=Array.from({length:profile.recharge.count},()=>randomInt(1,profile.recharge.sides+1)),amount=rolls.reduce((a,b)=>a+b,profile.recharge.bonus??0),before=item.chargesCurrent;item.chargesCurrent=Math.min(profile.charges,item.chargesCurrent+amount);recoveries.push({instanceId:item.instanceId,rolls,recovered:item.chargesCurrent-before,chargesRemaining:item.chargesCurrent});}
  state.magicDawns=[...state.magicDawns,p.eventId].slice(-200);state.lastMagicDawn=p.at;state.revision++;return {type:'equipment.dawn',eventId:p.eventId,at:p.at,reason:p.reason,recoveries};
}
module.exports={cast,dawn};

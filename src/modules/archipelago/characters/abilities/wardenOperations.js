const { abilityEffectDuration, lightTheWatch, lightTheWatchHitTerms, dawnAtSeaPulse, vigilCureEffect } = require('@crossworld/sanguine-engine/callings');
const { sumDice } = require('@crossworld/sanguine-engine/dice');
const { freePortDefaultSaveDC, freePortBreakConditions, freePortRerollConditions, freePortBreakBenefit } = require('@crossworld/sanguine-engine/callings');
const { freePortSave, freePortReroll } = require('@crossworld/sanguine-engine/callings');
const { grantTemporaryHealth } = require('@crossworld/sanguine-engine/vitality');
const {randomInt}=require('node:crypto');
const clock=require('../../combat/effects/clock');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function one(targets){if(targets.length!==1)fail('Choose one creature');return targets[0];}
function event(params){if(typeof params.eventId!=='string'||!params.eventId.trim()||params.eventId.length>100)fail('Record a stable trigger event ID');}
function source(params){if(typeof params.conditionSource!=='string'||!params.conditionSource.trim()||params.conditionSource.length>100)fail('Identify the condition source');}
function apply(c,summary,option,params,targets,effect,result,turnId){
  if(params.confirmed!==true)fail('Confirm the printed Warden trigger, sight, range and available Reaction');
  const state=c.rulesRuntime,level=summary.callingLevels.warden,self=String(c._id??'self');
  switch(option.handler){
    case 'freeport-break':{
      one(targets);source(params);if(params.consent!==true||!freePortBreakConditions.includes(params.mode)||typeof params.magical!=='boolean')fail('Choose a willing visible creature and its Grappled or Restrained source, confirming whether magical');
      let success=true;
      if(params.magical){const dc=params.dc??freePortDefaultSaveDC;if(!Number.isSafeInteger(dc)||dc<1||dc>1000)fail('Confirm the restraint save DC, or use fifteen if none is printed');result.rolls=[randomInt(1,21)];const outcome=freePortSave(result.rolls[0],summary.attributeModifiers.spirit,dc);result.checkTotal=outcome.checkTotal;result.dc=dc;success=outcome.success;result.success=success;}
      if(success){result.endsCondition=params.mode;result.endsConditionSource=params.conditionSource;result.requireConditionSource=true;
        const {temporaryHealth,movement}=freePortBreakBenefit(summary.pathSelections.warden.pathDiscipline,level);
        if(movement)result.freeMovement={targetId:targets[0],...movement};
        else result.temporaryHealthGrant={amount:temporaryHealth,targetIds:targets,metadata:{source:option.featureId,sourceCharacterId:self}};
      }
      result.recordOnly=true;break;
    }
    case 'freeport-reroll':{
      const target=one(targets);source(params);event(params);
      if(target===self||!summary.auraOfProtection||!freePortRerollConditions.includes(params.mode)||!Number.isInteger(params.originalRoll)||params.originalRoll<1||params.originalRoll>20||!Number.isSafeInteger(params.checkTotal)||!Number.isSafeInteger(params.dc)||params.dc<1||params.dc>1000||params.checkTotal>=params.dc)fail('Confirm another ally in your active aura failed a save against Restrained or Paralyzed, with its d20, total and DC');
      state.counters.wardenRerolls??=[];if(state.counters.wardenRerolls.includes(params.eventId)||state.counters.wardenRerolls.length>=200)fail('This failed save was already rerolled or the rest journal is full');
      state.counters.wardenRerolls.push(params.eventId);result.rolls=[randomInt(1,21)];Object.assign(result,freePortReroll(result.rolls[0],params.checkTotal,params.originalRoll,params.dc));result.mustUseNewRoll=true;result.rerolledSave={targetId:target,conditionId:params.mode,dc:params.dc,originalTotal:params.checkTotal,total:result.checkTotal};
      if(result.success){result.endsCondition=params.mode;result.endsConditionSource=params.conditionSource;}result.recordOnly=true;break;
    }
    case 'freeport-harbor':
      if(targets.length)fail('Open Harbor empowers your aura');state.effects=state.effects.filter(e=>e.featureId!==option.featureId);effect.expiresAt=effect.createdAt+abilityEffectDuration(option.handler)*1000;effect.openHarbor=true;break;
    case 'vigil-watch':
      if(targets.length)fail('Light the Watch creates your light aura');state.effects=state.effects.filter(e=>e.featureId!==option.featureId);effect.expiresAt=effect.createdAt+abilityEffectDuration(option.handler)*1000;Object.assign(effect,lightTheWatch(summary.pathSelections.warden.pathDiscipline));break;
    case 'vigil-hit':{
      const target=one(targets);event(params);const watch=state.effects.find(e=>e.watchLight&&clock.active(state,e));
      const hit=state.ownerTurn?.firstWeaponHit;
      if(!watch||!state.ownerTurn?.open||require('../../combat/vitality/vitality').incapacitated(state)||turnId!==state.ownerTurn.id||!hit||hit.eventId!==params.eventId||hit.targetId!==target||hit.weaponId!==params.objectId||typeof params.undead!=='boolean')fail('Use the first weapon hit recorded on your current owner turn while Light the Watch was active');
      state.counters.vigilHits??=[];
      if(state.counters.vigilHits.some(e=>e.turnId===turnId||e.eventId===params.eventId)||state.counters.vigilHits.length>=200)fail('Light the Watch already added damage on this turn or its rest journal is full');
      if(hit.watchId!==watch.id)fail('Light the Watch must be active when you record your first weapon hit');
      state.counters.vigilHits.push({turnId,eventId:params.eventId});watch.lastHitTurn=state.ownerTurn.number;
      const {count,sides}=option.preview.roll;
      result.rolls=Array.from({length:count},()=>randomInt(1,sides+1));result.damage=sumDice(result.rolls);result.damageType=watch.damageType;
      result.watchHit={targetId:target,eventId:params.eventId,...lightTheWatchHitTerms(params.undead)};result.recordOnly=true;break;
    }
    case 'vigil-cure':
      one(targets);source(params);if(params.undead!==true)fail('Confirm one Charmed effect caused by an Undead on a touched creature');Object.assign(result,vigilCureEffect(params.conditionSource));result.recordOnly=true;break;
    case 'vigil-dawn':
      if(targets.length)fail('Dawn at Sea empowers your aura');state.effects=state.effects.filter(e=>e.featureId!==option.featureId);effect.expiresAt=effect.createdAt+abilityEffectDuration(option.handler)*1000;effect.dawnSunlight=true;effect.turnEvents=[];break;
    case 'vigil-dawn-damage':{
      one(targets);event(params);const dawn=state.effects.find(e=>e.dawnSunlight&&clock.active(state,e));
      if(!dawn||!summary.auraOfProtection||params.undead!==true||typeof turnId!=='string'||!turnId.trim()||turnId.length>100)fail('Confirm an Undead starts its turn inside your active Dawn aura');
      if(dawn.turnEvents.some(e=>e.eventId===params.eventId||e.targetId===targets[0]&&e.turnId===turnId)||dawn.turnEvents.length>=200)fail('Dawn already resolved this target turn or the active journal is full');
      dawn.turnEvents.push({eventId:params.eventId,targetId:targets[0],turnId});Object.assign(result,dawnAtSeaPulse(option.preview.fixed.amount));result.recordOnly=true;break;
    }
    default:fail('Unknown Warden Path operation');
  }
  if(result.temporaryHealthGrant&&targets.includes(self)){const {amount,metadata}=result.temporaryHealthGrant;Object.assign(state, grantTemporaryHealth(state.temporaryHealth, amount, metadata));}
}
module.exports={apply};

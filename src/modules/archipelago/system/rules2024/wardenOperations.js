const {randomInt}=require('node:crypto');
const clock=require('./clock');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function one(targets){if(targets.length!==1)fail('Choose one creature');return targets[0];}
function event(params){if(typeof params.eventId!=='string'||!params.eventId.trim()||params.eventId.length>100)fail('Record a stable trigger event ID');}
function source(params){if(typeof params.conditionSource!=='string'||!params.conditionSource.trim()||params.conditionSource.length>100)fail('Identify the condition source');}
function apply(c,summary,option,params,targets,effect,result,turnId){
  if(params.confirmed!==true)fail('Confirm the printed Warden trigger, sight, range and available Reaction');
  const state=c.rulesRuntime,level=summary.callingLevels.warden,self=String(c._id??'self');
  switch(option.handler){
    case 'freeport-break':{
      one(targets);source(params);if(params.consent!==true||!['grappled','restrained'].includes(params.mode)||typeof params.magical!=='boolean')fail('Choose a willing visible creature and its Grappled or Restrained source, confirming whether magical');
      let success=true;
      if(params.magical){const dc=params.dc??15;if(!Number.isSafeInteger(dc)||dc<1||dc>1000)fail('Confirm the restraint save DC, or use fifteen if none is printed');result.rolls=[randomInt(1,21)];result.checkTotal=result.rolls[0]+summary.attributeModifiers.spirit;result.dc=dc;success=result.checkTotal>=dc;result.success=success;}
      if(success){result.endsCondition=params.mode;result.endsConditionSource=params.conditionSource;result.requireConditionSource=true;
        if(summary.pathSelections.warden.pathDiscipline==='refuge')result.temporaryHealthGrant={amount:level,targetIds:targets,metadata:{source:option.featureId,sourceCharacterId:self}};
        else result.freeMovement={targetId:targets[0],feet:10,noOpportunityAttacks:true};
      }
      result.recordOnly=true;break;
    }
    case 'freeport-reroll':{
      const target=one(targets);source(params);event(params);
      if(target===self||!summary.auraOfProtection||!['restrained','paralyzed'].includes(params.mode)||!Number.isInteger(params.originalRoll)||params.originalRoll<1||params.originalRoll>20||!Number.isSafeInteger(params.checkTotal)||!Number.isSafeInteger(params.dc)||params.dc<1||params.dc>1000||params.checkTotal>=params.dc)fail('Confirm another ally in your active aura failed a save against Restrained or Paralyzed, with its d20, total and DC');
      state.counters.wardenRerolls??=[];if(state.counters.wardenRerolls.includes(params.eventId)||state.counters.wardenRerolls.length>=200)fail('This failed save was already rerolled or the rest journal is full');
      state.counters.wardenRerolls.push(params.eventId);result.rolls=[randomInt(1,21)];result.checkTotal=result.rolls[0]+params.checkTotal-params.originalRoll;result.success=result.checkTotal>=params.dc;result.mustUseNewRoll=true;result.rerolledSave={targetId:target,conditionId:params.mode,dc:params.dc,originalTotal:params.checkTotal,total:result.checkTotal};
      if(result.success){result.endsCondition=params.mode;result.endsConditionSource=params.conditionSource;}result.recordOnly=true;break;
    }
    case 'freeport-harbor':
      if(targets.length)fail('Open Harbor empowers your aura');state.effects=state.effects.filter(e=>e.featureId!==option.featureId);effect.expiresAt=effect.createdAt+600000;effect.openHarbor=true;break;
    case 'vigil-watch':
      if(targets.length)fail('Light the Watch creates your light aura');state.effects=state.effects.filter(e=>e.featureId!==option.featureId);effect.expiresAt=effect.createdAt+60000;effect.watchLight=true;effect.brightLightFeet=20;effect.sunlight=false;effect.damageType=summary.pathSelections.warden.pathDiscipline;break;
    case 'vigil-hit':{
      const target=one(targets);event(params);const watch=state.effects.find(e=>e.watchLight&&clock.active(state,e));
      const hit=state.ownerTurn?.firstWeaponHit;
      if(!watch||!state.ownerTurn?.open||require('./vitality').incapacitated(state)||turnId!==state.ownerTurn.id||!hit||hit.eventId!==params.eventId||hit.targetId!==target||hit.weaponId!==params.objectId||typeof params.undead!=='boolean')fail('Use the first weapon hit recorded on your current owner turn while Light the Watch was active');
      state.counters.vigilHits??=[];
      if(state.counters.vigilHits.some(e=>e.turnId===turnId||e.eventId===params.eventId)||state.counters.vigilHits.length>=200)fail('Light the Watch already added damage on this turn or its rest journal is full');
      if(hit.watchId!==watch.id)fail('Light the Watch must be active when you record your first weapon hit');
      state.counters.vigilHits.push({turnId,eventId:params.eventId});watch.lastHitTurn=state.ownerTurn.number;
      const {count,sides}=option.preview.roll;
      result.rolls=Array.from({length:count},()=>randomInt(1,sides+1));result.damage=result.rolls.reduce((a,b)=>a+b,0);result.damageType=watch.damageType;
      result.watchHit={targetId:target,eventId:params.eventId,preventsHealing:params.undead,healingPreventionEnds:'start-of-next-owner-turn'};result.recordOnly=true;break;
    }
    case 'vigil-cure':
      one(targets);source(params);if(params.undead!==true)fail('Confirm one Charmed effect caused by an Undead on a touched creature');result.endsCondition='charmed';result.endsConditionSource=params.conditionSource;result.requireConditionSource=true;result.recordOnly=true;break;
    case 'vigil-dawn':
      if(targets.length)fail('Dawn at Sea empowers your aura');state.effects=state.effects.filter(e=>e.featureId!==option.featureId);effect.expiresAt=effect.createdAt+60000;effect.dawnSunlight=true;effect.turnEvents=[];break;
    case 'vigil-dawn-damage':{
      one(targets);event(params);const dawn=state.effects.find(e=>e.dawnSunlight&&clock.active(state,e));
      if(!dawn||!summary.auraOfProtection||params.undead!==true||typeof turnId!=='string'||!turnId.trim()||turnId.length>100)fail('Confirm an Undead starts its turn inside your active Dawn aura');
      if(dawn.turnEvents.some(e=>e.eventId===params.eventId||e.targetId===targets[0]&&e.turnId===turnId)||dawn.turnEvents.length>=200)fail('Dawn already resolved this target turn or the active journal is full');
      dawn.turnEvents.push({eventId:params.eventId,targetId:targets[0],turnId});result.damage=option.preview.fixed.amount;result.damageType='radiant';result.noSave=true;result.recordOnly=true;break;
    }
    default:fail('Unknown Warden Path operation');
  }
  if(result.temporaryHealthGrant&&targets.includes(self)&&result.temporaryHealthGrant.amount>state.temporaryHealth){state.temporaryHealth=result.temporaryHealthGrant.amount;state.temporaryHealthMetadata=result.temporaryHealthGrant.metadata;}
}
module.exports={apply};

const { colossusStanceHealth, stormhideRetaliationDamage, reaverAreaDamage, chainbreakerEscapeOutcome, thunderousLandingEligible, thunderousLanding,
  stormhideLeap, reaverPathHitDamage, chainbreakerRallyTargets, deckshakerOutcome, chainbreakerRallyEffect,
  nonnegativeAbilityAmount } = require('@crossworld/sanguine-engine/callings');
const { grantTemporaryHealth } = require('@crossworld/sanguine-engine/vitality');
const { readyMeleeWeapon } = require('@crossworld/sanguine-engine/equipment/weapon-projection');
const { d20RollCount, sumDice } = require('@crossworld/sanguine-engine/dice');
const { chainbreakerHitModes, chainbreakerKneelConditions, walkingStormEffect, chainbreakerKneelOutcome } = require('@crossworld/sanguine-engine/callings');
const {randomInt}=require('node:crypto');
const clock=require('../../combat/effects/clock');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function event(p){if(typeof p.eventId!=='string'||!p.eventId.trim()||p.eventId.length>100)fail('Record a stable trigger event ID');}
function apply(c,s,o,p,targets,effect,result,turnId){
  if(p.confirmed!==true)fail('Confirm the Reaver trigger, target, sight and supporting landing space');
  const state=c.rulesRuntime,level=s.callingLevels.reaver,self=String(c._id??'self'),rage=state.effects.find(e=>e.rage&&clock.active(state,e)),rageDamage=s.mechanics.reaver.rageDamage;
  const one=()=>{if(targets.length!==1)fail('Choose one creature');return targets[0];};
  const needRage=()=>{if(!rage)fail('This clause requires active Rage');};
  const rolls=(n,d)=>Array.from({length:n},()=>randomInt(1,d+1));
  const grant=(amount,ids)=>{result.temporaryHealthGrant={amount:nonnegativeAbilityAmount(amount),targetIds:ids,metadata:{source:o.featureId,sourceCharacterId:self}};if(ids.includes(self))Object.assign(state, grantTemporaryHealth(state.temporaryHealth, amount, result.temporaryHealthGrant.metadata));};
  switch(o.handler){
    case 'stormhide-leap':{
      const movement=stormhideLeap(p.distanceFeet);
      if(!movement)fail('Leap one to fifteen feet to a visible unoccupied supporting surface without crossing solid barriers');
      if(targets.length&&!thunderousLandingEligible(level, Boolean(rage)))fail('Thunderous Landing requires Reaver ten and active Rage');
      result.movement=movement;
      if(targets.length)Object.assign(result, thunderousLanding(targets, o.preview.save));result.recordOnly=true;break;
    }
    case 'stormhide-retaliate':
      needRage();one();event(p);rage.retaliations??=[];if(rage.retaliations.includes(p.eventId)||rage.retaliations.length>=200)fail('This melee-hit retaliation already resolved or the Rage journal is full');rage.retaliations.push(p.eventId);result.damage=stormhideRetaliationDamage(s.attributeModifiers.resolve);result.damageType=s.pathSelections.reaver.pathDiscipline;result.recordOnly=true;break;
    case 'reaver-path-hit':{
      needRage();one();event(p);const attack=require('../../equipment/equipmentView').derive(c).attacks.find(a=>a.instanceId===p.objectId);
      if(require('../../combat/vitality/vitality').incapacitated(state)||!state.ownerTurn?.open||state.ownerTurn.id!==turnId||!readyMeleeWeapon(attack,'might'))fail('Confirm a Might-based melee weapon hit on your current owner turn');
      if(s.paths.reaver==='chainbreaker'&&!chainbreakerHitModes.includes(p.mode))fail('Chainbreaker needs a target grappling an ally or carrying restraints');
      rage.pathHits??=[];if(rage.pathHits.some(e=>e.turnId===turnId||e.eventId===p.eventId))fail('Path damage already applied on this turn');rage.pathHits.push({turnId,eventId:p.eventId});Object.assign(result,reaverPathHitDamage(rageDamage,s.paths.reaver,s.pathSelections.reaver.pathDiscipline,attack.weapon));result.recordOnly=true;break;
    }
    case 'stormhide-walking':{
      needRage();if(targets.length)fail('Activate Walking Storm, then resolve each enemy turn separately');if(rage.walkingStormUsed)fail('Walking Storm is once per Rage');
      rage.walkingStormUsed=true;const {walkingStorm,...terms}=walkingStormEffect();
      effect.walkingStorm=walkingStorm;effect.rageId=rage.id;Object.assign(effect,terms);effect.turnEvents=[];break;
    }
    case 'stormhide-pulse':{
      needRage();one();event(p);const storm=state.effects.find(e=>e.walkingStorm&&e.rageId===rage.id);
      if(!storm||typeof turnId!=='string'||!turnId.trim()||turnId.length>100)fail('Confirm an enemy starts its turn inside your live ten-foot Walking Storm');
      if(storm.turnEvents.some(e=>e.eventId===p.eventId||e.targetId===targets[0]&&e.turnId===turnId)||storm.turnEvents.length>=200)fail('Walking Storm already resolved this target turn');storm.turnEvents.push({eventId:p.eventId,targetId:targets[0],turnId});
      result.rolls=rolls(o.preview.roll.count,o.preview.roll.sides);const { damage, successDamage } = reaverAreaDamage(result.rolls);result.damage=damage;result.damageType=s.pathSelections.reaver.pathDiscipline;result.save={...o.preview.save,successDamage};result.recordOnly=true;break;
    }
    case 'chainbreaker-escape':
      if(one()===self||!Number.isSafeInteger(p.dc)||p.dc<1||p.dc>1000||typeof p.conditionSource!=='string'||!p.conditionSource.trim()||p.conditionSource.length>100)fail('Choose an adjacent ally, its grapple source and source DC');
      result.rolls=rolls(d20RollCount(Boolean(s.mightAdvantage)),20);
      Object.assign(result,chainbreakerEscapeOutcome(result.rolls,s.skillModifiers.athletics,p.dc,p.conditionSource));result.recordOnly=true;break;
    case 'chainbreaker-rally':
      if(!chainbreakerRallyTargets(targets,self))fail('Choose up to three other allies within thirty feet who hear you');result.rolls=rolls(o.preview.roll.count,o.preview.roll.sides);grant(sumDice([result.rolls[0]],o.preview.roll.bonus),targets);Object.assign(result,chainbreakerRallyEffect());result.recordOnly=true;break;
    case 'chainbreaker-kneel':
      needRage();if(one()===self||!chainbreakerKneelConditions.includes(p.mode)||typeof p.conditionSource!=='string'||!p.conditionSource.trim()||p.conditionSource.length>100||!Number.isSafeInteger(p.checkTotal)||!Number.isSafeInteger(p.dc)||p.checkTotal>=p.dc||p.dc<1||p.dc>1000)fail('Confirm another visible ally within thirty feet failed an eligible source save');Object.assign(result,chainbreakerKneelOutcome(p.mode));result.endsConditionSource=p.conditionSource;result.recordOnly=true;break;
    case 'colossus-stance':
      if(targets.length)fail('Colossus Stance grants temporary Health only to you');grant(colossusStanceHealth(level,s.attributeModifiers.resolve),[self]);result.recordOnly=true;break;
    case 'colossus-deck':{
      needRage();if(!targets.length)fail('Choose creatures within ten feet');result.rolls=rolls(o.preview.roll.count,o.preview.roll.sides);Object.assign(result,deckshakerOutcome(result.rolls,targets,o.preview.save));result.recordOnly=true;break;}
    case 'colossus-suppress':
      needRage();if(targets.length)fail('Suppress your own Reef Skin');state.effects=state.effects.filter(e=>!e.reefSkinSuppressed);effect.reefSkinSuppressed=true;effect.ends='start-of-next-turn';break;
    default:fail('Unknown Reaver Path operation');
  }
}
module.exports={apply};

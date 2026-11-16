const { recoilMovement, withinWalkingSpeed, halfWalkingSpeed, nonnegativeWalkingSpeed, passingShotEligible, suppressingFireTargetLimit,
  suppressingFireControl, holdTheCorridorEffect, suppressingFireEffect } = require('@crossworld/sanguine-engine/callings');
const { encounterMovementTotals } = require('@crossworld/sanguine-engine/combat/encounter');
const {randomInt,randomUUID}=require('node:crypto');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function apply(c,s,o,p,targets,effect,result,turnId){
  if(p.confirmed!==true)fail('Confirm the Gunslinger attack, trigger, sight, range and movement facts');
  const state=c.rulesRuntime,level=s.callingLevels.gunslinger,turn=state.ownerTurn;
  const event=()=>{if(typeof p.eventId!=='string'||!p.eventId.trim()||p.eventId.length>100)fail('Record a stable attack or trigger event ID');};
  const ownTurn=()=>{if(!turn?.open||turn.id!==turnId)fail('This option requires your current open owner turn');};
  const weapon=ranged=>{const a=require('../../equipment/equipmentView').derive(c).attacks.find(a=>a.instanceId===p.objectId&&!a.requiresTwoHandGrip);if(!a||ranged&&a.weapon.type!=='ranged')fail('Choose an equipped eligible weapon');return a;};
  const once=key=>{event();if(typeof turnId!=='string'||!turnId.trim()||turnId.length>100)fail('Record the triggering turn');state.counters[key]??=[];if(state.counters[key].some(e=>e.turnId===turnId||e.eventId===p.eventId)||state.counters[key].length>=200)fail('This rider already resolved this turn or the event journal is full');state.counters[key].push({turnId,eventId:p.eventId});};
  const speed=()=>nonnegativeWalkingSpeed(s.movement.walk);
  const movement=(feet,provokes=false,voluntary=false)=>{
    result.movement={feet,provokesOpportunityAttacks:provokes};
    if(turn?.open){
      const totals=encounterMovementTotals(turn,feet,voluntary);
      turn.movementFeet=totals.movementFeet;
      if(voluntary)turn.voluntarySpeedFeet=totals.voluntarySpeedFeet;
    }
  };
  const attack=actionType=>{event();if(targets.length!==1)fail('Choose one attack target');const a=weapon(actionType==='reaction'),attackEventId=randomUUID();if(a.weapon.ammunitionType)result.ammunition=require('../../equipment/commands').apply(c,'equipment.fire',{weaponId:p.objectId,ammunitionId:p.ammunitionId,shots:1,actionId:attackEventId,actionType},s);result.grantedAttack={targetId:targets[0],attackEventId,weaponId:p.objectId,actionType,source:o.handler};return attackEventId;};
  switch(o.handler){
    case 'suppressor-hit':{
      const a=weapon(true);if(!targets.length||targets.length>suppressingFireTargetLimit(level))fail('Choose the primary hit target and at fifteen at most one secondary creature within ten feet');
      if(state.counters.crossingAttacks?.some(e=>e.attackId===p.eventId))fail('Crossing Denied cannot also apply Suppressing Fire');once('suppressionHits');result.rolls=[randomInt(1,o.preview.roll.sides+1)];result.damage=result.rolls[0];result.damageType=a.weapon.damage.type;result.save={...o.preview.save};result.controlTargets=suppressingFireControl(targets, result.damage, s.pathSelections.gunslinger.pathDiscipline);Object.assign(effect,suppressingFireEffect(result.controlTargets));break;
    }
    case 'suppressor-crossing':
      event();state.counters.crossingAttacks??=[];if(state.counters.crossingAttacks.some(e=>e.eventId===p.eventId)||state.counters.crossingAttacks.length>=200)fail('Crossing Denied already resolved this trigger or journal is full');effect.crossingAttackId=attack('reaction');state.counters.crossingAttacks.push({eventId:p.eventId,attackId:effect.crossingAttackId});result.cannotSuppress=true;result.recordOnly=true;break;
    case 'suppressor-hold':
      if(targets.length)fail('Hold the Corridor affects only you');state.pools['iron-suppressor:suppression']=s.resources['iron-suppressor:suppression'].max;result.suppressionRecovered=state.pools['iron-suppressor:suppression'];Object.assign(effect,holdTheCorridorEffect());break;
    case 'outrider-recoil': {
      ownTurn();weapon(true);const recoil=recoilMovement(p.distanceFeet, p.mode);if(targets.length||!recoil)fail('Choose one to fifteen feet of self movement or a willing mount using its remaining movement');once('outriderRecoil');turn.recoilBeforeHit=true;movement(recoil.feet, recoil.provokesOpportunityAttacks);Object.assign(result.movement, recoil);result.recordOnly=true;break;
    }
    case 'outrider-passing':{
      ownTurn();const hit=turn.firstWeaponHit;
      if(!hit||targets.length!==1||hit.targetId!==targets[0]||hit.weaponId!==p.objectId||hit.eventId!==p.eventId)fail('Choose your recorded first weapon hit this turn');
      if(!passingShotEligible(hit))fail('Passing Shot requires twenty feet of voluntary Speed movement at the hit, with no earlier Recoil');
      once('passingShots');result.rolls=[randomInt(1,o.preview.roll.sides+1)];result.damage=result.rolls[0];result.recordOnly=true;break;
    }
    case 'outrider-break':
      if(targets.length!==1)fail('Confirm one creature ends its turn within five feet');event();state.counters.breakPursuit??=[];if(state.counters.breakPursuit.includes(p.eventId)||state.counters.breakPursuit.length>=200)fail('Break Pursuit already resolved this trigger or journal is full');state.counters.breakPursuit.push(p.eventId);movement(halfWalkingSpeed(speed()));result.recordOnly=true;break;
    case 'outrider-horizon':
      ownTurn();if(!withinWalkingSpeed(p.distanceFeet, speed()))fail('Move no farther than your current walking Speed');attack('bonus');movement(p.distanceFeet,true,true);result.additionalActionGranted=false;result.recordOnly=true;break;
    default:fail('Unknown Gunslinger operation');
  }
}
module.exports={apply};

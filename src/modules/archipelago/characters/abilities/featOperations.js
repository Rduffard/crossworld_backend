const {randomInt,randomUUID}=require('node:crypto');
const {recordedDieEligible,d20RollCount}=require('@crossworld/sanguine-engine/dice');
const vitality=require('../../combat/vitality/vitality');
const turns=require('../../spells/castingTurn');
const { options, initiativeOutcome, savageAttackerOutcome, improveFateOutcome, harborDefenderOutcome, punchAndGrabOutcome, dimensionalTravelEligible } = require('@crossworld/sanguine-engine/feats');
const { improveFateDice, improveFateSigns, peerlessAimOutcome, nightSpiritLightEligible, mergeWithShadowsEffect } = require('@crossworld/sanguine-engine/feats');
const { savageAttackerRollSets, overwhelmingStrikeOutcome, fieldResponderOutcome } = require('@crossworld/sanguine-engine/feats');
const { strikeRollCount } = require('@crossworld/sanguine-engine/combat/strike');
const { sizeWithinMaximum } = require('@crossworld/sanguine-engine/combat/size');
const { action, source, recover } = require('../runtime/featState');
const { label } = require('../runtime/runtimeJournals');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function fields(p,allowed){if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!allowed.includes(k)))fail('Invalid feat operation fields');}
function integer(v,min=-1000,max=1000){return Number.isSafeInteger(v)&&v>=min&&v<=max;}
function apply(c,summary,type,p,findAttack){
  const state=c.rulesRuntime;let result={type};
  if(type==='inspiration.grant'){
    fields(p,['confirmed']);if(p.confirmed!==true)fail('Confirm the GM Inspiration award');if(!state.inspiration)state.inspirationSource={source:'gm-award',createdAt:require('../../combat/effects/clock').now(state)};state.inspiration=true;
  }else if(type==='inspiration.spend'){
    fields(p,['sides','originalRoll','eventId','confirmed']);
    if(!state.inspiration)fail('No Heroic Inspiration available');
    if(p.confirmed!==true||!recordedDieEligible(p.sides,p.originalRoll)||!label(p.eventId))fail('Confirm the original die, its size and stable roll ID');
    const inspirationSource=state.inspirationSource;state.inspiration=false;state.inspirationSource=null;result={...result,eventId:p.eventId,inspirationSource,originalRoll:p.originalRoll,roll:randomInt(1,p.sides+1),sides:p.sides,mustUseNewRoll:true};
  }else if(type==='initiative.record'){
    fields(p,['combatId','roll','confirmed']);if(p.confirmed!==true||!label(p.combatId)||p.roll!==undefined&&!integer(p.roll,1,20))fail('Confirm combat and a valid Initiative d20');
    if(state.initiative?.combatId===p.combatId)fail('Initiative already recorded for this combat');
    if(vitality.incapacitated(state))fail('Cannot roll Initiative while Incapacitated');
    const rolls=p.roll!==undefined?[p.roll]:Array.from({length:d20RollCount(Boolean(summary.initiative.advantage))},()=>randomInt(1,21));
    state.initiative={combatId:p.combatId,...initiativeOutcome(rolls,summary.initiative.modifier,summary.paths.corsair,summary.callingLevels.corsair)};
    state.inCombat=true;
    recover(state);result={...result,...state.initiative};
  }else if(type==='scene.record'){
    fields(p,['light','inCombat','confirmed']);if(p.confirmed!==true||!['bright','dim','dark'].includes(p.light)||typeof p.inCombat!=='boolean')fail('Confirm light and combat state');
    if(!p.inCombat)delete state.externalCastingTurn;
    state.environment={light:p.light};state.inCombat=p.inCombat;if(p.light==='bright')action(state);
  }else if(type==='action.record'){
    fields(p,['action','confirmed']);if(p.confirmed!==true||!['action','bonus-action','reaction'].includes(p.action))fail('Confirm the action used');if(vitality.incapacitated(state))fail('Cannot act while Incapacitated');action(state);
  }else if(type==='feat.use'){
    fields(p,['featId','parameters','targetIds','eventId','turnId','confirmed']);
    if(p.confirmed!==true||!summary.feats.includes(p.featId)||!label(p.eventId))fail('Confirm the known feat trigger and a stable event ID');
    const params=p.parameters??{};fields(params,['weaponId','critical','sign','total','incomingDamage','allyTotal','consent','distanceFeet','naturalRoll','damageType','kitId','trigger','targetSize']);
    const targets=p.targetIds??[];if(!Array.isArray(targets)||targets.length>1||targets.some(id=>!label(id)))fail('Choose at most one stable feat target');
    if(vitality.incapacitated(state))fail('Cannot use this feat while Incapacitated');
    state.featState??={};const grantKey=source(c,p.featId),record=state.featState[grantKey]??={featId:p.featId,events:[],turns:[],spent:false};
    if(record.events.includes(p.eventId))fail('This feat event has already been resolved');
    if(record.events.length>=200)fail('Too many feat events; complete a rest');
    const savedTurn=turns.current(state);
    const turnId=savedTurn??(typeof p.turnId==='string'?p.turnId.trim():null);
    const oncePerTurn=()=>{
      if(savedTurn&&p.turnId!==undefined&&p.turnId!==savedTurn||state.inCombat&&!savedTurn)fail('Use the current recorded encounter turn for this feat');
      if(!turns.validLabel(turnId)||record.turns.some(id=>id===turnId||!savedTurn&&id.trim()===turnId))fail('This feat requires an unused confirmed turn label');
      record.turns.push(turnId);
    };
    result={...result,featId:p.featId,grantKey,eventId:p.eventId};
    switch(p.featId){
      case 'savage-attacker':{
        oncePerTurn();const attack=findAttack(params.weaponId);
        if(!attack||attack.requiresTwoHandGrip||params.critical!==undefined&&typeof params.critical!=='boolean')fail('Choose a wielded weapon usable with the current grip and confirm the hit');
        const {count,sides}=attack.weapon.damage;
        const rolls=Array.from({length:savageAttackerRollSets},()=>Array.from({length:strikeRollCount(count,true,params.critical)},()=>randomInt(1,sides+1)));
        result={...result,...savageAttackerOutcome(rolls,attack.weapon,c.loadout.grip,summary.fightingStyles),flatModifier:attack.damageModifier,riderDiceIncluded:false};break;
      }
      case 'alert':{
        if(!state.initiative||targets.length!==1||targets[0]===String(c._id??'self')||params.consent!==true||!integer(params.allyTotal))fail('Record Initiative and confirm one willing conscious ally in the same combat');
        if(record.combatId===state.initiative.combatId)fail('Alert swap already used in this combat');
        result.swap={targetId:targets[0],combatId:state.initiative.combatId,allyReceives:state.initiative.total,ownerReceives:params.allyTotal};state.initiative.total=params.allyTotal;record.combatId=state.initiative.combatId;break;
      }
      case 'boon-of-combat-prowess':{
        const turn=state.ownerTurn?.number??0;if(record.ownerTurn===turn)fail('Peerless Aim already used before your next turn');record.ownerTurn=turn;Object.assign(result,peerlessAimOutcome());break;
      }
      case 'boon-of-dimensional-travel':{
        if(!dimensionalTravelEligible(params.trigger,params.distanceFeet))fail('Confirm immediate Attack/Magic action teleport to a visible unoccupied space within 30 feet');action(state);result.teleportFeet=params.distanceFeet;break;
      }
      case 'boon-of-fate':{
        if(record.spent||!improveFateSigns.includes(params.sign)||!integer(params.total)||targets.length!==1)fail('Improve Fate requires an available use and a confirmed D20 Test within 60 feet');
        action(state);const rolls=Array.from({length:improveFateDice.count},()=>randomInt(1,improveFateDice.sides+1));result={...result,...improveFateOutcome(rolls,params.sign,params.total)};record.spent=true;break;
      }
      case 'boon-of-irresistible-offense':{
        if(params.naturalRoll!==20||targets.length!==1||!vitality.damageTypes.includes(params.damageType))fail('Confirm a natural twenty attack, its target and original damage type');
        const grant=c.rulesLedger.levels.find(e=>e.choices.feat===p.featId),attribute=Object.keys(grant?.choices.increases??{})[0];if(!attribute)fail('Missing source attribute for this boon');Object.assign(result,overwhelmingStrikeOutcome(summary.attributes[attribute],params.damageType));break;
      }
      case 'boon-of-the-night-spirit':{
        if(!nightSpiritLightEligible(state.environment?.light))fail('Merge with Shadows requires recorded Dim Light or Darkness');action(state);state.effects.push({id:randomUUID(),featureId:'feat:boon-of-the-night-spirit',name:'Merge with Shadows',...mergeWithShadowsEffect(),createdAt:require('../../combat/effects/clock').now(state)});result.invisible=true;break;
      }
      case 'harbor-defender':{
        if(targets.length!==1||!integer(params.incomingDamage,1,1000000))fail('Confirm visible ally within five feet and incoming attack damage before Resistance');action(state);Object.assign(result,harborDefenderOutcome(params.incomingDamage,summary.trainingBonus));break;
      }
      case 'field-responder':{
        if(targets.length!==1||targets[0]===String(c._id??'self'))fail('Confirm one other living creature at zero Health within five feet');const kit=c.inventory.find(i=>i.instanceId===params.kitId&&i.definitionId==='healer-kit');if(!kit||!(kit.chargesCurrent>0))fail('Choose an owned healer kit with a charge');action(state);kit.chargesCurrent--;Object.assign(result,fieldResponderOutcome());break;
      }
      case 'grappler':{
        if(!state.ownerTurn?.open||targets.length!==1)fail('Punch and Grab requires your active turn and a confirmed unarmed Attack-action hit');
        if(!sizeWithinMaximum(params.targetSize,summary.grappleSize,1))fail('Confirm a target no more than one size larger than you');
        oncePerTurn();action(state);result.grapple=punchAndGrabOutcome(summary.trainingBonus,summary.attributeModifiers.might);break;
      }
      default:fail('This feat has no triggered operation; use its passive rules or its dedicated casting controls');
    }
    record.events.push(p.eventId);
  }else fail('Unknown feat operation');
  state.revision++;require('../runtime/runtimeValidation').validateProjected(summary,state);return result;
}
module.exports={apply,options};

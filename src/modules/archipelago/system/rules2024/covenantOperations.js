const clock=require('./clock');
const steel='path:iron-covenant:covenant-of-steel:3',standard='path:iron-covenant:unyielding-standard:20';
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function held(character,id){return Boolean(id&&[character.loadout.mainHand,character.loadout.offHand].includes(id)&&character.inventory.some(i=>i.instanceId===id&&i.definitionId&&require('../../equipment').definition(i.definitionId).kind==='shield'));}
function prune(character){const state=character.rulesRuntime,before=state.effects.length;state.effects=state.effects.filter(e=>e.featureId!==steel||held(character,e.shieldInstanceId));if(state.effects.length!==before)state.revision++;}
function guardBonus(character){return character.rulesRuntime?.effects.some(e=>e.featureId===steel&&e.shieldDiscipline==='bulwark'&&clock.active(character.rulesRuntime,e)&&held(character,e.shieldInstanceId))?1:0;}
function apply(c,summary,option,params,targets,effect,result,turnId){
  if(params.confirmed!==true)fail('Confirm the Covenant trigger, sight, range and available Reaction when required');
  const state=c.rulesRuntime,self=String(c._id??'self');
  if(option.handler==='covenant-steel'){
    if(targets.length||!held(c,params.objectId))fail('Choose one Shield you currently hold');
    state.effects=state.effects.filter(e=>e.featureId!==steel);effect.shieldInstanceId=params.objectId;effect.shieldDiscipline=summary.pathSelections.warden.pathDiscipline;effect.expiresAt=effect.createdAt+60000;
  }else if(option.handler==='covenant-sentinel'){
    const shield=state.effects.find(e=>e.featureId===steel&&e.shieldDiscipline==='sentinel'&&clock.active(state,e)&&held(c,e.shieldInstanceId));
    if(!shield||targets.length!==1||targets[0]===self||typeof params.eventId!=='string'||!params.eventId.trim()||params.eventId.length>100)fail('Sentinel requires your live empowered Shield, one other ally within five feet and an attack event before its roll');
    shield.attackEvents??=[];if(shield.attackEvents.includes(params.eventId)||shield.attackEvents.length>=200)fail('This Sentinel attack event is already resolved or full');shield.attackEvents.push(params.eventId);
    result.sentinel={eventId:params.eventId,protectedTargetId:targets[0],attackDisadvantage:true,rangeFeet:5,beforeAttackRoll:true,reactionSpent:true};result.recordOnly=true;
  }else if(option.handler==='covenant-standard'){
    if(targets.length)fail('Unyielding Standard empowers your aura; grant each ally at its turn start');
    state.effects=state.effects.filter(e=>e.featureId!==standard);effect.expiresAt=effect.createdAt+60000;effect.covenantStandard=true;effect.turnGrants=[];
  }else if(option.handler==='covenant-grant'){
    const active=state.effects.find(e=>e.featureId===standard&&clock.active(state,e));
    if(!active||!summary.auraOfProtection||targets.length!==1||targets[0]===self||typeof params.eventId!=='string'||!params.eventId.trim()||params.eventId.length>100||typeof turnId!=='string'||!turnId.trim()||turnId.length>100)fail('Standard grant requires your active aura and one ally starting its turn inside it');
    if(active.turnGrants.some(g=>g.eventId===params.eventId||g.targetId===targets[0]&&g.turnId===turnId)||active.turnGrants.length>=200)fail('This ally turn already received Standard temporary Health or the active journal is full');
    active.turnGrants.push({eventId:params.eventId,targetId:targets[0],turnId});
    result.temporaryHealthGrant={amount:Math.max(1,summary.attributeModifiers.spirit),targetIds:targets,metadata:{source:standard,sourceCharacterId:self}};result.recordOnly=true;
  }else fail('Unknown Covenant operation');
}
module.exports={apply,prune,guardBonus,steel,standard};

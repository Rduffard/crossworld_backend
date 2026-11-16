const { sumDice } = require('@crossworld/sanguine-engine/dice');
const { bloodPriceHealthCost, bloodPriceDiceCount, bloodPriceShelterHealth, vitalCircuitHealth, bloodPriceDiceSides,
  measuredSacrificeTerms, bloodPriceShelterSelected, canPayConduitHealth, bloodPriceSurgeOutcome } = require('@crossworld/sanguine-engine/callings');
const { grantTemporaryHealth } = require('@crossworld/sanguine-engine/vitality');
const {randomInt,randomUUID}=require('node:crypto');
const { calculateCappedPoolRecovery } = require('@crossworld/sanguine-engine/resources');
const bloodPrice='path:sanguine-conduit:blood-price:3';
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function grant(state,result,amount,targetIds,metadata,self){
  result.temporaryHealthGrant={amount,targetIds,metadata};
  if(targetIds.includes(self))Object.assign(state, grantTemporaryHealth(state.temporaryHealth, amount, metadata));
}
function apply(character,summary,option,params,targets,effect,result,turnId,context={}){
  if(params.confirmed!==true)fail('Confirm the Conduit trigger, visibility, range and Reaction when required');
  const state=character.rulesRuntime,level=summary.callingLevels.tidecaller,self=String(character._id??'self');
  if(option.handler==='conduit-sacrifice'){
    if(targets.length)fail('Measured Sacrifice affects only your Sorcery Points');
    const {healthCost,sorceryRecovery}=measuredSacrificeTerms;
    if (!canPayConduitHealth(state.health.current,healthCost)) fail('Health cost must leave at least one');
    state.health.current -= healthCost;
    const pool = 'tidecaller:sorcery-points';
    const { remaining, recovered } = calculateCappedPoolRecovery({
      current: state.pools[pool], maximum: summary.resources[pool].max, amount: sorceryRecovery,
    });
    state.pools[pool] = remaining;
    result.sorceryRecovered = recovered;
    result.healthLost = healthCost;
    result.recordOnly = true;
  }else if(option.handler==='conduit-price'){
    const shelter=bloodPriceShelterSelected(summary.pathSelections.tidecaller.pathDiscipline);
    if(shelter?targets.length!==1:targets.length!==0)fail(shelter?'Shelter requires one creature within 30 feet':'Surge empowers your next spell; choose no creature yet');
    const loss=bloodPriceHealthCost(summary.trainingBonus);if(!canPayConduitHealth(state.health.current,loss))fail('Health cost must leave at least one');
    state.health.current-=loss;result.healthLost=loss;result.rolls=Array.from({length:bloodPriceDiceCount(level)},()=>randomInt(1,bloodPriceDiceSides+1));
    const amount=sumDice(result.rolls);
    if(shelter){
      const metadata={source:bloodPrice,sourceCharacterId:self,grantId:randomUUID()};
      grant(state,result,bloodPriceShelterHealth(amount,summary.attributeModifiers.spirit),targets,metadata,self);result.recordOnly=true;
      state.conduitGrants??=[];state.conduitGrants.push({...metadata,targetId:targets[0]});if(state.conduitGrants.length>200)state.conduitGrants.shift();
    }else{
      state.effects=state.effects.filter(e=>e.featureId!==bloodPrice);
      effect.extraNecrotic=amount;effect.rolls=result.rolls;effect.ends='start-of-next-turn';effect.nextSpellOnly=true;
    }
  }else if(option.handler==='conduit-circuit'){
    if(targets.length!==1||!params.targetId||targets[0]===params.targetId||typeof turnId!=='string'||!turnId.trim()||turnId.length>100||typeof params.eventId!=='string'||!params.eventId.trim()||params.eventId.length>100)fail('Vital Circuit requires another recipient, a damage event and a stable turn ID');
    const loss=context.bloodPriceLoss;
    if(/^[a-f0-9]{24}$/i.test(params.targetId)){
      if(!loss||loss.sourceCharacterId!==self||loss.source!==bloodPrice||!(loss.amount>0))fail('Vital Circuit requires a recorded native Blood Price temporary-Health damage event');
    }else{
      const recorded=context.bloodPriceGrant;
      if(!state.conduitGrants?.some(g=>g.grantId===params.objectId&&g.targetId===params.targetId)&&!(recorded?.metadata?.source===bloodPrice&&recorded.metadata.sourceCharacterId===self&&recorded.metadata.grantId===params.objectId&&recorded.targetIds.includes(params.targetId)))fail('Identify your Blood Price grant and confirm damage reduced its temporary Health');
    }
    state.conduitCircuit??=[];
    if(state.conduitCircuit.some(e=>e.turnId===turnId||e.eventId===params.eventId&&e.targetId===params.targetId))fail('Vital Circuit already resolved this damage event or turn');
    result.conduitCircuit={eventId:params.eventId,targetId:params.targetId,turnId};
    state.conduitCircuit.push(result.conduitCircuit);if(state.conduitCircuit.length>200)state.conduitCircuit.shift();
    grant(state,result,vitalCircuitHealth(summary.attributeModifiers.spirit),targets,{source:'path:sanguine-conduit:vital-circuit:14',sourceCharacterId:self,grantId:randomUUID()},self);result.recordOnly=true;
  }else fail('Unknown Conduit operation');
}
function consumeSurge(state,management,castId,spellId){
  const surge=state.effects.find(e=>e.featureId===bloodPrice&&e.nextSpellOnly);
  if(!surge)return undefined;
  state.effects=state.effects.filter(e=>e!==surge);
  return {castId,spellId,...bloodPriceSurgeOutcome(surge.extraNecrotic,management.damageTypes)};
}
module.exports={apply,consumeSurge,bloodPrice};

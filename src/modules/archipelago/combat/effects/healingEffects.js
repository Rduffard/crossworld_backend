const { isBloodied, halfHealthHealingAmount, canStabilize } = require('@crossworld/sanguine-engine/vitality');
const { heal, revive } = require('../vitality/healthState');
const { stabilize } = require('../vitality/vitality');
const { update } = require('../../characters/runtime/runtime');

function fail(message){throw Object.assign(new Error(message),{statusCode:422});}

function targetEffects(state,result,summary){
  if(result.saveAdvantageEffect)state.effects.push(structuredClone(result.saveAdvantageEffect));
  if(result.prayerRest){const epoch=state.lastLongRest??'no-long-rest';if(state.prayerRestEpoch===epoch)fail('Prayer of Healing requires this recipient to finish a Long Rest before benefiting again');if(!summary)fail('Prayer of Healing needs the recipient rules summary');Object.assign(state,update(summary,state,{type:'short-rest',expectedRevision:state.revision}));state.prayerRestEpoch=epoch;}
  if(result.requireBloodied&&!isBloodied(state.health))fail('This healing requires a Bloodied target');
  if(result.requireZeroHealth&&!canStabilize(state.health.current,state.deathSaves))fail('This treatment requires a living creature at zero Health');
  if(result.restoreFromFailedSaves&&(!state.deathSaves?.dead||state.deathSaves.cause!=='failed-saves'))fail('One More Dawn only prevents death from failed death saves');
  if(result.restoresHealthTo!==undefined){if(!state.deathSaves?.dead)fail('Revival requires a dead creature');revive(state,result.restoresHealthTo);}
  if(result.stabilize)stabilize(state);
  if(result.restoreAllHealth)heal(state,state.health.max);
  if(result.healing>0)heal(state,result.healingCapFraction===0.5?halfHealthHealingAmount(state.health, result.healing):result.healing);
  const ended=result.endsConditions??(result.endsCondition?[result.endsCondition]:[]);
  if(result.requireConditionSource&&!(state.conditions??[]).some(c=>ended.includes(c.conditionId)&&c.source===result.endsConditionSource))fail('No matching condition source exists on this creature');
  if(ended.length)state.conditions=(state.conditions??[]).filter(c=>!ended.includes(c.conditionId)||result.endsConditionSource!==undefined&&c.source!==result.endsConditionSource);
}

module.exports = { targetEffects };

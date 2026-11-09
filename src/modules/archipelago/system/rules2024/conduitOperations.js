const {randomInt,randomUUID}=require('node:crypto');
const bloodPrice='path:sanguine-conduit:blood-price:3';
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function grant(state,result,amount,targetIds,metadata,self){
  result.temporaryHealthGrant={amount,targetIds,metadata};
  if(targetIds.includes(self)&&amount>state.temporaryHealth){state.temporaryHealth=amount;state.temporaryHealthMetadata=metadata;}
}
function apply(character,summary,option,params,targets,effect,result,turnId,context={}){
  if(params.confirmed!==true)fail('Confirm the Conduit trigger, visibility, range and Reaction when required');
  const state=character.rulesRuntime,level=summary.callingLevels.tidecaller,self=String(character._id??'self');
  if(option.handler==='conduit-sacrifice'){
    if(targets.length)fail('Measured Sacrifice affects only your Sorcery Points');
    if(state.health.current<=6)fail('Health cost must leave at least one');
    state.health.current-=6;const pool='tidecaller:sorcery-points',before=state.pools[pool];
    state.pools[pool]=Math.min(summary.resources[pool].max,before+2);result.sorceryRecovered=state.pools[pool]-before;result.healthLost=6;result.recordOnly=true;
  }else if(option.handler==='conduit-price'){
    const shelter=summary.pathSelections.tidecaller.pathDiscipline==='shelter';
    if(shelter?targets.length!==1:targets.length!==0)fail(shelter?'Shelter requires one creature within 30 feet':'Surge empowers your next spell; choose no creature yet');
    const loss=2*summary.trainingBonus;if(state.health.current<=loss)fail('Health cost must leave at least one');
    state.health.current-=loss;result.healthLost=loss;result.rolls=Array.from({length:level>=18?3:level>=6?2:1},()=>randomInt(1,9));
    const amount=result.rolls.reduce((a,b)=>a+b,0);
    if(shelter){
      const metadata={source:bloodPrice,sourceCharacterId:self,grantId:randomUUID()};
      grant(state,result,Math.max(0,amount+summary.attributeModifiers.spirit),targets,metadata,self);result.recordOnly=true;
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
    grant(state,result,Math.max(1,summary.attributeModifiers.spirit),targets,{source:'path:sanguine-conduit:vital-circuit:14',sourceCharacterId:self,grantId:randomUUID()},self);result.recordOnly=true;
  }else fail('Unknown Conduit operation');
}
function consumeSurge(state,management,castId,spellId){
  const surge=state.effects.find(e=>e.featureId===bloodPrice&&e.nextSpellOnly);
  if(!surge)return undefined;
  state.effects=state.effects.filter(e=>e!==surge);
  return {castId,spellId,amount:management.damageTypes.length?surge.extraNecrotic:0,damageType:'necrotic',oneDamageRollOnly:true,forfeited:!management.damageTypes.length};
}
function validate(state){
  for(const [key,fields]of [['conduitGrants',['grantId','targetId','sourceCharacterId']],['conduitCircuit',['eventId','targetId','turnId']]]){
    if(state[key]!==undefined&&(!Array.isArray(state[key])||state[key].length>200||state[key].some(entry=>!entry||fields.some(f=>typeof entry[f]!=='string'||!entry[f].trim()||entry[f].length>100))))fail('Invalid saved Conduit event journal');
  }
}
module.exports={apply,consumeSurge,bloodPrice,validate};

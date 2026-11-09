const {randomInt,randomUUID}=require('node:crypto');
const clock=require('./clock');
const conditions=['blinded','charmed','deafened','frightened','grappled','incapacitated','invisible','paralyzed','petrified','poisoned','prone','restrained','stunned','unconscious'];
const damageTypes=['acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder'];
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
const fresh=()=>({successes:0,failures:0,stable:false,dead:false});
function incapacitated(state){return state.deathSaves?.dead||state.health?.current===0||(state.conditions??[]).some(c=>['incapacitated','paralyzed','petrified','stunned','unconscious'].includes(c.conditionId));}
function endConcentration(state){state.effects=state.effects.filter(e=>!e.concentration);state.concentrationChecks=[];}
function heal(state,amount){
  if(!Number.isSafeInteger(amount)||amount<0)fail('Invalid healing');
  if(state.deathSaves?.dead)fail('Healing cannot revive a dead creature');
  state.health.current=Math.min(state.health.max,state.health.current+amount);
  if(state.health.current>0){state.deathSaves=fresh();state.pendingRelentlessRage=null;}
}
function revive(state,amount=1){state.deathSaves=fresh();state.health.current=Math.min(state.health.max,amount);}
function stabilize(state){if(state.health.current!==0||state.deathSaves?.dead)fail('Stabilize a living creature at zero Health');state.deathSaves={...fresh(),stable:true,stableUntil:clock.now(state)+randomInt(1,5)*3600000};}
function validate(state){
  const d=state.deathSaves;
  if(d&&(!Number.isSafeInteger(d.successes)||d.successes<0||d.successes>3||!Number.isSafeInteger(d.failures)||d.failures<0||d.failures>3||typeof d.stable!=='boolean'||typeof d.dead!=='boolean'))fail('Invalid saved death saves');
  if(state.exhaustion!==undefined&&(!Number.isInteger(state.exhaustion)||state.exhaustion<0||state.exhaustion>6))fail('Invalid Exhaustion level');
  if(state.conditions!==undefined&&(!Array.isArray(state.conditions)||state.conditions.length>100||state.conditions.some(c=>!conditions.includes(c.conditionId)||typeof c.source!=='string'||!c.source.trim()||c.source.length>100)||new Set(state.conditions.map(c=>c.conditionId+'|'+c.source)).size!==state.conditions.length))fail('Invalid saved conditions');
  if(state.concentrationChecks!==undefined&&(!Array.isArray(state.concentrationChecks)||state.concentrationChecks.length>100||state.concentrationChecks.some(c=>typeof c.id!=='string'||!Number.isInteger(c.dc)||c.dc<10||c.dc>30||!Array.isArray(c.effects))))fail('Invalid saved Concentration checks');
  if(state.worldTime!==undefined&&(!Number.isSafeInteger(state.worldTime)||state.worldTime<0))fail('Invalid saved world time');
}
function damage(character,summary,p,{ignoreMitigation=false}={}){
  if(Object.keys(p).some(k=>!['amount','damageType','attack','critical','confirmed','unbrokenCurrent','agilityHalfSave'].includes(k))||!Number.isSafeInteger(p.amount)||p.amount<0||p.amount>1000000||!damageTypes.includes(p.damageType)||p.confirmed!==true||p.attack!==undefined&&typeof p.attack!=='boolean'||p.critical!==undefined&&typeof p.critical!=='boolean'||p.unbrokenCurrent!==undefined&&typeof p.unbrokenCurrent!=='boolean'||p.agilityHalfSave!==undefined&&!['success','failure'].includes(p.agilityHalfSave))fail('Record confirmed damage, type, save outcome and attack/critical flags');
  const state=character.rulesRuntime;if(state.deathSaves?.dead)fail('Creature is already dead');
  if(p.unbrokenCurrent&&(summary.paths.tidecaller!=='sanguine-conduit'||summary.callingLevels.tidecaller<18))fail('Unbroken Current requires Sanguine Conduit eighteen');
  const before=state.health.current,canReact=!incapacitated(state),tempSource=structuredClone(state.temporaryHealthMetadata??null);let amount=p.amount,unbrokenCurrent;
  const evasionApplied=!ignoreMitigation&&Boolean(p.agilityHalfSave&&summary.evasion);
  if(!ignoreMitigation&&p.agilityHalfSave){if(evasionApplied)amount=p.agilityHalfSave==='success'?0:Math.floor(amount/2);else if(p.agilityHalfSave==='success')amount=Math.floor(amount/2);}
  if(!ignoreMitigation&&summary.immunities?.includes(p.damageType))amount=0;
  else if(!ignoreMitigation&&summary.resistances.includes(p.damageType))amount=Math.floor(amount/2);
  if(!ignoreMitigation&&p.attack&&['bludgeoning','piercing','slashing'].includes(p.damageType)&&summary.paths.reaver==='reef-colossus'&&summary.callingLevels.reaver>=6&&summary.raging&&!summary.reefSkinSuppressed){
    const armor=character.inventory.find(i=>i.instanceId===character.loadout.armor);
    if(!armor||require('../../equipment').definition(armor.definitionId).category!=='heavy')amount=Math.max(0,amount-summary.trainingBonus);
  }
  const absorbed=Math.min(state.temporaryHealth??0,amount);state.temporaryHealth=(state.temporaryHealth??0)-absorbed;
  state.health.current=Math.max(0,before-amount+absorbed);state.deathSaves??=fresh();
  if(amount>0&&state.health.current===0){
    if(amount-absorbed-before>=state.health.max){state.deathSaves.dead=true;state.deathSaves.cause='massive-damage';}
    else if(before===0){state.deathSaves.stable=false;state.deathSaves.failures=Math.min(3,state.deathSaves.failures+(p.critical?2:1));if(state.deathSaves.failures===3){state.deathSaves.dead=true;state.deathSaves.cause='failed-saves';}}
  }
  if(p.unbrokenCurrent&&before>0&&state.health.current===0&&!state.deathSaves.dead){
    if(!canReact||!(state.pools['sanguine-conduit:unbroken-current']>0))fail('Unbroken Current requires an available Reaction and unspent use');
    state.pools['sanguine-conduit:unbroken-current']--;state.health.current=1;state.deathSaves=fresh();
    const temporaryHealth=summary.callingLevels.tidecaller;
    if(temporaryHealth>state.temporaryHealth){state.temporaryHealth=temporaryHealth;state.temporaryHealthMetadata={source:'path:sanguine-conduit:unbroken-current:18'};}
    unbrokenCurrent={health:1,temporaryHealth,reactionSpent:true};
  }
  if(before>0&&state.health.current===0&&!state.deathSaves.dead&&summary.raging&&summary.callingLevels.reaver>=11)state.pendingRelentlessRage={dc:10+5*(state.counters.relentlessRage??0)};
  if(incapacitated(state)){endConcentration(state);state.effects=state.effects.filter(e=>e.featureId!=='calling:reaver:rage:1'||state.pendingRelentlessRage||state.health.current>0&&summary.callingLevels.reaver>=15);}
  else if(amount>0&&state.effects.some(e=>e.concentration&&clock.active(state,e))){
    const effects=state.effects.filter(e=>e.concentration&&clock.active(state,e)&&!(summary.callingLevels.navigator>=13&&e.featureId==='spell:hunter-s-mark')).map(e=>e.id??e.featureId);
    if(effects.length){state.concentrationChecks??=[];state.concentrationChecks.push({id:randomUUID(),dc:Math.min(30,Math.max(10,Math.floor(amount/2))),damage:amount,effects});}
  }
  const bloodPriceLoss=absorbed>0&&tempSource?.source===require('./conduitOperations').bloodPrice?{...tempSource,amount:absorbed}:undefined;
  return {type:'health.damage',damage:amount,absorbed,healthLost:before-state.health.current,deathSaves:structuredClone(state.deathSaves),...(p.agilityHalfSave?{agilityHalfSave:p.agilityHalfSave,evasionApplied}:{}),...(bloodPriceLoss?{bloodPriceLoss}:{}),...(unbrokenCurrent?{unbrokenCurrent}:{})};
}
function apply(character,summary,type,p){
  const state=character.rulesRuntime;let result={type};
  if(type==='health.damage')result=damage(character,summary,p);
  else if(type==='condition.record'){
    if(Object.keys(p).some(k=>!['conditionId','source','active','level','confirmed'].includes(k))||p.confirmed!==true||typeof p.source!=='string'||!p.source.trim()||p.source.length>100)fail('Record a confirmed condition and its source');
    if(p.conditionId==='exhaustion'){
      if(!Number.isInteger(p.level)||p.level<0||p.level>6)fail('Exhaustion level must be zero through six');state.exhaustion=p.level;
      if(p.level===6){state.health.current=0;state.deathSaves={...fresh(),dead:true,cause:'exhaustion'};}
    }else{
      if(!conditions.includes(p.conditionId)||typeof p.active!=='boolean'||p.level!==undefined)fail('Choose a known condition and whether its source is active');
      if(p.active&&summary.conditionImmunities?.includes(p.conditionId))fail('Your active feature grants Immunity to this condition');
      state.conditions=(state.conditions??[]).filter(c=>c.conditionId!==p.conditionId||c.source!==p.source);
      if(p.active)state.conditions.push({conditionId:p.conditionId,source:p.source});
    }
    if(incapacitated(state)){endConcentration(state);state.effects=state.effects.filter(e=>!e.endsOnCasterIncapacitated);}
    const unconscious=state.health.current===0||(state.conditions??[]).some(c=>c.conditionId==='unconscious');
    if(unconscious||incapacitated(state)&&(summary.callingLevels.reaver??0)<15)state.effects=state.effects.filter(e=>e.featureId!=='calling:reaver:rage:1');
  }else if(type==='temp-health.choose'){
    if(Object.keys(p).some(k=>!['amount','source','expiresAt','confirmed'].includes(k))||p.confirmed!==true||!Number.isSafeInteger(p.amount)||p.amount<0||p.amount>10000||typeof p.source!=='string'||!p.source.trim()||p.source.length>100||p.expiresAt!==undefined&&(!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=clock.now(state)))fail('Choose one confirmed temporary Health pool, source and optional future expiry');
    state.temporaryHealth=p.amount;state.temporaryHealthMetadata=p.amount?{source:p.source,...(p.expiresAt!==undefined?{expiresAt:p.expiresAt}:{})}:null;
  }else if(type==='death-save.roll'){
    if(Object.keys(p).some(k=>!['naturalRoll','confirmed'].includes(k))||p.naturalRoll!==undefined&&(p.confirmed!==true||!Number.isInteger(p.naturalRoll)||p.naturalRoll<1||p.naturalRoll>20))fail('Record a GM-confirmed d20 or request a server roll');
    if(state.pendingRelentlessRage)fail('Resolve Relentless Rage first');
    if(state.health.current!==0||state.deathSaves?.dead||state.deathSaves?.stable)fail('Death save requires an unstable living creature at zero Health');
    const defyDeath=summary.paths.gunslinger==='deadeye'&&summary.callingLevels.gunslinger>=18,rolls=p.naturalRoll!==undefined?[p.naturalRoll]:Array.from({length:defyDeath?2:1},()=>randomInt(1,21)),roll=Math.max(...rolls);state.deathSaves??=fresh();result.rolls=rolls;result.defyDeath=defyDeath;
    if(roll>=(defyDeath?18:20))revive(state,1);
    else if(roll>=10){state.deathSaves.successes++;if(state.deathSaves.successes===3)stabilize(state);}
    else{state.deathSaves.failures=Math.min(3,state.deathSaves.failures+(roll===1?2:1));if(state.deathSaves.failures===3){state.deathSaves.dead=true;state.deathSaves.cause='failed-saves';}}
    result.deathSaves=structuredClone(state.deathSaves);
  }else if(type==='concentration.resolve'){
    if(Object.keys(p).some(k=>!['checkId','rolls','confirmed'].includes(k)))fail('Invalid Concentration save fields');
    const check=state.concentrationChecks?.find(c=>c.id===p.checkId);if(!check)fail('No matching pending Concentration save');
    const count=summary.concentrationSaveAdvantage?2:1;
    if(p.rolls!==undefined&&(p.confirmed!==true||!Array.isArray(p.rolls)||p.rolls.length!==count||p.rolls.some(r=>!Number.isInteger(r)||r<1||r>20)))fail('Record the correct number of GM-confirmed d20 rolls');
    const rolls=p.rolls??Array.from({length:count},()=>randomInt(1,21)),total=Math.max(...rolls)+summary.savingThrowModifiers.resolve;
    const success=total>=check.dc;state.concentrationChecks=state.concentrationChecks.filter(c=>c.id!==check.id);
    if(!success){state.effects=state.effects.filter(e=>!check.effects.includes(e.id??e.featureId));clock.expire(state);}
    result={type,rolls,total,dc:check.dc,success};
  }else fail('Unknown character-state operation');
  state.revision++;validate(state);return result;
}
function targetEffects(state,result,summary){
  if(result.saveAdvantageEffect)state.effects.push(structuredClone(result.saveAdvantageEffect));
  if(result.prayerRest){const epoch=state.lastLongRest??'no-long-rest';if(state.prayerRestEpoch===epoch)fail('Prayer of Healing requires this recipient to finish a Long Rest before benefiting again');if(!summary)fail('Prayer of Healing needs the recipient rules summary');Object.assign(state,require('./runtime').update(summary,state,{type:'short-rest',expectedRevision:state.revision}));state.prayerRestEpoch=epoch;}
  if(result.requireBloodied&&state.health.current>Math.floor(state.health.max/2))fail('This healing requires a Bloodied target');
  if(result.requireZeroHealth&&(state.health.current!==0||state.deathSaves?.dead))fail('This treatment requires a living creature at zero Health');
  if(result.restoreFromFailedSaves&&(!state.deathSaves?.dead||state.deathSaves.cause!=='failed-saves'))fail('One More Dawn only prevents death from failed death saves');
  if(result.restoresHealthTo!==undefined){if(!state.deathSaves?.dead)fail('Revival requires a dead creature');revive(state,result.restoresHealthTo);}
  if(result.stabilize)stabilize(state);
  if(result.restoreAllHealth)heal(state,state.health.max);
  if(result.healing>0)heal(state,result.healingCapFraction===0.5?Math.min(result.healing,Math.max(0,Math.floor(state.health.max/2)-state.health.current)):result.healing);
  const ended=result.endsConditions??(result.endsCondition?[result.endsCondition]:[]);
  if(result.requireConditionSource&&!(state.conditions??[]).some(c=>ended.includes(c.conditionId)&&c.source===result.endsConditionSource))fail('No matching condition source exists on this creature');
  if(ended.length)state.conditions=(state.conditions??[]).filter(c=>!ended.includes(c.conditionId)||result.endsConditionSource!==undefined&&c.source!==result.endsConditionSource);
}
module.exports={conditions,damageTypes,fresh,heal,revive,stabilize,incapacitated,endConcentration,validate,damage,apply,targetEffects};

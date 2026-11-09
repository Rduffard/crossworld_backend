const clock=require('./clock');
const vitality=require('./vitality');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function remember(state,id){state.restHistory=[...(state.restHistory??[]),id];}
function recover(character,summary,type,options={}){
  const {attunement,...recovery}=options;
  if(attunement){if(type!=='short-rest')fail('Attunement requires a dedicated Short Rest');require('../../equipment/magic').attune(character,summary,attunement);}
  character.rulesRuntime=require('./runtime').update(summary,character.rulesRuntime,{...recovery,expectedRevision:character.rulesRuntime.revision,type});
}
function interrupt(character,summary,{at,reason,resume=true,shortRestOptions={}}){
  const rest=character.rulesRuntime.restSession;if(!rest)return {interrupted:false};
  if(!['initiative','non-cantrip-spell','damage','exertion-hour'].includes(reason)||typeof resume!=='boolean'||!Number.isSafeInteger(at)||at<(rest.segmentStart??rest.startedAt))fail('Record a valid rest interruption and time');
  clock.advance(character.rulesRuntime,at);
  let shortRestGranted=false;
  if(rest.kind==='long-rest'&&at-(rest.segmentStart??rest.startedAt)>=3600000){
    recover(character,summary,'short-rest',shortRestOptions);shortRestGranted=true;
    character.rulesRuntime.restEpoch=require('node:crypto').createHash('sha256').update(rest.id+':interruption:'+(rest.interruptions?.length??0)).digest('hex');
  }else if(Object.keys(shortRestOptions).length)fail('No completed hour is available for Short Rest recovery');
  const state=character.rulesRuntime;
  if(rest.kind==='short-rest'||!resume){remember(state,rest.id);state.restSession=null;}
  else{
    state.restSession={...rest,segmentStart:at,interruptions:[...(rest.interruptions??[]),{at,reason,shortRestGranted}]};
  }
  return {interrupted:true,shortRestGranted,resumed:Boolean(state.restSession)};
}
function apply(character,summary,type,p){
  let state=character.rulesRuntime;let result={type};
  if(type==='rest.start'){
    if(Object.keys(p).some(k=>!['restId','kind','startedAt','options'].includes(k))||typeof p.restId!=='string'||!p.restId.trim()||p.restId.length>100||!['short-rest','long-rest'].includes(p.kind)||!Number.isSafeInteger(p.startedAt)||p.startedAt<0)fail('Choose a rest ID, kind and world start time');
    if(state.restSession)fail('Complete or cancel the current rest first');
    if(state.inCombat)fail('End the encounter before starting a rest');
    if(state.health.current<1||state.deathSaves?.dead)fail('Rest requires at least one Health at its start and a living creature');
    if(state.restHistory?.includes(p.restId))fail('Rest ID has already been used');
    const options=p.options??{};
    if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['hitDice','recoverSlots','restoreSorcery','preparations','selections','nourished','attunement'].includes(k)))fail('Choose valid rest options');
    clock.advance(state,p.startedAt);
    // Validate the whole planned recovery without granting it during rest start.
    recover(structuredClone(character),summary,p.kind,options);
    state.restSession={id:p.restId,kind:p.kind,startedAt:p.startedAt,segmentStart:p.startedAt,interruptions:[],options:structuredClone(options)};
  }else if(type==='rest.cancel'){
    if(Object.keys(p).some(k=>k!=='restId')||!state.restSession||p.restId!==state.restSession.id)fail('No matching active rest');
    remember(state,p.restId);state.restSession=null;
  }else if(type==='rest.interrupt'){
    if(Object.keys(p).some(k=>!['restId','at','reason','resume','shortRestOptions','confirmed'].includes(k))||p.confirmed!==true||!state.restSession||p.restId!==state.restSession.id)fail('Confirm an interruption of the matching active rest');
    result={type,...interrupt(character,summary,p)};state=character.rulesRuntime;
  }else if(type==='rest.complete'){
    const rest=state.restSession;
    if(Object.keys(p).some(k=>!['restId','completedAt'].includes(k))||!rest||p.restId!==rest.id||!Number.isSafeInteger(p.completedAt))fail('Complete the matching active rest with a world end time');
    if(state.deathSaves?.dead)fail('A dead creature cannot complete a rest');
    if(state.inCombat)fail('End the encounter before completing the rest');
    const duration=rest.kind==='long-rest'?8*3600000+(rest.interruptions?.length??0)*3600000:3600000;
    if(p.completedAt-rest.startedAt<duration)fail('Rest duration is too short, including interruption extensions');
    if(rest.kind==='long-rest'&&state.lastLongRest!==undefined&&p.completedAt-state.lastLongRest<24*3600000)fail('Long Rest benefits require 24 hours between completions');
    clock.advance(state,p.completedAt);recover(character,summary,rest.kind,rest.options);state=character.rulesRuntime;
    remember(state,rest.id);state.restEpoch=rest.id;state.restSession=null;
    if(rest.kind==='long-rest')state.lastLongRest=p.completedAt;
  }else fail('Unknown rest command');
  state.revision++;vitality.validate(state);return result;
}
module.exports={apply,interrupt};

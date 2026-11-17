const { restInterruptionReasons, restInterruptionOutcome, restStartHealthEligible, restCompletionTimingError } = require('@crossworld/sanguine-engine/rest');
const clock=require('../../combat/effects/clock');
const vitality=require('../../combat/vitality/vitality');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function remember(state,id){state.restHistory=[...(state.restHistory??[]),id];}
function recover(character,summary,type,options={}){
  const {attunement,lineageCantrip,...recovery}=options;
  if (lineageCantrip !== undefined) {
    if (type !== 'long-rest') fail('Glasslight replacement requires a Long Rest');
    require('./selections').validateCantrip(lineageCantrip, summary.innateSpells?.find(grant => grant.replacement));
  }
  if(attunement){if(character.rulesRuntime.animalForms?.activeFormId)fail('Merged equipment cannot be attuned');if(type!=='short-rest')fail('Attunement requires a dedicated Short Rest');require('../../equipment/magic').attune(character,summary,attunement);}
  character.rulesRuntime=require('./runtime').update(summary,character.rulesRuntime,{...recovery,expectedRevision:character.rulesRuntime.revision,type});
  if (lineageCantrip !== undefined) character.rulesRuntime.lineageCantrip = structuredClone(lineageCantrip);
}
function interrupt(character,summary,{at,reason,resume=true,shortRestOptions={}}){
  const rest=character.rulesRuntime.restSession;if(!rest)return {interrupted:false};
  const segmentStart=rest.segmentStart??rest.startedAt;
  if(!restInterruptionReasons.includes(reason)||typeof resume!=='boolean'||!Number.isSafeInteger(at)||at<segmentStart)fail('Record a valid rest interruption and time');
  clock.advance(character.rulesRuntime,at);
  const {shortRestGranted,resumed}=restInterruptionOutcome({kind:rest.kind,elapsed:at-segmentStart,resume});
  if(shortRestGranted){
    recover(character,summary,'short-rest',shortRestOptions);
    character.rulesRuntime.restEpoch=require('node:crypto').createHash('sha256').update(rest.id+':interruption:'+(rest.interruptions?.length??0)).digest('hex');
  }else if(Object.keys(shortRestOptions).length)fail('No completed hour is available for Short Rest recovery');
  const state=character.rulesRuntime;
  if(!resumed){remember(state,rest.id);state.restSession=null;}
  else{
    state.restSession={...rest,segmentStart:at,interruptions:[...(rest.interruptions??[]),{at,reason,shortRestGranted}]};
  }
  return {interrupted:true,shortRestGranted,resumed:Boolean(state.restSession)};
}
function apply(character,summary,type,p){
  let state=character.rulesRuntime;let result={type};
  if(type==='rest.start'){
    if(Object.keys(p).some(k=>!['restId','kind','startedAt','options','mode'].includes(k))||typeof p.restId!=='string'||!p.restId.trim()||p.restId.length>100||!['short-rest','long-rest'].includes(p.kind)||!Number.isSafeInteger(p.startedAt)||p.startedAt<0)fail('Choose a rest ID, kind and world start time');
    if(state.restSession)fail('Complete or cancel the current rest first');
    if(state.inCombat)fail('End the encounter before starting a rest');
    if(!restStartHealthEligible(state.health.current,state.deathSaves?.dead))fail('Rest requires at least one Health at its start and a living creature');
    if(state.restHistory?.includes(p.restId))fail('Rest ID has already been used');
    const mode = summary.lineage?.restModes?.find(entry => entry.id === p.mode);
    if (p.mode !== undefined && (!mode || p.kind !== 'long-rest' || (mode.conscious && vitality.incapacitated(state))))
      fail('Waking Reverie requires a conscious Fey-Touched character taking a Long Rest');
    const options=p.options??{};
    if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['hitDice','recoverSlots','restoreSorcery','preparations','selections','nourished','attunement','lineageCantrip'].includes(k)))fail('Choose valid rest options');
    clock.advance(state,p.startedAt);
    // Validate the whole planned recovery without granting it during rest start.
    recover(structuredClone(character),summary,p.kind,options);
    state.restSession={id:p.restId,kind:p.kind,startedAt:p.startedAt,segmentStart:p.startedAt,interruptions:[],options:structuredClone(options),...(mode ? { mode: mode.id } : {})};
  }else if(type==='rest.cancel'){
    if(Object.keys(p).some(k=>k!=='restId')||!state.restSession||p.restId!==state.restSession.id)fail('No matching active rest');
    remember(state,p.restId);state.restSession=null;
  }else if(type==='rest.interrupt'){
    if(Object.keys(p).some(k=>!['restId','at','reason','resume','shortRestOptions','confirmed'].includes(k))||p.confirmed!==true||!state.restSession||p.restId!==state.restSession.id)fail('Confirm an interruption of the matching active rest');
    result={type,...interrupt(character,summary,p)};state=character.rulesRuntime;
  }else if(type==='rest.complete'){
    const rest=state.restSession;
    if(Object.keys(p).some(k=>!['restId','completedAt','inspirationRecipientId'].includes(k))||!rest||p.restId!==rest.id||!Number.isSafeInteger(p.completedAt))fail('Complete the matching active rest with a world end time');
    if(state.deathSaves?.dead)fail('A dead creature cannot complete a rest');
    if(state.inCombat)fail('End the encounter before completing the rest');
    const elapsedSinceLongRest=state.lastLongRest===undefined?undefined:p.completedAt-state.lastLongRest;
    const mode = summary.lineage?.restModes?.find(entry => entry.id === rest.mode);
    if (rest.mode && (!mode || (mode.conscious && vitality.incapacitated(state))))
      fail('Waking Reverie requires a conscious Fey-Touched character');
    const timingError=restCompletionTimingError(rest.kind,p.completedAt-rest.startedAt,
      rest.interruptions?.length,elapsedSinceLongRest,mode?.hours);
    if(timingError==='duration')fail('Rest duration is too short, including interruption extensions');
    if(timingError==='interval')fail('Long Rest benefits require 24 hours between completions');
    if (p.inspirationRecipientId !== undefined) {
      if (rest.kind !== 'long-rest' || summary.lineage?.id !== 'human' || !state.inspiration ||
        !character.campaignId || !/^[a-f0-9]{24}$/i.test(p.inspirationRecipientId) ||
        p.inspirationRecipientId === String(character._id))
        fail('Choose another party character for the excess Human Long Rest Inspiration');
      result.inspirationTransfer = { targetId: p.inspirationRecipientId };
    }
    clock.advance(state,p.completedAt);recover(character,summary,rest.kind,rest.options);state=character.rulesRuntime;
    remember(state,rest.id);state.restEpoch=rest.id;state.restSession=null;
    if(rest.kind==='long-rest')state.lastLongRest=p.completedAt;
  }else fail('Unknown rest command');
  state.revision++;vitality.validate(state);return result;
}
module.exports={apply,interrupt};

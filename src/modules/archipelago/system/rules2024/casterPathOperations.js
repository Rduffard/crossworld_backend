const {randomInt}=require('node:crypto');
const rules=require('./rules');
const spellProfiles=require('./spellProfiles');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function apply(c,s,o,p,targets,effect,result,turnId){
  if(p.confirmed!==true)fail('Confirm the casting or unresolved save trigger, willingness, language, sight and range');
  const state=c.rulesRuntime,self=String(c._id??'self'),level=s.callingLevels.tidecaller;
  const event=()=>{if(typeof p.eventId!=='string'||!p.eventId.trim()||p.eventId.length>100)fail('Record a stable trigger event ID');};
  const journal=key=>{event();state.counters[key]??=[];if(state.counters[key].includes(p.eventId)||state.counters[key].length>=200)fail('This event already resolved or the journal is full');state.counters[key].push(p.eventId);};
  const ownTurn=()=>{if(!state.ownerTurn?.open||state.ownerTurn.id!==turnId)fail('This option requires your current open owner turn');};
  const once=key=>{ownTurn();state.counters[key]??=[];if(state.counters[key].includes(turnId)||state.counters[key].length>=200)fail('This option already resolved this turn or the journal is full');state.counters[key].push(turnId);};
  const failedSave=attributes=>{if(targets.length||!attributes.includes(p.saveAttribute)||!Number.isSafeInteger(p.checkTotal)||!Number.isSafeInteger(p.dc)||p.dc<1||p.dc>1000||p.checkTotal>=p.dc)fail('Record your failed eligible save total and DC before resolving its consequences');};
  const casting=()=>{const cast=state.castings?.find(e=>e.castId===p.objectId);if(!cast)fail('Choose your recorded source casting');return cast;};
  switch(o.handler){
    case 'echo-link':
      ownTurn();if(targets.length!==1||targets.includes(self))fail('Choose one other willing creature within thirty feet that understands a language');state.effects=state.effects.filter(e=>!e.echoVoice);effect.echoVoice=true;effect.telepathy={rangeFeet:30,endsBeyondRange:true,sharedLanguageRequired:false};break;
    case 'echo-save':
      failedSave(['spirit','instinct']);journal('echoSaves');result.rolls=[randomInt(1,o.preview.roll.sides+1)];result.checkTotal=p.checkTotal+result.rolls[0];result.dc=p.dc;result.success=result.checkTotal>=p.dc;result.recordOnly=true;break;
    case 'echo-pattern':{
      const cast=casting(),spell=rules.spells.find(x=>x.id===cast.spellId);if(cast.callingId!=='tidecaller'||spell?.school!=='enchantment'||!spellProfiles[spell.id]?.savingThrow||targets.length!==1||!(cast.targets??[]).includes(targets[0]))fail('Confirm one enemy succeeded on a save against your recorded Enchantment casting with a saving throw');
      if(typeof turnId!=='string'||!turnId.trim()||turnId.length>100)fail('Record the triggering turn');state.counters.echoPatterns??=[];event();if(state.counters.echoPatterns.some(e=>e.turnId===turnId||e.eventId===p.eventId)||state.counters.echoPatterns.length>=200)fail('Recalled Pattern already resolved this turn or the journal is full');state.counters.echoPatterns.push({turnId,eventId:p.eventId});result.revealCharmedImmunity={targetId:targets[0],GMResolves:true};result.movement={feet:10,provokesOpportunityAttacks:false,optional:true};result.saveUnchanged=true;result.recordOnly=true;break;
    }
    case 'echo-share':
      if(!targets.length||targets.length>s.trainingBonus)fail('Choose up to Training Bonus willing creatures within thirty feet, including yourself if desired');effect.concentration=true;effect.expiresAt=effect.createdAt+3600000;effect.telepathy={rangeFeet:5280,initialRangeFeet:30,sharedLanguageRequired:false,participants:targets};break;
    case 'echo-unwritten':
      failedSave(['wit','instinct','spirit']);journal('echoUnwritten');if(p.mode!==undefined&&p.mode!==''&&!['charmed','frightened'].includes(p.mode))fail('End only one Charmed or Frightened source');if(p.mode){if(typeof p.conditionSource!=='string'||!p.conditionSource.trim()||p.conditionSource.length>100)fail('Choose the condition source to end');result.endsCondition=p.mode;result.endsConditionSource=p.conditionSource;result.requireConditionSource=true;}result.saveSucceedsInstead=true;result.recordOnly=true;break;
    case 'tempest-pulse':{
      ownTurn();const cast=casting();if(cast.slotLevel<1||cast.turnId!==turnId||cast.castId!==state.castings.at(-1)?.castId)fail('Storm Pulse must immediately follow your recorded level-one-or-higher spell on this turn');if(targets.length!==1||targets.includes(self))fail('Choose one visible creature within ten feet after moving');once('tempestPulses');result.damage=o.preview.fixed.amount;result.damageType=o.preview.fixed.unit;result.movement={feet:10,provokesOpportunityAttacks:false};if(p.targetId){if(level<14||p.targetId===self||typeof p.targetId!=='string'||!p.targetId.trim()||p.targetId.length>100)fail('Eye of the Storm requires one other adjacent willing creature of your size or smaller and an unoccupied ending space');result.movement.carriedTargetId=p.targetId;}result.noSave=true;result.recordOnly=true;break;
    }
    case 'tempest-convert':
      ownTurn();if(targets.length||!['lightning','thunder'].includes(p.damageType))fail('Choose Lightning or Thunder for the next Tidecaller spell this turn');state.effects=state.effects.filter(e=>!e.tempestConversion);effect.tempestConversion={damageType:p.damageType};effect.turnId=turnId;effect.endsAtRecordedTurnEnd=true;break;
    case 'tempest-damage':{
      const cast=casting(),type=s.pathSelections.tidecaller.pathDiscipline;if(cast.callingId!=='tidecaller'||!cast.management.damageTypes.includes(type))fail('Choose your recorded spell casting dealing the chosen storm damage type');if(typeof turnId!=='string'||!turnId.trim()||turnId.length>100)fail('Record the damage turn');state.counters.tempestDamage??=[];if(state.counters.tempestDamage.includes(turnId)||state.counters.tempestDamage.length>=200)fail('Conductive Soul already applied this turn or the journal is full');state.counters.tempestDamage.push(turnId);result.damage=o.preview.fixed.amount;result.damageType=o.preview.fixed.unit;result.singleDamageRoll=true;result.recordOnly=true;break;
    }
    case 'tempest-live':
      if(targets.length)fail('Living Tempest affects only you');state.effects=state.effects.filter(e=>!e.livingTempest);effect.livingTempest=true;effect.flySpeed=60;effect.expiresAt=effect.createdAt+60000;break;
    default:fail('Unknown caster Path operation');
  }
}
function convert(state,summary,p,management){
  const pending=state.effects.find(e=>e.tempestConversion);
  if(!pending||p.callingId!=='tidecaller')return;
  state.effects=state.effects.filter(e=>e!==pending);
  if(summary.paths.tidecaller!=='tempest-heart'||!state.ownerTurn?.open||pending.turnId!==state.ownerTurn.id||p.turnId!==pending.turnId)return;
  const type=pending.tempestConversion.damageType,other=type==='lightning'?'thunder':'lightning';
  const eligible=management.damageTypes.includes(other);
  management.damageTypes=[...new Set(management.damageTypes.map(t=>t===other?type:t))];management.conductiveConversion={from:other,to:type,forfeited:!eligible};
}
module.exports={apply,convert};

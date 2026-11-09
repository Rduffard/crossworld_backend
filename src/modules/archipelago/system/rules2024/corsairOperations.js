const {randomInt,randomUUID}=require('node:crypto');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function event(params){if(typeof params.eventId!=='string'||!params.eventId.trim()||params.eventId.length>100)fail('Record a stable attack or damage event ID');}
function one(targets){if(targets.length!==1)fail('Choose one stable creature target');return targets[0];}
function apply(c,summary,option,params,targets,effect,result,turnId){
  if(params.confirmed!==true)fail('Confirm the option trigger, visible target and printed range');
  const state=c.rulesRuntime,level=summary.callingLevels.corsair;
  switch(option.handler){
    case 'envoy-move':case 'envoy-save':case 'envoy-all':case 'envoy-parley':{
      event(params);
      const parley=option.handler==='envoy-parley',limit=parley?Math.max(1,summary.attributeModifiers.spirit):option.handler==='envoy-all'?3:1;
      if(!targets.length||targets.length>limit||targets.includes(String(c._id??'self')))fail('Choose distinct other creatures within the command target limit');
      state.counters.envoyCommands??=[];
      if(state.counters.envoyCommands.includes(params.eventId)||state.counters.envoyCommands.length>=200)fail('This Envoy command event was already resolved or the journal is full');
      if(parley){
        effect.rangeFeet=60;effect.expiresAt=effect.createdAt+60000;
        effect.save={...option.preview.save};
        effect.onFailedSave={condition:'charmed',cannotAttackOwner:true};
        effect.repeatSave='end-of-target-turn';effect.endsOnOwnerOrAllyHarm=true;effect.charmedImmunityPreventsAll=true;
        result.save=effect.save;result.parley={targetIds:[...targets],...effect.onFailedSave,repeatSave:effect.repeatSave,endsOnOwnerOrAllyHarm:true,charmedImmunityPreventsAll:true};
      }else{
        if(typeof turnId!=='string'||!turnId.trim()||turnId.length>100)fail('Record the command turn');
        if(option.handler==='envoy-save'&&!['charmed','frightened'].includes(params.mode))fail('Choose Charmed or Frightened for the repeated save');
        result.crewCommand={eventId:params.eventId,turnId,rangeFeet:level>=9?60:30,requiresSight:true,requiresHearing:true,requiresConsciousAlly:true,requiresAvailableReaction:true,
          grants:targets.map(targetId=>option.handler==='envoy-save'?{targetId,repeatSaveAgainst:params.mode,advantage:true,endsConditionOnSuccess:true}:{targetId,movementSpeedFraction:0.5,noOpportunityAttacks:true}),
          resolution:'GM confirms you see each ally, each hears you, is conscious, and spends its own available Reaction. Resolve movement or the original condition save with the GM.'};
        result.recordOnly=true;
      }
      state.counters.envoyCommands.push(params.eventId);break;
    }
    case 'lantern-study':effect.studyTargetId=one(targets);effect.ends='end-of-next-turn';effect.rangeFeet=30;effect.sneakWithoutAdvantage=true;break;
    case 'lantern-detect':effect.detectFalseAdvantage=true;effect.expiresAt=effect.createdAt+600000;effect.automaticReveal=false;break;
    case 'lantern-search':result.grantedAction='Search';result.recordOnly=true;break;
    case 'lantern-mark':effect.markedTargetId=one(targets);effect.suppressesUnseenAdvantageAgainstOwner=true;effect.ends='start-of-next-turn';effect.rangeFeet=30;effect.revealsLaterLocation=false;break;
    case 'lantern-reroll':{
      event(params);const strike=state.strikeHistory?.find(s=>s.kind==='cunning'&&s.eventId===params.eventId);
      if(!strike?.studyEffectId||strike.lastTellUsed)fail('Last Tell requires an unresolved Sneak Attack against a target studied when it was hit');
      const indices=params.indices;if(!Array.isArray(indices)||!indices.length||indices.length>3||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=strike.rolls.length))fail('Choose up to three distinct saved Sneak Attack dice');
      result.originalRolls=[...strike.rolls];for(const i of indices)strike.rolls[i]=randomInt(1,7);strike.extraDamage=strike.rolls.reduce((a,b)=>a+b,0);strike.lastTellUsed=true;
      result.rolls=[...strike.rolls];result.sneakDamage=strike.extraDamage;result.mustUseNewRoll=true;result.recordOnly=true;break;
    }
    case 'duelist-parry':{
      event(params);one(targets);if(!Number.isSafeInteger(params.attackTotal)||params.attackTotal< -100||params.attackTotal>1000||!Number.isInteger(params.originalRoll)||params.originalRoll<1||params.originalRoll>20)fail('Record the visible melee attack total and its natural d20');
      state.counters.duelistParries??=[];if(state.counters.duelistParries.some(r=>r.eventId===params.eventId)||state.counters.duelistParries.length>=200)fail('This parry event was already resolved or the event journal is full');
      const guard=require('../../equipment').derive(c).guard,after=guard+summary.trainingBonus;
      const parry={eventId:params.eventId,targetId:targets[0],guardBefore:guard,guardAfter:after,attackTotal:params.attackTotal,originalRoll:params.originalRoll,causedMiss:![1,20].includes(params.originalRoll)&&params.attackTotal>=guard&&params.attackTotal<after,answered:false};state.counters.duelistParries.push(parry);result.parry=parry;result.recordOnly=true;break;
    }
    case 'duelist-answer':{
      event(params);const parry=state.counters.duelistParries?.find(r=>r.eventId===params.eventId);
      if(!parry?.causedMiss||parry.answered||one(targets)!==parry.targetId)fail('Answer in Steel requires this attacker to have missed because of Open Challenge');
      parry.answered=true;result.grantedAttack={targetId:parry.targetId,attackEventId:randomUUID(),meleeOnly:true,noSneakAttack:true,sameReaction:true};state.forbiddenSneakEvents??=[];state.forbiddenSneakEvents.push(result.grantedAttack.attackEventId);result.recordOnly=true;break;
    }
    case 'duelist-footwork':case 'duelist-perfect':{
      event(params);const held=[c.loadout.mainHand,c.loadout.offHand].map(id=>c.inventory.find(i=>i.instanceId===id)).filter(Boolean),signature=summary.pathSelections.corsair.pathDiscipline;
      if(!held.some(i=>i.definitionId===signature))fail('Hold your chosen signature weapon');
      one(targets);
      if(option.handler==='duelist-footwork'){
        state.counters.duelistAttacks??=[];if(state.counters.duelistAttacks.includes(params.eventId)||state.counters.duelistAttacks.length>=200)fail('This melee attack event was already recorded');state.counters.duelistAttacks.push(params.eventId);
        if(typeof turnId!=='string'||!turnId.trim()||turnId.length>100)fail('Record the melee attack turn');effect.noOpportunityAttacksFrom=targets[0];effect.turnId=turnId;effect.endsAtRecordedTurnEnd=true;
      }else{result.hitInstead=true;result.naturalTwenty=false;result.beforeDamage=true;result.recordOnly=true;}
      break;
    }
    default:fail('Unknown Corsair Path operation');
  }
  result.callingLevel=level;
}
module.exports={apply};

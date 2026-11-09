const agilityChecks=require('./agilityChecks');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function apply(c,s,o,p,targets,effect,result,turnId){
  if(p.confirmed!==true)fail('Confirm the action, trigger, visibility, cover and target facts');
  const state=c.rulesRuntime,self=String(c._id??'self');
  const event=()=>{if(typeof p.eventId!=='string'||!p.eventId.trim()||p.eventId.length>100)fail('Record a stable trigger event ID');};
  const ownTurn=()=>{if(!state.ownerTurn?.open||state.ownerTurn.id!==turnId)fail('This Bonus Action requires your current open owner turn');};
  const untilEnd=()=>{if(typeof turnId!=='string'||!turnId.trim()||turnId.length>100)fail('Record the triggering turn');effect.turnId=turnId;effect.endsAtRecordedTurnEnd=true;effect.endsAtTriggerTurnEnd=true;};
  switch(o.handler){
    case 'corsair-dash':
      ownTurn();if(targets.length)fail('Dash affects only you');result.dash={additionalMovementFeet:s.movement.walk,expiresOnTurn:turnId};result.recordOnly=true;break;
    case 'corsair-disengage':
      ownTurn();if(targets.length)fail('Disengage affects only you');untilEnd();effect.noOpportunityAttacksForMovement=true;break;
    case 'corsair-aim':
      ownTurn();if(targets.length||(state.ownerTurn.movementFeet??0)>0||state.effects.some(e=>e.steadyAim))fail('Steady Aim requires no movement yet and can be activated only once on your turn');untilEnd();effect.steadyAim=true;effect.nextAttackAdvantage=true;effect.uncancelable=true;break;
    case 'corsair-aim-attack':{
      ownTurn();event();const aim=state.effects.find(e=>e.steadyAim&&e.nextAttackAdvantage&&e.turnId===turnId);if(!aim||targets.length!==1)fail('Choose one next attack target with active unused Steady Aim');aim.nextAttackAdvantage=false;result.attackAdvantage=true;result.eventId=p.eventId;result.speedRemainsZero=true;state.conditions=state.conditions.filter(c=>c.source!=='hide'||c.conditionId!=='invisible');result.recordOnly=true;break;
    }
    case 'corsair-hide':{
      ownTurn();if(targets.length||!['cover','heavy-obscurement'].includes(p.mode))fail('Hide requires three-quarters or total cover, or heavy obscurement, outside enemy sight');
      Object.assign(result,agilityChecks.hide(c,s));
      result.recordOnly=true;break;
    }
    case 'corsair-finesse':{
      ownTurn();event();if(!['lock','trap','pocket'].includes(p.mode)||!Number.isSafeInteger(p.dc)||p.dc<1||p.dc>1000||typeof p.objectId!=='string'||!p.objectId.trim()||p.objectId.length>100)fail('Choose the lock, trap or pocket, its stable identity and GM DC');
      const toolId=p.mode==='pocket'?undefined:'thieves-tools';
      if(toolId&&!c.inventory.some(i=>i.definitionId===toolId))fail('Locks and traps require carried Thieves Tools');
      Object.assign(result,agilityChecks.rollSkill(c,s,'sleight-of-hand',{toolId}));
      result.dc=p.dc;result.success=result.checkTotal>=p.dc;result.objectId=p.objectId;result.recordOnly=true;break;
    }
    case 'gray-defense':case 'broker-resist':
      event();if(!require('./vitality').damageTypes.includes(p.damageType)||!Number.isSafeInteger(p.incomingDamage)||p.incomingDamage<1||p.incomingDamage>1000000)fail('Record unresolved incoming damage and its type');
      state.counters.defensiveReactions??=[];if(state.counters.defensiveReactions.includes(p.eventId)||state.counters.defensiveReactions.length>=200)fail('This damage trigger already resolved or its journal is full');
      if(o.handler==='gray-defense'){if(targets.length&&!(targets.length===1&&targets[0]===self))fail('Superior Defense protects only you');untilEnd();effect.damageResistance=p.damageType;result.resistanceGrant={targetId:self,damageType:p.damageType,untilTurnEnd:turnId};}
      else{if(targets.length!==1||!['lightning','thunder'].includes(p.damageType))fail('Choose one visible creature within sixty feet taking Lightning or Thunder damage');result.resistanceGrant={targetId:targets[0],damageType:p.damageType,eventId:p.eventId,onlyThisDamageInstance:true};result.recordOnly=true;}
      state.counters.defensiveReactions.push(p.eventId);break;
    default:fail('Unknown utility operation');
  }
}
module.exports={apply};

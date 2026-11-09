const {randomInt,randomUUID}=require('node:crypto');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function apply(c,s,p){
  if(Object.keys(p).some(k=>!['mode','eventId','turnId','weaponId','targetId','originalTargetId','missingHealth','critical','confirmed'].includes(k))||p.confirmed!==true||s.paths.navigator!=='gray-net'||require('./vitality').incapacitated(c.rulesRuntime))fail('Confirm the acquired Gray Net feature, eligible weapon attack and target facts');
  for(const key of ['eventId','turnId','targetId'])if(typeof p[key]!=='string'||!p[key].trim()||p[key].length>100)fail('Record stable event, target and turn IDs');
  const state=c.rulesRuntime,choice=s.pathSelections.navigator,turn=state.ownerTurn,result={type:'navigator.prey',mode:p.mode,eventId:p.eventId,targetId:p.targetId};
  state.counters.grayNet??=[];const journal=key=>{if(state.counters.grayNet.includes(key)||state.counters.grayNet.length>=200)fail('This Gray Net trigger already resolved or journal is full');state.counters.grayNet.push(key);};
  if(p.mode==='multiattack-defense'){
    if(s.callingLevels.navigator<7||choice.defensiveTactics!=='multiattack-defense')fail('Select Multiattack Defense before recording the incoming hit');
    journal('defense:'+p.eventId);state.effects.push({id:randomUUID(),featureId:'path:gray-net:defensive-tactics:7',multiattackDefense:p.targetId,turnId:p.turnId,endsAtTriggerTurnEnd:true,createdAt:require('./clock').now(state)});result.subsequentAttacksDisadvantage=true;
  }else{
    const attack=require('../../equipment').derive(c).attacks.find(a=>a.instanceId===p.weaponId&&!a.requiresTwoHandGrip);if(!attack)fail('Choose an equipped weapon with its required grip');
    if(p.mode==='colossus-slayer'){
      if(choice.hunterPrey!=='colossus-slayer'||p.missingHealth!==true||p.critical!==undefined&&typeof p.critical!=='boolean')fail('Colossus Slayer requires its selected option and a hit against a creature missing Health');journal('slayer:'+p.turnId);result.rolls=Array.from({length:p.critical?2:1},()=>randomInt(1,9));result.damage=result.rolls.reduce((a,b)=>a+b,0);result.damageType=attack.weapon.damage.type;
    }else if(p.mode==='horde-breaker'){
      if(choice.hunterPrey!=='horde-breaker'||!turn?.open||turn.id!==p.turnId||typeof p.originalTargetId!=='string'||!p.originalTargetId.trim()||p.originalTargetId.length>100||p.originalTargetId===p.targetId||turn.attackedTargetIds?.includes(p.targetId))fail('Horde Breaker requires your turn, another adjacent target in weapon range that you have not attacked this turn');
      journal('horde:'+p.turnId);const d=attack.weapon;
      if(d.ammunitionType){if(d.hands===1&&c.loadout.mainHand&&c.loadout.offHand)fail('A one-handed ammunition weapon needs a free loading hand');const ammo=c.inventory.find(i=>i.definitionId&&require('../../equipment').definition(i.definitionId).kind!=='weapon'&&require('../../equipment').definition(i.definitionId).ammunitionType===d.ammunitionType&&i.quantity>0);if(!ammo)fail('Horde Breaker requires ammunition');ammo.quantity--;if(!ammo.quantity)c.inventory=c.inventory.filter(i=>i!==ammo);result.ammunitionSpent=1;}
      turn.attackedTargetIds??=[];turn.attackedTargetIds.push(p.targetId);result.additionalAttack={weaponId:p.weaponId,targetId:p.targetId,originalTargetId:p.originalTargetId,requiresWithinFiveFeetOfOriginal:true,action:'No action'};
    }else fail('Choose a selected Gray Net option');
  }
  state.revision++;return result;
}
module.exports={apply};

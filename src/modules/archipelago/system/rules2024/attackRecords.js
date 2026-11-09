const {randomUUID,randomInt}=require('node:crypto');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function apply(c,s,p){
  if(!p||Object.keys(p).some(k=>!['eventId','targetId','weaponId','attribute','hit','reckless','confirmed','preserveHide','turnId','critical','damageType'].includes(k))||p.confirmed!==true||typeof p.hit!=='boolean'||typeof p.reckless!=='boolean'||p.preserveHide!==undefined&&typeof p.preserveHide!=='boolean'||p.critical!==undefined&&typeof p.critical!=='boolean'||p.damageType!==undefined&&!require('./vitality').damageTypes.includes(p.damageType))fail('Confirm the attack outcome, chosen attribute and Reckless Attack decision');
  for(const key of ['eventId','targetId'])if(typeof p[key]!=='string'||!p[key].trim()||p[key].length>100)fail('Record stable attack and target IDs');
  if(!['might','agility','resolve','wit','instinct','spirit'].includes(p.attribute))fail('Choose the attribute actually used for the attack');
  const state=c.rulesRuntime;if(require('./vitality').incapacitated(state))fail('Cannot attack while Incapacitated');
  const turn=state.ownerTurn,ownTurn=!!turn?.open;
  if(!ownTurn&&(typeof p.turnId!=='string'||!p.turnId.trim()||p.turnId.length>100))fail('Record the external turn ID for an off-turn attack');
  if(ownTurn&&p.turnId!==undefined&&p.turnId!==turn.id)fail('Use your current owner turn ID');
  if(p.weaponId!==undefined&&(typeof p.weaponId!=='string'||!require('../../equipment').derive(c).attacks.some(a=>a.instanceId===p.weaponId&&!a.requiresTwoHandGrip)))fail('Choose an equipped weapon that can attack with its current grip');
  state.counters.attackRecords??=[];if(state.counters.attackRecords.includes(p.eventId)||state.counters.attackRecords.length>=200)fail('Attack already recorded or attack journal is full');
  if(ownTurn)turn.attackEvents??=[];
  if(p.reckless&&(!ownTurn||!(s.callingLevels.reaver>=2)||turn.attackEvents.length))fail('Choose Reckless Attack only on your first attack roll of the turn after acquiring it');
  if(p.preserveHide&&(!ownTurn||!state.strikeHistory?.some(r=>r.eventId===p.eventId&&r.turnId===turn.id&&r.effects.some(e=>e.optionId==='stealth-attack'))))fail('Preserving Hide requires the same recorded Stealth Attack hit');
  if(p.reckless)state.effects.push({id:randomUUID(),featureId:'calling:reaver:reckless-attack:2',recklessAttack:true,createdTurn:turn.number,ends:'start-of-next-turn',createdAt:require('./clock').now(state)});
  const studied=state.effects.find(e=>e.studiedAttack&&e.targetId===p.targetId),aim=state.effects.find(e=>e.steadyAim&&e.nextAttackAdvantage);
  const result={type:'attack.record',eventId:p.eventId,targetId:p.targetId,hit:p.hit,recklessAdvantage:p.attribute==='might'&&state.effects.some(e=>e.recklessAttack),studiedAdvantage:!!studied,steadyAimAdvantage:!!aim};
  const outrider=s.paths.gunslinger==='brass-outrider'&&s.callingLevels.gunslinger>=10;
  const vigil=s.paths.warden==='lantern-vigil';
  if(ownTurn&&p.hit&&p.weaponId&&(outrider||vigil)&&!turn.firstWeaponHit){
    const watch=vigil&&state.effects.find(e=>e.watchLight&&require('./clock').active(state,e));
    turn.firstWeaponHit={eventId:p.eventId,targetId:p.targetId,weaponId:p.weaponId,voluntarySpeedFeet:turn.voluntarySpeedFeet??0,recoilBeforeHit:!!turn.recoilBeforeHit,...(watch?{watchId:watch.id}:{})};
  }
  if(studied)state.effects=state.effects.filter(e=>e!==studied);if(aim)aim.nextAttackAdvantage=false;
  if(!p.hit&&s.callingLevels.gunslinger>=13)state.effects.push({id:randomUUID(),featureId:'calling:gunslinger:studied-attacks:13',studiedAttack:true,targetId:p.targetId,createdTurn:turn?.number??0,ends:'end-of-next-turn',createdAt:require('./clock').now(state)});
  if(!p.preserveHide)state.conditions=state.conditions.filter(e=>e.source!=='hide'||e.conditionId!=='invisible');
  const rage=state.effects.find(e=>e.rage);if(rage&&ownTurn)rage.createdTurn=turn.number;
  if(ownTurn&&p.hit&&p.attribute==='might'&&rage&&s.paths.reaver==='bloodwake'&&state.effects.some(e=>e.recklessAttack)&&!turn.frenzyUsed){
    if(!p.damageType)fail('Record the actual weapon or Unarmed Strike damage type for Frenzy');
    turn.frenzyUsed=true;result.rolls=Array.from({length:s.mechanics.reaver.rageDamage*(p.critical?2:1)},()=>randomInt(1,7));result.damage=result.rolls.reduce((a,b)=>a+b,0);result.damageType=p.damageType;result.frenzy=true;
  }
  if(ownTurn){turn.attackEvents.push(p.eventId);turn.attackedTargetIds??=[];if(!turn.attackedTargetIds.includes(p.targetId))turn.attackedTargetIds.push(p.targetId);}state.counters.attackRecords.push(p.eventId);require('./featOperations').action(state);state.revision++;return result;
}
module.exports={apply};

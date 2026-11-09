const {randomInt,randomUUID}=require('node:crypto');
const profiles={
  acid:{action:'attack-replacement',consume:true,rangeFeet:20,dice:[2,6],damageType:'acid',save:true},
  'alchemists-fire':{action:'attack-replacement',consume:true,rangeFeet:20,dice:[1,4],damageType:'fire',save:true,burningOnFailure:true},
  'holy-water':{action:'attack-replacement',consume:true,rangeFeet:20,dice:[2,8],damageType:'radiant',save:true,fiendOrUndeadOnly:true},
  net:{action:'attack-replacement',consume:true,rangeFeet:15,save:true,deployed:true,restrainedOnFailure:true,hugeOrLargerAutoSucceeds:true,escapeDC:10,objectGuard:10,objectHealth:5,immunities:['bludgeoning','poison','psychic']},
  'ball-bearings':{action:'utilize',consume:true,deployed:true,recoverMinutes:10,rangeFeet:10,areaFeet:10,saveDC:10,proneOnFailure:true},
  caltrops:{action:'utilize',consume:true,deployed:true,recoverMinutes:10,rangeFeet:5,areaFeet:5,saveDC:15,damage:1,damageType:'piercing',speedZeroUntilTargetTurn:true},
  'hunting-trap':{action:'utilize',consume:true,deployed:true,recoverMinutes:0,saveDC:13,dice:[1,4],damageType:'piercing',speedZeroUntilTargetTurn:true,chainFeet:3,escapeDC:13,failedEscapeDamage:1},
  antitoxin:{action:'bonus',consume:true,antitoxin:true,durationSeconds:3600},
  'healing-potion':{action:'bonus',consume:true,healing:[2,4,2]},
  'healer-kit':{action:'utilize',kitCharge:true,stabilize:true},
  torch:{action:'utilize',consume:true,durationSeconds:3600,brightFeet:20,dimBeyondFeet:20},
  candle:{action:'utilize',consume:true,durationSeconds:3600,brightFeet:5,dimBeyondFeet:5},
  'basic-poison':{action:'bonus',consume:true,durationSeconds:60,weaponPoison:true},
};
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function apply(c,s,p){
  if(Object.keys(p).some(k=>!['instanceId','action','targetIds','eventId','mode','objectId','confirmed'].includes(k))||p.confirmed!==true||typeof p.eventId!=='string'||!p.eventId.trim()||p.eventId.length>100)fail('Confirm the owned object, printed activation, target facts and stable event');
  const gear=require('./index'),item=c.inventory.find(i=>i.instanceId===p.instanceId),definition=item?.definitionId?gear.definition(item.definitionId):null,state=c.rulesRuntime,self=String(c._id??'self');
  if(!definition||definition.kind!=='gear'||definition.magic)fail('Choose an owned mundane catalog object; magic items use their identified controls');
  if(require('../system/rules2024/vitality').incapacitated(state))fail('Cannot use an object while Incapacitated');
  const targets=p.targetIds??[];if(!Array.isArray(targets)||new Set(targets).size!==targets.length||targets.length>1||targets.some(id=>typeof id!=='string'||!id.trim()||id.length>100))fail('Choose at most one stable object-use recipient');
  let profile=profiles[definition.id]??{action:'utilize'};
  if(definition.id==='oil'){
    if(!['throw','ground','fuel'].includes(p.mode))fail('Choose throwing, pouring on ground or fueling a carried Lamp/Lantern');
    profile={action:p.mode==='throw'?'attack-replacement':'utilize',consume:true,...(p.mode==='throw'?{rangeFeet:20,save:true,oilCoating:true,durationSeconds:60}:p.mode==='ground'?{rangeFeet:5,areaFeet:5,deployed:true,groundOil:true,burningDamage:5,oncePerCreatureTurn:true}:{oilFuel:true,durationSeconds:21600})};
    if(profile.oilFuel&&!c.inventory.some(i=>i.instanceId===p.objectId&&['lamp','lantern-bullseye','lantern-hooded'].includes(i.definitionId)))fail('Fuel requires a currently owned Lamp or Lantern');
  }
  if(p.action!==undefined&&!['utilize','bonus','attack-replacement'].includes(p.action))fail('Choose a valid object activation');
  const action=p.action??profile.action;if(action!==profile.action&&!(action==='bonus'&&profile.action==='utilize'&&s.paths.corsair==='reef-knife'&&s.callingLevels.corsair>=3))fail('Only Fast Hands changes a Utilize activation into a Bonus Action');
  if(profile.save&&targets.length!==1)fail('Choose one visible creature or object for this thrown item');
  if(profile.fiendOrUndeadOnly&&!['fiend','undead','other'].includes(p.mode))fail('Confirm whether the Holy Water target is a Fiend, Undead or another creature');
  if((profile.healing||profile.stabilize||profile.antitoxin)&&targets.length!==1)fail('Choose one object-use recipient');
  if(profile.antitoxin&&targets[0]!==self)fail('Antitoxin is drunk by its owner; it does not restore Health or remove Poisoned');
  if(profile.weaponPoison){const coated=c.inventory.find(i=>i.instanceId===p.objectId),d=coated?.definitionId?gear.definition(coated.definitionId):null;if(targets.length||!d||d.kind!=='weapon'&&!d.ammunitionType)fail('Choose one owned weapon or ammunition stack to coat with Basic Poison');}
  if(profile.kitCharge&&!(item.chargesCurrent>0))fail('The healer kit is empty');
  if((profile.consume||profile.kitCharge)&&[c.loadout.mainHand,c.loadout.offHand,c.loadout.armor].includes(item.instanceId))fail('Unequip this item before expending it');
  state.gearUses??=[];if(state.gearUses.includes(p.eventId)||state.gearUses.length>=200)fail('This object-use event already resolved or the journal is full');
  const effect={id:randomUUID(),featureId:'equipment:'+definition.id,name:definition.name,sourceInstanceId:item.instanceId,createdAt:require('../system/rules2024/clock').now(state),createdTurn:state.ownerTurn?.number??0,targetIds:targets,objectProfile:profile};
  if(profile.durationSeconds)effect.expiresAt=effect.createdAt+profile.durationSeconds*1000;
  const result={type:'equipment.utilize',instanceId:item.instanceId,definitionId:definition.id,eventId:p.eventId,action,description:definition.description,objectProfile:profile};
  if(profile.dice){result.rolls=Array.from({length:profile.dice[0]},()=>randomInt(1,profile.dice[1]+1));result.damage=result.rolls.reduce((a,b)=>a+b,0);result.damageType=profile.damageType;}
  if(profile.fiendOrUndeadOnly&&p.mode==='other'){result.damage=0;result.rolls=[];}
  if(profile.damage!==undefined){result.damage=profile.damage;result.damageType=profile.damageType;}
  if(profile.save||profile.saveDC)result.save={attribute:'agility',dc:profile.saveDC??8+s.attributeModifiers.agility+s.trainingBonus};
  if(profile.healing){result.rolls=Array.from({length:profile.healing[0]},()=>randomInt(1,profile.healing[1]+1));result.healing=result.rolls.reduce((a,b)=>a+b,profile.healing[2]);if(targets.includes(self))require('../system/rules2024/vitality').heal(state,result.healing);}
  if(profile.stabilize){result.stabilize=true;result.requireZeroHealth=true;if(targets.includes(self))require('../system/rules2024/vitality').targetEffects(state,result);}
  if(profile.antitoxin)effect.poisonedSaveAdvantage=true;
  if(profile.weaponPoison){const coated=c.inventory.find(i=>i.instanceId===p.objectId),d=gear.definition(coated.definitionId);effect.poisonCoating={instanceId:coated.instanceId,ammunition:d.kind!=='weapon',remainingHits:d.kind==='weapon'?1:Math.min(3,coated.quantity)};state.effects=state.effects.filter(e=>e.poisonCoating?.instanceId!==coated.instanceId);}
  if(profile.deployed){effect.deployedItem={...item,quantity:1};effect.recoverMinutes=profile.recoverMinutes??0;result.deployedEffectId=effect.id;}
  if(profile.oilFuel){effect.oilFuel={objectId:p.objectId,lit:true,remainingMs:21600000,lastLitAt:effect.createdAt};}
  if(profile.kitCharge)item.chargesCurrent--;else if(profile.consume){item.quantity--;if(!item.quantity)c.inventory=c.inventory.filter(i=>i.instanceId!==item.instanceId);}
  if(profile.durationSeconds||profile.deployed)state.effects.push(effect);state.gearUses.push(p.eventId);state.revision++;return {...result,...(profile.durationSeconds||profile.deployed?{effect}:{})};
}
function recover(c,p){
  if(Object.keys(p).some(k=>!['effectId','startedAt','completedAt','confirmed'].includes(k))||p.confirmed!==true)fail('Confirm retrieval of the deployed item and its recovery time');
  const state=c.rulesRuntime,effect=state.effects.find(e=>e.id===p.effectId&&e.deployedItem);if(!effect||effect.objectProfile.groundOil)fail('Choose your recoverable deployed object');
  if(require('../system/rules2024/vitality').incapacitated(state)||state.inCombat||state.ownerTurn?.open||state.restSession)fail('Complete the current action, combat and rest before retrieval');
  if(!Number.isSafeInteger(p.startedAt)||!Number.isSafeInteger(p.completedAt)||p.startedAt<effect.createdAt||p.completedAt-p.startedAt<effect.recoverMinutes*60000)fail('Record sufficient recovery time after the object was deployed');
  require('../system/rules2024/clock').advance(state,p.startedAt);require('../system/rules2024/clock').advance(state,p.completedAt);
  const existing=c.inventory.find(i=>i.instanceId===effect.sourceInstanceId);let instanceId=effect.sourceInstanceId;
  if(existing&&existing.definitionId===effect.deployedItem.definitionId&&existing.customName===effect.deployedItem.customName&&existing.notes===effect.deployedItem.notes){if(!require('./index').definition(existing.definitionId).stackable)fail('A nonstackable deployed object already exists in inventory');existing.quantity++;}else{if(existing)instanceId=randomUUID();c.inventory.push({...effect.deployedItem,instanceId,quantity:1});}state.effects=state.effects.filter(e=>e.id!==effect.id);state.revision++;return {type:'equipment.recover',definitionId:effect.deployedItem.definitionId,instanceId};
}
function flame(c,p){
  if(Object.keys(p).some(k=>!['effectId','lit','confirmed'].includes(k))||p.confirmed!==true||typeof p.lit!=='boolean')fail('Confirm the Utilize action to light or extinguish Oil');
  const state=c.rulesRuntime,effect=state.effects.find(e=>e.id===p.effectId&&(e.oilFuel||e.objectProfile?.groundOil));if(!effect||require('../system/rules2024/vitality').incapacitated(state))fail('Choose your remaining Oil effect while conscious');
  const now=require('../system/rules2024/clock').now(state);
  if(effect.oilFuel){const fuel=effect.oilFuel;if(fuel.lit===p.lit)fail('Choose a changed flame state');if(fuel.lit)fuel.remainingMs=Math.max(0,fuel.remainingMs-(now-fuel.lastLitAt));if(!fuel.remainingMs)fail('This Oil has burned out');fuel.lit=p.lit;if(p.lit){fuel.lastLitAt=now;effect.expiresAt=now+fuel.remainingMs;}else delete effect.expiresAt;}
  else{if(!p.lit||effect.expiresAt)fail('Ground Oil can be lit once; resolve extinguishing the spill with the GM');effect.expiresAt=now+12000;}
  state.revision++;return {type:'equipment.flame',effectId:effect.id,lit:p.lit,...(effect.oilFuel?{remainingMs:effect.oilFuel.remainingMs}:{burningDamage:5,oncePerCreatureTurn:true})};
}
function poisonHit(c,p){
  if(Object.keys(p).some(k=>!['effectId','eventId','targetId','damageType','confirmed','hit'].includes(k))||p.confirmed!==true||!['piercing','slashing'].includes(p.damageType)||p.hit!==undefined&&typeof p.hit!=='boolean')fail('Confirm a hit dealing Piercing or Slashing damage from this poisoned weapon or ammunition');
  for(const key of ['eventId','targetId'])if(typeof p[key]!=='string'||!p[key].trim()||p[key].length>100)fail('Record stable poison hit and target IDs');
  const state=c.rulesRuntime,effect=state.effects.find(e=>e.id===p.effectId&&e.poisonCoating&&require('../system/rules2024/clock').active(state,e));if(!effect)fail('Choose an active unused Basic Poison coating');
  if(p.hit===false&&!effect.poisonCoating.ammunition)fail('A missed weapon attack does not expend its poison coating');
  state.gearUses??=[];if(state.gearUses.includes(p.eventId)||state.gearUses.length>=200)fail('Poison hit already resolved or object journal is full');
  const rolls=p.hit===false?[]:[randomInt(1,5)];effect.poisonCoating.remainingHits--;if(!effect.poisonCoating.remainingHits)state.effects=state.effects.filter(e=>e!==effect);state.gearUses.push(p.eventId);state.revision++;
  return {type:'equipment.poison-hit',eventId:p.eventId,targetId:p.targetId,rolls,damage:rolls[0]??0,damageType:'poison',remainingCoatedHits:effect.poisonCoating.remainingHits};
}
module.exports={apply,recover,flame,profiles,poisonHit};

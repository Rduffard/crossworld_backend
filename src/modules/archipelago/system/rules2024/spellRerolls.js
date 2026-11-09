const {randomInt}=require('node:crypto');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function apply(character,summary,p){
  if(!p||Object.keys(p).some(k=>!['castId','eventId','optionId','confirmed','dice','indices','originalRoll','turnId','free'].includes(k)))fail('Invalid spell reroll fields');
  const state=structuredClone(character.rulesRuntime),cast=state.castings?.find(c=>c.castId===p.castId);
  if(!cast||!['empowered-spell','seeking-spell'].includes(p.optionId)||!summary.pathSelections.tidecaller?.metamagic?.includes(p.optionId))fail('Choose a saved casting and known reroll option');
  if(p.confirmed!==true||typeof p.eventId!=='string'||!p.eventId.trim()||p.eventId.length>100)fail('GM must confirm the damage roll or missed spell attack and identify the roll');
  if(cast.rerolls.some(r=>r.eventId===p.eventId&&r.optionId===p.optionId))fail('This spell roll has already used this Metamagic option');
  if(cast.rerolls.length>=100)fail('Too many rolls recorded for this casting');
  let result={type:'spell.reroll',castId:cast.castId,eventId:p.eventId,optionId:p.optionId};
  if(p.optionId==='empowered-spell'){
    if(!cast.management.damageTypes.length)fail('Empowered requires spell damage');
    if(!Array.isArray(p.dice)||!p.dice.length||p.dice.length>100||p.dice.some(d=>!d||Object.keys(d).some(k=>!['sides','value'].includes(k))||![4,6,8,10,12,20,100].includes(d.sides)||!Number.isSafeInteger(d.value)||d.value<1||d.value>d.sides))fail('Record valid damage dice');
    if(!Array.isArray(p.indices)||!p.indices.length||new Set(p.indices).size!==p.indices.length||p.indices.length>Math.max(1,summary.attributeModifiers.spirit)||p.indices.some(i=>!Number.isSafeInteger(i)||i<0||i>=p.dice.length))fail('Choose damage dice within your Spirit reroll limit');
    const dice=structuredClone(p.dice);for(const i of p.indices)dice[i].value=randomInt(1,dice[i].sides+1);
    result={...result,originalDice:p.dice,dice,indices:p.indices,total:dice.reduce((s,d)=>s+d.value,0),mustUseNewRoll:true};
  }else{
    if(!cast.management.spellAttack||!Number.isSafeInteger(p.originalRoll)||p.originalRoll<1||p.originalRoll>20)fail('Seeking requires a missed spell attack and its original d20');
    const roll=randomInt(1,21);result={...result,originalRoll:p.originalRoll,roll,attackModifier:cast.attackModifier,total:roll+cast.attackModifier,mustUseNewRoll:true};
  }
  if(p.free!==undefined&&typeof p.free!=='boolean')fail('Choose whether to use Arcane Apotheosis');
  if(p.free){
    const active=state.effects.some(e=>e.featureId==='calling:tidecaller:innate-sorcery:1'&&require('./clock').active(state,e));
    const castingTurn=require('./castingTurn'),turnId=castingTurn.resolve(state,p.turnId)??p.turnId;
    if(!active||summary.callingLevels.tidecaller<20||!turnId)fail('Arcane Apotheosis requires active Innate Sorcery and a turn label');
    castingTurn.record(state,turnId,{level:0,freeMetamagic:true});
  }else{
    if(!(state.pools['tidecaller:sorcery-points']>=1))fail('Insufficient Sorcery Points');
    state.pools['tidecaller:sorcery-points']--;
  }
  result.metamagicCost=p.free?0:1;cast.rerolls.push(result);
  state.revision++;require('./runtime').validateProjected(summary,state);character.rulesRuntime=state;return result;
}
module.exports={apply};

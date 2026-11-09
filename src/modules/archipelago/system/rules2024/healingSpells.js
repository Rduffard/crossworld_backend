const {randomInt}=require('node:crypto');
// SRD 5.2.1 healing clauses; all spatial and casting-completion facts are GM adjudicated.
const profiles={
  'cure-wounds':{dice:2,sides:8,perLevel:2,modifier:true,targets:1},
  'healing-word':{dice:2,sides:4,perLevel:2,modifier:true,targets:1},
  'mass-healing-word':{dice:2,sides:4,perLevel:1,modifier:true,targets:6},
  'mass-cure-wounds':{dice:5,sides:8,perLevel:1,modifier:true,targets:6},
  'prayer-of-healing':{dice:2,sides:8,perLevel:1,targets:5,prayerRest:true},
  heal:{flat:70,perLevel:10,targets:1,endsConditions:['blinded','deafened','poisoned']},
  'mass-heal':{budget:700,targets:100,endsConditions:['blinded','deafened','poisoned']},
  regenerate:{dice:4,sides:8,flat:15,perLevel:0,targets:1,ticks:true},
  'power-word-heal':{full:true,targets:1,endsConditions:['charmed','frightened','paralyzed','poisoned','stunned']},
};
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function apply(c,s,p){
  if(Object.keys(p).some(k=>!['castId','targetIds','eventId','turnId','phase','allocations','confirmed'].includes(k))||p.confirmed!==true||typeof p.eventId!=='string'||!p.eventId.trim()||p.eventId.length>100)fail('Confirm the completed healing spell, recipient facts and stable resolution event');
  const state=c.rulesRuntime,cast=state.castings?.find(x=>x.castId===p.castId),profile=profiles[cast?.spellId],spell=require('./rules').spells.find(x=>x.id===cast?.spellId);
  if(!cast||!profile||!spell)fail('Choose an actual recorded healing spell casting');
  const targets=p.targetIds,self=String(c._id??'self'),phase=p.phase??'initial';
  if(!Array.isArray(targets)||!targets.length||targets.length>profile.targets||new Set(targets).size!==targets.length||targets.some(id=>typeof id!=='string'||!id.trim()||id.length>100||!cast.targets?.includes(id)))fail('Choose distinct recorded casting recipients within the spell target limit');
  if(!['initial','regeneration-turn'].includes(phase))fail('Choose a supported healing phase');
  if(phase==='regeneration-turn'&&(!profile.ticks||!state.effects.some(e=>e.id===cast.castId&&require('./clock').active(state,e))||typeof p.turnId!=='string'||!p.turnId.trim()||p.turnId.length>100))fail('Regeneration requires the live source spell and recipient turn');
  cast.healingUses??=[];const key=phase==='initial'?'initial':'turn:'+p.turnId;
  if(cast.healingUses.some(e=>e.key===key||e.eventId===p.eventId)||cast.healingUses.length>=700)fail('This healing phase already resolved or its source journal is full');
  const sanctuary=s.paths.doctor==='sanctuary-hand',supreme=sanctuary&&s.callingLevels.doctor>=17,initial=phase==='initial',level=cast.slotLevel??spell.level,bonus=initial&&sanctuary&&cast.usedSlot?2+level:0;
  let healing=0,rolls=[],allocations;
  if(profile.budget){if(!Array.isArray(p.allocations)||p.allocations.length!==targets.length||p.allocations.some((a,i)=>!a||Object.keys(a).some(k=>!['targetId','amount'].includes(k))||a.targetId!==targets[i]||!Number.isSafeInteger(a.amount)||a.amount<1)||p.allocations.reduce((n,a)=>n+a.amount,0)>profile.budget)fail('Divide at most seven hundred healing among the selected recipients');allocations=p.allocations.map(a=>({...a,amount:a.amount+bonus}));}
  else if(p.allocations!==undefined)fail('Only Mass Heal accepts a divided healing budget');
  else if(!initial)healing=1;
  else if(!profile.full){const count=(profile.dice??0)+(profile.dice?(level-spell.level)*(profile.perLevel??0):0);rolls=Array.from({length:count},()=>supreme?profile.sides:randomInt(1,profile.sides+1));healing=Math.max(0,rolls.reduce((a,b)=>a+b,0)+(profile.flat??0)+(!profile.dice?(level-spell.level)*(profile.perLevel??0):0)+(profile.modifier?(cast.castingModifier??s.spellcasting[cast.callingId]?.modifier??0):0)+bonus);}
  const result={type:'spell.heal',castId:cast.castId,spellId:spell.id,phase,eventId:p.eventId,rolls,healing,...(allocations?{healingAllocations:allocations}:{}),...(initial&&profile.full?{restoreAllHealth:true}:{}),...(initial&&profile.endsConditions?{endsConditions:profile.endsConditions}:{}),...(initial&&profile.prayerRest?{prayerRest:true}:{}),discipleLifeBonus:bonus,supremeHealing:initial&&supreme};
  cast.healingUses.push({key,eventId:p.eventId,targetIds:targets});
  if(targets.includes(self))require('./vitality').targetEffects(state,allocations?{...result,healing:allocations.find(a=>a.targetId===self).amount}:result,s);
  if(initial&&sanctuary&&s.callingLevels.doctor>=6&&cast.usedSlot&&targets.some(id=>id!==self)){const amount=2+level,before=state.health.current;require('./vitality').heal(state,amount);result.blessedHealerSelfHealing=state.health.current-before;}
  state.revision++;return result;
}
module.exports={apply,profiles};

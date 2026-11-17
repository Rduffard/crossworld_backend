const { sumDice } = require('@crossworld/sanguine-engine/dice');
const {randomInt}=require('node:crypto');
const { profiles, healingDiceCount, healingSpellAmount, healingAllocationWithinBudget, healingAllocationsWithBonus,
  regenerationHealing, healingPhases, healingTargetsEligible } = require('@crossworld/sanguine-engine/spells/healing');
const { sanctuaryHealingFeatures } = require('@crossworld/sanguine-engine/callings');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function apply(c,s,p){
  if(Object.keys(p).some(k=>!['castId','targetIds','eventId','turnId','phase','allocations','confirmed'].includes(k))||p.confirmed!==true||typeof p.eventId!=='string'||!p.eventId.trim()||p.eventId.length>100)fail('Confirm the completed healing spell, recipient facts and stable resolution event');
  const state=c.rulesRuntime,cast=state.castings?.find(x=>x.castId===p.castId),profile=profiles[cast?.spellId],spell=require('../system/rules').spells.find(x=>x.id===cast?.spellId);
  if(!cast||!profile||!spell)fail('Choose an actual recorded healing spell casting');
  const targets=p.targetIds,self=String(c._id??'self'),phase=p.phase??'initial';
  if(!healingTargetsEligible(targets,profile.targets,cast.targets)||targets.some(id=>typeof id!=='string'||!id.trim()||id.length>100))
    fail('Choose distinct recorded casting recipients within the spell target limit');
  if(!healingPhases.includes(phase))fail('Choose a supported healing phase');
  if(phase==='regeneration-turn'&&(!profile.ticks||!state.effects.some(e=>e.id===cast.castId&&require('../combat/effects/clock').active(state,e))||typeof p.turnId!=='string'||!p.turnId.trim()||p.turnId.length>100))fail('Regeneration requires the live source spell and recipient turn');
  cast.healingUses??=[];const key=phase==='initial'?'initial':'turn:'+p.turnId;
  if(cast.healingUses.some(e=>e.key===key||e.eventId===p.eventId)||cast.healingUses.length>=700)fail('This healing phase already resolved or its source journal is full');
  const initial=phase==='initial',level=cast.slotLevel??spell.level;
  const sanctuary=s.paths.doctor==='sanctuary-hand'?sanctuaryHealingFeatures(s.callingLevels.doctor,level,cast.usedSlot):null;
  const supreme=sanctuary?.maximumHealingDice??false;
  const bonus=initial?sanctuary?.additionalHealingOnCastingTurn??0:0;
  let healing=0,rolls=[],allocations;
  if(profile.budget){if(!Array.isArray(p.allocations)||p.allocations.length!==targets.length||p.allocations.some((a,i)=>!a||Object.keys(a).some(k=>!['targetId','amount'].includes(k))||a.targetId!==targets[i]||!Number.isSafeInteger(a.amount)||a.amount<1)||!healingAllocationWithinBudget(p.allocations,profile.budget))fail('Divide at most seven hundred healing among the selected recipients');allocations=healingAllocationsWithBonus(p.allocations,bonus);}
  else if(p.allocations!==undefined)fail('Only Mass Heal accepts a divided healing budget');
  else if(!initial)healing=regenerationHealing;
  else if(!profile.full){const count=healingDiceCount(profile, level, spell.level);rolls=Array.from({length:count},()=>supreme?profile.sides:randomInt(1,profile.sides+1));healing=healingSpellAmount(profile, { level, baseLevel: spell.level, rolledTotal: sumDice(rolls), castingModifier: cast.castingModifier??s.spellcasting[cast.callingId]?.modifier??0, bonus });}
  const result={type:'spell.heal',castId:cast.castId,spellId:spell.id,phase,eventId:p.eventId,rolls,healing,...(allocations?{healingAllocations:allocations}:{}),...(initial&&profile.full?{restoreAllHealth:true}:{}),...(initial&&profile.endsConditions?{endsConditions:profile.endsConditions}:{}),...(initial&&profile.prayerRest?{prayerRest:true}:{}),discipleLifeBonus:bonus,supremeHealing:initial&&supreme};
  cast.healingUses.push({key,eventId:p.eventId,targetIds:targets});
  if(targets.includes(self))require('../combat/effects/healingEffects').targetEffects(state,allocations?{...result,healing:allocations.find(a=>a.targetId===self).amount}:result,s);
  if(initial&&sanctuary?.blessedHealerEligible&&targets.some(id=>id!==self)){const amount=bonus,before=state.health.current;require('../combat/vitality/vitality').heal(state,amount,s);result.blessedHealerSelfHealing=state.health.current-before;}
  state.revision++;return result;
}
module.exports={apply,profiles};

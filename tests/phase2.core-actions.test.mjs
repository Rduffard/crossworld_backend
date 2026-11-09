import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands');
function use(b,optionId,parameters,targetIds=[]){return commands.apply(b.character,{operationId:'core-action-001',expectedRevision:b.character.documentRevision,rulesVersion:'SA-CHAR-1',type:'ability.activate',payload:{optionId,parameters,targetIds}});}
test('Indomitable rolls a new save, adds Calling level and persists exactly one spend for a failed test',()=>{
  const b=build('gunslinger',17),p={confirmed:true,eventId:'failed-save-one',checkTotal:8,dc:15,saveAttribute:'resolve'},id='calling:gunslinger:indomitable:9#main';
  const next=use(b,id,p);assert.equal(next.result.checkTotal,next.result.rolls[0]+b.summary.savingThrowModifiers.resolve+17);assert.equal(next.changes.rulesRuntime.pools['gunslinger:indomitable'],2);
  b.character={...b.character,...next.changes};const before=structuredClone(b.character);assert.throws(()=>use(b,id,p),/already been resolved/);assert.deepEqual(b.character,before);
});
test('Stroke of Luck turns the original die into twenty without changing its modifiers',()=>{
  const b=build('corsair',20),next=use(b,'calling:corsair:stroke-of-luck:20#main',{confirmed:true,eventId:'check-one',checkTotal:7,originalRoll:2,dc:22});
  assert.equal(next.result.naturalRoll,20);assert.equal(next.result.checkTotal,25);assert.equal(next.result.success,true);assert.equal(next.changes.rulesRuntime.pools['corsair:stroke-of-luck'],0);
});
test('Uncanny Dodge halves attack damage before Resistance and needs confirmed visible attacker evidence',()=>{
  const b=build('corsair',5),id='calling:corsair:uncanny-dodge:5#main';assert.throws(()=>use(b,id,{incomingDamage:11}),/visible attacker/);
  const r=use(b,id,{incomingDamage:11,confirmed:true}).result;assert.equal(r.remainingDamage,5);assert.equal(r.damageReduction,6);
});
test('Divine Spark damage scales at eighteen, chooses its type and records exact half-on-save damage',()=>{
  const b=build('doctor',18),r=use(b,'calling:doctor:channel-divinity:2#spark-damage',{confirmed:true,damageType:'necrotic'},['foe']).result;
  assert.equal(r.rolls.length,4);assert.equal(r.damageType,'necrotic');assert.equal(r.save.successDamage,Math.floor(r.damage/2));assert.equal(r.save.dc,b.summary.spellcasting.doctor.saveDC);
});
test('Turn Undead includes optional Sear damage and ends when its caster becomes Incapacitated',()=>{
  const b=build('doctor',5),next=use(b,'calling:doctor:channel-divinity:2#turn-undead',{confirmed:true,sear:true},['undead-one','undead-two']);assert.equal(next.result.searDoesNotEndTurning,true);
  assert.equal(next.result.rolls.length,Math.max(1,b.summary.attributeModifiers.instinct));assert.deepEqual(next.result.effect.targetConditions,['frightened','incapacitated']);
  const c={...b.character,...next.changes};const changed=commands.apply(c,{operationId:'condition-after-turning',expectedRevision:c.documentRevision,rulesVersion:'SA-CHAR-1',type:'condition.record',payload:{conditionId:'incapacitated',source:'stun',active:true,confirmed:true}});
  assert.ok(!changed.changes.rulesRuntime.effects.some(e=>e.endsOnCasterIncapacitated));
});
test('Abjure Foes limits visible targets to Spirit and records one-choice turn restriction',()=>{
  const b=build('warden',9),id='calling:warden:abjure-foes:9#main';assert.throws(()=>use(b,id,{confirmed:true},Array.from({length:Math.max(1,b.summary.attributeModifiers.spirit)+1},(_,i)=>'foe'+i)),/target limit/);
  const r=use(b,id,{confirmed:true},['foe']).result;assert.equal(r.rangeFeet,60);assert.ok(r.effect.targetTurnRestriction.includes('Bonus Action'));
});
test('Take the Burden bypasses owner Resistance but uses temporary Health and triggers Concentration checks',()=>{
  const b=build('warden',15,'iron-covenant');b.character.rulesRuntime.temporaryHealth=2;b.character.rulesRuntime.effects=[{id:'concentrating',concentration:true}];
  const next=use(b,'path:iron-covenant:take-the-burden:15#main',{confirmed:true,incomingDamage:11},['ally']);
  assert.equal(next.result.transferredDamage,5);assert.equal(next.result.allyDamage,6);assert.equal(next.changes.rulesRuntime.health.current,b.character.rulesRuntime.health.current-3);assert.equal(next.changes.rulesRuntime.concentrationChecks.length,1);
  assert.doesNotThrow(()=>rules.runtime.validate(b.summary,next.changes.rulesRuntime));
});

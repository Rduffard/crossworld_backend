import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands');
function run(b,type,payload){const r=commands.apply(b.character,{operationId:'utility-command',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...r.changes};return r.result;}
function use(b,handler,parameters={},targets=[],turnId){const option=rules.replay(b.character.rulesLedger).abilityOptions.find(o=>o.handler===handler);assert.ok(option,handler);return run(b,'ability.activate',{optionId:option.id,targetIds:targets,parameters:{confirmed:true,...parameters},...(turnId?{turnId}:{})});}
test('Steady Aim cannot erase movement, grants one attack Advantage and keeps zero Speed after that attack',()=>{
  const b=build('corsair',3,'reef-knife');run(b,'turn.start',{turnId:'one',confirmed:true});use(b,'corsair-aim',{},[],'one');const effect=b.character.rulesRuntime.effects.find(e=>e.steadyAim);assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime,b.character).movement.walk,0);assert.throws(()=>run(b,'effect.end',{effectId:effect.id}),/printed duration/);assert.throws(()=>run(b,'movement.record',{feet:1,voluntarySpeed:true,eventId:'move',confirmed:true}),/Speed to zero/);const r=use(b,'corsair-aim-attack',{eventId:'shot'},['enemy'],'one');assert.equal(r.attackAdvantage,true);const s=rules.runtime.project(b.summary,b.character.rulesRuntime,b.character);assert.equal(s.nextAttackAdvantage,false);assert.equal(s.movement.walk,0);assert.throws(()=>use(b,'corsair-aim-attack',{eventId:'another'},['enemy'],'one'),/unused Steady Aim/);run(b,'turn.end',{turnId:'one',confirmed:true});assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime,b.character).movement.walk,30);
  run(b,'turn.start',{turnId:'two',confirmed:true});run(b,'movement.record',{feet:1,voluntarySpeed:true,eventId:'move',confirmed:true});assert.throws(()=>use(b,'corsair-aim',{},[],'two'),/no movement/);
});
test('Cunning Dash and Disengage require the current owner turn and expire normally',()=>{
  const b=build('corsair',3,'reef-knife');assert.throws(()=>use(b,'corsair-dash'),/current open/);run(b,'turn.start',{turnId:'one',confirmed:true});assert.equal(use(b,'corsair-dash',{},[],'one').dash.additionalMovementFeet,30);use(b,'corsair-disengage',{},[],'one');assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime).noOpportunityAttacksForMovement,true);run(b,'turn.end',{turnId:'one',confirmed:true});assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime).noOpportunityAttacksForMovement,false);
});
test('Cunning Hide requires cover and uses a server Agility Stealth check rather than guaranteed invisibility',()=>{
  const b=build('corsair',3,'reef-knife');run(b,'turn.start',{turnId:'one',confirmed:true});assert.throws(()=>use(b,'corsair-hide',{},[],'one'),/Hide requires/);const r=use(b,'corsair-hide',{mode:'cover'},[],'one');assert.equal(r.checkTotal,r.rolls[0]+b.summary.skillModifiers.stealth);assert.equal(r.success,r.checkTotal>=15);assert.equal(b.character.rulesRuntime.conditions.some(c=>c.source==='hide'),r.success);
});
test('Fast Hands checks require the real tools for traps or locks and retain the accepted roll',()=>{
  const b=build('corsair',3,'reef-knife');run(b,'turn.start',{turnId:'one',confirmed:true});const r=use(b,'corsair-finesse',{mode:'lock',objectId:'cabin-lock',eventId:'attempt',dc:15},[],'one');
  assert.equal(b.summary.training.includes('sleight-of-hand'),false);
  assert.equal(r.checkTotal,r.rolls[0]+b.summary.skillModifiers['sleight-of-hand']+b.summary.trainingBonus);assert.equal(r.success,r.checkTotal>=15);b.character.inventory=b.character.inventory.filter(i=>i.definitionId!=='thieves-tools');assert.throws(()=>use(b,'corsair-finesse',{mode:'trap',objectId:'trap',eventId:'second',dc:15},[],'one'),/Thieves Tools/);
});

test('ability checks cancel conflicting circumstances and apply Reliable Talent after selecting the die',()=>{
  const b=build('corsair',7,'reef-knife');
  const summary=rules.runtime.project(b.summary,b.character.rulesRuntime,b.character);
  summary.training=[...new Set([...summary.training,'stealth'])];
  summary.conditions=['poisoned'];
  const {rollSkill}=require('../src/modules/archipelago/system/rules2024/agilityChecks');
  const dice=[17,4];
  const disadvantaged=rollSkill(b.character,summary,'stealth',{rollD20:()=>dice.shift()});
  assert.deepEqual(disadvantaged.rolls,[17,4]);
  assert.equal(disadvantaged.naturalRoll,4);
  assert.equal(disadvantaged.appliedRoll,10);
  assert.equal(disadvantaged.checkTotal,10+summary.skillModifiers.stealth);
  const cancelled=rollSkill(b.character,{...summary,silentKeelStealth:true},'stealth',{rollD20:()=>6});
  assert.deepEqual(cancelled.rolls,[6]);
  assert.equal(cancelled.appliedRoll,10);
});
test('Superior Defense applies one type of real Resistance through the actual triggering turn',()=>{
  const b=build('navigator',15,'gray-net');use(b,'gray-defense',{eventId:'damage',incomingDamage:15,damageType:'fire'},[],'enemy-turn');assert.equal(run(b,'health.damage',{amount:15,damageType:'fire',confirmed:true}).damage,7);run(b,'turn.trigger-end',{turnId:'enemy-turn',confirmed:true});assert.equal(run(b,'health.damage',{amount:15,damageType:'fire',confirmed:true}).damage,15);
});
test('Eye of the Bargain spends a Squall for one visible Lightning or Thunder damage instance only',()=>{
  const b=build('navigator',15,'storm-broker'),before=b.character.rulesRuntime.pools['storm-broker:squall'];assert.throws(()=>use(b,'broker-resist',{eventId:'damage',incomingDamage:20,damageType:'fire'},['ally']),/Lightning or Thunder/);const r=use(b,'broker-resist',{eventId:'damage',incomingDamage:20,damageType:'lightning'},['ally']);assert.equal(r.resistanceGrant.onlyThisDamageInstance,true);assert.equal(b.character.rulesRuntime.pools['storm-broker:squall'],before-1);assert.equal(b.character.rulesRuntime.effects.some(e=>e.damageResistance),false);assert.throws(()=>use(b,'broker-resist',{eventId:'damage',incomingDamage:20,damageType:'lightning'},['ally']),/already resolved/);
});

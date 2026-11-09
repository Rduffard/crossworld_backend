import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),gear=require('../src/modules/archipelago/equipment');
function run(b,type,payload){const r=commands.apply(b.character,{operationId:'object-use-command',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...r.changes};return r.result;}
function add(b,id,quantity=1){const item=gear.issue({definitionId:id,quantity});b.character.inventory.push(item);return item;}
function use(b,item,eventId,extra={}){return run(b,'equipment.utilize',{instanceId:item.instanceId,eventId,confirmed:true,...extra});}
test('thrown Acid spends one vial for one attack replacement with exact dice and Agility DC',()=>{
  const b=build('gunslinger'),item=add(b,'acid',2),r=use(b,item,'acid-throw',{targetIds:['foe']});assert.equal(r.action,'attack-replacement');assert.equal(r.rolls.length,2);assert.equal(r.save.dc,12);assert.equal(r.damageType,'acid');assert.equal(b.character.inventory.find(i=>i.instanceId===item.instanceId).quantity,1);assert.throws(()=>use(b,item,'acid-throw',{targetIds:['foe']}),/already resolved/);
});

test('Basic Poison consumes its vial, coats an owned weapon and deals one d4 only once before expiry',()=>{
  const b=build('gunslinger'),poison=add(b,'basic-poison',2),weapon=add(b,'dagger');run(b,'time.advance',{worldTime:1000,confirmed:true});const r=use(b,poison,'coat',{objectId:weapon.instanceId});assert.equal(r.action,'bonus');assert.equal(b.character.inventory.find(i=>i.instanceId===poison.instanceId).quantity,1);assert.equal(r.effect.poisonCoating.remainingHits,1);
  const hit={effectId:r.effect.id,eventId:'poison-hit',targetId:'enemy',damageType:'piercing',confirmed:true};assert.throws(()=>run(b,'equipment.poison-hit',{...hit,damageType:'bludgeoning'}),/Piercing or Slashing/);const damage=run(b,'equipment.poison-hit',hit);assert.ok(damage.damage>=1&&damage.damage<=4);assert.equal(damage.remainingCoatedHits,0);assert.throws(()=>run(b,'equipment.poison-hit',hit),/active unused/);
  const second=use(b,poison,'coat-again',{objectId:weapon.instanceId});run(b,'time.advance',{worldTime:second.effect.expiresAt,confirmed:true});assert.throws(()=>run(b,'equipment.poison-hit',{...hit,effectId:second.effect.id,eventId:'expired'}),/active unused/);
});
test('Fast Hands changes Utilize to Bonus Action but cannot convert a thrown attack replacement',()=>{
  const b=build('corsair',3,'reef-knife'),bearings=add(b,'ball-bearings'),acid=add(b,'acid');assert.equal(use(b,bearings,'spill',{action:'bonus'}).action,'bonus');assert.throws(()=>use(b,acid,'throw',{action:'bonus',targetIds:['foe']}),/Fast Hands/);const c=build('gunslinger'),other=add(c,'ball-bearings');assert.throws(()=>use(c,other,'spill',{action:'bonus'}),/Fast Hands/);
});
test('deployed Ball Bearings leave inventory, require ten minutes to recover and cannot be duplicated',()=>{
  const b=build('gunslinger');run(b,'time.advance',{worldTime:1000,confirmed:true});const item=add(b,'ball-bearings'),r=use(b,item,'spill');assert.equal(b.character.inventory.some(i=>i.instanceId===item.instanceId),false);assert.throws(()=>run(b,'equipment.recover',{effectId:r.deployedEffectId,startedAt:1000,completedAt:600999,confirmed:true}),/sufficient recovery/);run(b,'equipment.recover',{effectId:r.deployedEffectId,startedAt:1000,completedAt:601000,confirmed:true});assert.equal(b.character.inventory.find(i=>i.instanceId===item.instanceId).quantity,1);assert.throws(()=>run(b,'equipment.recover',{effectId:r.deployedEffectId,startedAt:601000,completedAt:1201000,confirmed:true}),/recoverable deployed/);
});
test('Antitoxin grants one-hour save Advantage without healing or ending existing Poisoned',()=>{
  const b=build('gunslinger');b.character._id='self';run(b,'time.advance',{worldTime:1000,confirmed:true});const item=add(b,'antitoxin'),hp=b.character.rulesRuntime.health.current;b.character.rulesRuntime.conditions.push({conditionId:'poisoned',source:'venom'});use(b,item,'drink',{targetIds:['self']});assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime,b.character).poisonedSaveAdvantage,true);assert.equal(b.character.rulesRuntime.health.current,hp);assert.equal(b.character.rulesRuntime.conditions.length,1);run(b,'time.advance',{worldTime:3601000,confirmed:true});assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime,b.character).poisonedSaveAdvantage,false);
});
test('Potion object use consumes one vial and heals the chosen owner with the accepted two dice',()=>{
  const b=build('gunslinger',3);b.character._id='self';b.character.rulesRuntime.health.current=1;const item=add(b,'healing-potion'),r=use(b,item,'drink',{targetIds:['self']});assert.equal(r.action,'bonus');assert.equal(r.healing,r.rolls[0]+r.rolls[1]+2);assert.equal(b.character.rulesRuntime.health.current,1+r.healing);assert.equal(b.character.inventory.some(i=>i.instanceId===item.instanceId),false);
});
test('Oil fuel retains only actual unburned hours across extinguishing and relighting',()=>{
  const b=build('gunslinger');run(b,'time.advance',{worldTime:1000,confirmed:true});const oil=add(b,'oil'),lamp=add(b,'lamp'),r=use(b,oil,'fuel',{mode:'fuel',objectId:lamp.instanceId}),id=r.effect.id;run(b,'time.advance',{worldTime:3601000,confirmed:true});const off=run(b,'equipment.flame',{effectId:id,lit:false,confirmed:true});assert.equal(off.remainingMs,5*3600000);run(b,'time.advance',{worldTime:7201000,confirmed:true});run(b,'equipment.flame',{effectId:id,lit:true,confirmed:true});assert.equal(b.character.rulesRuntime.effects.find(e=>e.id===id).expiresAt,25201000);run(b,'time.advance',{worldTime:25201000,confirmed:true});assert.equal(b.character.rulesRuntime.effects.some(e=>e.id===id),false);
});
test('Holy Water records zero damage to other creature types and ground Oil cannot be recovered as fresh inventory',()=>{
  const b=build('gunslinger'),holy=add(b,'holy-water'),r=use(b,holy,'throw',{mode:'other',targetIds:['humanoid']});assert.equal(r.damage,0);const oil=add(b,'oil'),spill=use(b,oil,'spill',{mode:'ground'});assert.throws(()=>run(b,'equipment.recover',{effectId:spill.effect.id,startedAt:Date.now()+100,completedAt:Date.now()+600100,confirmed:true}),/recoverable/);
});

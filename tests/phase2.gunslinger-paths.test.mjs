import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),gear=require('../src/modules/archipelago/equipment');
function run(b,type,payload){const r=commands.apply(b.character,{operationId:'gunslinger-path-command',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...r.changes};return r.result;}
function use(b,handler,parameters={},targets=[],turnId){const option=rules.replay(b.character.rulesLedger).abilityOptions.find(o=>o.handler===handler);assert.ok(option,handler);return run(b,'ability.activate',{optionId:option.id,targetIds:targets,parameters:{confirmed:true,...parameters},...(turnId?{turnId}:{})});}
function equip(b){const gun=gear.issue({definitionId:'musket'}),ammo=gear.issue({definitionId:'bullets',quantity:3});b.character.inventory.push(gun,ammo);b.character.loadout={...b.character.loadout,mainHand:gun.instanceId,offHand:null,grip:'two'};return {objectId:gun.instanceId,ammunitionId:ammo.instanceId};}
test('Suppression scales dice and secondary target has control but no extra damage',()=>{
  for(const level of [3,7,15]){const b=build('gunslinger',level,'iron-suppressor'),p=equip(b),r=use(b,'suppressor-hit',{...p,eventId:'hit'},level===15?['primary','secondary']:['primary'],'enemy-turn');assert.ok(r.damage>=1&&r.damage<=(level===3?6:level===7?8:10));assert.equal(r.controlTargets[0].extraDamage,r.damage);if(level===15)assert.equal(r.controlTargets[1].extraDamage,0);assert.equal(r.controlTargets[0].doesNotStackWithSameMastery,true);assert.throws(()=>use(b,'suppressor-hit',{...p,eventId:'other'},['primary'],'enemy-turn'),/already resolved/);}
});
test('Crossing Denied spends real ammunition and cannot add Suppression to its granted attack',()=>{
  const b=build('gunslinger',10,'iron-suppressor'),p=equip(b),r=use(b,'suppressor-crossing',{...p,eventId:'approach'},['foe']);assert.equal(b.character.inventory.find(i=>i.instanceId===p.ammunitionId).quantity,2);assert.equal(r.cannotSuppress,true);assert.throws(()=>use(b,'suppressor-hit',{...p,eventId:r.grantedAttack.attackEventId},['foe'],'enemy-turn'),/cannot also/);
});
test('Corridor restores the exact pool cap and its two-point DC bonus expires next turn',()=>{
  const b=build('gunslinger',18,'iron-suppressor'),p=equip(b);
  const preview=()=>rules.runtime.project(b.summary,b.character.rulesRuntime,b.character).abilityOptions.find(o=>o.handler==='suppressor-hit').preview;
  const baseDc=8+b.summary.trainingBonus+b.summary.attributeModifiers.agility;
  run(b,'turn.start',{turnId:'one',confirmed:true});b.character.rulesRuntime.pools['iron-suppressor:suppression']=0;use(b,'suppressor-hold');
  assert.equal(b.character.rulesRuntime.pools['iron-suppressor:suppression'],4);
  assert.equal(preview().save.dc,baseDc+2);
  const hit=use(b,'suppressor-hit',{...p,eventId:'hit'},['foe'],'one');assert.equal(hit.save.dc,preview().save.dc);
  run(b,'turn.end',{turnId:'one',confirmed:true});run(b,'turn.start',{turnId:'two',confirmed:true});
  assert.equal(preview().save.dc,baseDc);
});
test('Entrenched cover is conditional on recorded movement and does not raise general Guard',()=>{
  const b=build('gunslinger',7,'iron-suppressor');run(b,'turn.start',{turnId:'one',confirmed:true});const base=gear.derive(b.character).guard;run(b,'movement.record',{feet:5,voluntarySpeed:true,eventId:'step',confirmed:true});assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime).entrenchedDrill.halfCoverAgainstRanged,true);run(b,'movement.record',{feet:1,voluntarySpeed:true,eventId:'step-two',confirmed:true});assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime).entrenchedDrill.halfCoverAgainstRanged,false);assert.equal(gear.derive(b.character).guard,base);assert.throws(()=>run(b,'movement.record',{feet:1,voluntarySpeed:true,eventId:'step-two',confirmed:true}),/already recorded/);
});
test('Passing Shot needs voluntary Speed movement, excludes earlier Recoil, and applies once',()=>{
  const b=build('gunslinger',10,'brass-outrider'),p=equip(b);
  const record=(eventId,hit=true)=>run(b,'attack.record',{eventId,targetId:'foe',weaponId:p.objectId,attribute:'agility',hit,reckless:false,confirmed:true});
  const move=()=>run(b,'movement.record',{feet:20,voluntarySpeed:true,eventId:'move',confirmed:true});
  const pass=(eventId,turnId)=>use(b,'outrider-passing',{...p,eventId},['foe'],turnId);
  run(b,'turn.start',{turnId:'one',confirmed:true});
  assert.throws(()=>pass('early','one'),/recorded first weapon hit/);
  record('early');move();record('late');
  assert.throws(()=>pass('early','one'),/twenty feet/);
  assert.throws(()=>pass('late','one'),/recorded first weapon hit/);
  run(b,'turn.end',{turnId:'one',confirmed:true});run(b,'turn.start',{turnId:'two',confirmed:true});
  move();use(b,'outrider-recoil',{...p,eventId:'shot',mode:'self',distanceFeet:15},[],'two');record('recoil-hit');
  assert.throws(()=>pass('recoil-hit','two'),/no earlier Recoil/);
  run(b,'turn.end',{turnId:'two',confirmed:true});run(b,'turn.start',{turnId:'three',confirmed:true});
  move();record('miss',false);record('qualified');
  const hit=pass('qualified','three');assert.ok(hit.damage>=1&&hit.damage<=8);
  assert.throws(()=>pass('qualified','three'),/already resolved/);
});
test('Break Pursuit moves half current Speed without provoking and prevents repeated triggers',()=>{
  const b=build('gunslinger',15,'brass-outrider'),speed=b.summary.movement.walk-gear.derive(b.character).restrictions.speedPenaltyFeet,r=use(b,'outrider-break',{eventId:'enemy-end'},['enemy']);assert.equal(r.movement.feet,Math.floor(speed/2));assert.equal(r.movement.provokesOpportunityAttacks,false);assert.throws(()=>use(b,'outrider-break',{eventId:'enemy-end'},['enemy']),/already resolved/);
});
test('Horizon moves and grants one bonus-action attack with ammunition rather than another Action',()=>{
  const b=build('gunslinger',18,'brass-outrider'),p=equip(b);run(b,'turn.start',{turnId:'one',confirmed:true});const r=use(b,'outrider-horizon',{...p,eventId:'horizon',distanceFeet:10},['foe'],'one');assert.equal(r.additionalActionGranted,false);assert.equal(r.grantedAttack.actionType,'bonus');assert.equal(b.character.inventory.find(i=>i.instanceId===p.ammunitionId).quantity,2);assert.equal(b.character.rulesRuntime.ownerTurn.voluntarySpeedFeet,10);
});

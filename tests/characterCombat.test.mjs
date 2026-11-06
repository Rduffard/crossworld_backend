import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {fromCharacter}=require('../src/modules/archipelago/combat/snapshot');
const {applyCommand,createFixture}=require('../src/modules/archipelago/combat/state');
const {createService}=require('../src/modules/archipelago/combat/service');
const character=()=>({_id:'0123456789abcdef01234567',owner:'owner',name:'Mara',calling:'tidecaller',progression:{rank:3},attributes:{might:12,agility:16,wit:10,spirit:14,resolve:10,instinct:10},training:['attune','lore','read','climb'],trainingRulesVersion:1,resources:{health:{current:12,max:20},focus:{current:3,max:12}},equipment:{armor:[{name:'Plate'}]}});
const cmd={id:'character-attack-01',expectedRevision:0,type:'attack',actor:'player',weapon:'cutlass',target:'enemy'};
test('actual identity, depleted Health, attributes, Training and temporary loadout copied without mutation',()=>{
 const original=character(),before=structuredClone(original),state=fromCharacter(original,'owner',false),player=state.combatants[0];
 assert.equal(player.id,'player');assert.notEqual(player.id,original._id);assert.equal(player.source.id,original._id);assert.equal(state.owner,'owner');assert.equal(player.name,'Mara');assert.equal(player.calling,'tidecaller');assert.equal(player.level,3);
 assert.deepEqual(player.health,{current:12,max:20});assert.deepEqual(player.attributes,original.attributes);assert.deepEqual(player.training,original.training);assert.equal(player.modifiers.agility,3);assert.equal(player.guard,13);assert.deepEqual(player.guardInputs,{});assert.deepEqual(player.weaponTraining,[]);assert.equal(player.weapon,'cutlass');
 assert.deepEqual(state.initialCharacterSnapshot,player);assert.notStrictEqual(state.initialCharacterSnapshot,player);assert.deepEqual(original,before);
 original.attributes.agility=8;original.resources.health.current=20;
 assert.equal(player.attributes.agility,16);assert.equal(player.health.current,12);
 const next=applyCommand(state,cmd,'owner',()=>1);
 assert.equal(next.events[0].proficiency,0);assert.deepEqual(next.initialCharacterSnapshot,state.initialCharacterSnapshot);assert.deepEqual(original.resources.focus,{current:3,max:12});
});
test('practice-only proficiency explicitly controls attack bonus for every Calling',()=>{
 for(const calling of ['corsair','gunslinger','navigator','tidecaller','warden','reaver']) {
  const c={...character(),calling};
  const state=fromCharacter(c,'owner',true);
  assert.deepEqual(state.combatants[0].weaponTraining,['cutlass']);
  assert.equal(applyCommand(state,cmd,'owner',()=>1).events[0].proficiency,2);
 }
 assert.throws(()=>fromCharacter(character(),'owner',undefined));
});
test('malformed or unavailable saved values rejected without repair',()=>{
 for(const change of [c=>delete c.resources.health,c=>c.resources.health.current=0,c=>c.resources.health.current=21,c=>c.resources.health.current=null,c=>c.resources.health.max=-1,c=>c.attributes.might=0,c=>c.progression.rank=21,c=>c.training={},c=>c.calling='unknown']) {
  const c=character();change(c);const before=structuredClone(c);assert.throws(()=>fromCharacter(c,'owner',false));assert.deepEqual(c,before);
 }
});
test('service authorizes character read, persists snapshot, never re-reads character for attacks',async()=>{
 let stored,reads=0;const c=character(),original=structuredClone(c);
 const Model={create:async s=>(stored={...structuredClone(s),_id:'encounter'}),findOne:f=>({lean:async()=>f.owner===stored.owner?structuredClone(stored):null}),findOneAndUpdate:(f,u)=>({lean:async()=>{if(f.revision!==stored.revision)return null;stored={...stored,...structuredClone(u.$set)};return structuredClone(stored)}})};
 const Characters={findOne:f=>({lean:async()=>{reads++;return f.owner===c.owner&&f._id===c._id?structuredClone(c):null}})};
 const service=createService(Model,Characters);
 await assert.rejects(service.fromCharacter('intruder',c._id,true),/Character not found/);
 await service.fromCharacter('owner',c._id,true);assert.deepEqual(c,original);
 c.attributes.agility=8;c.resources.health.current=20;const before=structuredClone(c),readCount=reads;
 const result=await service.command('encounter','owner',cmd);assert.equal(reads,readCount);assert.equal(result.combatants[0].attributes.agility,16);assert.equal(result.combatants[0].health.current,12);assert.deepEqual(c,before);
 assert.deepEqual(await service.command('encounter','owner',cmd),result);
 await assert.rejects(service.command('encounter','owner',{...cmd,id:'stale-command-02'}));
 const reloaded=await createService(Model,Characters).load('encounter','owner');assert.deepEqual(reloaded,result);assert.equal(reloaded.sourceCharacter,c._id);assert.deepEqual(reloaded.initialCharacterSnapshot.health,{current:12,max:20});
 assert.equal(createFixture('owner').activeCombatant,'corsair');
});
test('from-character endpoint rejects forged snapshots and other owners without leaking character data',async()=>{
 const express=require('express'),jwt=require('jsonwebtoken');const {JWT_SECRET}=require('../src/config/env');
 const Encounter=require('../src/modules/archipelago/combat/model'),Character=require('../src/modules/archipelago/characters/model');
 const oldCreate=Encounter.create,oldFind=Character.findOne;const c=character();
 let created;
 Encounter.create=async value=>{created=structuredClone(value);return {...created,_id:'encounter'}};
 Character.findOne=filter=>({lean:async()=>filter.owner===c.owner&&filter._id===c._id?structuredClone(c):null});
 const app=express();app.use(express.json());app.use('/archipelago',require('../src/modules/archipelago/routes'));
 app.use((err,_req,res,_next)=>res.status(err.statusCode??(err.details?400:500)).json({message:err.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const call=async(body,owner='owner')=>{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/archipelago/encounters/from-character`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt.sign({_id:owner},JWT_SECRET)}`},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 };
 try {
  const body={characterId:c._id,practiceProficiency:false};
  assert.equal((await call({...body,attributes:{might:20}})).status,400);
  assert.equal((await call({...body,practiceProficiency:'true'})).status,400);
  assert.equal((await call({characterId:c._id})).status,400);
  const denied=await call(body,'intruder');assert.equal(denied.status,404);assert.equal(denied.body.message,'Character not found');assert.equal(created,undefined);
  const response=await call(body);assert.equal(response.status,201);assert.equal(response.body.combatants[0].name,'Mara');assert.deepEqual(created.initialCharacterSnapshot.health,{current:12,max:20});
  c.resources.health.current=null;assert.equal((await call(body)).status,400);
 } finally {Encounter.create=oldCreate;Character.findOne=oldFind;await new Promise(resolve=>server.close(resolve));}
});

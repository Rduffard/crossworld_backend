import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { d20 } = require('../src/modules/archipelago/combat/dice');
const { resolveAttack } = require('../src/modules/archipelago/combat/attack');
const { calculateGuard } = require('../src/modules/archipelago/combat/guard');
const { createFixture, applyCommand } = require('../src/modules/archipelago/combat/state');
const { createService } = require('../src/modules/archipelago/combat/service');
const { cutlass } = require('../src/modules/archipelago/combat/weapons');
const dice = (...values) => () => { assert.ok(values.length, 'unexpected die'); return values.shift(); };
const command = (overrides = {}) => ({ id: 'command-0001', expectedRevision: 0, type: 'attack', actor: 'corsair', weapon: 'cutlass', target: 'enemy', ...overrides });
const fixture = () => createFixture('owner');
test('d20 normal, advantage, disadvantage, cancellation and invalid dice', () => {
 assert.deepEqual(d20({}, dice(7)), {dice:[7], selected:7});
 assert.equal(d20({advantage:true},dice(2,19)).selected,19);
 assert.equal(d20({disadvantage:true},dice(2,19)).selected,2);
 assert.deepEqual(d20({advantage:true,disadvantage:true},dice(8)),{dice:[8],selected:8});
 assert.throws(()=>d20({},dice(21)));
});
for (const [roll, expected] of [[4,'miss'],[5,'hit'],[6,'hit'],[1,'miss'],[20,'critical']]) test(`attack roll ${roll}: ${expected}`, () => {
 const [actor,target] = fixture().combatants;
 const result = resolveAttack(actor,target,cutlass,{},dice(roll,2,4));
 assert.equal(result.result,expected); assert.equal(result.proficiency,2);
 if(expected==='critical') { assert.deepEqual(result.damageDice,[2,4]); assert.equal(result.damageTotal,9); }
 if(expected==='miss') assert.equal(result.damageApplied,0);
});
test('finesse uses best attribute, explicit entitlement only, minimum zero damage', () => {
 const [actor,target]=fixture().combatants;
 actor.attributes.agility=18;
 actor.weaponTraining=[]; actor.training=['cutlass'];
 let result=resolveAttack(actor,target,cutlass,{},dice(10,3));
 assert.equal(result.attribute,'agility'); assert.equal(result.attributeModifier,4); assert.equal(result.proficiency,0); assert.equal(result.damageTotal,7);
 actor.attributes.might=1; actor.attributes.agility=1;
 result=resolveAttack(actor,target,cutlass,{},dice(20,1,1));
 assert.equal(result.damageTotal,0); assert.equal(result.healthAfter,target.health.current);
});
test('attack resolver applies advantage and disadvantage',()=>{
 const [a,t]=fixture().combatants;
 assert.equal(resolveAttack(a,t,cutlass,{advantage:true},dice(1,15,2)).result,'hit');
 assert.equal(resolveAttack(a,t,cutlass,{disadvantage:true},dice(1,15)).result,'miss');
});
test('Guard handles unarmored, light, medium, heavy and shield',()=>{
 const attributes={agility:18};
 assert.equal(calculateGuard(attributes),14);
 assert.equal(calculateGuard(attributes,{armor:{category:'light',base:11}}),15);
 assert.equal(calculateGuard(attributes,{armor:{category:'medium',base:14}}),16);
 assert.equal(calculateGuard(attributes,{armor:{category:'heavy',base:16},shield:true}),18);
 assert.throws(()=>calculateGuard(attributes,{armor:{category:'unknown',base:10}}));
});
test('miss consumes Action; duplicate is unchanged; invalid commands never mutate inputs',()=>{
 const state=fixture(), original=structuredClone(state);
 const next=applyCommand(state,command(),'owner',dice(1));
 assert.equal(next.combatants[0].actions,0); assert.equal(next.combatants[1].health.current,18);
 assert.strictEqual(applyCommand(next,command(),'owner'),next);
 for (const [value,owner] of [[command(),'intruder'],[command({actor:'enemy'}),'owner'],[command({weapon:'invalid'}),'owner'],[command({target:'corsair'}),'owner'],[command({expectedRevision:1}),'owner'],[command({roll:20}),'owner']]) assert.throws(()=>applyCommand(state,value,owner));
 assert.throws(()=>applyCommand(next,command({id:'command-0002',expectedRevision:1}),'owner'));
 assert.throws(()=>applyCommand(next,command({target:'corsair'}),'owner'));
 assert.deepEqual(state,original);
});
test('turns refresh Action; pause/resume; defeated opponent ends fixture; zero clamp',()=>{
 let state=applyCommand(fixture(),command(),'owner',dice(1));
 state=applyCommand(state,{id:'end-turn-001',expectedRevision:1,type:'end-turn',actor:'corsair'},'owner');
 assert.equal(state.activeCombatant,'enemy');
 state=applyCommand(state,{id:'end-turn-002',expectedRevision:2,type:'end-turn',actor:'enemy'},'owner');
 assert.equal(state.combatants[0].actions,1); assert.equal(state.round,2);
 state=applyCommand(state,{id:'pause-00001',expectedRevision:3,type:'pause',actor:'corsair'},'owner');
 assert.throws(()=>applyCommand(state,command({expectedRevision:4}),'owner'));
 state=applyCommand(state,{id:'resume-0001',expectedRevision:4,type:'resume',actor:'corsair'},'owner');
 state.combatants[1].health.current=1;
 state=applyCommand(state,command({id:'attack-final',expectedRevision:5}),'owner',dice(20,6,6));
 assert.equal(state.combatants[1].health.current,0); assert.equal(state.status,'completed'); assert.equal(state.events.at(-1).damageApplied,1);
});
function repository() {
 let stored;
 return {
  create: async value => { stored={...structuredClone(value),_id:'encounter'}; return structuredClone(stored); },
  findOne: filter => ({lean:async()=>stored && filter._id===stored._id && filter.owner===stored.owner ? structuredClone(stored):null}),
  findOneAndUpdate: (filter,update)=>({lean:async()=>{
   if(filter.owner!==stored.owner || filter.revision!==stored.revision) return null;
   stored={...stored,...structuredClone(update.$set)}; return structuredClone(stored);
  }})
 };
}
test('service persists, reloads through fresh service, rejects ownership and handles concurrent duplicates/stale writes',async()=>{
 const model=repository(),service=createService(model);
 await service.create('owner');
 const [one,two]=await Promise.all([service.command('encounter','owner',command()),service.command('encounter','owner',command())]);
 assert.equal(one.revision,1); assert.deepEqual(one,two);
 const reloaded=await createService(model).load('encounter','owner');
 assert.equal(reloaded.events.length,1); assert.equal(reloaded.combatants[0].actions,0);
 await assert.rejects(service.load('encounter','intruder'));
 await assert.rejects(service.command('encounter','owner',command({id:'command-stale'})));
 assert.deepEqual(await service.load('encounter','owner'),reloaded);
});
test('authenticated HTTP workflow creates, attacks, reloads and rejects forged requests',async()=>{
 const express=require('express');
 const jwt=require('jsonwebtoken');
 const {JWT_SECRET}=require('../src/config/env');
 const Model=require('../src/modules/archipelago/combat/model');
 const memory=repository();
 const original={create:Model.create,findOne:Model.findOne,findOneAndUpdate:Model.findOneAndUpdate};
 Object.assign(Model,memory);
 const app=express(); app.use(express.json());
 app.use('/archipelago',require('../src/modules/archipelago/routes'));
 app.use((err,_req,res,_next)=>res.status(err.statusCode ?? (err.joi || err.details ? 400 : 500)).json({message:err.message}));
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const address=`http://127.0.0.1:${server.address().port}/archipelago/encounters`;
 const token=jwt.sign({_id:'owner'},JWT_SECRET);
 const call=async(path,method='GET',body,credential=token)=>{
  const response=await fetch(address+path,{method,headers:{'Content-Type':'application/json',...(credential?{Authorization:`Bearer ${credential}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
 };
 try {
  assert.equal((await call('/test','POST',{},null)).status,401);
  assert.equal((await call('/test','POST',{roll:20})).status,400);
  const created=await call('/test','POST',{}); assert.equal(created.status,201);
  // Mock storage uses a fixture ID; translate only the repository lookup to an API-valid ObjectId.
  const id='0123456789abcdef01234567';
  const find=Model.findOne, update=Model.findOneAndUpdate;
  Model.findOne=filter=>find({...filter,_id:filter._id===id?'encounter':filter._id});
  Model.findOneAndUpdate=(filter,value)=>update({...filter,_id:filter._id===id?'encounter':filter._id},value);
  assert.equal((await call('/'+id,'GET',undefined,jwt.sign({_id:'intruder'},JWT_SECRET))).status,404);
  assert.equal((await call('/'+id+'/commands','POST',{...command(),roll:20})).status,400);
  const attacked=await call('/'+id+'/commands','POST',command()); assert.equal(attacked.status,200);
  assert.equal(attacked.body.revision,1); assert.equal(attacked.body.events.length,1);
  const retry=await call('/'+id+'/commands','POST',command()); assert.deepEqual(retry.body,attacked.body);
  const loaded=await call('/'+id); assert.deepEqual(loaded.body,attacked.body);
  assert.equal((await call('/'+id+'/commands','POST',command({id:'second-attack',expectedRevision:1}))).status,400);
 } finally {
  Object.assign(Model,original);
  await new Promise(resolve=>server.close(resolve));
 }
});
test('competing commands use compare-and-set; a failed command preserves storage',async()=>{
 const model=repository(),service=createService(model); await service.create('owner');
 const results=await Promise.allSettled([
  service.command('encounter','owner',{id:'pause-race-1',expectedRevision:0,type:'pause',actor:'corsair'}),
  service.command('encounter','owner',{id:'pause-race-2',expectedRevision:0,type:'pause',actor:'corsair'})
 ]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const state=await service.load('encounter','owner'); assert.equal(state.revision,1); assert.equal(state.events.length,1);
 await assert.rejects(service.command('encounter','owner',command({expectedRevision:1})));
 assert.deepEqual(await service.load('encounter','owner'),state);
});

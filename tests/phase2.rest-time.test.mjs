import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands');
const hour=3600000;
function run(c,type,payload){const out=commands.apply(c,{operationId:'rest-time-command-test',expectedRevision:c.documentRevision,rulesVersion:'SA-CHAR-1',type,payload});return {...c,...out.changes,result:out.result};}
function begin(c,kind='long-rest',options={}){return run(c,'rest.start',{restId:'rest-one',kind,startedAt:0,options});}
test('a resumed Long Rest interruption grants completed Short Rest recovery once and adds one hour',()=>{
  let c=build('gunslinger',5).character;c.rulesRuntime.pools['gunslinger:second-wind']=0;
  c=begin(c);c=run(c,'rest.interrupt',{restId:'rest-one',at:2*hour,reason:'initiative',resume:true,confirmed:true});
  assert.equal(c.result.shortRestGranted,true);assert.equal(c.rulesRuntime.pools['gunslinger:second-wind'],1);
  c=run(c,'rest.interrupt',{restId:'rest-one',at:2*hour,reason:'damage',resume:true,confirmed:true});
  assert.equal(c.result.shortRestGranted,false);assert.equal(c.rulesRuntime.pools['gunslinger:second-wind'],1);
  assert.throws(()=>run(c,'rest.complete',{restId:'rest-one',completedAt:9*hour}),/too short/);
  c=run(c,'rest.complete',{restId:'rest-one',completedAt:10*hour});assert.equal(c.rulesRuntime.pools['gunslinger:second-wind'],3);
  assert.equal(c.rulesRuntime.lastLongRest,10*hour);assert.equal(c.rulesRuntime.restSession,null);
});
test('interrupted Short Rests and canceled rests grant nothing and cannot reuse their IDs',()=>{
  let c=build('reaver',3).character;c.rulesRuntime.pools['reaver:rage']=0;c=begin(c,'short-rest');
  c=run(c,'rest.interrupt',{restId:'rest-one',at:hour/2,reason:'initiative',resume:true,confirmed:true});
  assert.equal(c.rulesRuntime.restSession,null);assert.equal(c.rulesRuntime.pools['reaver:rage'],0);
  assert.throws(()=>run(c,'rest.complete',{restId:'rest-one',completedAt:hour}),/matching active rest/);
  assert.throws(()=>begin(c,'short-rest'),/already been used/);
});
test('damage and non-cantrip casting automatically interrupt an active Long Rest',()=>{
  let c=begin(build('doctor',3).character);c=run(c,'time.advance',{worldTime:2*hour,confirmed:true});
  c=run(c,'health.damage',{amount:1,damageType:'force',confirmed:true});assert.equal(c.rulesRuntime.restSession.interruptions.length,1);
  const s=rules.replay(c.rulesLedger),spell=s.spellcasting.doctor.prepared.find(id=>!rules.blueprint.spells.find(spell=>spell.id===id).specificMaterial);
  c=run(c,'spell.cast',{callingId:'doctor',spellId:spell,slotLevel:1});assert.equal(c.rulesRuntime.restSession.interruptions.length,2);
});
test('recorded Initiative interrupts a Long Rest and recovery cannot complete until combat ends',()=>{
  let c=begin(build('gunslinger',5).character);
  c=run(c,'time.advance',{worldTime:2*hour,confirmed:true});
  c=run(c,'initiative.record',{combatId:'battle',roll:10,confirmed:true});
  assert.equal(c.rulesRuntime.restSession.interruptions[0].reason,'initiative');
  const before=structuredClone(c);
  assert.throws(()=>run(c,'rest.complete',{restId:'rest-one',completedAt:9*hour}),/End the encounter/);
  assert.deepEqual(c,before);
  c=run(c,'scene.record',{light:'bright',inCombat:false,confirmed:true});
  c=run(c,'rest.complete',{restId:'rest-one',completedAt:9*hour});
  assert.equal(c.rulesRuntime.restSession,null);
});
test('Long Rest expires timed effects, preserves lasting non-Concentration effects and removes temporary Health',()=>{
  let c=build('doctor',3).character;c.rulesRuntime.worldTime=0;
  c.rulesRuntime.effects=[{id:'lasting',featureId:'spell:geas',expiresAt:30*24*hour},{id:'short',featureId:'spell:light',expiresAt:hour},{id:'focus',featureId:'spell:guidance',concentration:true}];
  c.rulesRuntime.temporaryHealth=10;c=begin(c);c=run(c,'rest.complete',{restId:'rest-one',completedAt:8*hour});
  assert.deepEqual(c.rulesRuntime.effects.map(e=>e.id),['lasting']);assert.equal(c.rulesRuntime.temporaryHealth,0);
});
test('Long Rest Exhaustion recovery needs nourishment, while Tireless Short Rest recovery does not',()=>{
  for(const nourished of [false,true]){
    let c=build('doctor',3).character;c.rulesRuntime.exhaustion=2;c=begin(c,'long-rest',{nourished});
    c=run(c,'rest.complete',{restId:'rest-one',completedAt:8*hour});assert.equal(c.rulesRuntime.exhaustion,nourished?1:2);
  }
  let c=build('navigator',10).character;c.rulesRuntime.exhaustion=2;c=begin(c,'short-rest');
  c=run(c,'rest.complete',{restId:'rest-one',completedAt:hour});assert.equal(c.rulesRuntime.exhaustion,1);
});
test('Long Rest benefits require 24 hours between completions',()=>{
  let c=begin(build('doctor',3).character);
  c=run(c,'rest.complete',{restId:'rest-one',completedAt:8*hour});
  c=run(c,'rest.start',{restId:'rest-two',kind:'long-rest',startedAt:16*hour});
  const before=structuredClone(c);
  assert.throws(()=>run(c,'rest.complete',{restId:'rest-two',completedAt:24*hour}),/24 hours/);
  assert.deepEqual(c,before);
  c=run(c,'rest.complete',{restId:'rest-two',completedAt:32*hour});
  assert.equal(c.rulesRuntime.lastLongRest,32*hour);
});
test('planned invalid recovery is rejected before rest start and neither zero-Health nor dead creatures can start',()=>{
  const c=build('doctor',3).character,before=structuredClone(c);
  assert.throws(()=>begin(c,'long-rest',{preparations:{doctor:['wish']}}),/preparation/);assert.deepEqual(c,before);
  c.rulesRuntime.health.current=0;assert.throws(()=>begin(c),/at least one Health/);
  c.rulesRuntime.health.current=1;c.rulesRuntime.deathSaves.dead=true;assert.throws(()=>begin(c),/living creature/);
});

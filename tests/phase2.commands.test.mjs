import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url);
const commands=require('../src/modules/archipelago/characters/commands');
const gear=require('../src/modules/archipelago/equipment');
const envelope=(type,payload,expectedRevision=0)=>({operationId:'command-test-0001',expectedRevision,rulesVersion:'SA-CHAR-1',type,payload});

function transactionalStore(character){
  let saved={_id:'111111111111111111111111',owner:'owner',...structuredClone(character)},receipts=[];
  const query=value=>({session(){return this;},lean:async()=>structuredClone(value())});
  const Character={
    db:{startSession:async()=>({withTransaction:async fn=>{
      const before=structuredClone(saved),previous=structuredClone(receipts);
      try{await fn();}catch(e){saved=before;receipts=previous;throw e;}
    },endSession:async()=>{}})},
    findOne:q=>query(()=>q._id===saved._id&&q.owner===saved.owner?saved:null),
    findOneAndUpdate:(q,u)=>query(()=>{
      if(q.owner!==saved.owner||q.documentRevision!==saved.documentRevision)return null;
      saved={...saved,...structuredClone(u.$set)};return saved;
    }),
  };
  const Receipt={findOne:q=>query(()=>receipts.find(r=>r.operationId===q.operationId&&r.owner===q.owner&&r.characterId===q.characterId)??null),create:async entries=>{receipts.push(...structuredClone(entries));}};
  const handler=commands.handler(Character,Receipt);
  return {read:()=>structuredClone(saved),receipts:()=>structuredClone(receipts),async call(body,owner='owner'){
    let data,error;await handler({body,user:{_id:owner},params:{characterId:saved._id}},{send(value){data=value;}},e=>{error=e;});return {data,error};
  }};
}
test('transactional command receipts replay prior result, reject changed body and isolate ownership',async()=>{
  const store=transactionalStore(build('gunslinger').character);
  const command=envelope('identity.patch',{name:'First command'});
  const first=await store.call(command);assert.equal(first.error,undefined);assert.equal(first.data.documentRevision,1);
  const second=await store.call({...envelope('identity.patch',{notes:'Later command'},1),operationId:'command-test-0002'});assert.equal(second.error,undefined);
  const replay=await store.call(command);assert.deepEqual(replay.data,first.data);assert.equal(store.read().documentRevision,2);assert.equal(store.receipts().length,2);
  assert.equal((await store.call({...command,payload:{name:'Different'}})).error.statusCode,409);
  assert.equal((await store.call(command,'intruder')).error.statusCode,404);
  assert.equal(store.read().name,'First command');
});
test('failed transactions do not save a character mutation or operation receipt',async()=>{
  const store=transactionalStore(build('tidecaller',3).character),before=store.read();
  const invalid=envelope('spell.cast',{callingId:'tidecaller',spellId:'wish',slotLevel:1});
  const result=await store.call(invalid);assert.ok(result.error);assert.deepEqual(store.read(),before);assert.equal(store.receipts().length,0);
  assert.equal((await store.call(envelope('identity.patch',{name:'Stale'},5))).error.statusCode,409);
});

test('manual resource expenditure uses receipts and cannot bypass revision conflicts or invoke an untyped recovery',async()=>{
  const store=transactionalStore(build('tidecaller',3).character),before=store.read().rulesRuntime.pools['tidecaller:sorcery-points'],body=envelope('resource.adjust',{type:'spend-pool',poolId:'tidecaller:sorcery-points',amount:1});const first=await store.call(body);assert.equal(first.error,undefined);assert.equal(first.data.rulesRuntime.pools['tidecaller:sorcery-points'],before-1);assert.deepEqual((await store.call(body)).data,first.data);assert.equal(store.receipts().length,1);assert.equal((await store.call({...body,operationId:'stale-resource-command'})).error.statusCode,409);assert.equal((await store.call({...envelope('resource.adjust',{type:'long-rest'},1),operationId:'invalid-recovery-command'})).error.statusCode,422);
});

test('manual Initiative recovery requires a recorded Initiative and resolves only once per combat',()=>{
  let c=build('reaver',15,'bloodwake').character;c.rulesRuntime.pools['reaver:rage']=0;const recovery=envelope('resource.adjust',{type:'initiative-recovery',poolId:'reaver:rage'});assert.throws(()=>commands.apply(c,recovery),/saved combat Initiative/);let out=commands.apply(c,envelope('initiative.record',{combatId:'one',roll:10,confirmed:true}));c={...c,...out.changes};out=commands.apply(c,{...recovery,expectedRevision:c.documentRevision});c={...c,...out.changes};assert.ok(c.rulesRuntime.pools['reaver:rage']>0);assert.throws(()=>commands.apply(c,{...recovery,expectedRevision:c.documentRevision}),/only once/);
});
test('rest start/completion persists its choices, enforces duration and the 24-hour Long Rest restriction',async()=>{
  const fixture=build('doctor',2).character;fixture.rulesRuntime.slots[0]=0;
  const store=transactionalStore(fixture),start=100*24*3600000;
  let result=await store.call(envelope('rest.start',{restId:'rest-001',kind:'long-rest',startedAt:start,options:{}}));
  assert.equal(result.error,undefined);assert.equal(store.read().rulesRuntime.slots[0],0);
  const complete={...envelope('rest.complete',{restId:'rest-001',completedAt:start+8*3600000},1),operationId:'complete-rest-001'};
  const short={...complete,payload:{...complete.payload,completedAt:start+7*3600000}};
  assert.match((await store.call(short)).error.message,/too short/);assert.equal(store.read().rulesRuntime.slots[0],0);
  result=await store.call(complete);assert.equal(result.error,undefined);assert.equal(result.data.rulesRuntime.slots[0],3);
  result=await store.call({...envelope('rest.start',{restId:'rest-002',kind:'long-rest',startedAt:start+9*3600000,options:{}},2),operationId:'start-rest-002'});assert.equal(result.error,undefined);
  result=await store.call({...envelope('rest.complete',{restId:'rest-002',completedAt:start+17*3600000},3),operationId:'complete-rest-002'});assert.match(result.error.message,/24 hours/);
  assert.equal(store.read().rulesRuntime.restSession.id,'rest-002');
});
test('Triage uses scaled healing, exact kit charges and a persisted target rest lock',()=>{
  const b=build('doctor',6,'field-surgeon','yuma-core','field-medic'),c=structuredClone(b.character);
  const option=b.summary.abilityOptions.find(o=>o.handler==='triage');
  const beforeKit=c.inventory.find(i=>i.chargesCurrent!==undefined);assert.equal(beforeKit.chargesCurrent,10);
  const before=structuredClone(c);
  const payload={optionId:option.id,targetIds:['patient-one'],parameters:{targetRestEpoch:'rest-1'}};
  assert.throws(()=>commands.apply(c,envelope('ability.activate',payload)),/within 5 feet/);
  assert.deepEqual(c,before);
  payload.parameters.confirmed=true;
  const result=commands.apply(c,envelope('ability.activate',payload));
  assert.equal(result.changes.rulesRuntime.pools['field-surgeon:triage'],1);
  assert.equal(result.changes.inventory.find(i=>i.instanceId===beforeKit.instanceId).chargesCurrent,9);
  assert.equal(result.result.rolls.length,3);assert.equal(result.result.healing,result.result.rolls.reduce((a,b)=>a+b,0)+6);
  assert.throws(()=>commands.apply({...c,...result.changes},envelope('ability.activate',payload,1)),/already received Triage/);
  assert.equal(c.inventory.find(i=>i.instanceId===beforeKit.instanceId).chargesCurrent,10);
});
test('Triage finds a charged catalog kit and ignores a misleading custom name',()=>{
  const b=build('doctor',6,'field-surgeon','yuma-core','field-medic');
  const gear=require('../src/modules/archipelago/equipment');
  const depleted=b.character.inventory.find(i=>i.definitionId==='healer-kit');
  depleted.chargesCurrent=0;
  const renamed=gear.issue({definitionId:'wand-of-magic-missiles'});
  renamed.customName='Healer Kit';
  b.character.inventory.push(renamed);
  const payload={optionId:b.summary.abilityOptions.find(o=>o.handler==='triage').id,targetIds:['patient-one'],parameters:{confirmed:true,targetRestEpoch:'rest-1'}};
  const command=envelope('ability.activate',payload);
  assert.throws(()=>commands.apply(b.character,command),/available charges/);
  const charged=gear.issue({definitionId:'healer-kit'});
  charged.customName='Surgeon supplies';
  b.character.inventory.push(charged);
  const {changes}=commands.apply(b.character,command);
  const saved=id=>changes.inventory.find(i=>i.instanceId===id);
  assert.equal(saved(charged.instanceId).chargesCurrent,9);
  assert.equal(saved(depleted.instanceId).chargesCurrent,0);
  assert.equal(saved(renamed.instanceId).chargesCurrent,renamed.chargesCurrent);
});
test('barriers persist scaled object statistics and replace previous barriers',()=>{
  const b=build('shipwright',10,'breakwater'),option=b.summary.abilityOptions.find(o=>o.handler==='barrier');
  const first=commands.apply(b.character,envelope('ability.activate',{optionId:option.id,parameters:{confirmed:true}}));
  const barrier=first.changes.rulesRuntime.effects.find(e=>e.objectType==='barrier');
  assert.deepEqual(barrier.health,{current:70,max:70});assert.equal(barrier.width,20);assert.equal(barrier.height,10);assert.equal(barrier.cover,'three-quarters');
  const next=commands.apply({...b.character,...first.changes},envelope('ability.activate',{optionId:option.id,parameters:{confirmed:true}},1));
  assert.equal(next.changes.rulesRuntime.effects.filter(e=>e.objectType==='barrier').length,1);
});
test('Second Wind heals from the server roll and does not mutate the input character',()=>{
  const b=build('gunslinger',5),character=structuredClone(b.character);character.rulesRuntime.health.current=1;
  const option=b.summary.abilityOptions.find(o=>o.handler==='second-wind');
  const result=commands.apply(character,envelope('ability.activate',{optionId:option.id,parameters:{}}));
  assert.equal(result.changes.rulesRuntime.health.current,1+5+result.result.rolls[0]);
  assert.equal(result.changes.rulesRuntime.pools['gunslinger:second-wind'],2);assert.equal(character.rulesRuntime.health.current,1);
});
test('firearm package and Powder Drill alter shot capacity without adding attacks or ignoring ammunition',()=>{
  const b=build('gunslinger',5),c=structuredClone(b.character),pistol=gear.issue({definitionId:'pistol'});c.inventory.push(pistol);c.loadout.mainHand=pistol.instanceId;
  assert.equal(gear.derive(c).attacks[0].maxShotsPerAction,1);
  const firstFour=c.rulesLedger.levels.slice(0,4);firstFour[3].choices={...firstFour[3].choices,feat:'powder-drill',increases:{agility:1}};
  c.rulesLedger={...c.rulesLedger,levels:[...firstFour,c.rulesLedger.levels[4]]};
  assert.equal(rules.replay(c.rulesLedger).attacksPerAction,2);assert.equal(gear.derive(c).attacks[0].maxShotsPerAction,2);
});

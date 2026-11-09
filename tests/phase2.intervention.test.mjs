import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands');
function cast(b,spellId,extra={}){const r=commands.apply(b.character,{operationId:'intervention-op-001',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type:'spell.cast',payload:{source:'intervention',callingId:'doctor',spellId,...extra}});b.character={...b.character,...r.changes};return r.result;}
test('Divine Intervention casts an unprepared Doctor spell as a Magic action without a slot or priced Material',()=>{
  const b=build('doctor',10),spell='raise-dead',slots=[...b.character.rulesRuntime.slots];b.character.rulesRuntime.preparations.doctor=b.character.rulesRuntime.preparations.doctor.filter(id=>id!==spell);
  // Keep a complete ordinary list while proving this specific spell is unprepared.
  if(b.character.rulesRuntime.preparations.doctor.length!==b.summary.spellcasting.doctor.preparedCount)b.character.rulesRuntime.preparations.doctor.push(rules.blueprint.spells.find(s=>s.callings.includes('doctor')&&s.level===1&&!b.character.rulesRuntime.preparations.doctor.includes(s.id)&&!b.summary.spellcasting.doctor.alwaysPrepared.includes(s.id)).id);
  const r=cast(b,spell);assert.equal(r.management.castingTime,'Magic action');assert.ok(!r.management.components.includes('M'));assert.deepEqual(r.consumedMaterials,[]);assert.deepEqual(b.character.rulesRuntime.slots,slots);assert.equal(b.character.rulesRuntime.pools['doctor:intervention'],0);
});
test('Intervention rejects unacquired use, wrong lists, spells above five, Reaction spells and slot overrides atomically',()=>{
  for(const [level,spellId,extra] of [[9,'raise-dead',{}],[10,'fireball',{}],[10,'heal',{}],[10,'wish',{}],[10,'raise-dead',{slotLevel:5}],[10,'raise-dead',{ritual:true}]]){
    const b=build('doctor',level),before=structuredClone(b.character);assert.throws(()=>cast(b,spellId,extra),/Divine Intervention/);assert.deepEqual(b.character,before);
  }
});
test('ordinary Divine Intervention at twenty recovers after one Long Rest without manual override',()=>{
  const b=build('doctor',20);cast(b,'cure-wounds');assert.equal(b.character.rulesRuntime.pools['doctor:intervention'],0);
  b.character.rulesRuntime=rules.runtime.update(b.summary,b.character.rulesRuntime,{type:'long-rest',expectedRevision:b.character.rulesRuntime.revision});assert.equal(b.character.rulesRuntime.pools['doctor:intervention'],1);
});
test('Greater Intervention saves 2d4 Wish cooldown, persists across reload and counts only completed Long Rest recovery',()=>{
  const b=build('doctor',20),r=cast(b,'wish');const count=r.interventionCooldown.longRestsRemaining;assert.ok(count>=2&&count<=8);assert.equal(count,r.interventionCooldown.rolls.reduce((a,b)=>a+b,0));
  b.character=JSON.parse(JSON.stringify(b.character));let state=rules.runtime.update(b.summary,b.character.rulesRuntime,{type:'short-rest',expectedRevision:b.character.rulesRuntime.revision});assert.equal(state.interventionCooldown.longRestsRemaining,count);
  assert.throws(()=>rules.runtime.update(b.summary,state,{type:'long-rest',confirmInterventionRecovery:true,expectedRevision:state.revision}),/invalid fields/);
  for(let n=count-1;n>=0;n--){state=rules.runtime.update(b.summary,state,{type:'long-rest',expectedRevision:state.revision});assert.equal(state.interventionCooldown.longRestsRemaining,n);assert.equal(state.pools['doctor:intervention'],n===0?1:0);}
});
test('a Wish cooldown blocks all Intervention choices and duplicate failure preserves counters and slots',()=>{
  const b=build('doctor',20);cast(b,'wish');const before=structuredClone(b.character);assert.throws(()=>cast(b,'cure-wounds'),/expended or its Wish cooldown/);assert.deepEqual(b.character,before);
});

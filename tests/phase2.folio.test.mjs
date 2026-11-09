import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),casting=require('../src/modules/archipelago/system/rules2024/spellOperations');
function run(b,type,payload){const r=commands.apply(b.character,{operationId:'folio-operation-001',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...r.changes};return r.result;}
function ready(level=3){const b=build('shipwright',level);b.character.goldCp=1000000;b.character.rulesRuntime.worldTime=1000000;return b;}
function unknown(b){return rules.blueprint.spells.find(s=>s.level>0&&s.level<=b.summary.spellcasting.shipwright.slots.length&&s.callings.includes('shipwright')&&!b.summary.spellcasting.shipwright.folio.includes(s.id));}
test('GM discovery, copying, exact copper and elapsed world time are saved once in the normal command result',()=>{
  const b=ready(),spell=unknown(b);run(b,'spells.discover',{spellId:spell.id,discoveryId:'wreck-book-1',reason:'Recovered from wreck'});const gold=b.character.goldCp,start=b.character.rulesRuntime.worldTime;
  const r=run(b,'spells.copy',{spellId:spell.id,discoveryId:'wreck-book-1',startedAt:start,completedAt:start+spell.level*2*3600000,confirmed:true});assert.equal(r.costCp,5000*spell.level);assert.equal(b.character.goldCp,gold-r.costCp);assert.ok(rules.runtime.project(b.summary,b.character.rulesRuntime).spellcasting.shipwright.folio.includes(spell.id));assert.equal(b.character.rulesRuntime.folioHistory[0].discoveryId,'wreck-book-1');assert.equal(b.character.rulesRuntime.worldTime,start+spell.level*2*3600000);
  run(b,'scene.record',{light:'dim',inCombat:false,confirmed:true});
  assert.equal(b.character.rulesRuntime.environment.light,'dim');
  assert.equal(b.character.rulesRuntime.folio.filter(id=>id===spell.id).length,1);
  const before=structuredClone(b.character);assert.throws(()=>run(b,'spells.copy',{spellId:spell.id,discoveryId:'wreck-book-1',startedAt:b.character.rulesRuntime.worldTime,completedAt:b.character.rulesRuntime.worldTime+spell.level*2*3600000,confirmed:true}),/unknown/);assert.deepEqual(b.character,before);
});
test('copying rejects invented sources, insufficient time, overspending and backward clocks atomically',()=>{
  const b=ready(),spell=unknown(b),start=b.character.rulesRuntime.worldTime;
  const payload={spellId:spell.id,discoveryId:'source',startedAt:start,completedAt:start+spell.level*2*3600000,confirmed:true};assert.throws(()=>run(b,'spells.copy',payload),/GM-recorded/);run(b,'spells.discover',{spellId:spell.id,discoveryId:'source',reason:'Found'});
  let before=structuredClone(b.character);assert.throws(()=>run(b,'spells.copy',{...payload,completedAt:start+1}),/sufficient/);assert.throws(()=>run(b,'spells.copy',{...payload,startedAt:start-1}),/clock/);assert.deepEqual(b.character,before);
  b.character.goldCp=0;before=structuredClone(b.character);assert.throws(()=>run(b,'spells.copy',payload),/copper/);assert.deepEqual(b.character,before);
});
test('lost folio preserves prepared casting, blocks unprepared rituals and rebuilds only prepared memories',()=>{
  const b=ready(),s=b.summary.spellcasting.shipwright,prepared=b.character.rulesRuntime.preparations.shipwright[0],unprepared=s.folio.find(id=>!b.character.rulesRuntime.preparations.shipwright.includes(id)&&!s.alwaysPrepared.includes(id));
  run(b,'folio.lose',{folioId:'lost-book',confirmed:true});let projected=rules.runtime.project(b.summary,b.character.rulesRuntime);assert.equal(projected.spellcasting.shipwright.folio.length,0);assert.ok(projected.spellcasting.shipwright.memorized.includes(prepared));
  const spell=rules.blueprint.spells.find(s=>s.id===prepared);assert.doesNotThrow(()=>casting.cast(b.character,b.summary,{callingId:'shipwright',spellId:prepared,slotLevel:spell.level}));
  const start=b.character.rulesRuntime.worldTime,payload={folioId:'replacement-book',spellIds:[prepared],startedAt:start,completedAt:start+spell.level*3600000,confirmed:true},gold=b.character.goldCp;
  const r=run(b,'folio.rebuild',payload);assert.equal(r.costCp,1000*spell.level);assert.equal(b.character.goldCp,gold-r.costCp);projected=rules.runtime.project(b.summary,b.character.rulesRuntime);assert.deepEqual(projected.spellcasting.shipwright.folio,[prepared]);
  if(unprepared)assert.throws(()=>run(b,'folio.rebuild',{...payload,spellIds:[unprepared],startedAt:b.character.rulesRuntime.worldTime,completedAt:b.character.rulesRuntime.worldTime+100*3600000}),/currently prepared/);
});
test('lost unprepared rituals cannot be read from the missing folio',()=>{
  const b=ready(5),s=b.summary.spellcasting.shipwright,ritual=rules.blueprint.spells.find(spell=>spell.ritual&&spell.callings.includes('shipwright')&&spell.level<=3&&!b.character.rulesRuntime.preparations.shipwright.includes(spell.id));assert.ok(ritual);
  if(!s.folio.includes(ritual.id))b.character.rulesRuntime.folio.push(ritual.id);
  run(b,'folio.lose',{folioId:'lost',confirmed:true});const before=structuredClone(b.character);assert.throws(()=>casting.cast(b.character,b.summary,{callingId:'shipwright',spellId:ritual.id,source:'ritual',ritual:true}),/available/);assert.deepEqual(b.character,before);
});
test('Mastery and Signature grants remain memorized after folio loss',()=>{
  const b=ready(20),before=rules.runtime.project(b.summary,b.character.rulesRuntime).spellcasting.shipwright;run(b,'folio.lose',{folioId:'lost',confirmed:true});const after=rules.runtime.project(b.summary,b.character.rulesRuntime).spellcasting.shipwright;assert.deepEqual(after.spellMastery,before.spellMastery);assert.deepEqual(after.signatureSpells,before.signatureSpells);assert.equal(after.folio.length,0);assert.ok(after.spellMastery.every(id=>after.memorized.includes(id)));
});

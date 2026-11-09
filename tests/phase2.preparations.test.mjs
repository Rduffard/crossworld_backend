import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url);
test('all 32 level-twenty builds keep automatic preparations outside their full ordinary preparation count',()=>{
  assert.equal(rules.blueprint.paths.length,32);
  for(const path of rules.blueprint.paths){
    const b=build(path.callingId,20,path.id);
    for(const [id,s] of Object.entries(b.summary.spellcasting)){
      assert.equal(s.prepared.length,s.preparedCount,path.id);
      assert.equal(s.prepared.some(spell=>s.alwaysPrepared.includes(spell)),false,path.id);
      assert.doesNotThrow(()=>rules.runtime.validate(b.summary,b.character.rulesRuntime),id);
    }
  }
});
test('a Long Rest changes Spell Mastery and frees/replaces ordinary preparations in the same validated operation',()=>{
  const b=build('shipwright',18,'breakwater'),s=b.summary,c=s.spellcasting.shipwright,state=b.character.rulesRuntime;
  const old=c.spellMastery.find(id=>rules.blueprint.spells.find(s=>s.id===id).level===1);
  const replacement=c.prepared.find(id=>{const s=rules.blueprint.spells.find(s=>s.id===id);return s.level===1&&s.castingTime==='Action';});assert.ok(replacement);
  const mastery=c.spellMastery.map(id=>id===old?replacement:id),prepared=c.prepared.map(id=>id===replacement?old:id);
  const operation={expectedRevision:0,type:'long-rest',selections:{shipwright:{spellMastery:mastery}},preparations:{shipwright:prepared}};
  const next=rules.runtime.update(s,state,operation),projected=rules.runtime.project(s,next);
  assert.deepEqual(next.preparations.shipwright,prepared);assert.ok(projected.spellcasting.shipwright.alwaysPrepared.includes(replacement));
  assert.ok(!projected.spellcasting.shipwright.alwaysPrepared.includes(old));
  assert.throws(()=>rules.runtime.update(s,state,{...operation,preparations:{shipwright:c.prepared}}),/Invalid prepared spell/);
});
test('Spell Mastery accepts Action-or-Ritual spells for advancement and Long Rest replacement',()=>{
  const b=build('shipwright',18,'breakwater'),casting=b.summary.spellcasting.shipwright;
  assert.ok(casting.spellMastery.includes('detect-magic'));
  const cast=require('../src/modules/archipelago/system/rules2024/spellOperations').cast;
  const state=b.character.rulesRuntime,slots=[...state.slots];
  const result=cast(b.character,b.summary,{spellId:'detect-magic',callingId:'shipwright',source:'mastery'});
  assert.equal(result.management.castingTime,'Action');
  assert.equal(result.spentSlot,false);
  assert.deepEqual(b.character.rulesRuntime.slots,slots);
  const oldLevelTwo=casting.spellMastery.find(id=>id!=='detect-magic');
  assert.ok(casting.prepared.includes('gentle-repose'));
  const runtime=b.character.rulesRuntime;
  const next=rules.runtime.update(b.summary,runtime,{expectedRevision:runtime.revision,type:'long-rest',
    selections:{shipwright:{spellMastery:['detect-magic','gentle-repose']}},
    preparations:{shipwright:casting.prepared.map(id=>id==='gentle-repose'?oldLevelTwo:id)},
  });
  assert.deepEqual(rules.runtime.project(b.summary,next).spellcasting.shipwright.spellMastery,['detect-magic','gentle-repose']);
  assert.throws(()=>rules.runtime.update(b.summary,runtime,{expectedRevision:runtime.revision,type:'long-rest',
    selections:{shipwright:{spellMastery:['alarm',oldLevelTwo]}},
  }),/Invalid replacement selection/);
});
for(const {level,key,spellId,copyHours} of [
  {level:18,key:'spellMastery',spellId:'chromatic-orb',copyHours:2},
  {level:20,key:'signatureSpells',spellId:'nondetection',copyHours:6},
])test(`level-${level} ${key} can use a spell copied into the saved folio`,async()=>{
  const b=build('shipwright',level-1,'breakwater');
  const commands=require('../src/modules/archipelago/characters/commands');
  let character={...b.character,owner:'player',goldCp:100000};
  const run=(type,payload)=>{
    const result=commands.apply(character,{operationId:'folio-mastery-advance',expectedRevision:character.documentRevision,rulesVersion:'SA-CHAR-1',type,payload});
    character={...character,...result.changes};
  };
  const choices=structuredClone(build('shipwright',level,'breakwater').ledger.levels[level-1].choices);
  choices[key][0]=spellId;
  assert.throws(()=>run('advance',{level,choices}),new RegExp(`Invalid ${key} choice`));
  run('spells.discover',{spellId,discoveryId:'manual',reason:'Recovered manual'});
  run('spells.copy',{spellId,discoveryId:'manual',startedAt:0,completedAt:copyHours*3600000,confirmed:true});
  const {handlers}=require('../src/modules/archipelago/characters/rules2024');
  let preview;
  const characterModel={findOne:()=>({lean:async()=>character})};
  await handlers(characterModel).preview({params:{characterId:'test'},user:{_id:character.owner},body:{callingId:'shipwright',choices}},
    {send(value){preview=value;}},error=>{throw error;});
  assert.ok(preview.spellcasting.shipwright[key].includes(spellId));
  run('advance',{level,choices});
  const reload=JSON.parse(JSON.stringify(character));
  const summary=rules.replay(reload.rulesLedger);
  assert.ok(summary.spellcasting.shipwright[key].includes(spellId));
  assert.ok(rules.runtime.project(summary,reload.rulesRuntime).spellcasting.shipwright.folio.includes(spellId));
  assert.ok(!reload.rulesRuntime.preparations.shipwright.includes(spellId));
  const forged=structuredClone(reload.rulesLedger);
  forged.levels[level-1].folioAtSpellGrant.push('forged-spell');
  assert.throws(()=>run('rebuild.preview',{ledger:forged,reason:'Forged folio'}),/historical spell grant/);
});

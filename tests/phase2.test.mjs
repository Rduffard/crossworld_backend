import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {build,complete,creation,rules,scores} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url);
const {apply,validateEnvelope}=require('../src/modules/archipelago/characters/commands');
const origins=['yuma-core','lilin-core','yayimi','klechi','tetlanco','harshanum','khiz','dengz-guo','arannia','dazibinian','kirkia','silvia','sha-ni','purapet','thult','rukka','busha','akshan'];
const roster={corsair:['reef-knife','black-flag-envoy','hollow-lantern','saltglass-duelist'],gunslinger:['deadeye','iron-suppressor','brass-outrider','cinder-artillerist'],navigator:['gray-net','storm-broker','starwake-pilot','mangrove-stalker'],tidecaller:['omen-diver','memory-echo','tempest-heart','sanguine-conduit'],warden:['leviathan-anchor','oath-of-the-free-port','iron-covenant','lantern-vigil'],reaver:['bloodwake','thunderhide','chainbreaker','reef-colossus'],doctor:['sanctuary-hand','field-surgeon','plaguewarden','keeper-of-last-breaths'],shipwright:['powder-saint','drydock-ghost','breakwater','sparkwrite-aetherist']};
const expectedFeatures=[...fs.readFileSync(new URL('../../archipelago/docs/character-system/abilities.md',import.meta.url),'utf8').matchAll(/`((?:calling|path):[^`]+)`\s*\n\nOwner (calling|path) `([^`]+)`; unlock (\d+)/g)].map(m=>({id:m[1],owner:m[3],level:Number(m[4])}));
const command=(type,payload,revision=0)=>({type,payload,expectedRevision:revision,operationId:'phase-two-operation',rulesVersion:'SA-CHAR-1'});

test('all 144 origin/Calling combinations apply origin bonuses, starting Health and saves, and offer all four Paths',()=>{
  const startingHealth={corsair:8,gunslinger:10,navigator:10,tidecaller:6,warden:10,reaver:12,doctor:8,shipwright:6};
  const saves={corsair:['agility','wit'],gunslinger:['might','resolve'],navigator:['might','agility'],tidecaller:['resolve','spirit'],warden:['instinct','spirit'],reaver:['might','resolve'],doctor:['instinct','spirit'],shipwright:['wit','instinct']};
  for(const originId of origins)for(const callingId of Object.keys(roster)){
    const b=build(callingId,1,undefined,originId),origin=rules.blueprint.creation.origins.find(o=>o.id===originId);
    const expected={...scores,might:scores.might+2};expected[origin.attribute]++;
    assert.deepEqual(b.summary.attributes,expected);
    assert.deepEqual(rules.replay(JSON.parse(JSON.stringify(b.ledger))),b.summary);
    assert.ok(b.summary.languages.includes(origin.language));
    assert.equal(b.character.origin,originId);
    assert.equal(b.summary.health.max,startingHealth[callingId]+Math.floor((expected.resolve-10)/2));
    assert.deepEqual([...b.summary.savingThrows].sort(),[...saves[callingId]].sort());
    assert.equal(b.summary.decisionsComplete,true);
    const second=complete({...b.ledger,revision:1,levels:[...b.ledger.levels,{callingId,choices:{}}]});
    assert.equal(second.summary.paths[callingId],undefined);
    const preview=rules.replay({...second.ledger,revision:2,levels:[...second.ledger.levels,{callingId,choices:{}}]});
    const request=preview.requiredChoices.find(choice=>choice.key==='pathId');
    assert.deepEqual([...request.options].sort(),[...roster[callingId]].sort(),`${originId} ${callingId}`);
  }
});
for(const[callingId,paths]of Object.entries(roster))for(const pathId of paths)test(`${pathId}: level 1–20 replay matches every documented Calling/Path feature boundary`,()=>{
  assert.equal(rules.blueprint.paths.filter(p=>p.callingId===callingId).length,4);
  let result;
  for(let n=1;n<=20;n++){
    result=complete({version:3,ruleset:'srd-5.2.1',revision:n-1,baseAttributes:scores,creation:creation(),levels:[...(result?.ledger.levels??[]),{callingId,choices:{}}]},pathId);
    const summary=result.summary;
    const expected=expectedFeatures.filter(f=>(f.owner===callingId||n>=3&&f.owner===pathId)&&f.level<=n).map(f=>f.id).sort();
    assert.deepEqual(summary.features.map(f=>f.id).sort(),expected);
    assert.equal(summary.paths[callingId],n>=3?pathId:undefined);
    assert.equal(summary.trainingBonus,2+Math.floor((n-1)/4));
    assert.deepEqual(rules.replay(JSON.parse(JSON.stringify(result.ledger))),summary);
    const state=rules.runtime.initialize(summary);assert.equal(rules.runtime.validate(summary,state),true);
  }
});
test('point-buy bounds, exact background allocation and no trusted client attributes',()=>{
  for(const invalid of [{...scores,might:16},{...scores,might:15,wit:15},{...scores,might:8.5}])assert.throws(()=>rules.create(invalid,{callingId:'doctor',choices:{}},{creation:creation(),allowIncomplete:true}),/Point buy|base attributes/);
  assert.throws(()=>rules.create(scores,{callingId:'doctor',choices:{}},{creation:{...creation(),increases:{might:2,resolve:1}},allowIncomplete:true}),/Background increases/);
  assert.throws(()=>rules.create(scores,{callingId:'doctor',choices:{}},{creation:{...creation(),method:'gm-approved'},allowIncomplete:true}),/point buy/);
});
test('all specified backgrounds complete their source choices, including Magic Initiate and Skilled',()=>{
  for(const b of rules.blueprint.creation.backgrounds){const result=build('doctor',1,undefined,'yuma-core',b.id);assert.equal(result.summary.decisionsComplete,true);assert.ok(result.summary.feats.includes(b.id==='custom'?'alert':b.feat));}
});
test('single Calling and fixed Health are enforced without mutating the saved ledger',()=>{
  const b=build('doctor',2),before=structuredClone(b.ledger);
  assert.throws(()=>rules.replay({...b.ledger,levels:[...b.ledger.levels,{callingId:'shipwright',choices:{}}]}),/one Calling/);
  assert.throws(()=>rules.replay({...b.ledger,levels:[...b.ledger.levels,{callingId:'doctor',choices:{},healthRoll:8}]}),/fixed Health/);
  assert.deepEqual(b.ledger,before);
});
test('command envelope rejects stale revisions, arbitrary derived-stat patches and version mismatches atomically',()=>{
  const b=build('gunslinger'),before=structuredClone(b.character);
  assert.throws(()=>apply(b.character,command('identity.patch',{attributes:{might:30}})),/narrative/);
  assert.throws(()=>apply(b.character,command('identity.patch',{name:'Changed'},1)),/changed/);
  assert.throws(()=>validateEnvelope({...command('identity.patch',{}),rulesVersion:'wrong'}),/version/);
  assert.deepEqual(b.character,before);
  const result=apply(b.character,command('identity.patch',{name:'Changed'}));assert.equal(result.changes.name,'Changed');assert.equal(result.changes.documentRevision,1);
});
test('spell casting spends one source and exact Metamagic cost, rejects a second slot on the same turn',()=>{
  const b=build('tidecaller',3),s=b.summary;
  const turn=apply(b.character,command('turn.start',{turnId:'round1-turn1',confirmed:true}));
  const character={...b.character,...turn.changes};
  const spellId=s.spellcasting.tidecaller.prepared.find(id=>rules.blueprint.spells.find(spell=>spell.id===id).level===1&&rules.blueprint.spellProfiles[id].savingThrow);assert.ok(spellId);
  const selected=s.pathSelections.tidecaller.metamagic[0];
  const first=apply(character,command('spell.cast',{callingId:'tidecaller',spellId,slotLevel:1,metamagic:[selected],parameters:{exemptTargets:[]}},character.documentRevision));
  assert.equal(first.changes.rulesRuntime.slots[0],character.rulesRuntime.slots[0]-1);
  assert.equal(first.changes.rulesRuntime.pools['tidecaller:sorcery-points'],2);
  assert.throws(()=>apply({...character,...first.changes},command('spell.cast',{callingId:'tidecaller',spellId,slotLevel:1},first.changes.documentRevision)),/one spell slot/);
  assert.equal(character.rulesRuntime.slots[0],s.spellSlots[0]);
});
test('the full Druid access list and all ten Metamagic choices are usable references',()=>{
  assert.equal(rules.blueprint.spells.length,316);assert.equal(rules.blueprint.metamagic.length,10);
  for(const id of ['druidcraft','produce-flame','shillelagh','starry-wisp','faerie-fire'])assert.ok(rules.blueprint.spells.find(s=>s.id===id)?.callings.includes('druid'));
  assert.equal(expectedFeatures.length,246);
});

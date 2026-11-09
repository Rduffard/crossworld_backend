import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),casting=require('../src/modules/archipelago/system/rules2024/spellOperations'),rerolls=require('../src/modules/archipelago/system/rules2024/spellRerolls'),clock=require('../src/modules/archipelago/system/rules2024/clock');
function ready(id){
  const b=build('tidecaller',20,'tempest-heart');
  b.summary.pathSelections.tidecaller.metamagic=rules.blueprint.metamagic.map(o=>o.id);
  const spell=rules.blueprint.spells.find(s=>s.id===id),c=b.summary.spellcasting.tidecaller;
  if(spell.level===0&&!c.cantrips.includes(id))c.cantrips[0]=id;
  if(spell.level>0&&!c.alwaysPrepared.includes(id)&&!b.character.rulesRuntime.preparations.tidecaller.includes(id))b.character.rulesRuntime.preparations.tidecaller[0]=id;
  return {...b,spell};
}
function cast(b,metamagic=[],parameters={},targets=[]){return casting.cast(b.character,b.summary,{spellId:b.spell.id,callingId:'tidecaller',...(b.spell.level?{slotLevel:b.spell.level}:{}),metamagic,parameters,targets,turnId:'turn-one'});}
function reroll(b,result,p){return rerolls.apply(b.character,b.summary,{castId:result.castId,eventId:'roll-one',confirmed:true,...p});}
test('typed management profiles cover the complete spell catalog and repaired rules keep statblocks with their spells',()=>{
  assert.equal(Object.keys(rules.blueprint.spellProfiles).length,316);
  for(const s of rules.blueprint.spells){const p=rules.blueprint.spellProfiles[s.id];assert.ok(p.components.length);assert.ok(p.range.kind);assert.ok(Number.isSafeInteger(p.durationSeconds));}
  for(const id of ['tree-stride','phantasmal-killer']){
    const spell=rules.blueprint.spells.find(s=>s.id===id);
    assert.equal(spell.concentration,true,id);
    assert.equal(require('../src/modules/archipelago/system/rules2024/metamagic').project(spell,['extended-spell']).concentrationAdvantage,true,id);
  }
  const spell=id=>rules.blueprint.spells.find(s=>s.id===id).description;
  assert.ok(!spell('fireball').includes('Otherworldly Steed'));assert.ok(spell('find-steed').includes('Healing Touch'));
  assert.ok(spell('find-the-path').endsWith('which path is the most direct.'));
  assert.ok(!spell('antipathy-sympathy').includes('Animated Object'));assert.ok(spell('antipathy-sympathy').endsWith('affected again.'));
  assert.ok(spell('animate-objects').includes('Animated Object Huge'));assert.ok(!spell('animate-objects').includes('through the barrier'));
});
test('Distant doubles numeric range and converts Touch without changing the source spell; rejects Self atomically',()=>{
  let b=ready('fire-bolt'),r=cast(b,['distant-spell']);assert.equal(r.management.range.feet,240);assert.equal(rules.blueprint.spellProfiles['fire-bolt'].range.feet,120);
  b=ready('shocking-grasp');assert.equal(cast(b,['distant-spell']).management.range.feet,30);
  b=ready('shield');const before=structuredClone(b.character);assert.throws(()=>cast(b,['distant-spell']),/Distant requires/);assert.deepEqual(b.character,before);
});
test('Extended saves duration, expiry and Concentration advantage and rejects instantaneous spells',()=>{
  const b=ready('hold-person');clock.advance(b.character.rulesRuntime,1000);const r=cast(b,['extended-spell']);assert.equal(r.management.durationSeconds,120);assert.equal(r.management.concentrationAdvantage,true);
  assert.equal(b.character.rulesRuntime.effects.at(-1).expiresAt,121000);clock.advance(b.character.rulesRuntime,121000);assert.equal(b.character.rulesRuntime.effects.length,0);
  const instant=ready('fireball');assert.throws(()=>cast(instant,['extended-spell']),/Extended requires/);
});
test('Careful and Heightened save exact targets and reject invalid target membership and excess or duplicate exemptions',()=>{
  const b=ready('fireball');assert.throws(()=>cast(b,['careful-spell'],{exemptTargets:['ally','ally']},['ally']),/Careful/);
  assert.throws(()=>cast(b,['careful-spell'],{exemptTargets:['other']},['ally']),/included/);
  const r=cast(b,['careful-spell'],{exemptTargets:['ally']},['ally','foe']);assert.deepEqual(r.management.carefulTargets,['ally']);assert.equal(r.management.carefulNoHalfDamage,true);
  const h=ready('hold-person'),x=cast(h,['heightened-spell'],{heightenedTarget:'foe'},['foe']);assert.equal(x.metamagicCost,2);assert.equal(x.management.disadvantageOnAllSaves,true);
});
test('Memory Echo integration build rejects Careful Detect Magic and accepts Careful Burning Hands',()=>{
  const {character}=build('tidecaller',20,'memory-echo','yuma-core','archive-apprentice');
  const commands=require('../src/modules/archipelago/characters/commands');
  const before=structuredClone(character);
  const castSpell=(spellId,targets,exemptTargets)=>commands.apply(character,{
    operationId:'careful-integration-cast',rulesVersion:'SA-CHAR-1',expectedRevision:character.documentRevision,
    type:'spell.cast',payload:{callingId:'tidecaller',spellId,slotLevel:1,metamagic:['careful-spell'],targets,parameters:{exemptTargets},turnId:'real-round-one'},
  });
  assert.throws(()=>castSpell('detect-magic',[],[]),{statusCode:422,message:/Careful requires/});
  assert.deepEqual(character,before);
  const {result,changes}=castSpell('burning-hands',['careful-ally','careful-foe'],['careful-ally']);
  assert.deepEqual(result.management.carefulTargets,['careful-ally']);
  assert.equal(result.management.carefulNoHalfDamage,true);
  assert.equal(changes.rulesRuntime.slots[0],before.rulesRuntime.slots[0]-1);
  assert.equal(changes.rulesRuntime.pools['tidecaller:sorcery-points'],before.rulesRuntime.pools['tidecaller:sorcery-points']-1);
});
test('Subtle removes components but preserves priced Material and consumed components',()=>{
  const b=ready('fireball');assert.deepEqual(cast(b,['subtle-spell']).management.components,[]);
  const meta=require('../src/modules/archipelago/system/rules2024/metamagic');
  const orb=rules.blueprint.spells.find(s=>s.id==='chromatic-orb');assert.deepEqual(meta.project(orb,['subtle-spell']).components,['M']);
});
test('Transmuted validates original damage, rejects same type and returns changed element',()=>{
  const b=ready('fireball');assert.throws(()=>cast(b,['transmuted-spell'],{originalDamageType:'cold',damageType:'fire'}),/damage types/);
  assert.throws(()=>cast(b,['transmuted-spell'],{originalDamageType:'fire',damageType:'fire'}),/damage types/);
  const r=cast(b,['transmuted-spell'],{originalDamageType:'fire',damageType:'cold'});assert.deepEqual(r.management.damageTypes,['cold']);
});
test('Twinned increases only target scaling level, not slot spend or duration; rejects ineligible spells',()=>{
  const b=ready('hold-person'),before=[...b.character.rulesRuntime.slots];const r=cast(b,['twinned-spell']);assert.equal(r.management.targetScalingLevel,3);assert.equal(r.slotLevel,2);assert.equal(b.character.rulesRuntime.slots[1],before[1]-1);assert.equal(r.management.durationSeconds,60);
  assert.throws(()=>cast(ready('fireball'),['twinned-spell']),/Twinned requires/);
});
test('Quickened changes action and prevents another levelled cast on the recorded turn',()=>{
  const b=ready('magic-missile');
  assert.throws(()=>cast(b,['quickened-spell']),/Record the active/);
  b.character.rulesRuntime.ownerTurn={id:'turn-one',number:1,open:true};
  assert.equal(cast(b,['quickened-spell']).management.castingTime,'Bonus Action');
  assert.throws(()=>cast(b),/Only one spell slot/);
});
test("Extended Hunter's Mark scales first, then caps saved duration at 24 hours",()=>{
  const {project}=require('../src/modules/archipelago/system/rules2024/metamagic');
  const spell=rules.blueprint.spells.find(s=>s.id==='hunter-s-mark');
  for(const [slotLevel,duration] of [[1,7200],[3,57600],[5,86400]]){
    const management=project(spell,['extended-spell'],{},slotLevel);
    assert.equal(management.durationSeconds,duration);
    assert.equal(management.concentrationAdvantage,true);
  }
});
test('Empowered uses saved casting damage dice, Spirit limits, replacement rolls and atomic event deduplication',()=>{
  const b=ready('fireball'),r=cast(b),before=b.character.rulesRuntime.pools['tidecaller:sorcery-points'];
  const result=reroll(b,r,{optionId:'empowered-spell',dice:[{sides:6,value:1},{sides:6,value:2}],indices:[0]});assert.equal(result.dice[1].value,2);assert.ok(result.dice[0].value>=1&&result.dice[0].value<=6);assert.equal(result.mustUseNewRoll,true);assert.equal(b.character.rulesRuntime.pools['tidecaller:sorcery-points'],before-1);
  const saved=structuredClone(b.character);assert.throws(()=>reroll(b,r,{optionId:'empowered-spell',dice:[{sides:6,value:1}],indices:[0]}),/already used/);assert.deepEqual(b.character,saved);
});
test('Seeking requires missed spell attack evidence, rerolls d20 with saved modifier, and does not spend another slot',()=>{
  const b=ready('fire-bolt'),r=cast(b),slots=[...b.character.rulesRuntime.slots];
  assert.throws(()=>reroll(b,r,{optionId:'seeking-spell',originalRoll:0}),/original d20/);
  const result=reroll(b,r,{optionId:'seeking-spell',originalRoll:2});assert.ok(result.roll>=1&&result.roll<=20);assert.equal(result.total,result.roll+result.attackModifier);assert.deepEqual(b.character.rulesRuntime.slots,slots);
  const f=ready('fireball'),fr=cast(f);assert.throws(()=>reroll(f,fr,{optionId:'seeking-spell',originalRoll:2}),/missed spell attack/);
});
test('reroll options apply after their triggers rather than prematurely charging on cast',()=>{
  const b=ready('fireball'),saved=structuredClone(b.character);assert.throws(()=>cast(b,['empowered-spell']),/after a damage roll/);assert.deepEqual(b.character,saved);
});
test('Arcane Apotheosis shares its once-per-turn free option across casts and triggered rerolls',()=>{
  const b=ready('fire-bolt');b.character.rulesRuntime.effects.push({featureId:'calling:tidecaller:innate-sorcery:1'});const r=cast(b,['distant-spell'],{freeMetamagic:'distant-spell'});assert.equal(r.metamagicCost,0);
  const before=structuredClone(b.character);assert.throws(()=>reroll(b,r,{optionId:'seeking-spell',originalRoll:1,free:true,turnId:'turn-one'}),/already used/);assert.deepEqual(b.character,before);
  const result=reroll(b,r,{optionId:'seeking-spell',originalRoll:1,free:true,turnId:'turn-two'});assert.equal(result.metamagicCost,0);
});

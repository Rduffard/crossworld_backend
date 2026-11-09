import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,complete,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands');
const command=(c,type,payload)=>commands.apply(c,{operationId:'replacement-test-001',expectedRevision:c.documentRevision,rulesVersion:'SA-CHAR-1',type,payload});
test('Magic Initiate replaces one same-level spell from its own list on level gain and preserves free-cast expenditure',()=>{
  const b=build('shipwright',1,undefined,'yuma-core','archive-apprentice'),c=b.character,grant=b.summary.featSpellcasters[0];
  c.rulesRuntime.pools[grant.poolId]=0;
  const to=rules.blueprint.spells.find(s=>s.level===0&&s.callings.includes(grant.list)&&!grant.cantrips.includes(s.id)).id;
  const choices=complete({...b.ledger,levels:[...b.ledger.levels,{callingId:'shipwright',choices:{initiateReplacements:[{grantKey:grant.grantKey,from:grant.cantrips[0],to}]}}]}).ledger.levels[1].choices;
  const result=command(c,'advance',{level:2,choices}),after=rules.replay(result.changes.rulesLedger);
  assert.ok(after.featSpellcasters[0].cantrips.includes(to));assert.ok(!after.featSpellcasters[0].cantrips.includes(grant.cantrips[0]));
  assert.equal(result.changes.rulesRuntime.pools[grant.poolId],0);
  const invalid=structuredClone(choices);invalid.initiateReplacements[0].to=grant.spell;
  assert.throws(()=>command(c,'advance',{level:2,choices:invalid}),/Invalid Magic Initiate/);
  invalid.initiateReplacements=[...choices.initiateReplacements,...choices.initiateReplacements];
  assert.throws(()=>command(c,'advance',{level:2,choices:invalid}),/at most one/);
});
test('cantrip-style replacement is a level-bound, same-list one-for-one choice',()=>{
  const b=build('navigator',2);b.ledger.levels[1].choices.style=['cantrip-style'];
  const eligible=rules.blueprint.spells.filter(s=>s.level===0&&s.callings.includes('druid')).map(s=>s.id);
  b.ledger.levels[1].choices.styleCantrips=eligible.slice(0,2);
  let ledger={...b.ledger,levels:[...b.ledger.levels,{callingId:'navigator',choices:{styleCantripReplacement:{from:eligible[0],to:eligible[2]}}}]};
  ledger=complete(ledger).ledger;assert.deepEqual(rules.replay(ledger).pathSelections.navigator.styleCantrips,[eligible[2],eligible[1]]);
  const forged=structuredClone(ledger);forged.levels[2].choices.styleCantripReplacement.to='eldritch-blast';
  assert.throws(()=>rules.replay(forged),/Invalid cantrip-style/);
});
test('Magic Initiate can use ordinary slots without spending its independent free use',()=>{
  const c=build('shipwright',1,undefined,'yuma-core','archive-apprentice').character;
  const grant=rules.replay(c.rulesLedger).featSpellcasters[0];
  const cast={callingId:'shipwright',spellId:grant.spell,source:grant.grantKey,slotLevel:1};
  const first=command(c,'spell.cast',cast);assert.equal(first.changes.rulesRuntime.slots[0],1);assert.equal(first.changes.rulesRuntime.pools[grant.poolId],1);
  const free=command(c,'spell.cast',{...cast,slotLevel:undefined});assert.equal(free.changes.rulesRuntime.slots[0],2);assert.equal(free.changes.rulesRuntime.pools[grant.poolId],0);
});
test('single-creature healing cannot multiply targets or redirect personal recovery',()=>{
  const c=build('gunslinger',2).character;c._id='self';c.rulesRuntime.health.current=1;
  const option=rules.replay(c.rulesLedger).abilityOptions.find(o=>o.handler==='second-wind');const before=structuredClone(c);
  assert.throws(()=>command(c,'ability.activate',{optionId:option.id,targetIds:['ally']}),/only heals its owner/);
  assert.throws(()=>command(c,'ability.activate',{optionId:option.id,targetIds:['self','ally']}),/one target/);
  assert.deepEqual(c,before);
  const doctor=build('doctor',2).character,spark=rules.replay(doctor.rulesLedger).abilityOptions.find(o=>o.handler==='spark-heal');
  assert.throws(()=>command(doctor,'ability.activate',{optionId:spark.id,targetIds:['ally','ally']}),/distinct stable targets/);
  assert.throws(()=>command(doctor,'ability.activate',{optionId:spark.id,targetIds:[]}),/another creature/);
});
test('Quickening a cantrip still prohibits a levelled spell before or after it on that turn',()=>{
  const c=build('tidecaller',3).character;c.rulesLedger.levels[1].choices.metamagic=['quickened-spell','subtle-spell'];
  const s=rules.replay(c.rulesLedger),spell=s.spellcasting.tidecaller.prepared.find(id=>!rules.blueprint.spells.find(s=>s.id===id).specificMaterial),cantrip=s.spellcasting.tidecaller.cantrips[0];
  c.rulesRuntime.ownerTurn={id:'round-one',number:1,open:true};
  const leveled={callingId:'tidecaller',spellId:spell,slotLevel:1};
  const first=command(c,'spell.cast',leveled);
  const quickened={callingId:'tidecaller',spellId:cantrip,metamagic:['quickened-spell']};
  assert.throws(()=>command({...c,...first.changes},'spell.cast',quickened),/Quickened prohibits/);
  const quickFirst=command(c,'spell.cast',quickened);
  assert.throws(()=>command({...c,...quickFirst.changes},'spell.cast',leveled),/Quickened prohibits/);
  assert.throws(()=>command(c,'spell.cast',{...quickened,turnId:'__proto__'}),/Invalid turn ID/);
});

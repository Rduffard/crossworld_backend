import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands');
function run(c,type,payload){const out=commands.apply(c,{operationId:'vitality-test-command',expectedRevision:c.documentRevision,rulesVersion:'SA-CHAR-1',type,payload});return {...c,...out.changes,result:out.result};}
function damage(c,amount,extra={}){return run(c,'health.damage',{amount,damageType:'force',confirmed:true,...extra});}
function activate(c,handler){const option=rules.replay(c.rulesLedger).abilityOptions.find(o=>o.handler===handler);return run(c,'ability.activate',{optionId:option.id});}
function condition(c,conditionId,source='test',active=true){return run(c,'condition.record',{conditionId,source,active,confirmed:true});}

test('Petrified stacks damage immunities, suppresses existing Poisoned and rejects new poison without deleting its source',()=>{
  const b=build('tidecaller',18,'tempest-heart');let c=condition(b.character,'poisoned','old-toxin');
  const option=b.summary.abilityOptions.find(o=>o.handler==='tempest-live');c=run(c,'ability.activate',{optionId:option.id,targetIds:[],parameters:{confirmed:true}});
  c=condition(c,'petrified','stone');const projected=rules.runtime.project(b.summary,c.rulesRuntime,c),type=b.summary.pathSelections.tidecaller.pathDiscipline;
  assert.ok(projected.immunities.includes(type));assert.ok(projected.immunities.includes('poison'));assert.ok(projected.conditionImmunities.includes('poisoned'));assert.equal(projected.conditions.includes('poisoned'),false);
  assert.ok(c.rulesRuntime.conditions.some(r=>r.conditionId==='poisoned'&&r.source==='old-toxin'));
  const before=structuredClone(c);assert.throws(()=>condition(c,'poisoned','new-toxin'),/Immunity/);assert.deepEqual(c,before);
  c=condition(c,'petrified','stone',false);assert.ok(rules.runtime.project(b.summary,c.rulesRuntime,c).conditions.includes('poisoned'));
});
test('damage absorbs one temporary pool, heals separately and a chosen lower pool does not stack',()=>{
  let c=build('gunslinger',1).character;
  c=run(c,'temp-health.choose',{amount:8,source:'first',confirmed:true});
  c=run(c,'temp-health.choose',{amount:3,source:'second',confirmed:true});assert.equal(c.rulesRuntime.temporaryHealth,3);
  const max=c.rulesRuntime.health.max;c=damage(c,5);assert.equal(c.result.absorbed,3);assert.equal(c.rulesRuntime.health.current,max-2);assert.equal(c.rulesRuntime.temporaryHealth,0);
  c=run(c,'health.apply',{healthDelta:100});assert.equal(c.rulesRuntime.health.current,max);
});
test('Reef Skin applies after physical Resistance and reduces a ten-damage attack to two at level six',()=>{
  let c=build('reaver',6,'reef-colossus').character;c=activate(c,'rage');
  const before=c.rulesRuntime.health.current;c=damage(c,10,{damageType:'slashing',attack:true});
  assert.equal(c.result.damage,2);assert.equal(c.rulesRuntime.health.current,before-2);
});
test('death save natural one counts twice, natural twenty restores one Health and critical damage can cause death',()=>{
  let c=build('gunslinger',1).character;c.rulesRuntime.health.current=0;
  c=run(c,'death-save.roll',{naturalRoll:1,confirmed:true});assert.equal(c.rulesRuntime.deathSaves.failures,2);
  c=run(c,'death-save.roll',{naturalRoll:20,confirmed:true});assert.equal(c.rulesRuntime.health.current,1);assert.equal(c.rulesRuntime.deathSaves.failures,0);
  c.rulesRuntime.health.current=0;c=damage(c,1,{critical:true});assert.equal(c.rulesRuntime.deathSaves.failures,2);
  c=damage(c,1);assert.equal(c.rulesRuntime.deathSaves.dead,true);
  assert.throws(()=>run(c,'health.apply',{healthDelta:5}),/cannot revive/);assert.throws(()=>run(c,'death-save.roll',{}),/unstable living/);
});
test('three successful death saves stabilize, damage breaks stability and massive remaining damage kills outright',()=>{
  let c=build('doctor',1).character;c.rulesRuntime.health.current=0;
  for(let i=0;i<3;i++)c=run(c,'death-save.roll',{naturalRoll:10,confirmed:true});
  assert.equal(c.rulesRuntime.deathSaves.stable,true);assert.equal(c.rulesRuntime.deathSaves.successes,0);
  c=damage(c,1);assert.equal(c.rulesRuntime.deathSaves.stable,false);assert.equal(c.rulesRuntime.deathSaves.failures,1);
  const other=build('doctor',1).character;other.rulesRuntime.health.current=2;
  const killed=damage(other,2+other.rulesRuntime.health.max);assert.equal(killed.rulesRuntime.deathSaves.dead,true);
});
test('damage creates an exact Concentration DC even when temporary Health absorbs it; failure ends the source',()=>{
  let c=build('doctor',3).character;c.rulesRuntime.effects.push({id:'concentration-one',featureId:'spell:guidance',concentration:true});
  c.rulesRuntime.temporaryHealth=100;c=damage(c,70);assert.equal(c.rulesRuntime.concentrationChecks[0].dc,30);assert.equal(c.result.healthLost,0);
  const checkId=c.rulesRuntime.concentrationChecks[0].id;
  c=run(c,'concentration.resolve',{checkId,rolls:[1],confirmed:true});assert.equal(c.result.success,false);assert.equal(c.rulesRuntime.effects.length,0);assert.equal(c.rulesRuntime.concentrationChecks.length,0);
  assert.throws(()=>run(c,'concentration.resolve',{checkId}),/No matching/);
});
test('Concentration advantage rolls two dice, uses Resolve save Training and retains the source on success',()=>{
  let c=build('shipwright',6,'sparkwrite-aetherist').character;
  c.rulesRuntime.effects.push({id:'relay',objectType:'relay',withinTenFeet:true,health:{current:12,max:12},expiresAt:Date.now()+60000},{id:'spell',featureId:'spell:guidance',concentration:true});
  c=damage(c,1);const checkId=c.rulesRuntime.concentrationChecks[0].id;
  const before=structuredClone(c);assert.throws(()=>run(c,'concentration.resolve',{checkId,rolls:[20],confirmed:true}),/correct number/);assert.deepEqual(c,before);
  c=run(c,'concentration.resolve',{checkId,rolls:[1,20],confirmed:true});assert.equal(c.result.success,true);assert.ok(c.rulesRuntime.effects.some(e=>e.id==='spell'));
});
test('condition sources remain distinct; Incapacitated ends Concentration and blocks action abilities',()=>{
  let c=build('gunslinger',2).character;c.rulesRuntime.effects.push({featureId:'spell:guidance',concentration:true});
  c=condition(c,'paralyzed','one');c=condition(c,'paralyzed','two');assert.equal(c.rulesRuntime.effects.length,0);
  assert.throws(()=>activate(c,'second-wind'),/Incapacitated/);
  c=condition(c,'paralyzed','one',false);assert.equal(c.rulesRuntime.conditions.length,1);assert.throws(()=>activate(c,'second-wind'),/Incapacitated/);
  c=condition(c,'paralyzed','two',false);assert.doesNotThrow(()=>activate(c,'second-wind'));
});
test('Exhaustion affects D20 modifiers and Speed, preserves DC and kills at level six',()=>{
  const base=build('doctor',3).character,summary=rules.replay(base.rulesLedger);
  let c=run(base,'condition.record',{conditionId:'exhaustion',source:'travel',level:2,confirmed:true});
  const after=rules.runtime.project(summary,c.rulesRuntime);
  assert.equal(after.skillModifiers.arcana,summary.skillModifiers.arcana-4);assert.equal(after.savingThrowModifiers.resolve,summary.savingThrowModifiers.resolve-4);
  assert.equal(after.spellcasting.doctor.attackModifier,summary.spellcasting.doctor.attackModifier-4);assert.equal(after.spellcasting.doctor.saveDC,summary.spellcasting.doctor.saveDC);
  assert.equal(after.movement.walk,20);
  c=run(c,'condition.record',{conditionId:'exhaustion',source:'travel',level:6,confirmed:true});assert.equal(c.rulesRuntime.deathSaves.dead,true);
});
test('world time expires active features and temporary Health, rejects rewind and survives reload',()=>{
  let c=run(build('reaver',2).character,'time.advance',{worldTime:1000,confirmed:true});c=activate(c,'rage');
  c=run(c,'temp-health.choose',{amount:5,source:'test',expiresAt:61000,confirmed:true});
  c=run(JSON.parse(JSON.stringify(c)),'time.advance',{worldTime:61000,confirmed:true});assert.equal(c.rulesRuntime.temporaryHealth,0);assert.equal(c.rulesRuntime.effects.length,1);
  c=run(c,'time.advance',{worldTime:601000,confirmed:true});assert.equal(c.rulesRuntime.effects.length,0);
  assert.throws(()=>run(c,'time.advance',{worldTime:1000,confirmed:true}),/backward/);
});
test('Rage round extension uses owner turns, never exceeds ten minutes and Persistent Rage needs no extension',()=>{
  let c=run(build('reaver',2).character,'turn.start',{turnId:'one',confirmed:true});c=activate(c,'rage');
  c=run(c,'turn.end',{turnId:'one',confirmed:true});c=run(c,'turn.start',{turnId:'two',confirmed:true});
  c=run(c,'rage.extend',{reason:'bonus-action',confirmed:true});c=run(c,'turn.end',{turnId:'two',confirmed:true});assert.ok(c.rulesRuntime.effects.some(e=>e.rage));
  c=run(c,'turn.start',{turnId:'three',confirmed:true});c=run(c,'turn.end',{turnId:'three',confirmed:true});assert.ok(!c.rulesRuntime.effects.some(e=>e.rage));
  let high=activate(build('reaver',15).character,'rage');high=condition(high,'incapacitated');assert.ok(high.rulesRuntime.effects.some(e=>e.rage));
  high=condition(high,'unconscious');assert.ok(!high.rulesRuntime.effects.some(e=>e.rage));
});
test('Relentless Rage resolves before Unconscious, restores twice level and increases DC after failed attempts',()=>{
  let c=activate(build('reaver',11).character,'rage');c.rulesRuntime.health.current=1;
  c=damage(c,1);assert.equal(c.rulesRuntime.pendingRelentlessRage.dc,10);assert.ok(c.rulesRuntime.effects.some(e=>e.rage));
  assert.throws(()=>run(c,'death-save.roll',{}),/Resolve Relentless/);
  c=run(c,'relentless-rage.resolve',{total:10,confirmed:true});assert.equal(c.rulesRuntime.health.current,22);assert.equal(c.rulesRuntime.pendingRelentlessRage,null);assert.equal(c.rulesRuntime.counters.relentlessRage,1);
  c.rulesRuntime.health.current=1;c=damage(c,1);assert.equal(c.rulesRuntime.pendingRelentlessRage.dc,15);
  c=run(c,'relentless-rage.resolve',{total:1,confirmed:true});assert.equal(c.rulesRuntime.health.current,0);assert.ok(!c.rulesRuntime.effects.some(e=>e.rage));assert.equal(c.rulesRuntime.counters.relentlessRage,2);
});
test('Stable creatures recover one Health after the saved 1d4-hour deadline in the GM world calendar',()=>{
  let c=build('doctor',1).character;c.rulesRuntime.health.current=0;
  for(let i=0;i<3;i++)c=run(c,'death-save.roll',{naturalRoll:10,confirmed:true});
  c=run(c,'time.advance',{worldTime:10000,confirmed:true});const deadline=c.rulesRuntime.deathSaves.stableUntil;
  assert.ok(deadline>=10000+3600000-100);assert.ok(deadline<=10000+4*3600000);
  c=run(c,'time.advance',{worldTime:deadline,confirmed:true});assert.equal(c.rulesRuntime.health.current,1);assert.equal(c.rulesRuntime.deathSaves.stable,false);
});

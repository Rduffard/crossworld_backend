import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),gear=require('../src/modules/archipelago/equipment'),commands=require('../src/modules/archipelago/characters/commands');
function fixture(level,discipline='breach'){
  const b=build('gunslinger',level,'cinder-artillerist');b.character.rulesLedger.levels[2].choices.pathDiscipline=[discipline];
  b.character.inventory.push(gear.issue({definitionId:'smith-tools'}));return b.character;
}
function fire(c,handler='measured-charge',parameters={},targets=['enemy']){
  const option=rules.replay(c.rulesLedger).abilityOptions.find(o=>o.handler===handler);
  assert.ok(option,handler);
  return commands.apply(c,{operationId:'cinder-operation-test',expectedRevision:c.documentRevision,rulesVersion:'SA-CHAR-1',type:'ability.activate',payload:{optionId:option.id,targetIds:targets,
    parameters:{confirmed:true,areas:[{pointId:'near-bow',targetIds:targets}],...parameters}}});
}
for(const [level,count]of [[3,2],[7,3],[10,3],[15,5],[20,5]])test(`Measured Charge at ${level} has ${count}d6, exact DC and one Charge cost`,()=>{
  const c=fixture(level),before=structuredClone(c),result=fire(c);
  assert.equal(result.result.rolls[0].length,count);assert.equal(result.result.rangeFeet,30);
  assert.equal(result.result.targetResolutions[0].save.dc,8+rules.replay(c.rulesLedger).trainingBonus+rules.replay(c.rulesLedger).attributeModifiers.wit);
  assert.equal(result.changes.rulesRuntime.pools['cinder-artillerist:charge'],2);
  assert.equal(result.changes.rulesRuntime.effects.length,0);assert.deepEqual(c,before);
});
test('charges reject missing smith tools, occupied hands and invalid placement without changing state',()=>{
  const c=fixture(3),before=structuredClone(c);
  assert.throws(()=>fire(c,'measured-charge',{confirmed:false}),/Confirm range/);
  c.inventory=c.inventory.filter(i=>i.definitionId!=='smith-tools');assert.throws(()=>fire(c),/carried smith tools/);c.inventory=before.inventory;
  c.loadout.mainHand=c.inventory.find(i=>i.definitionId==='greatsword').instanceId;
  c.loadout.grip='two';assert.throws(()=>fire(c),/free hand/);
  c.loadout.grip='one';assert.doesNotThrow(()=>fire(c));c.loadout.mainHand=null;
  assert.throws(()=>fire(c,'measured-charge',{radiusFeet:10}),/Shaped Detonation/);
  assert.deepEqual(c,before);
});
test('Grand Battery pays both pools, rolls two 6d6 areas and affects an overlapping creature only once',()=>{
  const c=fixture(18),result=fire(c,'grand-battery',{areas:[{pointId:'bow',targetIds:['first','both']},{pointId:'stern',targetIds:['both','second']}]},['first','both','second']);
  assert.deepEqual(result.result.rolls.map(a=>a.length),[6,6]);assert.equal(result.result.targetResolutions.length,3);
  const overlap=result.result.targetResolutions.find(t=>t.targetId==='both');assert.equal(overlap.areaId,'bow');assert.equal(overlap.damage,result.result.rolls[0].reduce((a,b)=>a+b,0));
  assert.equal(result.result.rangeFeet,60);assert.equal(result.changes.rulesRuntime.pools['cinder-artillerist:charge'],1);assert.equal(result.changes.rulesRuntime.pools['cinder-artillerist:battery'],0);
  const next={...c,...result.changes};assert.throws(()=>fire(next,'grand-battery',{areas:[{pointId:'bow',targetIds:['enemy']},{pointId:'stern',targetIds:[]}]}),/Insufficient resource/);
  assert.throws(()=>fire(c,'grand-battery',{areas:[{pointId:'same',targetIds:['enemy']},{pointId:'same',targetIds:[]}]}),/two different/);
});
test('Shaped Detonation and Safe Handling enforce limits, target membership and independent save behavior',()=>{
  const c=fixture(10),result=fire(c,'measured-charge',{radiusFeet:10,exemptTargets:['ally'],advantageTargets:['ally']},['ally','enemy']);
  const ally=result.result.targetResolutions.find(t=>t.targetId==='ally');assert.equal(ally.damage,0);assert.equal(ally.exempt,true);assert.equal(ally.save.advantage,true);
  assert.throws(()=>fire(c,'measured-charge',{exemptTargets:['ally','enemy']},['ally','enemy']),/exemption limit/);
  assert.throws(()=>fire(c,'measured-charge',{advantageTargets:['outsider']}),/affected allies/);
  assert.throws(()=>fire(fixture(3),'measured-charge',{advantageTargets:['enemy']}),/level seven/);
});
test('Safe Handling always grants its owner save advantage without spending an ally selection',()=>{
  const c=fixture(7);c._id='owner-character';
  const result=fire(c,'measured-charge',{},['owner-character','enemy']);
  assert.equal(result.result.targetResolutions.find(t=>t.targetId==='owner-character').save.advantage,true);
  assert.equal(result.result.targetResolutions.find(t=>t.targetId==='enemy').save.advantage,false);
});
test('Breach doubles only unattended-object damage and gains resistance bypass at fifteen',()=>{
  for(const level of [3,15]){
    const r=fire(fixture(level),'measured-charge',{objectTargets:['door']},['door','enemy']).result;
    const door=r.targetResolutions.find(t=>t.targetId==='door'),enemy=r.targetResolutions.find(t=>t.targetId==='enemy');
    assert.equal(door.damage,2*enemy.damage);assert.equal(door.save,null);assert.equal(door.ignoresFireResistance,level>=15);
  }
});
test('Smoke records obscurement and upgraded duration without poisoning or recurrent damage',()=>{
  for(const level of [3,10,15]){
    const result=fire(fixture(level,'smoke')),effect=result.changes.rulesRuntime.effects[0];
    assert.equal(effect.smokeAreas[0].radiusFeet,level>=15?10:5);assert.equal(effect.smokeAreas[0].obscurement,'heavy');
    assert.equal(effect.dispersalWindMph,20);assert.equal(effect.condition,undefined);
    if(level>=15)assert.ok(effect.expiresAt>effect.createdAt);else assert.equal(effect.ends,'start-of-next-turn');
  }
});
test('charge recovery restores Charges on Short Rest but the battery only on Long Rest',()=>{
  const c=fixture(18),result=fire(c,'grand-battery',{areas:[{pointId:'bow',targetIds:['enemy']},{pointId:'stern',targetIds:[]}]}),summary=rules.replay(c.rulesLedger);
  const short=rules.runtime.update(summary,result.changes.rulesRuntime,{type:'short-rest',expectedRevision:result.changes.rulesRuntime.revision});
  assert.equal(short.pools['cinder-artillerist:charge'],3);assert.equal(short.pools['cinder-artillerist:battery'],0);
  const long=rules.runtime.update(summary,short,{type:'long-rest',expectedRevision:short.revision});assert.equal(long.pools['cinder-artillerist:battery'],1);
});

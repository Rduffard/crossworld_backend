import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands');
const run=(c,type,payload)=>{const x=commands.apply(c,{operationId:'path-management-test',expectedRevision:c.documentRevision,rulesVersion:'SA-CHAR-1',type,payload});return {...c,...x.changes,result:x.result};};
function activate(c,handler,parameters={},targetIds=[]){return run(c,'ability.activate',{optionId:rules.replay(c.rulesLedger).abilityOptions.find(o=>o.handler===handler).id,parameters,targetIds});}
test('Harbor Geometry validates exact passers, dimensions and placement before spending',()=>{
  const c=build('shipwright',10,'breakwater').character;
  assert.throws(()=>activate(c,'barrier'),/Confirm unoccupied/);
  assert.throws(()=>activate(c,'barrier',{confirmed:true,passers:['a','b','c','d','e']}),/passers/);
  assert.throws(()=>activate(c,'barrier',{confirmed:true,widthFeet:21}),/dimensions/);
  const next=activate(c,'barrier',{confirmed:true,widthFeet:15,heightFeet:8,bend:true,passers:['a','b']});
  const object=next.rulesRuntime.effects.find(e=>e.objectType==='barrier');
  assert.equal(object.width,15);assert.equal(object.height,8);assert.equal(object.thickness,1);assert.deepEqual(object.passers,['a','b']);
  assert.deepEqual(object.health,{current:70,max:70});assert.equal(object.cover,'three-quarters');
  assert.deepEqual(object.immunities,['poison','psychic']);assert.equal(object.bend,true);
});
test('high-level barrier damage distinguishes siege, Force and ordinary resistance; reduction requires a live barrier',()=>{
  let c=build('shipwright',14,'breakwater').character;
  assert.throws(()=>activate(c,'barrier-reduce',{confirmed:true},['ally']),/live barrier/);
  c=activate(c,'barrier',{confirmed:true});const effectId=c.rulesRuntime.effects[0].id;
  c=run(c,'object.damage',{effectId,amount:11,damageType:'fire'});assert.equal(c.result.damage,5);
  c=run(c,'object.damage',{effectId,amount:11,damageType:'fire',siege:true});assert.equal(c.result.damage,11);
  c=run(c,'object.damage',{effectId,amount:11,damageType:'force'});assert.equal(c.result.damage,11);
  c=activate(c,'barrier-reduce',{confirmed:true},['ally']);assert.equal(c.result.rolls.length,4);
});
test('Ghost salvage credits have exact capacity and cannot become gold or be consumed twice',()=>{
  let c=build('shipwright',6,'drydock-ghost').character;const goldCp=c.goldCp;
  assert.throws(()=>activate(c,'salvage',{confirmed:true}),/stable ID/);
  const beforeSalvage=structuredClone(c);
  assert.throws(()=>activate(c,'salvage',{confirmed:true,objectId:'wreck-17',salvageMinutes:9}),/ten completed minutes/);
  assert.deepEqual(c,beforeSalvage);
  c=activate(c,'salvage',{confirmed:true,objectId:'wreck-17',salvageMinutes:10});assert.equal(c.rulesRuntime.salvageCp,6000);
  assert.equal(c.rulesRuntime.effects[0].salvageMinutes,10);
  c=run(c,'craft.spend-salvage',{amountCp:4500,projectId:'repair-hull-17',kind:'repair',confirmed:true});assert.equal(c.rulesRuntime.salvageCp,1500);assert.equal(c.goldCp,goldCp);
  const before=structuredClone(c);assert.throws(()=>run(c,'craft.spend-salvage',{amountCp:4500,projectId:'repair-hull-17',kind:'repair',confirmed:true}),/available salvage/);assert.deepEqual(c,before);
  assert.throws(()=>run(c,'craft.spend-salvage',{amountCp:100,projectId:'sale',kind:'sale',confirmed:true}),/only on/);
});
test('Ghost Patch records the object and scaled server healing; Silent Keel limits targets and shares Concentration',()=>{
  let c=build('shipwright',14,'drydock-ghost').character;
  const gear=require('../src/modules/archipelago/equipment');
  const repairParams={confirmed:true,objectId:'nonmagical-hull',objectMissingHealth:100};
  assert.throws(()=>activate(c,'ghost-repair',repairParams),/carpenter's tools/);
  c.inventory.push(gear.issue({definitionId:'carpenter-tools'}));
  const repair=activate(c,'ghost-repair',repairParams);assert.equal(repair.result.rolls.length,5);
  assert.equal(repair.result.objectHealing,repair.result.rolls.reduce((a,b)=>a+b,14));
  const capped=activate(c,'ghost-repair',{...repairParams,objectMissingHealth:2});
  assert.equal(capped.result.objectHealing,2);
  assert.equal(capped.rulesRuntime.effects[0].objectHealing,2);
  assert.throws(()=>activate(c,'ghost-sabotage',repairParams),/thieves' tools/);
  c.inventory.push(gear.issue({definitionId:'thieves-tools'}));
  assert.equal(activate(c,'ghost-sabotage',repairParams).rulesRuntime.effects[0].discoveryDC,rules.replay(c.rulesLedger).spellcasting.shipwright.saveDC);
  assert.throws(()=>activate(c,'silent-keel',{confirmed:true,mode:'creatures'},['1','2','3','4','5','6','7']),/six willing/);
  c.rulesRuntime.effects.push({featureId:'spell:guidance',concentration:true});
  assert.throws(()=>activate(c,'silent-keel',{confirmed:true,mode:'vehicle',vehicleLengthFeet:101},['hull']),/up to 100 feet/);
  c=activate(c,'silent-keel',{confirmed:true,mode:'vehicle',vehicleLengthFeet:100},['hull']);assert.equal(c.rulesRuntime.effects.filter(e=>e.concentration).length,1);
  assert.equal(c.rulesRuntime.effects.find(e=>e.concentration).mode,'vehicle');
  assert.equal(c.rulesRuntime.effects.find(e=>e.concentration).vehicleLengthFeet,100);
});
test('Silent Keel ends only for a confirmed creature and releases Concentration after the last creature leaves',()=>{
  let c=build('shipwright',10,'drydock-ghost').character;
  c=activate(c,'silent-keel',{confirmed:true,mode:'creatures'},['ally-one','ally-two']);
  const [shroud]=c.rulesRuntime.effects;
  const pools=structuredClone(c.rulesRuntime.pools);
  const endTarget=(targetId,trigger)=>run(c,'silent-keel.end-target',{effectId:shroud.id,targetId,trigger,confirmed:true});
  assert.throws(()=>endTarget('bystander','attack'),/still covered/);
  assert.throws(()=>endTarget('ally-one','move'),/attacked or cast/);
  c=endTarget('ally-one','attack');
  c=JSON.parse(JSON.stringify(c));
  assert.deepEqual(c.rulesRuntime.effects[0],{...shroud,targetIds:['ally-two']});
  assert.throws(()=>endTarget('ally-one','attack'),/still covered/);
  c=endTarget('ally-two','spell');
  assert.equal(c.rulesRuntime.effects.length,0);
  assert.deepEqual(c.rulesRuntime.pools,pools);
});

test('a shrouded caster gains Stealth Advantage until their own recorded attack or non-Concentration spell',()=>{
  const b=build('shipwright',10,'drydock-ghost');
  const actorId='111111111111111111111111';
  const project=c=>rules.runtime.project(b.summary,c.rulesRuntime,c);
  for(const action of ['attack','spell']){
    let c=activate({...b.character,_id:actorId},'silent-keel',{confirmed:true,mode:'creatures'},['self','ally']);
    assert.deepEqual(c.rulesRuntime.effects[0].targetIds,[actorId,'ally']);
    assert.equal(project(c).silentKeelStealth,true);
    if(action==='attack'){
      c=run(c,'turn.start',{turnId:'shroud-turn',confirmed:true});
      assert.equal(project(c).silentKeelStealth,true);
      c=run(c,'attack.record',{eventId:'shrouded-attack',targetId:'foe',attribute:'agility',hit:false,reckless:false,confirmed:true});
    }else{
      assert.throws(()=>run(c,'spell.cast',{callingId:'shipwright',spellId:'unknown'}),/Unknown spell/);
      assert.equal(project(c).silentKeelStealth,true);
      c=run(c,'spell.cast',{callingId:'shipwright',spellId:'acid-splash',targets:['foe']});
    }
    assert.equal(project(c).silentKeelStealth,false);
    assert.deepEqual(c.rulesRuntime.effects[0].targetIds,['ally']);
    assert.equal(c.rulesRuntime.effects[0].concentration,true);
  }
});

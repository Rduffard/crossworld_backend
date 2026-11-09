import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),gear=require('../src/modules/archipelago/equipment');
function run(b,type,payload){const r=commands.apply(b.character,{operationId:'gray-prey-command',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...r.changes};return r.result;}
function setup(){const b=build('navigator',7,'gray-net'),item=gear.issue({definitionId:'dagger'});b.character.inventory.push(item);b.character.loadout.mainHand=item.instanceId;return {b,item};}
function prey(b,item,extra={}){return run(b,'navigator.prey',{mode:'colossus-slayer',eventId:'hit',turnId:'turn',targetId:'enemy',weaponId:item.instanceId,missingHealth:true,confirmed:true,...extra});}
test('Colossus Slayer requires the chosen option and missing Health, doubles dice on critical and is once per turn',()=>{
  const {b,item}=setup();b.character.rulesRuntime.selections.navigator={hunterPrey:['colossus-slayer']};assert.throws(()=>prey(b,item,{missingHealth:false}),/missing Health/);const r=prey(b,item,{critical:true});assert.equal(r.rolls.length,2);assert.equal(r.damageType,'piercing');assert.throws(()=>prey(b,item,{eventId:'other'}),/already resolved/);
});
test('Horde Breaker rejects a previously attacked target and spends one ammunition for its same-weapon extra attack',()=>{
  const {b}=setup();b.character.rulesRuntime.selections.navigator={hunterPrey:['horde-breaker']};const bow=gear.issue({definitionId:'shortbow'}),ammo=gear.issue({definitionId:'arrows',quantity:2});b.character.inventory=b.character.inventory.filter(i=>i.definitionId!=='arrows');b.character.inventory.push(bow,ammo);b.character.loadout.mainHand=bow.instanceId;b.character.loadout.grip='two';run(b,'turn.start',{turnId:'turn',confirmed:true});run(b,'attack.record',{eventId:'first',targetId:'first-target',attribute:'agility',hit:true,reckless:false,confirmed:true});
  assert.throws(()=>prey(b,bow,{mode:'horde-breaker',targetId:'first-target',originalTargetId:'other'}),/not attacked/);const r=prey(b,bow,{mode:'horde-breaker',targetId:'second-target',originalTargetId:'first-target'});assert.equal(r.ammunitionSpent,1);assert.equal(b.character.inventory.find(i=>i.instanceId===ammo.instanceId).quantity,1);assert.throws(()=>prey(b,bow,{mode:'horde-breaker',targetId:'third-target',originalTargetId:'first-target'}),/already resolved/);
});
test('Multiattack Defense is source- and turn-specific and ends with the recorded enemy turn',()=>{
  const {b,item}=setup();b.character.rulesRuntime.selections.navigator={defensiveTactics:['multiattack-defense']};prey(b,item,{mode:'multiattack-defense'});assert.deepEqual(rules.runtime.project(b.summary,b.character.rulesRuntime).multiattackDefenseSources,[{targetId:'enemy',turnId:'turn'}]);run(b,'turn.trigger-end',{turnId:'turn',confirmed:true});assert.deepEqual(rules.runtime.project(b.summary,b.character.rulesRuntime).multiattackDefenseSources,[]);
});

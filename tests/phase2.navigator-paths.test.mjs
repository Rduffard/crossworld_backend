import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands');
function run(b,type,payload){const r=commands.apply(b.character,{operationId:'navigator-path-command',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...r.changes};return r.result;}
function use(b,handler,parameters={},targets=[],turnId){const option=rules.replay(b.character.rulesLedger).abilityOptions.find(o=>o.handler===handler);assert.ok(option,handler);return run(b,'ability.activate',{optionId:option.id,targetIds:targets,parameters:{confirmed:true,...parameters},...(turnId?{turnId}:{})});}
function equip(b){const item=b.character.inventory.find(i=>i.definitionId==='shortsword');assert.ok(item);b.character.loadout={...b.character.loadout,mainHand:item.instanceId,offHand:null,grip:'one'};return item.instanceId;}
test('Passage guides only other allies, upgrades speeds and replaces prior Concentration',()=>{
  for(const level of [3,7]){const b=build('navigator',level,'starwake-pilot');b.character.rulesRuntime.effects.push({id:'prior',concentration:true});const r=use(b,'starwake-guide',{},['ally']);assert.equal(r.passage.speedFeet,level===3?20:30);assert.equal(r.passage.extraMovement,false);assert.equal(r.passage.ignoreNonmagicalDifficultTerrain,level>=7);assert.equal(b.character.rulesRuntime.effects.length,1);assert.equal(r.effect.expiresAt-r.effect.createdAt,60000);const before=structuredClone(b.character);assert.throws(()=>use(b,'starwake-guide',{},[String(b.character._id??'self')]),/other willing/);assert.deepEqual(b.character,before);}
});
test('Converging Routes needs an active guided ally and cannot repeat in an owner turn',()=>{
  const b=build('navigator',11,'starwake-pilot'),objectId=equip(b);run(b,'turn.start',{turnId:'one',confirmed:true});assert.throws(()=>use(b,'starwake-hit',{objectId,eventId:'a',advantageTargets:['ally']},['foe'],'one'),/guided ally/);use(b,'starwake-guide',{},['ally']);const r=use(b,'starwake-hit',{objectId,eventId:'a',advantageTargets:['ally']},['foe'],'one');assert.equal(r.rolls.length,1);assert.throws(()=>use(b,'starwake-hit',{objectId,eventId:'b',advantageTargets:['ally']},['foe'],'one'),/already resolved/);
});
test('Homeward requires distinct supporting destinations and ends Passage without moving unchosen allies',()=>{
  const b=build('navigator',15,'starwake-pilot');use(b,'starwake-guide',{},['ally','other']);const before=structuredClone(b.character);assert.throws(()=>use(b,'starwake-home',{areas:['same','same']},['ally']),/distinct/);assert.deepEqual(b.character,before);const r=use(b,'starwake-home',{areas:['self-destination','ally-destination']},['ally']);assert.deepEqual(r.teleport.targetIds,[String(b.character._id??'self'),'ally']);assert.equal(b.character.rulesRuntime.effects.some(e=>e.passage),false);
});
test('Rooted Ambush requires the owner mark, scales dice and rejects repeat events atomically',()=>{
  for(const level of [3,11]){const b=build('navigator',level,'mangrove-stalker'),objectId=equip(b);assert.throws(()=>use(b,'mangrove-hit',{objectId,eventId:'a'},['foe'],'enemy-turn'),/active Hunters Mark/);b.character.rulesRuntime.effects.push({id:'mark',featureId:'spell:hunter-s-mark',targets:['foe'],concentration:true});const r=use(b,'mangrove-hit',{objectId,eventId:'a'},['foe'],'enemy-turn');assert.equal(r.rolls.length,level===3?1:2);assert.equal(r.damageType,'piercing');assert.equal(r.save.dc,b.summary.spellcasting.navigator.saveDC);assert.equal(r.effect.ends,'start-of-next-turn');const before=structuredClone(b.character);assert.throws(()=>use(b,'mangrove-hit',{objectId,eventId:'b'},['foe'],'enemy-turn'),/already resolved/);assert.deepEqual(b.character,before);}
});
test('Patient Predator requires own turn, its marked target and the start-hidden trigger',()=>{
  const b=build('navigator',11,'mangrove-stalker');run(b,'turn.start',{turnId:'one',confirmed:true});b.character.rulesRuntime.effects.push({id:'mark',featureId:'spell:hunter-s-mark',targets:['foe']});assert.throws(()=>use(b,'mangrove-predator',{},['foe'],'one'),/started this turn/);const r=use(b,'mangrove-predator',{mode:'started-hidden-in-cover',eventId:'move'},['foe'],'one');assert.equal(r.movement.feet,10);assert.equal(r.movement.extraMovement,false);assert.equal(r.movement.endsHiddenOnLeavingCover,true);
});
test('Vanish halves only the unresolved hit, provokes normally and rolls a real cover Hide',()=>{
  const b=build('navigator',15,'mangrove-stalker');
  b.character.rulesRuntime.conditions.push({conditionId:'poisoned',source:'toxin'});
  const r=use(b,'mangrove-vanish',{incomingDamage:15,eventId:'attack',mode:'cover'},['attacker']);
  assert.equal(r.remainingDamage,7);assert.equal(r.movement.provokesOpportunityAttacks,true);
  assert.equal(r.hideRolls.length,2);assert.equal(r.hideRoll,Math.min(...r.hideRolls));
  assert.equal(r.hideTotal,r.hideRoll+b.summary.skillModifiers.stealth);assert.equal(r.hidden,r.hideTotal>=15);
  assert.equal(JSON.parse(JSON.stringify(b.character.rulesRuntime)).conditions.some(c=>c.conditionId==='invisible'&&c.source==='hide'),r.hidden);
  assert.throws(()=>use(b,'mangrove-vanish',{incomingDamage:15,eventId:'attack'},['attacker']),/already resolved/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),gear=require('../src/modules/archipelago/equipment');
function command(b,type,payload){const r=commands.apply(b.character,{operationId:'corsair-command-001',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...r.changes};return r.result;}
function use(b,handler,parameters={},targets=['foe'],turnId){const s=rules.runtime.project(b.summary,b.character.rulesRuntime),option=s.abilityOptions.find(o=>o.handler===handler);assert.ok(option,handler);return command(b,'ability.activate',{optionId:option.id,targetIds:targets,parameters:{confirmed:true,...(handler==='duelist-parry'?{originalRoll:10}:{}),...parameters},...(turnId?{turnId}:{})});}

test('Envoy commands scale range, require other allies and save a single reaction grant per target',()=>{
  for(const level of [3,9,17]){const b=build('corsair',level,'black-flag-envoy');const before=b.character.rulesRuntime.pools['black-flag-envoy:envoy'];
    const r=use(b,'envoy-move',{eventId:'order'},['ally'],'turn');assert.equal(r.crewCommand.rangeFeet,level>=9?60:30);assert.equal(r.crewCommand.grants[0].movementSpeedFraction,0.5);assert.equal(r.crewCommand.requiresAvailableReaction,true);assert.equal(b.character.rulesRuntime.pools['black-flag-envoy:envoy'],before-1);
    const saved=structuredClone(b.character);assert.throws(()=>use(b,'envoy-move',{eventId:'order'},['ally'],'turn'),/already resolved/);assert.deepEqual(b.character,saved);
    assert.throws(()=>use(b,'envoy-move',{eventId:'self'},['self'],'turn'),/other creatures/);
  }
});
test('Crew Before Crown permits only the two printed conditions and grants Advantage on the original save',()=>{
  const b=build('corsair',9,'black-flag-envoy');for(const mode of ['charmed','frightened']){const r=use(b,'envoy-save',{eventId:mode,mode},['ally'],'turn');assert.equal(r.crewCommand.grants[0].repeatSaveAgainst,mode);assert.equal(r.crewCommand.grants[0].advantage,true);}
  const saved=structuredClone(b.character);assert.throws(()=>use(b,'envoy-save',{eventId:'bad',mode:'poisoned'},['ally'],'turn'),/Charmed or Frightened/);assert.deepEqual(b.character,saved);
});
test('All Hands spends two uses, caps three distinct allies and cannot duplicate a command',()=>{
  const b=build('corsair',17,'black-flag-envoy'),before=b.character.rulesRuntime.pools['black-flag-envoy:envoy'];
  const r=use(b,'envoy-all',{eventId:'crew'},['a','b','c'],'turn');assert.equal(r.crewCommand.grants.length,3);assert.equal(b.character.rulesRuntime.pools['black-flag-envoy:envoy'],before-2);
  const fresh=build('corsair',17,'black-flag-envoy'),saved=structuredClone(fresh.character);assert.throws(()=>use(fresh,'envoy-all',{eventId:'too-many'},['a','b','c','d'],'turn'),/target limit/);assert.throws(()=>use(fresh,'envoy-all',{eventId:'duplicate'},['a','a'],'turn'),/distinct/);assert.deepEqual(fresh.character,saved);
});
test('Binding Parley saves conditional charm, immunity, harm termination, repeat saves and exact duration',()=>{
  const b=build('corsair',13,'black-flag-envoy'),r=use(b,'envoy-parley',{eventId:'parley'},['foe']);
  assert.deepEqual(r.save,{attribute:'instinct',dc:8+b.summary.trainingBonus+b.summary.attributeModifiers.spirit});assert.equal(r.effect.expiresAt-r.effect.createdAt,60000);assert.equal(r.effect.onFailedSave.cannotAttackOwner,true);assert.equal(r.effect.charmedImmunityPreventsAll,true);assert.equal(r.effect.endsOnOwnerOrAllyHarm,true);assert.equal(r.effect.repeatSave,'end-of-target-turn');assert.equal(b.character.rulesRuntime.pools['black-flag-envoy:parley'],0);
});
test('Envoy rejects missing confirmation, command turns and event IDs without spending resources',()=>{
  const b=build('corsair',3,'black-flag-envoy'),saved=structuredClone(b.character);
  for(const args of [[{eventId:'one',confirmed:false},['ally'],'turn'],[{eventId:'two'},['ally']], [{},['ally'],'turn']])assert.throws(()=>use(b,'envoy-move',...args));
  assert.deepEqual(b.character,saved);
});
test('Read the Wake tracks only its chosen target and expires at the end of the next owner turn',()=>{
  const b=build('corsair',3,'hollow-lantern');command(b,'turn.start',{turnId:'one',confirmed:true});use(b,'lantern-study');let s=rules.runtime.project(b.summary,b.character.rulesRuntime);assert.deepEqual(s.studiedSneakTargets,['foe']);
  command(b,'turn.end',{turnId:'one',confirmed:true});assert.equal(b.character.rulesRuntime.effects.length,1);command(b,'turn.start',{turnId:'two',confirmed:true});command(b,'turn.end',{turnId:'two',confirmed:true});s=rules.runtime.project(b.summary,b.character.rulesRuntime);assert.deepEqual(s.studiedSneakTargets,[]);
});
test('Unmask the False grants a ten-minute conditional advantage; Bonus Action Search is free',()=>{
  const b=build('corsair',9,'hollow-lantern'),before=b.character.rulesRuntime.pools['hollow-lantern:lantern'];use(b,'lantern-search',{},[]);assert.equal(b.character.rulesRuntime.pools['hollow-lantern:lantern'],before);
  const r=use(b,'lantern-detect',{},[]);assert.equal(r.effect.expiresAt-r.effect.createdAt,600000);assert.equal(r.effect.automaticReveal,false);assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime).detectFalseAdvantage,true);
});
test('Lantern in the Fog suppresses unseen Advantage only for the marked target without revealing its later location',()=>{
  const b=build('corsair',13,'hollow-lantern');command(b,'turn.start',{turnId:'one',confirmed:true});const r=use(b,'lantern-mark');assert.equal(r.effect.revealsLaterLocation,false);assert.deepEqual(rules.runtime.project(b.summary,b.character.rulesRuntime).unseenAttackAdvantageSuppressedTargets,['foe']);
  command(b,'turn.end',{turnId:'one',confirmed:true});command(b,'turn.start',{turnId:'two',confirmed:true});assert.deepEqual(rules.runtime.project(b.summary,b.character.rulesRuntime).unseenAttackAdvantageSuppressedTargets,[]);
});
test('Last Tell rerolls up to three actual saved Sneak Attack dice only when its target was studied',()=>{
  const b=build('corsair',17,'hollow-lantern'),weapon=b.character.inventory.find(i=>i.definitionId==='shortsword');b.character.loadout.mainHand=weapon.instanceId;use(b,'lantern-study');
  const strike=command(b,'strike.resolve',{kind:'cunning',weaponId:weapon.instanceId,options:[],targetId:'foe',eventId:'sneak-one',turnId:'turn-one',confirmed:true});assert.ok(strike.studyEffectId);const before=[...strike.rolls];
  const r=use(b,'lantern-reroll',{eventId:'sneak-one',indices:[0,1,2]},[]);assert.equal(r.rolls.length,before.length);assert.deepEqual(r.rolls.slice(3),before.slice(3));assert.equal(r.sneakDamage,r.rolls.reduce((a,b)=>a+b,0));assert.equal(b.character.rulesRuntime.pools['hollow-lantern:last-tell'],0);
  b.character.rulesRuntime.pools['hollow-lantern:last-tell']=1;const saved=structuredClone(b.character);assert.throws(()=>use(b,'lantern-reroll',{eventId:'sneak-one',indices:[0]},[]),/unresolved Sneak Attack/);assert.deepEqual(b.character,saved);
});
test('Last Tell rejects unstudied targets or unavailable dice without consuming its use',()=>{
  const b=build('corsair',17,'hollow-lantern'),weapon=b.character.inventory.find(i=>i.definitionId==='shortsword');b.character.loadout.mainHand=weapon.instanceId;
  command(b,'strike.resolve',{kind:'cunning',weaponId:weapon.instanceId,options:[],targetId:'foe',eventId:'sneak',turnId:'turn',confirmed:true});assert.throws(()=>use(b,'lantern-reroll',{eventId:'sneak',indices:[0]},[]),/studied/);assert.equal(b.character.rulesRuntime.pools['hollow-lantern:last-tell'],1);
});
test('Open Challenge computes one-attack Guard and only enables one Answer in Steel when it caused the miss',()=>{
  const b=build('corsair',13,'saltglass-duelist'),guard=gear.derive(b.character).guard;
  const p=use(b,'duelist-parry',{eventId:'attack-one',attackTotal:guard});assert.equal(p.parry.guardAfter,guard+b.summary.trainingBonus);assert.equal(p.parry.causedMiss,true);
  const a=use(b,'duelist-answer',{eventId:'attack-one'});assert.equal(a.grantedAttack.noSneakAttack,true);assert.equal(a.grantedAttack.sameReaction,true);
  assert.throws(()=>use(b,'duelist-answer',{eventId:'attack-one'}),/missed because/);
  const weapon=b.character.inventory.find(i=>i.definitionId==='shortsword');b.character.loadout.mainHand=weapon.instanceId;assert.throws(()=>command(b,'strike.resolve',{kind:'cunning',weaponId:weapon.instanceId,options:[],targetId:'foe',eventId:a.grantedAttack.attackEventId,turnId:'enemy-turn',confirmed:true}),/cannot deal Sneak Attack/);
});
test('an attack already missing or still hitting after Open Challenge cannot enable Answer in Steel',()=>{
  for(const delta of [-1,10]){const b=build('corsair',13,'saltglass-duelist');const r=use(b,'duelist-parry',{eventId:'attack',attackTotal:gear.derive(b.character).guard+delta});assert.equal(r.parry.causedMiss,false);assert.throws(()=>use(b,'duelist-answer',{eventId:'attack'}),/missed because/);}
});

test('Open Challenge cannot make a natural twenty miss or claim to have caused a natural-one miss',()=>{
  for(const originalRoll of [1,20]){const b=build('corsair',13,'saltglass-duelist');const r=use(b,'duelist-parry',{eventId:'natural',attackTotal:gear.derive(b.character).guard,originalRoll});assert.equal(r.parry.causedMiss,false);}
});
test('Saltglass Footwork requires the held signature weapon; Perfect Measure grants a noncritical hit and spends its use',()=>{
  const b=build('corsair',17,'saltglass-duelist');assert.throws(()=>use(b,'duelist-footwork',{eventId:'hit'},['foe'],'one'),/signature weapon/);
  const weapon=gear.issue({definitionId:b.summary.pathSelections.corsair.pathDiscipline});b.character.inventory.push(weapon);b.character.loadout.mainHand=weapon.instanceId;command(b,'turn.start',{turnId:'one',confirmed:true});
  const f=use(b,'duelist-footwork',{eventId:'attack'},['foe'],'one');assert.equal(f.effect.noOpportunityAttacksFrom,'foe');command(b,'turn.end',{turnId:'one',confirmed:true});assert.ok(!b.character.rulesRuntime.effects.some(e=>e.noOpportunityAttacksFrom));
  const p=use(b,'duelist-perfect',{eventId:'miss'});assert.equal(p.hitInstead,true);assert.equal(p.naturalTwenty,false);assert.equal(b.character.rulesRuntime.pools['saltglass-duelist:perfect-measure'],0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands');
function run(b,type,payload){const r=commands.apply(b.character,{operationId:'remaining-clause-command',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...r.changes};return r.result;}
function use(b,handler,parameters={},targets=[],turnId){const option=rules.replay(b.character.rulesLedger).abilityOptions.find(o=>o.handler===handler);assert.ok(option,handler);return run(b,'ability.activate',{optionId:option.id,targetIds:targets,parameters:{confirmed:true,...parameters},...(turnId?{turnId}:{})});}
test('Dragon Companion spends one free use, waives materials and preserves existing Concentration in its one-minute form',()=>{
  const b=build('tidecaller',18,'omen-diver'),slots=[...b.character.rulesRuntime.slots];b.character.rulesRuntime.effects.push({id:'existing',concentration:true});const r=run(b,'spell.cast',{callingId:'tidecaller',spellId:'summon-dragon',source:'dragon-companion',parameters:{dragonNoConcentration:true}});assert.equal(b.character.rulesRuntime.pools['omen-diver:companion'],0);assert.deepEqual(b.character.rulesRuntime.slots,slots);assert.equal(r.management.components.includes('M'),false);const effect=b.character.rulesRuntime.effects.find(e=>e.id===r.castId);assert.equal(effect.concentration,false);assert.equal(effect.expiresAt-effect.createdAt,60000);assert.ok(b.character.rulesRuntime.effects.some(e=>e.id==='existing'));assert.throws(()=>run(b,'spell.cast',{callingId:'tidecaller',spellId:'summon-dragon',source:'dragon-companion'}),/expended/);
});
test('Dragon Companion slot casting also waives materials and its special form is rejected below eighteen',()=>{
  const b=build('tidecaller',18,'omen-diver'),before=b.character.rulesRuntime.slots[4],r=run(b,'spell.cast',{callingId:'tidecaller',spellId:'summon-dragon',slotLevel:5});assert.equal(b.character.rulesRuntime.slots[4],before-1);assert.deepEqual(r.consumedMaterials,[]);assert.equal(b.character.rulesRuntime.effects.find(e=>e.id===r.castId).concentration,true);const low=build('tidecaller',17,'omen-diver');assert.throws(()=>run(low,'spell.cast',{callingId:'tidecaller',spellId:'summon-dragon',slotLevel:5,parameters:{dragonNoConcentration:true}}),/Dragon Companion/);
});
test('Leviathan Smite of Protection grants conditional Half Cover through next turn start without changing ordinary Guard',()=>{
  const b=build('warden',15,'leviathan-anchor');
  run(b,'turn.start',{turnId:'one',confirmed:true});
  const cast={callingId:'warden',spellId:'divine-smite',source:'smite-free',targets:['enemy']};
  const before=structuredClone(b.character);
  assert.throws(()=>run(b,'spell.cast',cast),/Confirm the printed spell trigger/);
  assert.deepEqual(b.character,before);
  const trigger={eventId:'melee-hit',confirmed:true};
  run(b,'spell.cast',{...cast,trigger});
  assert.throws(()=>run(b,'spell.cast',{...cast,source:'slot',slotLevel:1,trigger:{...trigger,eventId:' melee-hit '}}),/already been resolved/);
  assert.deepEqual(rules.runtime.project(b.summary,b.character.rulesRuntime).smiteProtectionAura,{halfCover:true,radiusFeet:10});
  run(b,'turn.end',{turnId:'one',confirmed:true});
  assert.ok(rules.runtime.project(b.summary,b.character.rulesRuntime).smiteProtectionAura);
  run(b,'turn.start',{turnId:'two',confirmed:true});
  assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime).smiteProtectionAura,null);
});
test('Squalls have typed effects and Captain Credit follows the approved off-turn once-per-combat-round rule',()=>{
  const b=build('navigator',11,'storm-broker');run(b,'initiative.record',{combatId:'combat-one',roll:10,confirmed:true});run(b,'turn.start',{turnId:'one',confirmed:true});assert.throws(()=>use(b,'squall',{exemptTargets:['one','two']}),/limit/);const r=use(b,'squall',{exemptTargets:['ally']});assert.equal(r.effect.radius,15);assert.equal(r.effect.ends,'end-of-next-turn');assert.deepEqual(r.effect.exemptTargets,['ally']);assert.equal(r.effect.heavilyObscured,true);
  const p={objectId:r.effect.id,eventId:'success',roundNumber:1};assert.throws(()=>use(b,'broker-credit',p,['ally'],'one'),/outside your turn/);run(b,'turn.end',{turnId:'one',confirmed:true});const credit=use(b,'broker-credit',p,['ally'],'ally-turn');assert.equal(credit.temporaryHealthGrant.amount,Math.max(1,b.summary.trainingBonus+b.summary.attributeModifiers.instinct));assert.throws(()=>use(b,'broker-credit',{...p,eventId:'other'},['ally'],'another-ally-turn'),/already granted this round/);assert.throws(()=>use(b,'broker-credit',{...p,roundNumber:2},['ally'],'later'),/success already used/);assert.doesNotThrow(()=>use(b,'broker-credit',{...p,eventId:'next-success',roundNumber:2},['ally'],'later'));assert.throws(()=>use(b,'broker-credit',{...p,eventId:'backward',roundNumber:1},['ally'],'earlier'),/round/);use(b,'squall');assert.equal(b.character.rulesRuntime.effects.filter(e=>e.zone).length,1);
});
test('Reef Knife Reflexes stores a first-round initiative offset and Initiative Advantage rolls two dice',()=>{
  const b=build('corsair',17,'reef-knife'),r=run(b,'initiative.record',{combatId:'one',roll:15,confirmed:true});assert.equal(r.firstRoundExtraTurnOffset,-10);const d=build('gunslinger',3,'deadeye'),result=run(d,'initiative.record',{combatId:'two',confirmed:true});assert.equal(result.rolls.length,2);assert.equal(result.roll,Math.max(...result.rolls));
});
test('Superior Gray Net prey requires a real source damage event and applies once per turn to another creature',()=>{
  const b=build('navigator',11,'gray-net'),cast=run(b,'spell.cast',{callingId:'navigator',spellId:'hunter-s-mark',source:'favored-enemy',targets:['foe']});assert.throws(()=>use(b,'rider-mark-secondary',{objectId:cast.castId,eventId:'hit'},['foe','other'],'one'),/same recorded/);use(b,'rider-mark',{objectId:cast.castId,eventId:'hit'},['foe']);const r=use(b,'rider-mark-secondary',{objectId:cast.castId,eventId:'hit'},['foe','other'],'one');assert.equal(r.secondaryTargetId,'other');assert.equal(r.rolls.length,1);assert.throws(()=>use(b,'rider-mark-secondary',{objectId:cast.castId,eventId:'hit'},['foe','third'],'one'),/already resolved/);
});

test('Sacred Weapon binds one held Melee instance, adds its real Spirit attack bonus and ends when no longer carried',()=>{
  const b=build('warden',3,'leviathan-anchor'),gear=require('../src/modules/archipelago/equipment'),weapon=b.character.inventory.find(i=>i.definitionId==='longsword');b.character.loadout.mainHand=weapon.instanceId;const before=gear.derive(b.character).attacks[0].attackModifier;use(b,'sacred',{objectId:weapon.instanceId});const after=gear.derive(b.character).attacks[0];assert.equal(after.attackModifier,before+Math.max(1,b.summary.attributeModifiers.spirit));assert.deepEqual(after.damageTypeOptions,['slashing','radiant']);run(b,'equipment.sell',{instanceId:weapon.instanceId,quantity:1,proceedsCp:1,unequip:true,reason:'Test sale'});assert.equal(b.character.rulesRuntime.effects.some(e=>e.sacredWeaponId),false);
});

test('Holy Nimbus projects sunlight and Fiend/Undead save Advantage and rolls no save for distinct enemy-turn pulses',()=>{
  const b=build('warden',20,'leviathan-anchor');use(b,'nimbus');let summary=rules.runtime.project(b.summary,b.character.rulesRuntime);assert.equal(summary.holyNimbus.radiusFeet,30);assert.deepEqual(summary.holyNimbus.saveAdvantageAgainst,['fiend','undead']);const r=use(b,'nimbus-pulse',{},['foe'],'enemy-turn');assert.equal(r.damage,b.summary.attributeModifiers.spirit+b.summary.trainingBonus);assert.equal(r.damageType,'radiant');assert.throws(()=>use(b,'nimbus-pulse',{},['foe'],'enemy-turn'),/already resolved/);assert.doesNotThrow(()=>use(b,'nimbus-pulse',{},['other'],'enemy-turn'));run(b,'condition.record',{conditionId:'incapacitated',source:'test',active:true,confirmed:true});assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime).holyNimbus,null);
});

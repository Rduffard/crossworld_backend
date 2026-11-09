import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),gear=require('../src/modules/archipelago/equipment');
function run(b,type,payload){const r=commands.apply(b.character,{operationId:'warden-command-001',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...r.changes};return r.result;}
function use(b,handler,parameters={},targets=[],turnId){const option=rules.replay(b.character.rulesLedger).abilityOptions.find(o=>o.handler===handler);assert.ok(option,handler);return run(b,'ability.activate',{optionId:option.id,targetIds:targets,parameters:{confirmed:true,...parameters},...(turnId?{turnId}:{})});}
test('Break the Chain ends only its selected source, grants Liberty movement and spends once',()=>{
  const b=build('warden',3,'oath-of-the-free-port');b.character.rulesRuntime.conditions=[{conditionId:'restrained',source:'rope'},{conditionId:'restrained',source:'web'}];
  const before=b.character.rulesRuntime.pools['warden:channel-divinity'],r=use(b,'freeport-break',{conditionSource:'rope',mode:'restrained',magical:false,consent:true},['self']);assert.deepEqual(b.character.rulesRuntime.conditions,[{conditionId:'restrained',source:'web'}]);assert.equal(r.freeMovement.feet,10);assert.equal(r.freeMovement.noOpportunityAttacks,true);assert.equal(b.character.rulesRuntime.pools['warden:channel-divinity'],before-1);
});
test('Refuge grants level temporary Health to its recipient and magical checks use Spirit with default DC fifteen',()=>{
  const b=build('warden',3,'oath-of-the-free-port');b.ledger.levels[2].choices.pathDiscipline=['refuge'];b.character.rulesLedger=b.ledger;b.summary=rules.replay(b.ledger);
  const r=use(b,'freeport-break',{conditionSource:'rope',mode:'grappled',magical:false,consent:true},['ally']);assert.equal(r.temporaryHealthGrant.amount,3);assert.deepEqual(r.temporaryHealthGrant.targetIds,['ally']);assert.equal(b.character.rulesRuntime.temporaryHealth,0);
  const c=build('warden',3,'oath-of-the-free-port'),check=use(c,'freeport-break',{conditionSource:'web',mode:'restrained',magical:true,consent:true},['ally']);assert.equal(check.dc,15);assert.equal(check.checkTotal,check.rolls[0]+c.summary.attributeModifiers.spirit);assert.equal(Boolean(check.endsCondition),check.success);
});
test('Break the Chain rejects missing source, invalid condition, unwilling targets and forged DC atomically',()=>{
  const b=build('warden',3,'oath-of-the-free-port'),before=structuredClone(b.character);
  for(const p of [{mode:'restrained',magical:false,consent:true},{conditionSource:'rope',mode:'paralyzed',magical:false,consent:true},{conditionSource:'rope',mode:'restrained',magical:false,consent:false},{conditionSource:'web',mode:'restrained',magical:true,consent:true,dc:-1}])assert.throws(()=>use(b,'freeport-break',p,['ally']));assert.deepEqual(b.character,before);
});
test('No Captive Left rerolls a failed eligible save, spends five Lay On Hands and never heals',()=>{
  const b=build('warden',15,'oath-of-the-free-port'),health=b.character.rulesRuntime.health.current,pool=b.character.rulesRuntime.pools['warden:lay-on-hands'];
  const p={conditionSource:'web',mode:'restrained',eventId:'failed-save',originalRoll:3,checkTotal:7,dc:15},r=use(b,'freeport-reroll',p,['ally']);assert.equal(r.checkTotal,r.rolls[0]+4);assert.equal(r.mustUseNewRoll,true);assert.equal(b.character.rulesRuntime.health.current,health);assert.equal(r.healing,undefined);assert.equal(b.character.rulesRuntime.pools['warden:lay-on-hands'],pool-5);
  const before=structuredClone(b.character);assert.throws(()=>use(b,'freeport-reroll',p,['ally']),/already rerolled/);assert.deepEqual(b.character,before);
});
test('Open Harbor lasts ten minutes and Passage aura requires consciousness with correct radius',()=>{
  const b=build('warden',20,'oath-of-the-free-port'),r=use(b,'freeport-harbor');assert.equal(r.effect.expiresAt-r.effect.createdAt,600000);let s=rules.runtime.project(b.summary,b.character.rulesRuntime);assert.equal(s.passageAura.radiusFeet,30);assert.equal(s.passageAura.ignoreNonmagicalDifficultTerrain,true);assert.equal(s.passageAura.openHarbor,true);
  b.character.rulesRuntime.conditions=[{conditionId:'stunned',source:'spell'}];assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime).passageAura,null);
});
test('Light the Watch deals one scaled rider per owner turn and recasting cannot reset its turn limit',()=>{
  const b=build('warden',15,'lantern-vigil'),weapon=b.character.inventory.find(i=>i.definitionId==='longsword')??gear.issue({definitionId:'longsword'});if(!b.character.inventory.includes(weapon))b.character.inventory.push(weapon);b.character.loadout.mainHand=weapon.instanceId;
  const activation=use(b,'vigil-watch');assert.equal(activation.effect.sunlight,false);assert.equal(activation.effect.brightLightFeet,20);run(b,'turn.start',{turnId:'one',confirmed:true});
  const record=(eventId,targetId,hit=true)=>run(b,'attack.record',{eventId,targetId,weaponId:weapon.instanceId,attribute:'might',hit,reckless:false,confirmed:true});
  record('miss','undead',false);record('hit-one','undead');record('hit-two','foe');
  const before=structuredClone(b.character);
  assert.throws(()=>use(b,'vigil-hit',{objectId:weapon.instanceId,eventId:'hit-two',undead:false},['foe'],'one'),/first weapon hit/);
  assert.deepEqual(b.character,before);
  const r=use(b,'vigil-hit',{objectId:weapon.instanceId,eventId:'hit-one',undead:true},['undead'],'one');assert.equal(r.rolls.length,2);assert.equal(r.damageType,b.summary.pathSelections.warden.pathDiscipline);assert.equal(r.watchHit.preventsHealing,true);use(b,'vigil-watch');assert.throws(()=>use(b,'vigil-hit',{objectId:weapon.instanceId,eventId:'hit-one',undead:true},['undead'],'one'),/already added/);
  run(b,'turn.end',{turnId:'one',confirmed:true});run(b,'turn.start',{turnId:'two',confirmed:true});record('hit-three','foe');assert.equal(use(b,'vigil-hit',{objectId:weapon.instanceId,eventId:'hit-three',undead:false},['foe'],'two').rolls.length,2);
});
test('Watch cannot produce weapon damage without an equipped weapon, an open turn or while Incapacitated',()=>{
  const b=build('warden',3,'lantern-vigil');use(b,'vigil-watch');assert.throws(()=>use(b,'vigil-hit',{objectId:'fake',eventId:'hit',undead:true},['foe'],'one'),/first weapon hit/);
});
test('Watchfire cures exactly one Undead charm source at five Lay On Hands points',()=>{
  const b=build('warden',15,'lantern-vigil');b.character.rulesRuntime.conditions=[{conditionId:'charmed',source:'vampire'},{conditionId:'charmed',source:'spell'}];
  const pool=b.character.rulesRuntime.pools['warden:lay-on-hands'];use(b,'vigil-cure',{conditionSource:'vampire',undead:true},['self']);assert.deepEqual(b.character.rulesRuntime.conditions,[{conditionId:'charmed',source:'spell'}]);assert.equal(b.character.rulesRuntime.pools['warden:lay-on-hands'],pool-5);const before=structuredClone(b.character);assert.throws(()=>use(b,'vigil-cure',{conditionSource:'spell',undead:false},['self']),/Undead/);assert.deepEqual(b.character,before);
});
test('Clear Sight does not pierce magical darkness and Dawn resolves once per Undead turn without a save',()=>{
  const b=build('warden',20,'lantern-vigil'),dawn=use(b,'vigil-dawn');assert.equal(dawn.effect.expiresAt-dawn.effect.createdAt,60000);let s=rules.runtime.project(b.summary,b.character.rulesRuntime);assert.equal(s.clearSightAura.radiusFeet,30);assert.equal(s.clearSightAura.piercesMagicalDarkness,false);assert.equal(s.clearSightAura.dawnSunlight,true);
  const p={eventId:'undead-start',undead:true},r=use(b,'vigil-dawn-damage',p,['undead'],'turn-one');assert.equal(r.damage,Math.max(1,b.summary.trainingBonus+b.summary.attributeModifiers.spirit));assert.equal(r.noSave,true);assert.throws(()=>use(b,'vigil-dawn-damage',{...p,eventId:'duplicate'},['undead'],'turn-one'),/already resolved/);
  b.character.rulesRuntime.worldTime=dawn.effect.expiresAt;assert.throws(()=>use(b,'vigil-dawn-damage',{...p,eventId:'expired'},['undead'],'turn-two'),/active Dawn/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),gear=require('../src/modules/archipelago/equipment');
function run(b,type,payload){const r=commands.apply(b.character,{operationId:'reaver-path-command',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...r.changes};return r.result;}
function use(b,handler,parameters={},targets=[],turnId){const option=rules.replay(b.character.rulesLedger).abilityOptions.find(o=>o.handler===handler);assert.ok(option,handler);return run(b,'ability.activate',{optionId:option.id,targetIds:targets,parameters:{confirmed:true,...parameters},...(turnId?{turnId}:{})});}
function rage(b){use(b,'rage');}

test('Reaver Path hit accepts a confirmed Might finesse attack even when Agility is the higher default',()=>{
  for(const path of ['thunderhide','chainbreaker']){
    const b=build('reaver',3,path),weapon=gear.issue({definitionId:'rapier'});b.character.inventory.push(weapon);b.character.loadout={...b.character.loadout,mainHand:weapon.instanceId,offHand:null,grip:'one'};
    assert.equal(gear.derive(b.character).attacks[0].attribute,'agility');
    run(b,'turn.start',{turnId:'finesse-turn',confirmed:true});rage(b);
    const r=use(b,'reaver-path-hit',{objectId:weapon.instanceId,eventId:'might-rapier-hit',mode:'grappling-ally'},['foe'],'finesse-turn');assert.equal(r.damage,2);
  }
  const b=build('reaver',3,'thunderhide'),bow=gear.issue({definitionId:'shortbow'});b.character.inventory.push(bow);b.character.loadout={...b.character.loadout,mainHand:bow.instanceId,offHand:null,grip:'two'};run(b,'turn.start',{turnId:'bow-turn',confirmed:true});rage(b);
  const before=structuredClone(b.character);assert.throws(()=>use(b,'reaver-path-hit',{objectId:bow.instanceId,eventId:'bow-hit'},['foe'],'bow-turn'),/Might-based melee/);assert.deepEqual(b.character,before);
});

test('Bloodwake Retaliation validates a real melee weapon or Unarmed Strike and cannot repeat its damage trigger',()=>{
  const b=build('reaver',10,'bloodwake');assert.throws(()=>use(b,'bloodwake-retaliation',{eventId:'damage'},['foe']),/equipped melee/);const r=use(b,'bloodwake-retaliation',{eventId:'damage',mode:'unarmed'},['foe']);assert.equal(r.grantedAttack.unarmed,true);assert.equal(r.grantedAttack.actionType,'reaction');assert.throws(()=>use(b,'bloodwake-retaliation',{eventId:'damage',mode:'unarmed'},['foe']),/already resolved/);
});

test('Intimidating Presence records the Might-based save, selected targets and repeat-save duration',()=>{
  const b=build('reaver',14,'bloodwake');assert.throws(()=>use(b,'presence'),/thirty-foot/);const r=use(b,'presence',{},['foe','other']);assert.equal(r.save.dc,8+b.summary.attributeModifiers.might+b.summary.trainingBonus);assert.equal(r.effect.targetCondition,'frightened');assert.equal(r.effect.repeatSave,'end-of-target-turn');assert.equal(r.effect.expiresAt-r.effect.createdAt,60000);assert.equal(b.character.rulesRuntime.pools['bloodwake:presence'],0);
});
test('Stormhide leap works outside Rage but its landing rider requires Rage and level ten',()=>{
  let b=build('reaver',3,'thunderhide'),before=b.character.rulesRuntime.pools['thunderhide:stormhide'];const leap=use(b,'stormhide-leap',{distanceFeet:15});assert.equal(leap.movement.teleport,false);assert.equal(leap.movement.provokesOpportunityAttacks,true);assert.equal(b.character.rulesRuntime.pools['thunderhide:stormhide'],before-1);assert.throws(()=>use(b,'stormhide-leap',{distanceFeet:16}),/fifteen/);
  b=build('reaver',10,'thunderhide');assert.throws(()=>use(b,'stormhide-leap',{distanceFeet:15},['foe']),/active Rage/);rage(b);const landing=use(b,'stormhide-leap',{distanceFeet:15},['foe']);assert.equal(landing.save.dc,8+b.summary.trainingBonus+b.summary.attributeModifiers.might);assert.equal(landing.landing.proneOnFailure,true);
});
test('Thunderhide type Resistance is conditional at three and permanent at six',()=>{
  for(const level of [3,6]){const b=build('reaver',level,'thunderhide'),type=b.summary.pathSelections.reaver.pathDiscipline;assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime).resistances.includes(type),level>=6);rage(b);assert.ok(rules.runtime.project(b.summary,b.character.rulesRuntime).resistances.includes(type));}
});
test('Walking Storm spends once per Rage, rolls three dice per target turn and expires at next owner turn',()=>{
  const b=build('reaver',14,'thunderhide');run(b,'turn.start',{turnId:'owner-one',confirmed:true});rage(b);use(b,'stormhide-walking');const before=structuredClone(b.character);assert.throws(()=>use(b,'stormhide-walking'),/once per Rage/);assert.deepEqual(b.character,before);
  const pulse=use(b,'stormhide-pulse',{eventId:'enemy-start'},['foe'],'enemy-turn');assert.equal(pulse.rolls.length,3);assert.equal(pulse.save.attribute,'resolve');assert.equal(pulse.save.successDamage,Math.floor(pulse.damage/2));assert.throws(()=>use(b,'stormhide-pulse',{eventId:'second-event'},['foe'],'enemy-turn'),/already resolved/);
  run(b,'turn.end',{turnId:'owner-one',confirmed:true});run(b,'turn.start',{turnId:'owner-two',confirmed:true});assert.throws(()=>use(b,'stormhide-pulse',{eventId:'expired'},['foe'],'later-turn'),/live ten-foot/);
});
test('Weather the Blow is a Rage-only source-bound retaliation with minimum-one Resolve damage',()=>{
  const b=build('reaver',6,'thunderhide');assert.throws(()=>use(b,'stormhide-retaliate',{eventId:'hit'},['foe']),/active Rage/);rage(b);const result=use(b,'stormhide-retaliate',{eventId:'hit'},['foe']);assert.equal(result.damage,Math.max(1,b.summary.attributeModifiers.resolve));assert.equal(result.damageType,b.summary.pathSelections.reaver.pathDiscipline);assert.throws(()=>use(b,'stormhide-retaliate',{eventId:'hit'},['foe']),/already resolved/);
});
test('Chainbreaker escape uses the owner full Athletics modifier and never spends an ally action',()=>{
  const b=build('reaver',3,'chainbreaker'),result=use(b,'chainbreaker-escape',{dc:15,conditionSource:'captor'},['ally']);assert.equal(result.checkTotal,Math.max(...result.rolls)+b.summary.skillModifiers.athletics);assert.equal(result.allyActionSpent,false);
  rage(b);const raging=use(b,'chainbreaker-escape',{dc:15,conditionSource:'captor'},['ally']);assert.equal(raging.rolls.length,2);
});
test('Rally grants the same nonnegative temporary pool to at most three allies and ends Prone',()=>{
  const b=build('reaver',10,'chainbreaker'),r=use(b,'chainbreaker-rally',{},['a','b','c']);assert.equal(r.temporaryHealthGrant.amount,Math.max(0,r.rolls[0]+b.summary.attributeModifiers.resolve));assert.equal(r.endsCondition,'prone');assert.equal(b.character.rulesRuntime.temporaryHealth,0);assert.throws(()=>use(b,'chainbreaker-rally',{},['a','b','c','d']),/three/);
});
test('None Shall Kneel requires Rage and a failed eligible source save, succeeds instead and never heals',()=>{
  const b=build('reaver',14,'chainbreaker'),p={mode:'frightened',conditionSource:'dragon',dc:15,checkTotal:10};assert.throws(()=>use(b,'chainbreaker-kneel',p,['ally']),/Rage/);rage(b);const r=use(b,'chainbreaker-kneel',p,['ally']);assert.equal(r.saveSucceedsInstead,true);assert.equal(r.endsConditionSource,'dragon');assert.equal(r.healing,undefined);assert.equal(b.character.rulesRuntime.pools['chainbreaker:none-kneel'],0);
});
test('Colossus carries as Large while Raging and Reef Skin suppression removes both reduction and Speed cost',()=>{
  const b=build('reaver',6,'reef-colossus'),base=gear.derive(b.character).carrying.capacityLb;run(b,'turn.start',{turnId:'one',confirmed:true});rage(b);let gearState=gear.derive(b.character);assert.equal(gearState.carrying.capacityLb,base*2);assert.equal(gearState.restrictions.speedPenaltyFeet,5);
  use(b,'colossus-suppress');gearState=gear.derive(b.character);assert.equal(gearState.restrictions.speedPenaltyFeet,0);const damage=run(b,'health.damage',{amount:10,damageType:'slashing',attack:true,confirmed:true});assert.equal(damage.damage,5);
  run(b,'turn.end',{turnId:'one',confirmed:true});run(b,'turn.start',{turnId:'two',confirmed:true});assert.equal(run(b,'health.damage',{amount:10,damageType:'slashing',attack:true,confirmed:true}).damage,2);
});
test('Deckshaker is not the Attack action and scales from three to five dice with exact half damage',()=>{
  for(const level of [10,14]){const b=build('reaver',level,'reef-colossus');rage(b);const r=use(b,'colossus-deck',{},['foe']);assert.equal(r.rolls.length,level===14?5:3);assert.equal(r.attackAction,false);assert.equal(r.save.successDamage,Math.floor(r.damage/2));assert.equal(r.landing.proneOnFailure,true);}
});
test('Thunderhide weapon rider validates a wielded Might attack and cannot repeat on the same turn',()=>{
  const b=build('reaver',3,'thunderhide'),axe=b.character.inventory.find(i=>i.definitionId==='greataxe');assert.ok(axe);b.character.loadout={...b.character.loadout,mainHand:axe.instanceId,offHand:null,grip:'two'};run(b,'turn.start',{turnId:'one',confirmed:true});rage(b);
  const hit=use(b,'reaver-path-hit',{objectId:axe.instanceId,eventId:'axe-hit'},['foe'],'one');assert.equal(hit.damage,2);assert.equal(hit.damageType,b.summary.pathSelections.reaver.pathDiscipline);const before=structuredClone(b.character);assert.throws(()=>use(b,'reaver-path-hit',{objectId:axe.instanceId,eventId:'second-hit'},['foe'],'one'),/already applied/);assert.deepEqual(b.character,before);
});

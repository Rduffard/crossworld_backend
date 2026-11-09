import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),gear=require('../src/modules/archipelago/equipment');
function check(b,definitionId,extra={}){let item=b.character.inventory.find(i=>i.definitionId===definitionId);if(!item){item=gear.issue({definitionId});b.character.inventory.push(item);}const result=commands.apply(b.character,{operationId:'tool-check-op-001',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type:'tool.check',payload:{instanceId:item.instanceId,eventId:'check-one',confirmed:true,...extra}});b.character={...b.character,...result.changes};return result.result;}
test('plural tool Training grant IDs match singular inventory IDs and add Training once with skill Advantage',()=>{
  const b=build('doctor',3),r=check(b,'navigator-tools',{skillId:'survival',dc:15});assert.equal(r.toolTrained,true);assert.equal(r.skillTrained,true);assert.equal(r.advantage,true);assert.equal(r.rolls.length,2);assert.equal(r.modifier,b.summary.attributeModifiers.instinct+b.summary.trainingBonus);assert.equal(r.total,Math.max(...r.rolls)+r.modifier);
});
test('Expertise doubles one Training Bonus even when both the tool and applicable skill are trained',()=>{
  const b=build('corsair',3),skill=b.summary.expertise[0],r=check(b,'thieves-tools',{skillId:skill,attribute:'agility'});assert.equal(r.expertise,true);assert.equal(r.modifier,b.summary.attributeModifiers.agility+2*b.summary.trainingBonus);assert.equal(r.advantage,true);
});
test('untrained tool checks use the GM-selected attribute without inventing Training',()=>{
  const b=build('doctor',3),r=check(b,'alchemists-supplies',{attribute:'spirit'});assert.equal(r.toolTrained,false);assert.equal(r.modifier,b.summary.attributeModifiers.spirit);assert.equal(r.rolls.length,1);
});
test('Poisoned cancels skill/tool Advantage and Exhaustion subtracts its penalty exactly once',()=>{
  const b=build('doctor',3);b.character.rulesRuntime.conditions=[{conditionId:'poisoned',source:'toxin'}];b.character.rulesRuntime.exhaustion=2;
  const r=check(b,'navigator-tools',{skillId:'survival'});assert.equal(r.advantage,true);assert.equal(r.disadvantage,true);assert.equal(r.rolls.length,1);assert.equal(r.modifier,b.summary.attributeModifiers.instinct+b.summary.trainingBonus-4);
});
test('tool checks reject a duplicate event, preserve saved outcomes on reload, and never consume the tool',()=>{
  const b=build('doctor',3),r=check(b,'navigator-tools'),before=structuredClone(b.character);assert.throws(()=>check(b,'navigator-tools'),/already been resolved/);assert.deepEqual(b.character,before);
  const restored=JSON.parse(JSON.stringify(b.character));assert.deepEqual(restored.rulesRuntime.toolChecks[0],r);assert.equal(restored.inventory.find(i=>i.definitionId==='navigator-tools').quantity,1);
  assert.doesNotThrow(()=>rules.runtime.validate(b.summary,restored.rulesRuntime));
});

test('Safe Handling grants automatic inspection Advantage only from level seven and cancels Disadvantage',()=>{
  for(const level of [6,7]){
    const b=build('gunslinger',level,'cinder-artillerist'),r=check(b,'smith-tools',{task:'inspect-explosives'});
    assert.equal(r.featureAdvantage,level===7);assert.equal(r.advantage,level===7);assert.equal(r.rolls.length,level===7?2:1);
  }
  const b=build('gunslinger',7,'cinder-artillerist'),r=check(b,'smith-tools',{task:'inspect-explosives',disadvantage:true});assert.equal(r.rolls.length,1);assert.equal(r.featureAdvantage,true);
  assert.equal(check(build('gunslinger',7,'cinder-artillerist'),'smith-tools',{task:'general'}).featureAdvantage,false);
});

test('Reinforced Anchorage grants tool Advantage at six for reinforcing structures, without a Bastion cost',()=>{
  for(const level of [5,6]){
    const b=build('shipwright',level,'breakwater'),before=structuredClone(b.character.rulesRuntime.pools),r=check(b,'carpenter-tools',{task:'reinforce-structure'});
    assert.equal(r.featureAdvantage,level===6);assert.equal(r.advantage,level===6);assert.deepEqual(b.character.rulesRuntime.pools,before);
  }
});

test('Ghost Patch applies its chosen trade once per turn, survives reload, and never spends Ghost Work',()=>{
  const b=build('shipwright',3,'drydock-ghost'),task=b.summary.pathSelections.shipwright.ghostTrade;
  assert.ok(['covert-repair','sabotage'].includes(task));
  b.character.inventory.push(gear.issue({definitionId:'carpenter-tools'}));
  const before=structuredClone(b.character),pools=structuredClone(b.character.rulesRuntime.pools);
  assert.throws(()=>check(b,'carpenter-tools',{task}),/turn ID/);assert.deepEqual(b.character,before);
  const first=check(b,'carpenter-tools',{task,turnId:'enemy-one'});assert.equal(first.tradeBonus,Math.max(1,b.summary.attributeModifiers.wit));
  b.character=JSON.parse(JSON.stringify(b.character));
  const second=check(b,'carpenter-tools',{task,turnId:'enemy-one',eventId:'check-two'});assert.equal(second.tradeBonus,0);
  assert.equal(check(b,'carpenter-tools',{task,turnId:'enemy-two',eventId:'check-three'}).tradeBonus,first.tradeBonus);
  assert.equal(check(b,'carpenter-tools',{task:task==='sabotage'?'covert-repair':'sabotage',turnId:'enemy-three',eventId:'check-four'}).tradeBonus,0);
  assert.deepEqual(b.character.rulesRuntime.pools,pools);
});

test('Barometer Instinct scopes tool Advantage to the selected discipline and required attribute',()=>{
  const b=build('navigator',3,'storm-broker'),discipline=b.summary.pathSelections.navigator.stormDiscipline,task=discipline==='weather'?'predict-weather':'interpret-signals',attribute=discipline==='weather'?'instinct':'wit';
  assert.equal(check(b,'navigator-tools',{task,attribute}).featureAdvantage,true);
  assert.equal(check(b,'navigator-tools',{task,attribute:attribute==='wit'?'instinct':'wit',eventId:'wrong-attribute'}).featureAdvantage,false);
  assert.equal(check(b,'navigator-tools',{task:task==='predict-weather'?'interpret-signals':'predict-weather',attribute,eventId:'wrong-discipline'}).featureAdvantage,false);
});
test('Ghost Patch uses the GM-recorded external turn and rejects a forged label',()=>{
  const b=build('shipwright',3,'drydock-ghost'),task=b.summary.pathSelections.shipwright.ghostTrade;
  b.character.inventory.push(gear.issue({definitionId:'carpenter-tools'}));
  b.character.rulesRuntime.inCombat=true;
  assert.throws(()=>check(b,'carpenter-tools',{task,turnId:'forged'}),/current turn ID/);
  b.character.rulesRuntime.externalCastingTurn='gm-turn';
  const first=check(b,'carpenter-tools',{task});
  assert.equal(first.tradeBonus,Math.max(1,b.summary.attributeModifiers.wit));
  const before=structuredClone(b.character);
  assert.throws(()=>check(b,'carpenter-tools',{task,eventId:'another',turnId:'forged'}),/current turn ID/);
  assert.deepEqual(b.character,before);
  assert.equal(check(b,'carpenter-tools',{task,eventId:'another'}).tradeBonus,0);
});

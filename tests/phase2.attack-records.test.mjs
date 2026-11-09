import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands');
function run(b,type,payload){const r=commands.apply(b.character,{operationId:'attack-record-command',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...r.changes};return r.result;}
function attack(b,eventId,targetId='enemy',extra={}){return run(b,'attack.record',{eventId,targetId,attribute:'might',hit:true,reckless:false,confirmed:true,...extra});}
test('Reckless Attack must be chosen on the first attack and survives turn end until the next turn starts',()=>{
  const b=build('reaver',2);run(b,'turn.start',{turnId:'one',confirmed:true});assert.equal(attack(b,'first','enemy',{reckless:true}).recklessAdvantage,true);assert.throws(()=>attack(b,'second','enemy',{reckless:true}),/first attack/);run(b,'turn.end',{turnId:'one',confirmed:true});assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime).attacksAgainstHaveAdvantage,true);run(b,'turn.start',{turnId:'two',confirmed:true});assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime).recklessAttack,false);
});
test('Studied Attacks applies only to the next attack against its target and a new miss renews it',()=>{
  const b=build('gunslinger',13,'deadeye');run(b,'turn.start',{turnId:'one',confirmed:true});assert.equal(attack(b,'miss','a',{hit:false}).studiedAdvantage,false);assert.equal(attack(b,'other','b').studiedAdvantage,false);assert.equal(attack(b,'second-miss','a',{hit:false}).studiedAdvantage,true);assert.equal(attack(b,'hit','a').studiedAdvantage,true);assert.equal(attack(b,'later','a').studiedAdvantage,false);
});
test('Studied Attacks survives into the next turn and expires at that turn end',()=>{
  const b=build('gunslinger',13,'deadeye');run(b,'turn.start',{turnId:'one',confirmed:true});attack(b,'miss','a',{hit:false});run(b,'turn.end',{turnId:'one',confirmed:true});run(b,'turn.start',{turnId:'two',confirmed:true});assert.deepEqual(rules.runtime.project(b.summary,b.character.rulesRuntime).studiedAttackTargets,['a']);run(b,'turn.end',{turnId:'two',confirmed:true});assert.deepEqual(rules.runtime.project(b.summary,b.character.rulesRuntime).studiedAttackTargets,[]);
});
test('A recorded attack consumes Steady Aim, ends Hide and rejects duplicate IDs without changing state',()=>{
  const b=build('corsair',3,'reef-knife');run(b,'turn.start',{turnId:'one',confirmed:true});b.character.rulesRuntime.effects.push({id:'aim',steadyAim:true,nextAttackAdvantage:true,turnId:'one'});b.character.rulesRuntime.conditions.push({conditionId:'invisible',source:'hide'});assert.equal(attack(b,'hit').steadyAimAdvantage,true);assert.equal(b.character.rulesRuntime.effects[0].nextAttackAdvantage,false);assert.equal(b.character.rulesRuntime.conditions.length,0);const before=structuredClone(b.character);assert.throws(()=>attack(b,'hit'),/already recorded/);assert.deepEqual(b.character,before);
});

test('off-turn misses grant Studied Attacks through the next owner turn and cannot choose Reckless Attack',()=>{
  const b=build('gunslinger',13,'deadeye');assert.throws(()=>attack(b,'missing-turn','a',{hit:false}),/external turn/);attack(b,'reaction-miss','a',{hit:false,turnId:'enemy-turn'});run(b,'turn.start',{turnId:'one',confirmed:true});assert.equal(attack(b,'follow-up','a').studiedAdvantage,true);assert.throws(()=>attack(b,'reaction-miss','a'),/already recorded/);run(b,'turn.end',{turnId:'one',confirmed:true});assert.throws(()=>attack(b,'bad-reckless','a',{reckless:true,turnId:'enemy-turn'}),/first attack/);
});

test('Bloodwake Frenzy adds scaled critical dice to only the first Might hit while Raging recklessly',()=>{
  const b=build('reaver',9,'bloodwake');run(b,'turn.start',{turnId:'one',confirmed:true});const option=b.summary.abilityOptions.find(o=>o.handler==='rage');run(b,'ability.activate',{optionId:option.id,targetIds:[],parameters:{confirmed:true}});attack(b,'miss','enemy',{hit:false,reckless:true});const r=attack(b,'first-hit','enemy',{critical:true,damageType:'slashing'});assert.equal(r.frenzy,true);assert.equal(r.rolls.length,6);assert.equal(r.damageType,'slashing');assert.equal(attack(b,'second-hit','other',{damageType:'slashing'}).frenzy,undefined);
});

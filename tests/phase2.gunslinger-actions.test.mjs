import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands');
function activate(c,handler,parameters={},turnId){
  const option=rules.replay(c.rulesLedger).abilityOptions.find(o=>o.handler===handler);
  assert.ok(option,handler);
  return commands.apply(c,{operationId:'gunslinger-action-test',expectedRevision:c.documentRevision,rulesVersion:'SA-CHAR-1',type:'ability.activate',payload:{optionId:option.id,parameters,...(turnId?{turnId}:{})}});
}
test('Tactical Mind spends Second Wind for a successful check and never heals',()=>{
  const c=build('gunslinger',2).character;c.rulesRuntime.health.current=1;
  const result=activate(c,'tactical-mind',{confirmed:true,eventId:'check-one',checkTotal:0,dc:1});
  assert.equal(result.result.rolls.length,1);assert.equal(result.result.success,true);assert.equal(result.result.refunded,false);
  assert.equal(result.changes.rulesRuntime.health.current,1);assert.equal(result.changes.rulesRuntime.pools['gunslinger:second-wind'],1);
  assert.equal(result.changes.rulesRuntime.effects.length,0);
});
test('continued Tactical Mind failure refunds its use but cannot reroll the same check after reload',()=>{
  const c=build('gunslinger',2).character,before=structuredClone(c),params={confirmed:true,eventId:'hard-check',checkTotal:0,dc:100};
  const result=activate(c,'tactical-mind',params);assert.equal(result.result.success,false);assert.equal(result.result.refunded,true);assert.equal(result.changes.rulesRuntime.pools['gunslinger:second-wind'],2);
  const reloaded=JSON.parse(JSON.stringify({...c,...result.changes}));assert.throws(()=>activate(reloaded,'tactical-mind',params),/already resolved/);
  assert.deepEqual(c,before);assert.throws(()=>activate(c,'tactical-mind',{...params,checkTotal:100}),/failed ability check/);
  c.rulesRuntime.pools['gunslinger:second-wind']=0;assert.throws(()=>activate(c,'tactical-mind',params),/Insufficient resource/);
});
test('Action Surge at seventeen has two uses but at most one use on any given turn',()=>{
  const c=build('gunslinger',17).character;
  const first=activate(c,'action-surge',{confirmed:true,extraAction:'attack'},'turn-one');
  assert.equal(first.result.additionalAction,'attack');assert.equal(first.changes.rulesRuntime.pools['gunslinger:action-surge'],1);
  const next={...c,...first.changes};assert.throws(()=>activate(next,'action-surge',{confirmed:true,extraAction:'dash'},'turn-one'),/once on a turn/);
  const second=activate(next,'action-surge',{confirmed:true,extraAction:'dash'},'turn-two');assert.equal(second.changes.rulesRuntime.pools['gunslinger:action-surge'],0);
  assert.throws(()=>activate(c,'action-surge',{confirmed:true,extraAction:'magic'},'turn-one'),/non-Magic action/);
  assert.throws(()=>activate(c,'action-surge',{confirmed:false,extraAction:'attack'},'turn-one'),/confirm it is your turn/);
  const recorded=structuredClone(c);
  recorded.rulesRuntime.inCombat=true;
  recorded.rulesRuntime.externalCastingTurn='enemy';
  assert.throws(()=>activate(recorded,'action-surge',{confirmed:true,extraAction:'attack'},'enemy'),/recorded owner turn/);
  recorded.rulesRuntime.ownerTurn={id:'owner',number:1,open:true};
  const saved=activate(recorded,'action-surge',{confirmed:true,extraAction:'attack'});
  const used={...recorded,...saved.changes};
  assert.throws(()=>activate(used,'action-surge',{confirmed:true,extraAction:'dash'},'fake'),/recorded owner turn/);
  assert.throws(()=>activate(used,'action-surge',{confirmed:true,extraAction:'dash'}),/once on a turn/);
  assert.equal(used.rulesRuntime.pools['gunslinger:action-surge'],1);
  assert.match(rules.runtime.project(rules.replay(used.rulesLedger),used.rulesRuntime).abilityOptions.find(o=>o.handler==='action-surge').unavailableReason,/already used/);
});
test('Tactical Shift is available only on Bonus Action Second Wind beginning at five',()=>{
  const low=activate(build('gunslinger',4).character,'second-wind');assert.equal(low.result.tacticalShift,undefined);
  const high=activate(build('gunslinger',5).character,'second-wind');assert.deepEqual(high.result.tacticalShift,{maximumFeet:15,provokesOpportunityAttacks:false});
  const armored=build('gunslinger',5).character;armored.loadout.armor=armored.inventory.find(i=>i.definitionId==='chain-mail').instanceId;
  assert.equal(activate(armored,'second-wind').result.tacticalShift.maximumFeet,10);
  const mind=activate(build('gunslinger',5).character,'tactical-mind',{confirmed:true,eventId:'check',checkTotal:0,dc:1});assert.equal(mind.result.tacticalShift,undefined);
});

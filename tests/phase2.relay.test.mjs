import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands');
let sequence=0;
function execute(c,type,payload){
  const result=commands.apply(c,{operationId:'relay-test-'+(++sequence),expectedRevision:c.documentRevision,rulesVersion:'SA-CHAR-1',type,payload});
  return {character:{...c,...result.changes},result:result.result};
}
function activate(c,handler,parameters={},targetIds=[]){
  const option=rules.replay(c.rulesLedger).abilityOptions.find(o=>o.handler===handler);
  return execute(c,'ability.activate',{optionId:option.id,parameters,targetIds});
}
function place(c,parameters={}){return activate(c,'relay-place',{confirmed:true,...parameters}).character;}
test('relay creation has exact object statistics, one-relay limit and no partial spend on bad placement',()=>{
  const c=build('shipwright',3,'sparkwrite-aetherist').character,before=structuredClone(c);
  assert.throws(()=>activate(c,'relay-place'),/Confirm unoccupied/);assert.deepEqual(c,before);
  const first=place(c),object=first.rulesRuntime.effects.find(e=>e.objectType==='relay');
  assert.equal(object.guard,15);assert.deepEqual(object.health,{current:6,max:6});assert.deepEqual(object.immunities,['poison','psychic']);
  const second=place(first);assert.equal(second.rulesRuntime.effects.filter(e=>e.objectType==='relay').length,1);
  assert.notEqual(second.rulesRuntime.effects.find(e=>e.objectType==='relay').id,object.id);
  assert.equal(second.rulesRuntime.pools['sparkwrite-aetherist:relay'],1);
});
test('Twin Circuit enforces two relays and an explicit third-relay replacement without extra expenditure',()=>{
  let c=place(place(build('shipwright',14,'sparkwrite-aetherist').character));
  const before=structuredClone(c),ids=c.rulesRuntime.effects.filter(e=>e.objectType==='relay').map(e=>e.id);
  assert.throws(()=>place(c),/Choose which relay/);assert.deepEqual(c,before);
  c=place(c,{replaceObjectId:ids[0]});
  assert.equal(c.rulesRuntime.effects.filter(e=>e.objectType==='relay').length,2);
  assert.ok(c.rulesRuntime.effects.some(e=>e.id===ids[1]));assert.ok(!c.rulesRuntime.effects.some(e=>e.id===ids[0]));
});
test('Grounding Circuit ends immediately when the selected relay is destroyed and respects damage immunity',()=>{
  let c=place(build('shipwright',6,'sparkwrite-aetherist').character),objectId=c.rulesRuntime.effects[0].id;
  c=activate(c,'relay-proximity',{objectId,withinTenFeet:true}).character;
  let summary=rules.runtime.project(rules.replay(c.rulesLedger),c.rulesRuntime);
  assert.ok(summary.resistances.includes('lightning'));assert.equal(summary.concentrationSaveAdvantage,true);
  c=execute(c,'object.damage',{effectId:objectId,amount:100,damageType:'poison'}).character;
  assert.equal(c.rulesRuntime.effects[0].health.current,12);
  c=execute(c,'object.damage',{effectId:objectId,amount:12,damageType:'force'}).character;
  summary=rules.runtime.project(rules.replay(c.rulesLedger),c.rulesRuntime);
  assert.equal(c.rulesRuntime.effects.length,0);assert.ok(!summary.resistances.includes('lightning'));assert.equal(summary.concentrationSaveAdvantage,false);
});
test('mobile relay movement rejects grounded objects and requires bounded confirmed movement',()=>{
  let c=build('shipwright',6,'sparkwrite-aetherist').character;
  c.rulesLedger.levels[2].choices.pathDiscipline=['mobile'];c=place(c);const objectId=c.rulesRuntime.effects[0].id;
  assert.throws(()=>activate(c,'relay-move',{objectId,distanceFeet:16,confirmed:true}),/15 feet/);
  c=activate(c,'relay-move',{objectId,distanceFeet:15,confirmed:true}).character;
  assert.equal(c.rulesRuntime.effects.length,1);assert.equal(c.rulesRuntime.effects[0].lastMovementFeet,15);
  const grounded=place(build('shipwright',6,'sparkwrite-aetherist').character);
  assert.throws(()=>activate(grounded,'relay-move',{objectId:grounded.rulesRuntime.effects[0].id,distanceFeet:5,confirmed:true}));
});
for(const [level,dice] of [[10,4],[14,6]])test(`Discharge at ${level} consumes one use, destroys only its relay and rolls ${dice}d8`,()=>{
  let c=place(build('shipwright',level,'sparkwrite-aetherist').character);
  if(level===14)c=place(c);
  const before=c.rulesRuntime.effects.length,id=c.rulesRuntime.effects[0].id,pool=c.rulesRuntime.pools['sparkwrite-aetherist:relay'];
  const base=rules.replay(c.rulesLedger),option=base.abilityOptions.find(o=>o.handler==='relay-discharge');
  assert.equal(option.preview.roll.count,dice);
  assert.equal(rules.runtime.project(base,c.rulesRuntime,c).abilityOptions.find(o=>o.id===option.id).available,true);
  const output=activate(c,'relay-discharge',{objectId:id,confirmed:true},['ally','foe']);
  assert.equal(output.result.rolls.length,dice);assert.equal(output.result.damage,output.result.rolls.reduce((a,b)=>a+b,0));
  assert.equal(output.result.save.dc,rules.replay(c.rulesLedger).spellcasting.shipwright.saveDC);
  assert.equal(output.result.save.dc,option.preview.save.dc);
  assert.equal(output.result.save.successDamage,Math.floor(output.result.damage/2));
  assert.deepEqual(output.result.discharge,{relayId:id,targetIds:['ally','foe']});
  if(level===10)assert.equal(rules.runtime.project(base,output.character.rulesRuntime,output.character).abilityOptions.find(o=>o.id===option.id).unavailableReason,'Place a live relay first');
  assert.equal(output.character.rulesRuntime.effects.length,before-1);assert.equal(output.character.rulesRuntime.pools['sparkwrite-aetherist:relay'],pool-1);
});
test('relay cantrip origin and Twin Circuit teleport are independently once per turn and reject dead or foreign relay IDs',()=>{
  let c=place(place(build('shipwright',14,'sparkwrite-aetherist').character));
  const [from,to]=c.rulesRuntime.effects.map(e=>e.id),s=rules.replay(c.rulesLedger);
  const cantrip={callingId:'shipwright',spellId:s.spellcasting.shipwright.cantrips[0],source:'slot',turnId:'round-1',parameters:{originRelayId:from,relayOriginConfirmed:true}};
  c=execute(c,'spell.cast',cantrip).character;
  assert.throws(()=>execute(c,'spell.cast',cantrip),/one cantrip per turn/);
  const spell=s.spellcasting.shipwright.prepared.find(id=>!rules.blueprint.spells.find(s=>s.id===id).specificMaterial);
  const cast={callingId:'shipwright',spellId:spell,slotLevel:1,source:'slot',turnId:'round-2',parameters:{teleport:{from,to,confirmed:true}}};
  c=execute(c,'spell.cast',cast).character;
  assert.equal(c.rulesRuntime.effects.find(e=>e.id===to).withinTenFeet,true);
  const before=structuredClone(c);
  assert.throws(()=>execute(c,'spell.cast',{...cast,source:'mastery'}));assert.deepEqual(c,before);
  assert.throws(()=>execute(c,'spell.cast',{...cast,turnId:'round-3',parameters:{teleport:{from,to:'foreign',confirmed:true}}}),/two live relays/);
});

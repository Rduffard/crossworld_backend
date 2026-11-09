import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),gear=require('../src/modules/archipelago/equipment'),materials=require('../src/modules/archipelago/system/rules2024/spellMaterials');
function ready(spellId,level=5){
  const c=build('doctor',level).character;
  if(!rules.replay(c.rulesLedger).spellcasting.doctor.alwaysPrepared.includes(spellId)&&!c.rulesRuntime.preparations.doctor.includes(spellId))c.rulesRuntime.preparations.doctor[c.rulesRuntime.preparations.doctor.length-1]=spellId;
  return c;
}
function cast(c,spellId,materialIds=[],targets=[]){const spell=rules.blueprint.spells.find(s=>s.id===spellId);const x=commands.apply(c,{operationId:'material-command-001',expectedRevision:c.documentRevision,rulesVersion:'SA-CHAR-1',type:'spell.cast',payload:{callingId:'doctor',spellId,slotLevel:spell.level,materialIds,targets}});return {...c,...x.changes,result:x.result};}
function item(c,kind,value,quantity=1){const d=rules.blueprint.equipment.items.find(d=>d.componentKind===kind&&d.componentValueCp===value);assert.ok(d,kind+' '+value);const i=gear.issue({definitionId:d.id,quantity});c.inventory.push(i);return i;}
test('every priced spell has a typed material profile and every referenced purchasable component has a server definition',()=>{
  const priced=rules.blueprint.spells.filter(s=>s.specificMaterial);assert.equal(priced.length,54);
  assert.deepEqual(priced.map(s=>s.id).sort(),Object.keys(materials.requirements).sort());
  for(const requirements of Object.values(materials.requirements))for(const r of requirements){
    assert.ok(Number.isSafeInteger(r.minValueCp));assert.ok(r.minValueCp>0);
    assert.ok(r.kind==='holy-symbol'||materials.items.some(i=>i.componentKind===r.kind&&i.componentValueCp>=r.minValueCp));
  }
});
test('Revivify rejects wrong or undervalued items without spending slots, and consumes exactly one valid diamond',()=>{
  const c=ready('revivify'),cheap=item(c,'diamond',5000),diamond=item(c,'diamond',30000),before=structuredClone(c);
  assert.throws(()=>cast(c,'revivify',[cheap.instanceId]),/diamond worth at least/);assert.deepEqual(c,before);
  const next=cast(c,'revivify',[diamond.instanceId]);assert.ok(!next.inventory.some(i=>i.instanceId===diamond.instanceId));
  assert.ok(next.inventory.some(i=>i.instanceId===cheap.instanceId));assert.equal(next.rulesRuntime.slots[2],c.rulesRuntime.slots[2]-1);assert.equal(next.result.consumedMaterials.length,1);
});
test('Bless retains its actual Holy Symbol and rejects narrative items masquerading as one',()=>{
  const c=ready('bless',1),fake=gear.issue({customName:'Holy Symbol'});c.inventory.push(fake);
  assert.throws(()=>cast(c,'bless',[fake.instanceId]),/catalog inventory/);
  const symbol=gear.issue({definitionId:'holy-symbol'});c.inventory.push(symbol);const next=cast(c,'bless',[symbol.instanceId]);
  assert.equal(next.inventory.find(i=>i.instanceId===symbol.instanceId).quantity,1);assert.deepEqual(next.result.consumedMaterials,[]);
});
test('compound Legend Lore materials consume incense and retain exactly four sufficiently valuable ivory strips',()=>{
  const c=ready('legend-lore',9),incense=item(c,'incense',25000),strips=item(c,'ivory-strip',5000,4);
  const before=structuredClone(c);c.inventory.find(i=>i.instanceId===strips.instanceId).quantity=3;
  assert.throws(()=>cast(c,'legend-lore',[incense.instanceId,strips.instanceId]),/ivory-strip/);c.inventory=before.inventory;
  const next=cast(c,'legend-lore',[incense.instanceId,strips.instanceId]);assert.ok(!next.inventory.some(i=>i.instanceId===incense.instanceId));assert.equal(next.inventory.find(i=>i.instanceId===strips.instanceId).quantity,4);
});
test('per-target Astral Projection materials scale by declared targets and reject incomplete sets atomically',()=>{
  const c=ready('astral-projection',17),gem=item(c,'jacinth',100000,2),silver=item(c,'silver-bar',10000,2),before=structuredClone(c);
  assert.throws(()=>cast(c,'astral-projection',[gem.instanceId,silver.instanceId],['caster','ally','other']),/jacinth/);assert.deepEqual(c,before);
  const next=cast(c,'astral-projection',[gem.instanceId,silver.instanceId],['caster','ally']);assert.ok(!next.inventory.some(i=>[gem.instanceId,silver.instanceId].includes(i.instanceId)));
});
test('Gentle Repose consumes two copper exactly and duplicate component instance IDs cannot double-count inventory',()=>{
  const c=ready('gentle-repose',3);c.goldCp=3;const next=cast(c,'gentle-repose');assert.equal(next.goldCp,1);
  assert.throws(()=>cast({...c,goldCp:1},'gentle-repose'),/two copper/);
  const revive=ready('revivify'),diamond=item(revive,'diamond',30000);
  assert.throws(()=>cast(revive,'revivify',[diamond.instanceId,diamond.instanceId]),/distinct component/);
});

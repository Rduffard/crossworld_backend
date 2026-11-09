import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),gear=require('../src/modules/archipelago/equipment');
function execute(c,type,payload){const output=commands.apply(c,{operationId:'inventory-test-0001',expectedRevision:c.documentRevision,rulesVersion:'SA-CHAR-1',type,payload});return {...c,...output.changes,operationResult:output.result};}
test('mandatory supply prices, ammo pack sizes and exact copper purchases reject overspending atomically',()=>{
  const c=build('gunslinger').character;c.goldCp=401;
  const bought=execute(c,'equipment.buy',{definitionId:'bullets',quantity:1}),bullets=bought.inventory.find(i=>i.definitionId==='bullets');
  assert.equal(bought.goldCp,101);assert.equal(bullets.quantity,10);assert.equal(bought.operationResult.costCp,300);
  assert.equal(gear.definition('healer-kit').costCp,500);assert.equal(gear.definition('healing-potion').weightLb,0.5);
  const before=structuredClone(bought);assert.throws(()=>execute(bought,'equipment.buy',{definitionId:'bullets',quantity:1}),/Insufficient copper/);assert.deepEqual(bought,before);
  assert.throws(()=>execute(c,'equipment.buy',{definitionId:'bullets',quantity:0}),/positive integer/);
  assert.throws(()=>execute(c,'equipment.buy',{definitionId:'bullets',quantity:1,costCp:0}),/Invalid inventory/);
  assert.doesNotThrow(()=>execute(bought,'equipment.equip',{loadout:bought.loadout}));
});
test('kit charges never refill when consuming or reloading; potion healing rolls are server-owned and capped',()=>{
  let c=build('doctor').character;c.goldCp=10000;c.rulesRuntime.health.current=1;
  c=execute(c,'equipment.buy',{definitionId:'healer-kit',quantity:1});const kit=c.inventory.at(-1);
  c=execute(c,'equipment.consume',{instanceId:kit.instanceId,quantity:3});assert.equal(c.inventory.at(-1).chargesCurrent,7);
  c=execute(c,'equipment.buy',{definitionId:'healing-potion',quantity:1});const potion=c.inventory.at(-1);
  c=execute(c,'equipment.consume',{instanceId:potion.instanceId,quantity:1});
  assert.equal(c.operationResult.rolls.length,2);assert.equal(c.operationResult.healing,c.operationResult.rolls.reduce((a,b)=>a+b,2));
  assert.equal(c.rulesRuntime.health.current,Math.min(c.rulesRuntime.health.max,1+c.operationResult.healing));
  assert.ok(!c.inventory.some(i=>i.instanceId===potion.instanceId));assert.equal(c.inventory.find(i=>i.instanceId===kit.instanceId).chargesCurrent,7);
});
test('split and merge conserve exact ammunition and reject incompatible or self stacks',()=>{
  let c=build('gunslinger').character;c.goldCp=1000;c=execute(c,'equipment.buy',{definitionId:'bullets',quantity:1});const id=c.inventory.at(-1).instanceId;
  c=execute(c,'equipment.split',{instanceId:id,quantity:3});const split=c.operationResult.instanceId;
  assert.equal(c.inventory.find(i=>i.instanceId===id).quantity,7);assert.equal(c.inventory.find(i=>i.instanceId===split).quantity,3);
  c=execute(c,'equipment.merge',{from:split,to:id});assert.equal(c.inventory.find(i=>i.instanceId===id).quantity,10);
  assert.throws(()=>execute(c,'equipment.merge',{from:id,to:id}),/different stacks/);
  const before=structuredClone(c);assert.throws(()=>execute(c,'equipment.split',{instanceId:id,quantity:10}),/leaving at least one/);assert.deepEqual(c,before);
});
test('presets validate every owned instance and incompatible hands before changing the loadout',()=>{
  let c=build('gunslinger').character;const sword=c.inventory.find(i=>i.definitionId==='greatsword');
  const loadout={...c.loadout,mainHand:sword.instanceId,grip:'two'};
  c=execute(c,'equipment.preset.save',{id:'two-handed',name:'Greatsword',loadout});
  assert.equal(c.loadout.mainHand,null);c=execute(c,'equipment.preset.apply',{id:'two-handed'});assert.deepEqual(c.loadout,loadout);
  c.loadout={mainHand:null,offHand:null,armor:null,grip:'one'};c.inventory=c.inventory.filter(i=>i.instanceId!==sword.instanceId);
  const before=structuredClone(c);assert.throws(()=>execute(c,'equipment.preset.apply',{id:'two-handed'}),/owned canonical/);assert.deepEqual(c,before);
});
function armed(powder=false){
  const c=build('gunslinger',5).character;c.goldCp=2000;
  if(powder)c.rulesLedger.levels[3].choices={...c.rulesLedger.levels[3].choices,feat:'powder-drill',increases:{agility:1}};
  const pistol=gear.issue({definitionId:'pistol'}),ammo=gear.issue({definitionId:'bullets',quantity:20});c.inventory.push(pistol,ammo);c.loadout.mainHand=pistol.instanceId;
  return {c,weaponId:pistol.instanceId,ammunitionId:ammo.instanceId};
}
test('pistol Loading allows one shot per Action, requires a free hand and spends exactly one bullet',()=>{
  const {c,...payload}=armed();const fire={...payload,actionId:'round1-action1',actionType:'attack',shots:1};
  const next=execute(c,'equipment.fire',fire);assert.equal(next.inventory.find(i=>i.instanceId===payload.ammunitionId).quantity,19);
  assert.throws(()=>execute(next,'equipment.fire',fire),/Loading limits/);
  const shield=gear.issue({definitionId:'shield'});c.inventory.push(shield);c.loadout.offHand=shield.instanceId;
  assert.throws(()=>execute(c,'equipment.fire',fire),/free loading hand/);
});

test('an unequipped matching ranged weapon cannot masquerade as ammunition',()=>{
  const {c,...payload}=armed(),spare=gear.issue({definitionId:'pistol'});c.inventory.push(spare);const before=structuredClone(c);assert.throws(()=>execute(c,'equipment.fire',{...payload,ammunitionId:spare.instanceId,shots:1,actionId:'forged-ammo',actionType:'attack'}),/matching ammunition/);assert.deepEqual(c,before);
});
test('Powder Drill allows two level-five firearm shots but grants no attacks and does not bypass crossbow Loading',()=>{
  const {c,...payload}=armed(true),fire={...payload,actionId:'round1-action1',actionType:'attack',shots:2};
  const next=execute(c,'equipment.fire',fire);assert.equal(next.inventory.find(i=>i.instanceId===payload.ammunitionId).quantity,18);
  assert.equal(rules.replay(c.rulesLedger).attacksPerAction,2);assert.throws(()=>execute(next,'equipment.fire',{...fire,shots:1}),/Extra Attack/);
  assert.throws(()=>execute(c,'equipment.fire',{...fire,actionType:'reaction'}),/Extra Attack/);
  const crossbow=gear.issue({definitionId:'hand-crossbow'}),bolts=gear.issue({definitionId:'bolts',quantity:20});c.inventory.push(crossbow,bolts);c.loadout.mainHand=crossbow.instanceId;
  assert.equal(gear.derive(c).attacks[0].maxShotsPerAction,1);
  assert.throws(()=>execute(c,'equipment.fire',{...fire,weaponId:crossbow.instanceId,ammunitionId:bolts.instanceId}),/Loading/);
});

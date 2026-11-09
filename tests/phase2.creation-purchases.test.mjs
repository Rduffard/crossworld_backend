import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),equipment=require('../src/modules/archipelago/characters/creationEquipment'),characters=require('../src/modules/archipelago/characters/rules2024');
test('creation purchases use both package balances and issue canonical instances without changing the ledger',()=>{
  const b=build('gunslinger'),ledger=structuredClone(b.ledger),base=equipment.build(ledger),purchases=[{definitionId:'dagger',quantity:2},{definitionId:'arrows',quantity:1}],next=equipment.build(ledger,purchases);assert.equal(next.goldCp,base.goldCp-500);assert.equal(next.inventory.filter(i=>i.definitionId==='dagger').length,2);assert.equal(next.inventory.find(i=>i.definitionId==='arrows').quantity,20);assert.deepEqual(ledger,b.ledger);assert.deepEqual(next.loadout,{mainHand:null,offHand:null,armor:null,grip:'one'});
});
test('unaffordable, forged and magic-item creation purchases fail with their basket field path',()=>{
  const ledger=build('gunslinger').ledger;
  for(const purchase of [{definitionId:'plate-armor',quantity:1},{definitionId:'dagger',quantity:-1},{definitionId:'dagger',quantity:1,costCp:0},{definitionId:'cloak-of-protection',quantity:1}])assert.throws(()=>equipment.build(ledger,[purchase]),e=>e.fieldPath==='purchases.0');
  assert.throws(()=>equipment.build(ledger,{}),e=>e.fieldPath==='purchases');
});
test('creation save and preview inventory totals agree and repeated previews never charge a draft',()=>{
  const ledger=build('gunslinger').ledger,purchases=[{definitionId:'dagger',quantity:1}],first=equipment.display(equipment.build(ledger,purchases)),second=equipment.display(equipment.build(ledger,purchases)),saved=characters.build({name:'Purchasing sailor',attributes:ledger.baseAttributes,creation:ledger.creation,firstLevel:ledger.levels[0],purchases});assert.deepEqual(first,second);assert.deepEqual(equipment.display(saved),first);assert.equal(saved.documentRevision,0);assert.equal(saved.rulesRuntime.health.current,saved.rulesRuntime.health.max);
});

test('priced scroll purchases require an exact matching spell and issue usable identified scrolls',()=>{
  const ledger=build('gunslinger').ledger;ledger.levels[0].choices.equipment=['starting-gold'];const base=equipment.build(ledger),next=equipment.build(ledger,[{definitionId:'spell-scroll-cantrip',spellId:'fire-bolt',quantity:2}]);
  const scrolls=next.inventory.filter(i=>i.definitionId==='spell-scroll');assert.equal(scrolls.length,2);assert.equal(new Set(scrolls.map(i=>i.instanceId)).size,2);assert.ok(scrolls.every(i=>i.spellId==='fire-bolt'&&i.quantity===1));assert.equal(next.goldCp,base.goldCp-6000);
  for(const spellId of [undefined,'magic-missile','unknown'])assert.throws(()=>equipment.build(ledger,[{definitionId:'spell-scroll-cantrip',spellId}]),/exact registered spell/);
});

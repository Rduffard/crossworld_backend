import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),gear=require('../src/modules/archipelago/equipment'),bundles=require('../src/modules/archipelago/equipment/bundles'),commands=require('../src/modules/archipelago/characters/commands');
function command(c,type,payload){const r=commands.apply(c,{operationId:'gear-catalog-0001',rulesVersion:'SA-CHAR-1',expectedRevision:c.documentRevision,type,payload});return {...c,...r.changes,result:r.result};}
test('all seven packs unpack exact components, retain per-unit quantities and never create an extra phantom pack',()=>{
  const packs=rules.blueprint.equipment.items.filter(i=>i.contents);assert.equal(packs.length,7);
  for(const pack of packs){const inventory=bundles.issue(pack.id);assert.ok(inventory.every(i=>i.definitionId&&!gear.definition(i.definitionId).contents));
    for(const e of pack.contents)assert.equal(inventory.filter(i=>i.definitionId===e.definitionId).reduce((s,i)=>s+i.quantity,0),e.quantity,pack.id+' '+e.definitionId);
    assert.equal(new Set(inventory.map(i=>i.instanceId)).size,inventory.length);
  }
  const explorer=bundles.issue('explorers-pack');assert.equal(explorer.find(i=>i.definitionId==='rations').quantity,10);assert.equal(explorer.find(i=>i.definitionId==='torch').quantity,10);
});
test('pack purchases charge once at pack price, expand multiple copies and reject overspending atomically',()=>{
  const c=build('gunslinger').character;c.goldCp=2500;const next=command(c,'equipment.buy',{definitionId:'explorers-pack',quantity:2});
  assert.equal(next.goldCp,500);assert.equal(next.result.costCp,2000);assert.equal(next.inventory.filter(i=>i.definitionId==='rations').reduce((s,i)=>s+i.quantity,0)-c.inventory.filter(i=>i.definitionId==='rations').reduce((s,i)=>s+i.quantity,0),20);
  const before=structuredClone(c);assert.throws(()=>command(c,'equipment.buy',{definitionId:'explorers-pack',quantity:3}),/Insufficient copper/);assert.deepEqual(c,before);
});
test('every Calling starting package grants functional catalog pack contents and Shipwright gets a real arcane staff',()=>{
  const starting=require('../src/modules/archipelago/system/rules2024/equipment');
  for(const calling of rules.blueprint.callings)for(const choice of starting.options(calling.id).filter(x=>x!=='starting-gold')){
    const inventory=starting.issue(calling.id,choice).inventory;assert.ok(inventory.every(i=>i.definitionId),calling.id+' '+choice);assert.ok(inventory.some(i=>i.definitionId==='tinderbox'));gear.validateInventory(inventory);
  }
  const staff=starting.issue('shipwright','pack-a').inventory.find(i=>i.definitionId==='arcane-focus-staff');assert.ok(staff);assert.equal(gear.definition(staff.definitionId).focus,'arcane');assert.equal(gear.definition(staff.definitionId).damage.sides,6);
});
test('background gear is canonical where defined and instrument selection grants the selected instrument',()=>{
  const creation=require('../src/modules/archipelago/system/rules2024/creation');
  const archive=creation.equipment({backgroundId:'archive-apprentice',equipment:'pack'}).inventory;
  assert.equal(archive.find(i=>i.definitionId==='paper').quantity,10);assert.ok(archive.some(i=>i.definitionId==='calligrapher-tools'));
  const oath=creation.equipment({backgroundId:'oath-witness',equipment:'pack'},{instrument:['flute']}).inventory;assert.ok(oath.some(i=>i.definitionId==='flute'));
});
test('carried weight divides ammunition purchase weights across rounds and includes expanded pack contents',()=>{
  const c=build('corsair').character;c.inventory=[...bundles.issue('explorers-pack'),...bundles.issue('arrows',20)];c.loadout={armor:null,mainHand:null,offHand:null,grip:'one'};
  const d=gear.derive(c);assert.equal(d.carrying.knownWeightLb,56);assert.equal(d.carrying.capacityLb,c.attributes.might*15);assert.equal(d.carrying.pushDragLiftLb,c.attributes.might*30);
  c.inventory.push(gear.issue({customName:'Narrative keepsake'}));assert.equal(gear.derive(c).carrying.unknownWeightInstances.length,1);
});
test('catalog tool prices, weights, ability checks and instrument variants preserve source rules',()=>{
  const tools=[['alchemists-supplies',5000,8,'wit'],['cartographers-tools',1500,6,'instinct'],['cobblers-tools',500,5,'agility'],['cooks-utensils',100,8,'instinct'],['weavers-tools',100,5,'agility']];
  for(const [id,cp,lb,attribute] of tools){const d=gear.definition(id);assert.equal(d.costCp,cp);assert.equal(d.weightLb,lb);assert.equal(d.toolAbility,attribute);assert.ok(d.description.includes('DC'));}
  assert.equal(gear.definition('pan-flute').costCp,1200);assert.equal(gear.definition('sling-bullets').units,20);
});

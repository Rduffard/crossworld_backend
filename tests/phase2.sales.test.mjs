import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),gear=require('../src/modules/archipelago/equipment');
function run(c,type,payload){const r=commands.apply(c,{operationId:'sale-operation-001',rulesVersion:'SA-CHAR-1',expectedRevision:c.documentRevision,type,payload});return {...c,...r.changes,result:r.result};}
test('selling part of a stack grants exact integer copper and leaves the rest unchanged',()=>{
  const c=build('gunslinger').character,item=gear.issue({definitionId:'bullets',quantity:10});c.inventory.push(item);const before=c.goldCp,next=run(c,'equipment.sell',{instanceId:item.instanceId,quantity:3,proceedsCp:47,reason:'Dock merchant'});assert.equal(next.goldCp,before+47);assert.equal(next.inventory.find(i=>i.instanceId===item.instanceId).quantity,7);assert.equal(c.inventory.find(i=>i.instanceId===item.instanceId).quantity,10);
});
test('sale of equipped gear requires explicit unequip and invalidates presets without dangling loadout',()=>{
  const c=build('warden',3,'iron-covenant').character,shield=c.inventory.find(i=>i.definitionId==='shield');c.loadout.offHand=shield.instanceId;
  const ability=rules.replay(c.rulesLedger).abilityOptions.find(o=>o.handler==='covenant-steel');const active=run(c,'ability.activate',{optionId:ability.id,targetIds:[],parameters:{objectId:shield.instanceId,confirmed:true}}),withPreset=run(active,'equipment.preset.save',{id:'shield',name:'Shield',loadout:active.loadout});
  const payload={instanceId:shield.instanceId,quantity:1,proceedsCp:500,reason:'Trade Shield'};assert.throws(()=>run(withPreset,'equipment.sell',payload),/unequip/);const sold=run(withPreset,'equipment.sell',{...payload,unequip:true});assert.equal(sold.loadout.offHand,null);assert.ok(!sold.inventory.some(i=>i.instanceId===shield.instanceId));assert.ok(!sold.rulesRuntime.effects.some(e=>e.shieldInstanceId===shield.instanceId));assert.throws(()=>run(sold,'equipment.preset.apply',{id:'shield'}),/owned/);
});
test('sale rejects forged quantity, price, fields and campaign-player permission atomically',()=>{
  const c=build('gunslinger').character,item=c.inventory[0],base={instanceId:item.instanceId,quantity:1,proceedsCp:100,reason:'Merchant'};
  for(const p of [{...base,quantity:0},{...base,quantity:item.quantity+1},{...base,proceedsCp:-1},{...base,proceedsCp:0.5},{...base,costCp:1}])assert.throws(()=>run(c,'equipment.sell',p));
  const campaign={...c,campaignId:'campaign'};assert.throws(()=>run(campaign,'equipment.sell',base),e=>e.statusCode===403);
});

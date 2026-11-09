import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),gear=require('../src/modules/archipelago/equipment'),components=require('../src/modules/archipelago/system/rules2024/spellComponents'),meta=require('../src/modules/archipelago/system/rules2024/metamagic'),slots=require('../src/modules/archipelago/system/rules2024/slotCasting');
const spell=id=>rules.blueprint.spells.find(s=>s.id===id);
function validate(c,id,options=[],calling='shipwright'){const s=spell(id);return components.validate(c,s,meta.project(s,options),calling);}
test('Somatic-only spells need a free hand even when holding an arcane staff and shield',()=>{
  const c=build('shipwright',3).character,staff=c.inventory.find(i=>i.definitionId==='arcane-focus-staff'),shield=gear.issue({definitionId:'shield'});c.inventory.push(shield);c.loadout={mainHand:staff.instanceId,offHand:shield.instanceId,armor:null,grip:'one'};
  assert.throws(()=>validate(c,'shield'),/Somatic components/);c.loadout.offHand=null;assert.doesNotThrow(()=>validate(c,'shield'));
});
test('a held focus performs S and unpriced M together; a narrative imitation or wrong-class focus cannot',()=>{
  const c=build('shipwright',3).character,staff=c.inventory.find(i=>i.definitionId==='arcane-focus-staff'),shield=gear.issue({definitionId:'shield'});c.inventory.push(shield);c.loadout={mainHand:staff.instanceId,offHand:shield.instanceId,armor:null,grip:'one'};
  assert.equal(validate(c,'fireball').focusId,staff.instanceId);
  c.inventory=c.inventory.filter(i=>i.instanceId!==staff.instanceId);c.loadout.mainHand=null;assert.throws(()=>validate(c,'fireball'),/proper focus/);
  c.inventory.push(gear.issue({customName:'Arcane Focus'}));assert.throws(()=>validate(c,'fireball'),/proper focus/);
});
test('Subtle removes hand components but actual priced materials still need handling and inventory',()=>{
  const c=build('tidecaller',3).character,a=gear.issue({definitionId:'dagger'}),b=gear.issue({definitionId:'dagger'});c.inventory.push(a,b);c.loadout={mainHand:a.instanceId,offHand:b.instanceId,armor:null,grip:'one'};
  assert.doesNotThrow(()=>validate(c,'fireball',['subtle-spell'],'tidecaller'));assert.throws(()=>validate(c,'chromatic-orb',['subtle-spell'],'tidecaller'),/priced or consumed/);
});
test('two-hand grip occupies both hands while merely carrying a staff in one hand leaves the other available',()=>{
  const c=build('shipwright',3).character,staff=c.inventory.find(i=>i.definitionId==='arcane-focus-staff');c.loadout={mainHand:staff.instanceId,offHand:null,armor:null,grip:'two'};
  assert.throws(()=>validate(c,'shield'),/free hand/);c.loadout.grip='one';assert.doesNotThrow(()=>validate(c,'shield'));
});
test('Spell Recall matches each slot level on a d4 without creating slots or consuming created-slot accounting',()=>{
  for(let level=1;level<=4;level++)for(let roll=1;roll<=4;roll++){
    const state={slots:[1,1,1,1],createdSlots:[1,1,1,1]},r=slots.spend(state,level,true,()=>roll);
    assert.equal(r.spentSlot,roll!==level);assert.equal(state.slots[level-1],roll===level?1:0);assert.equal(state.createdSlots[level-1],roll===level?1:0);
  }
});
test('Spell Recall does not apply without its feat, to level-five slots, or to an unavailable slot',()=>{
  const state={slots:[1,1,1,1,1],createdSlots:[0,0,0,0,0]},unexpected=()=>{throw Error('should not roll');};
  assert.equal(slots.spend(state,1,false,unexpected).spentSlot,true);assert.equal(slots.spend(state,5,true,unexpected).spentSlot,true);assert.throws(()=>slots.spend(state,1,true),/available spell slot/);
});

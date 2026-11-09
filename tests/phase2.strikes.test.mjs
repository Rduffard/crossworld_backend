import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),gear=require('../src/modules/archipelago/equipment');
function command(b,type,payload){const r=commands.apply(b.character,{operationId:'strike-command-001',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...r.changes};return r.result;}
function ready(calling,level,path){const b=build(calling,level,path),weapon=b.character.inventory.find(i=>i.definitionId===(calling==='corsair'?'shortsword':'greataxe'));b.character.loadout.mainHand=weapon.instanceId;b.character.loadout.grip=calling==='reaver'?'two':'one';b.weaponId=weapon.instanceId;return b;}
function strike(b,options=[],extra={}){return command(b,'strike.resolve',{kind:b.summary.callingLevels.corsair?'cunning':'brutal',options,weaponId:b.weaponId,targetId:'foe',targetSize:'medium',turnId:'turn-one',eventId:'hit-one',confirmed:true,...extra});}
test('Sneak Attack rolls its full level-one dice before Cunning Strike unlocks and never adds the victim condition to the owner',()=>{
  const b=ready('corsair',1),r=strike(b);assert.equal(r.rolls.length,1);assert.equal(r.costDice,0);assert.equal(r.damageDice,1);
  assert.throws(()=>strike(ready('corsair',3),['trip']),/available strike/);
});
test('Cunning Strike removes dice before rolling, scales to two options at eleven, and rejects over-budget choices',()=>{
  let b=ready('corsair',5);let r=strike(b,['trip']);assert.equal(r.rolls.length,2);assert.equal(r.effects[0].save.dc,8+b.summary.trainingBonus+b.summary.attributeModifiers.agility);assert.equal(r.effects[0].targetCondition,'prone');assert.ok(!rules.runtime.project(b.summary,b.character.rulesRuntime).conditions.includes('prone'));
  assert.throws(()=>strike(ready('corsair',10),['trip','withdraw']),/feature limit/);
  b=ready('corsair',11);r=strike(b,['trip','withdraw']);assert.equal(r.costDice,2);assert.equal(r.rolls.length,4);assert.equal(r.effects[1].movementFeet,15);
  assert.throws(()=>strike(ready('corsair',14),['knock-out','obscure']),/exceed Sneak Attack/);
});
test('Poison requires a real carried kit, Trip rejects Huge targets, and invalid choices preserve state',()=>{
  const b=ready('corsair',5),before=structuredClone(b.character);assert.throws(()=>strike(b,['poison']),/Poisoner kit/);assert.deepEqual(b.character,before);
  b.character.inventory.push(gear.issue({definitionId:'poisoner-kit'}));const r=strike(b,['poison']);assert.equal(r.effects[0].repeatSave,'end-of-target-turn');assert.equal(r.effects[0].expiresAt-r.effects[0].createdAt,60000);
  assert.throws(()=>strike(ready('corsair',5),['trip'],{targetSize:'huge'}),/Large-or-smaller/);
});
test('Devious Strikes unlock at fourteen and critical hits double only remaining Sneak Attack dice',()=>{
  assert.throws(()=>strike(ready('corsair',13),['daze']),/available strike/);
  const b=ready('corsair',20),r=strike(b,['knock-out','obscure'],{critical:true});assert.equal(r.costDice,9);assert.equal(r.damageDice,1);assert.equal(r.rolls.length,2);assert.equal(r.effects[0].endsOnTargetDamage,true);assert.equal(r.effects[1].ends,'end-of-target-next-turn');assert.equal(new Set(r.effects.map(e=>e.id)).size,2);
});
test('Sneak Attack cannot be spent twice on the same turn but is available on a different reaction turn',()=>{
  const b=ready('corsair',5);strike(b,['withdraw']);assert.throws(()=>strike(b,[],{eventId:'other-hit'}),/already been used/);assert.doesNotThrow(()=>strike(b,[],{turnId:'enemy-turn',eventId:'reaction-hit'}));
});
test('Sneak Attack uses recorded owner and reaction turns and rejects a fabricated label without changing state',()=>{
  const b=ready('corsair',5);
  command(b,'initiative.record',{combatId:'battle',roll:10,confirmed:true});
  assert.throws(()=>strike(b),/recorded encounter turn/);
  command(b,'turn.start',{turnId:'turn-one',confirmed:true});
  assert.equal(strike(b,[],{turnId:undefined}).turnId,'turn-one');
  const before=structuredClone(b.character);
  assert.throws(()=>strike(b,[],{turnId:'forged',eventId:'another-hit'}),/recorded encounter turn/);
  assert.throws(()=>strike(b,[],{turnId:undefined,eventId:'another-hit'}),/already been used/);
  assert.deepEqual(b.character,before);
  command(b,'turn.end',{turnId:'turn-one',confirmed:true});
  command(b,'turn.external',{turnId:'enemy',confirmed:true});
  assert.equal(strike(b,[],{turnId:undefined,eventId:'reaction-hit'}).turnId,'enemy');
});
test('Reef Knife Stealth Attack requires Hide Invisible and retains it only with sufficient end-of-turn cover',()=>{
  for(const [cover,remains] of [['half',false],['three-quarters',true],['total',true]]){
    const b=ready('corsair',9,'reef-knife');command(b,'turn.start',{turnId:'turn-one',confirmed:true});
    command(b,'condition.record',{conditionId:'invisible',source:'hide',active:true,confirmed:true});const r=strike(b,['stealth-attack']);assert.equal(r.costDice,1);
    command(b,'turn.end',{turnId:'turn-one',cover,confirmed:true});assert.equal(b.character.rulesRuntime.conditions.some(c=>c.source==='hide'),remains);
  }
  assert.throws(()=>strike(ready('corsair',9,'black-flag-envoy'),['stealth-attack']),/available strike/);
});
test('Brutal Strike requires own active Reckless turn and no Disadvantage, rolling its actual weapon type',()=>{
  const b=ready('reaver',9);assert.throws(()=>strike(b,['forceful-blow'],{reckless:true}),/own turn/);command(b,'turn.start',{turnId:'turn-one',confirmed:true});
  assert.throws(()=>strike(b,['forceful-blow'],{reckless:true,disadvantage:true}),/no Disadvantage/);
  const r=strike(b,['forceful-blow'],{reckless:true});assert.equal(r.rolls.length,1);assert.equal(r.damageType,'slashing');assert.equal(r.forgoAllAdvantage,true);assert.equal(r.effects[0].pushFeet,15);
});
test('Brutal Strike may roll extra damage without choosing an optional effect',()=>{
  const b=ready('reaver',9);
  command(b,'turn.start',{turnId:'turn-one',confirmed:true});
  const r=strike(b,[],{reckless:true,turnId:undefined});
  assert.equal(r.rolls.length,1);
  assert.deepEqual(r.effects,[]);
});
test('Brutal options upgrade at thirteen and seventeen, double on a critical and expire at next owner turn',()=>{
  assert.throws(()=>strike(ready('reaver',12),['staggering-blow'],{reckless:true}),/available strike/);
  const b=ready('reaver',17);command(b,'turn.start',{turnId:'turn-one',confirmed:true});const r=strike(b,['staggering-blow','sundering-blow'],{reckless:true,critical:true});assert.equal(r.rolls.length,4);assert.equal(r.effects[0].nextSaveDisadvantage,true);assert.equal(r.effects[1].nextOtherCreatureAttackBonus,5);
  command(b,'turn.end',{turnId:'turn-one',confirmed:true});command(b,'turn.start',{turnId:'turn-two',confirmed:true});assert.ok(!b.character.rulesRuntime.effects.some(e=>e.optionId==='staggering-blow'));
});

test('a missed selected Brutal Strike attack spends its turn choice without damage or effects',()=>{
  const b=ready('reaver',9);command(b,'turn.start',{turnId:'turn-one',confirmed:true});const r=strike(b,['forceful-blow'],{reckless:true,hit:false});assert.deepEqual(r.rolls,[]);assert.deepEqual(r.effects,[]);assert.equal(r.extraDamage,0);
  assert.throws(()=>strike(b,['hamstring-blow'],{reckless:true,eventId:'later-hit'}),/already been used/);
});
test('strike state survives reload and rests clear bounded per-turn history without dropping audit receipts',()=>{
  const b=ready('corsair',5);const r=strike(b,['withdraw']);const clone=JSON.parse(JSON.stringify(b.character));assert.equal(clone.rulesRuntime.strikeHistory[0].extraDamage,r.extraDamage);
  const after=rules.runtime.update(b.summary,clone.rulesRuntime,{type:'short-rest',expectedRevision:clone.rulesRuntime.revision});assert.deepEqual(after.strikeHistory,[]);
});

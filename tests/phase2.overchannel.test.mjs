import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),casting=require('../src/modules/archipelago/system/rules2024/spellOperations');
function ready(){const b=build('shipwright',14,'powder-saint');if(!b.character.rulesRuntime.preparations.shipwright.includes('fireball'))b.character.rulesRuntime.preparations.shipwright[0]='fireball';if(!b.summary.spellcasting.shipwright.folio.includes('fireball'))b.summary.spellcasting.shipwright.folio.push('fireball');b.character.rulesRuntime.temporaryHealth=1000;return b;}
function cast(b,turnId,spellId='fireball',level=3){return casting.cast(b.character,b.summary,{callingId:'shipwright',spellId,slotLevel:level,turnId,parameters:{overchannel:true}});}
test('Overchannel first casting maximizes damage only on its saved turn with no Health backlash',()=>{
  const b=ready(),hp=b.character.rulesRuntime.health.current,r=cast(b,'turn-one');assert.equal(r.overchannel.uses,1);assert.equal(r.overchannel.damage,0);assert.equal(r.management.maximumDamageOnTurn,'turn-one');assert.equal(b.character.rulesRuntime.health.current,hp);
});
test('second and third Overchannel casts roll 2d12 and 3d12 per actual slot level, bypassing Resistance and Immunity',()=>{
  const b=ready();b.summary.resistances.push('necrotic');b.summary.immunities=['necrotic'];cast(b,'one');const before=b.character.rulesRuntime.temporaryHealth;
  const second=cast(b,'two');assert.equal(second.overchannel.backlashDice.length,6);assert.equal(second.overchannel.damageOutcome.damage,second.overchannel.damage);assert.equal(b.character.rulesRuntime.temporaryHealth,before-second.overchannel.damage);
  const third=cast(b,'three');assert.equal(third.overchannel.backlashDice.length,9);assert.ok(third.overchannel.backlashDice.every(n=>n>=1&&n<=12));
});
test('Overchannel rejects non-damaging, no-slot and level-six castings atomically',()=>{
  const b=ready(),before=structuredClone(b.character);assert.throws(()=>cast(b,'one','fireball',6),/Overchannel requires/);assert.deepEqual(b.character,before);
  assert.throws(()=>casting.cast(b.character,b.summary,{callingId:'shipwright',spellId:'fireball',source:'mastery',parameters:{overchannel:true},turnId:'one'}),/Mastery/);assert.deepEqual(b.character,before);
});
test('only Long Rest resets the shared Overchannel escalation counter',()=>{
  const b=ready();cast(b,'one');const short=rules.runtime.update(b.summary,b.character.rulesRuntime,{type:'short-rest',expectedRevision:b.character.rulesRuntime.revision});assert.equal(short.counters.overchannel,1);
  const long=rules.runtime.update(b.summary,short,{type:'long-rest',expectedRevision:short.revision});assert.equal(long.counters.overchannel,undefined);
});

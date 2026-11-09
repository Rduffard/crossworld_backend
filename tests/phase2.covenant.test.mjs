import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),gear=require('../src/modules/archipelago/equipment');
function covenant(level=3,discipline='bulwark'){
  const b=build('warden',level,'iron-covenant');b.ledger.levels[2].choices.pathDiscipline=[discipline];b.summary=rules.replay(b.ledger);b.character.rulesLedger=b.ledger;b.character.rulesRuntime=rules.runtime.initialize(b.summary);
  const shield=b.character.inventory.find(i=>i.definitionId==='shield')??gear.issue({definitionId:'shield'});if(!b.character.inventory.includes(shield))b.character.inventory.push(shield);b.character.loadout.offHand=shield.instanceId;return {...b,shield};
}
function run(b,type,payload){const r=commands.apply(b.character,{operationId:'covenant-command-001',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...r.changes};return r.result;}
function use(b,handler,parameters={},targets=[],turnId){const option=rules.replay(b.character.rulesLedger).abilityOptions.find(o=>o.handler===handler);assert.ok(option,handler);return run(b,'ability.activate',{optionId:option.id,targetIds:targets,parameters:{confirmed:true,...parameters},...(turnId?{turnId}:{})});}
test('Bulwark binds one held Shield, spends Channel Divinity and adds exactly one Guard for one minute',()=>{
  const b=covenant(),before=gear.derive(b.character).guard,pool=b.character.rulesRuntime.pools['warden:channel-divinity'];
  const r=use(b,'covenant-steel',{objectId:b.shield.instanceId});assert.equal(gear.derive(b.character).guard,before+1);assert.equal(r.effect.expiresAt-r.effect.createdAt,60000);assert.equal(b.character.rulesRuntime.pools['warden:channel-divinity'],pool-1);
  assert.ok(!b.summary.abilityOptions.some(o=>o.handler==='covenant-sentinel'));
});
test('Covenant rejects carried-only Shields and nonshield instances without spending',()=>{
  const b=covenant();b.character.loadout.offHand=null;const before=structuredClone(b.character);assert.throws(()=>use(b,'covenant-steel',{objectId:b.shield.instanceId}),/currently hold/);assert.deepEqual(b.character,before);
  const weapon=b.character.inventory.find(i=>i.definitionId!=='shield');assert.throws(()=>use(b,'covenant-steel',{objectId:weapon.instanceId}),/currently hold/);
});
test('releasing a Shield permanently ends Steel through both command and existing equipment paths',()=>{
  for(const path of ['command','equipment']){const b=covenant();use(b,'covenant-steel',{objectId:b.shield.instanceId});const loadout={...b.character.loadout,offHand:null};
    if(path==='command')run(b,'equipment.equip',{loadout});else b.character={...b.character,...gear.update(b.character,{expectedRevision:b.character.documentRevision,loadout})};
    assert.ok(!b.character.rulesRuntime.effects.some(e=>e.shieldInstanceId));b.character.loadout.offHand=b.shield.instanceId;assert.equal(require('../src/modules/archipelago/system/rules2024/covenantOperations').guardBonus(b.character),0);
  }
});
test('preset release and timed expiry both remove the Bulwark bonus',()=>{
  let b=covenant();use(b,'covenant-steel',{objectId:b.shield.instanceId});run(b,'equipment.preset.save',{id:'empty',name:'No Shield',loadout:{...b.character.loadout,offHand:null}});run(b,'equipment.preset.apply',{id:'empty'});assert.ok(!b.character.rulesRuntime.effects.some(e=>e.shieldInstanceId));
  b=covenant();const guard=gear.derive(b.character).guard;use(b,'covenant-steel',{objectId:b.shield.instanceId});b.character.rulesRuntime.worldTime=b.character.rulesRuntime.effects[0].expiresAt;assert.equal(gear.derive(b.character).guard,guard);
});
test('Sentinel records one declared attack against another ally without an extra paid Shield use',()=>{
  const b=covenant(3,'sentinel');use(b,'covenant-steel',{objectId:b.shield.instanceId});const pool=b.character.rulesRuntime.pools['warden:channel-divinity'];
  const r=use(b,'covenant-sentinel',{eventId:'attack'},['ally']);assert.equal(r.sentinel.attackDisadvantage,true);assert.equal(r.sentinel.beforeAttackRoll,true);assert.equal(r.sentinel.rangeFeet,5);assert.equal(b.character.rulesRuntime.pools['warden:channel-divinity'],pool);
  const before=structuredClone(b.character);assert.throws(()=>use(b,'covenant-sentinel',{eventId:'attack'},['ally']),/already resolved/);assert.throws(()=>use(b,'covenant-sentinel',{eventId:'self'},['self']),/other ally/);assert.deepEqual(b.character,before);
});
test('Sentinel requires live Steel on the held Shield',()=>{
  const b=covenant(3,'sentinel');assert.throws(()=>use(b,'covenant-sentinel',{eventId:'attack'},['ally']),/empowered Shield/);use(b,'covenant-steel',{objectId:b.shield.instanceId});run(b,'equipment.equip',{loadout:{...b.character.loadout,offHand:null}});assert.throws(()=>use(b,'covenant-sentinel',{eventId:'attack'},['ally']),/empowered Shield/);
});
test('Aura of Resolve has the correct radius and turns off on Incapacitation',()=>{
  for(const level of [7,18]){const b=covenant(level);let summary=rules.runtime.project(b.summary,b.character.rulesRuntime);assert.deepEqual(summary.covenantAura.saveAdvantageAgainst,['forced-movement','prone']);assert.equal(summary.covenantAura.radiusFeet,level===18?30:10);
    b.character.rulesRuntime.conditions=[{conditionId:'stunned',source:'spell'}];summary=rules.runtime.project(b.summary,b.character.rulesRuntime);assert.equal(summary.covenantAura,null);
  }
});
test('Standard grants physical Resistance and enemy forced-movement protection for exactly one minute',()=>{
  const b=covenant(20),r=use(b,'covenant-standard');assert.equal(r.effect.expiresAt-r.effect.createdAt,60000);let summary=rules.runtime.project(b.summary,b.character.rulesRuntime);assert.ok(['bludgeoning','piercing','slashing'].every(t=>summary.resistances.includes(t)));assert.equal(summary.preventsEnemyForcedMovement,true);
  const damage=run(b,'health.damage',{amount:11,damageType:'slashing',confirmed:true});assert.equal(damage.damage,5);
  b.character.rulesRuntime.worldTime=r.effect.expiresAt;summary=rules.runtime.project(b.summary,b.character.rulesRuntime);assert.ok(!summary.preventsEnemyForcedMovement);assert.ok(!summary.resistances.includes('slashing'));
});
test('Standard grants max-one-Spirit temporary Health once per ally turn and rejects an inactive aura',()=>{
  const b=covenant(20);use(b,'covenant-standard');const r=use(b,'covenant-grant',{eventId:'turn-start'},['ally'],'ally-turn');assert.equal(r.temporaryHealthGrant.amount,Math.max(1,b.summary.attributeModifiers.spirit));
  const before=structuredClone(b.character);assert.throws(()=>use(b,'covenant-grant',{eventId:'new-event'},['ally'],'ally-turn'),/already received/);assert.deepEqual(b.character,before);
  use(b,'covenant-grant',{eventId:'other-start'},['other-ally'],'other-turn');b.character.rulesRuntime.conditions=[{conditionId:'stunned',source:'spell'}];assert.throws(()=>use(b,'covenant-grant',{eventId:'third-start'},['third'],'third-turn'),/active aura/);
});
test('Standard restoration spends exactly a fifth-level slot without activation and cannot be done while Incapacitated',()=>{
  const b=covenant(20);use(b,'covenant-standard');const slots=b.character.rulesRuntime.slots[4];
  run(b,'resource.convert',{type:'restore-feature',poolId:'iron-covenant:standard',slotLevel:5});assert.equal(b.character.rulesRuntime.slots[4],slots-1);assert.equal(b.character.rulesRuntime.pools['iron-covenant:standard'],1);assert.equal(b.character.rulesRuntime.effects.filter(e=>e.covenantStandard).length,1);
  use(b,'covenant-standard');b.character.rulesRuntime.conditions=[{conditionId:'stunned',source:'spell'}];const before=structuredClone(b.character);assert.throws(()=>run(b,'resource.convert',{type:'restore-feature',poolId:'iron-covenant:standard',slotLevel:5}),/Incapacitated/);assert.deepEqual(b.character,before);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),gear=require('../src/modules/archipelago/equipment');
const actorId='111111111111111111111111',targetId='222222222222222222222222';
function store(actor,target){
  let records=[{...actor,_id:actorId,owner:'owner'},{...target,_id:targetId,owner:'owner'}],receipts=[];
  const matches=(c,q)=>Object.entries(q).every(([k,v])=>c[k]===v);
  const query=fn=>({session(){return this;},lean:async()=>structuredClone(fn())});
  const Character={db:{startSession:async()=>({withTransaction:async fn=>{const before=structuredClone(records),previous=structuredClone(receipts);try{await fn();}catch(e){records=before;receipts=previous;throw e;}},endSession:async()=>{}})},
    findOne:q=>query(()=>records.find(c=>matches(c,q))??null),
    findOneAndUpdate:(q,u)=>query(()=>{const c=records.find(c=>matches(c,q));if(!c)return null;Object.assign(c,structuredClone(u.$set));return c;})};
  const Receipt={findOne:q=>query(()=>receipts.find(c=>matches(c,q))??null),create:async list=>receipts.push(...structuredClone(list))};
  const handler=commands.handler(Character,Receipt);
  return {read:id=>structuredClone(records.find(c=>c._id===id)),async call(optionId,parameters={confirmed:true}){
    return this.callCommand('ability.activate',{optionId,targetIds:[targetId],parameters});
  },async callCommand(type,payload){
    let error,data;await handler({params:{characterId:actorId},user:{_id:'owner'},body:{operationId:'doctor-target-op',expectedRevision:0,rulesVersion:'SA-CHAR-1',type,payload}},{send:r=>{data=r;}},e=>{error=e;});return {error,data};
  }};
}
function option(c,handler){return rules.replay(c.rulesLedger).abilityOptions.find(o=>o.handler===handler).id;}

test('Battlefield Procedure applies the chosen discipline to a native Triage recipient',async()=>{
  for(const discipline of ['trauma','toxicology']){
    const b=build('doctor',6,'field-surgeon','yuma-core','field-medic');
    b.ledger.levels[2].choices.surgicalDiscipline=[discipline];
    const summary=rules.replay(b.ledger);
    const actor={...b.character,rulesLedger:b.ledger,rulesRuntime:rules.runtime.initialize(summary)};
    const target=build('gunslinger',6).character;
    target.rulesRuntime.health.current=1;
    target.rulesRuntime.worldTime=1000;
    actor.rulesRuntime.worldTime=1000;
    target.rulesRuntime.conditions=['prone','poisoned'].map(conditionId=>({conditionId,source:'hazard'}));
    const s=store(actor,target);
    const out=await s.call(option(actor,discipline==='trauma'?'triage':'triage-antidote'),{confirmed:true,targetRestEpoch:'first-rest'});
    assert.equal(out.error,undefined);
    const saved=s.read(targetId);
    assert.deepEqual(saved.rulesRuntime.conditions.map(c=>c.conditionId),[discipline==='trauma'?'poisoned':'prone']);
    assert.equal(saved.rulesRuntime.health.current>1,discipline==='trauma');
    assert.equal(s.read(actorId).inventory.find(i=>i.definitionId==='healer-kit').chargesCurrent,9);
    if(discipline==='toxicology'){
      assert.equal(saved.rulesRuntime.effects[0].expiresAt,61000);
      const targetRules=rules.replay(saved.rulesLedger);
      assert.equal(rules.runtime.project(targetRules,saved.rulesRuntime,saved).poisonedSaveAdvantage,true);
      saved.rulesRuntime.worldTime=61000;
      assert.equal(rules.runtime.project(targetRules,saved.rulesRuntime,saved).poisonedSaveAdvantage,false);
    }
  }
});

test('a carried healer kit stabilizes a native zero-Health ally atomically and spends only one charge',async()=>{
  const actor=build('gunslinger').character,target=build('gunslinger').character,kit=gear.issue({definitionId:'healer-kit'});actor.inventory.push(kit);target.rulesRuntime.health.current=0;const s=store(actor,target),payload={instanceId:kit.instanceId,eventId:'kit-treatment',targetIds:[targetId],confirmed:true},out=await s.callCommand('equipment.utilize',payload);assert.equal(out.error,undefined);assert.equal(s.read(targetId).rulesRuntime.deathSaves.stable,true);assert.equal(s.read(targetId).rulesRuntime.health.current,0);assert.equal(s.read(actorId).inventory.at(-1).chargesCurrent,9);const retry=await s.callCommand('equipment.utilize',payload);assert.deepEqual(retry.data,out.data);assert.equal(s.read(actorId).inventory.at(-1).chargesCurrent,9);
});
test('administering a potion to a dead native ally rolls inventory consumption back',async()=>{
  const actor=build('gunslinger').character,target=build('gunslinger').character,potion=gear.issue({definitionId:'healing-potion'});actor.inventory.push(potion);target.rulesRuntime.health.current=0;target.rulesRuntime.deathSaves.dead=true;const s=store(actor,target),out=await s.callCommand('equipment.utilize',{instanceId:potion.instanceId,eventId:'potion-treatment',targetIds:[targetId],confirmed:true});assert.match(out.error.message,/revive a dead/);assert.ok(s.read(actorId).inventory.some(i=>i.instanceId===potion.instanceId));assert.equal(s.read(actorId).documentRevision,0);
});

test('recorded Cure Wounds heals a native recipient and Blessed Healer atomically, with an exact receipt retry',async()=>{
  const actor=build('doctor',6,'sanctuary-hand').character,target=build('gunslinger',3).character;actor.rulesRuntime.health.current=1;target.rulesRuntime.health.current=1;const summary=rules.replay(actor.rulesLedger),cast=require('../src/modules/archipelago/system/rules2024/spellOperations').cast(actor,summary,{spellId:'cure-wounds',callingId:'doctor',slotLevel:1,targets:[targetId]}),s=store(actor,target),payload={castId:cast.castId,targetIds:[targetId],eventId:'cure-result',confirmed:true},out=await s.callCommand('spell.heal',payload);assert.equal(out.error,undefined);assert.ok(s.read(targetId).rulesRuntime.health.current>1);assert.equal(s.read(actorId).rulesRuntime.health.current,4);const again=await s.callCommand('spell.heal',payload);assert.deepEqual(again.data,out.data);assert.equal(s.read(targetId).documentRevision,1);
});
test('a dead native healing target rolls back the entire resolution and its Blessed Healer grant',async()=>{
  const actor=build('doctor',6,'sanctuary-hand').character,target=build('gunslinger',3).character;actor.rulesRuntime.health.current=1;target.rulesRuntime.health.current=0;target.rulesRuntime.deathSaves.dead=true;const cast=require('../src/modules/archipelago/system/rules2024/spellOperations').cast(actor,rules.replay(actor.rulesLedger),{spellId:'cure-wounds',callingId:'doctor',slotLevel:1,targets:[targetId]}),s=store(actor,target),out=await s.callCommand('spell.heal',{castId:cast.castId,targetIds:[targetId],eventId:'failed-cure',confirmed:true});assert.match(out.error.message,/revive a dead/);assert.equal(s.read(actorId).rulesRuntime.health.current,1);assert.equal(s.read(actorId).documentRevision,0);assert.equal(s.read(targetId).documentRevision,0);assert.equal(s.read(actorId).rulesRuntime.castings[0].healingUses,undefined);
});

test('Preserve Life allocates its finite budget to a native Bloodied ally and caps healing at half maximum',async()=>{
  const actor=build('doctor',3,'sanctuary-hand').character,target=build('gunslinger',3).character;target.rulesRuntime.health.current=1;const s=store(actor,target),payload={optionId:option(actor,'preserve-life'),targetIds:[targetId],parameters:{confirmed:true,allocations:[{targetId,amount:15}]}},out=await s.callCommand('ability.activate',payload);assert.equal(out.error,undefined);assert.equal(s.read(targetId).rulesRuntime.health.current,Math.floor(target.rulesRuntime.health.max/2));assert.equal(s.read(actorId).rulesRuntime.pools['doctor:channel-divinity'],actor.rulesRuntime.pools['doctor:channel-divinity']-1);const retry=await s.callCommand('ability.activate',payload);assert.deepEqual(retry.data,out.data);assert.equal(s.read(targetId).documentRevision,1);
});
test('Preserve Life rejects non-Bloodied native recipients and over-allocation without spending Channel Divinity',async()=>{
  const actor=build('doctor',3,'sanctuary-hand').character,target=build('gunslinger',3).character;let s=store(actor,target),payload={optionId:option(actor,'preserve-life'),targetIds:[targetId],parameters:{confirmed:true,allocations:[{targetId,amount:10}]}},out=await s.callCommand('ability.activate',payload);assert.match(out.error.message,/Bloodied/);assert.equal(s.read(actorId).documentRevision,0);assert.equal(s.read(targetId).documentRevision,0);target.rulesRuntime.health.current=1;s=store(actor,target);out=await s.callCommand('ability.activate',{...payload,parameters:{confirmed:true,allocations:[{targetId,amount:16}]}});assert.match(out.error.message,/five times Doctor level/);assert.equal(s.read(actorId).rulesRuntime.pools['doctor:channel-divinity'],actor.rulesRuntime.pools['doctor:channel-divinity']);
});

test('Unyielding Standard grants native ally temporary Health atomically and receipt replay does not repeat it',async()=>{
  const actor=build('warden',20,'iron-covenant').character,target=build('gunslinger').character;
  require('../src/modules/archipelago/system/rules2024/abilityOperations').activate(actor,rules.replay(actor.rulesLedger),{optionId:option(actor,'covenant-standard'),parameters:{confirmed:true},targetIds:[]});
  const s=store(actor,target),payload={optionId:option(actor,'covenant-grant'),targetIds:[targetId],turnId:'ally-turn',parameters:{confirmed:true,eventId:'ally-start'}};
  const first=await s.callCommand('ability.activate',payload);assert.equal(first.error,undefined);assert.ok(s.read(targetId).rulesRuntime.temporaryHealth>=1);assert.match(s.read(targetId).rulesRuntime.temporaryHealthMetadata.source,/unyielding-standard/);
  const again=await s.callCommand('ability.activate',payload);assert.deepEqual(again.data,first.data);assert.equal(s.read(targetId).documentRevision,1);
});

test('Alert swaps both native Initiative totals atomically and retries reproduce the same saved result',async()=>{
  const actor=build('doctor',3,undefined,'yuma-core','field-medic').character,target=build('gunslinger').character;
  actor.rulesRuntime.initiative={combatId:'battle',roll:10,total:12};target.rulesRuntime.initiative={combatId:'battle',roll:17,total:19};
  const s=store(actor,target),payload={featId:'alert',confirmed:true,eventId:'initiative-swap',targetIds:[targetId],parameters:{allyTotal:19,consent:true}},first=await s.callCommand('feat.use',payload);assert.equal(first.error,undefined);
  assert.equal(s.read(actorId).rulesRuntime.initiative.total,19);assert.equal(s.read(targetId).rulesRuntime.initiative.total,12);
  const again=await s.callCommand('feat.use',payload);assert.deepEqual(again.data,first.data);assert.equal(s.read(targetId).documentRevision,1);
});

test('Alert rejects forged ally Initiative or an Incapacitated native ally without partial changes',async()=>{
  const actor=build('doctor',3,undefined,'yuma-core','field-medic').character,target=build('gunslinger').character;
  actor.rulesRuntime.initiative={combatId:'battle',total:12};target.rulesRuntime.initiative={combatId:'battle',total:19};
  const payload={featId:'alert',confirmed:true,eventId:'initiative-swap',targetIds:[targetId],parameters:{allyTotal:50,consent:true}};
  let s=store(actor,target),out=await s.callCommand('feat.use',payload);assert.match(out.error.message,/matching saved Initiative/);assert.equal(s.read(actorId).rulesRuntime.initiative.total,12);assert.equal(s.read(targetId).documentRevision,0);
  target.rulesRuntime.conditions=[{conditionId:'incapacitated',source:'stun'}];s=store(actor,target);out=await s.callCommand('feat.use',{...payload,parameters:{allyTotal:19,consent:true}});assert.match(out.error.message,/conscious/);assert.equal(s.read(actorId).documentRevision,0);
});

test('Field Responder stabilizes a native zero-Health ally and rolls kit expenditure back for an invalid target',async()=>{
  const b=build('doctor',4,undefined,'yuma-core','field-medic');b.ledger.levels[3].choices.feat='field-responder';b.ledger.levels[3].choices.increases={instinct:1};const summary=rules.replay(b.ledger);
  const actor={...b.character,rulesLedger:b.ledger,attributes:summary.attributes,rulesRuntime:rules.runtime.initialize(summary)},target=build('gunslinger').character,kit=actor.inventory.find(i=>i.definitionId==='healer-kit');
  const payload={featId:'field-responder',confirmed:true,eventId:'stabilize',targetIds:[targetId],parameters:{kitId:kit.instanceId}};
  let s=store(actor,target),out=await s.callCommand('feat.use',payload);assert.match(out.error.message,/zero Health/);assert.equal(s.read(actorId).inventory.find(i=>i.instanceId===kit.instanceId).chargesCurrent,10);
  target.rulesRuntime.health.current=0;s=store(actor,target);out=await s.callCommand('feat.use',payload);assert.equal(out.error,undefined);assert.equal(s.read(targetId).rulesRuntime.deathSaves.stable,true);assert.equal(s.read(targetId).rulesRuntime.health.current,0);assert.equal(s.read(actorId).inventory.find(i=>i.instanceId===kit.instanceId).chargesCurrent,9);
});
test('Keeper stabilization and comfort temporary Health update one recipient atomically and replay without rerolling',async()=>{
  const actor=build('doctor',3,'keeper-of-last-breaths').character,target=build('gunslinger').character;target.rulesRuntime.health.current=0;target.rulesRuntime.deathSaves.failures=2;
  const s=store(actor,target),id=option(actor,'keeper-stabilize'),first=await s.call(id);assert.equal(first.error,undefined);
  let saved=s.read(targetId);assert.equal(saved.rulesRuntime.deathSaves.stable,true);assert.equal(saved.rulesRuntime.deathSaves.failures,0);assert.ok(saved.rulesRuntime.temporaryHealth>=1);assert.equal(saved.rulesRuntime.health.current,0);
  const deadline=saved.rulesRuntime.deathSaves.stableUntil;await s.call(id);saved=s.read(targetId);assert.equal(saved.documentRevision,1);assert.equal(saved.rulesRuntime.deathSaves.stableUntil,deadline);
  assert.equal(s.read(actorId).rulesRuntime.pools['keeper-of-last-breaths:vigil'],2);
});
test('Witness Against Oblivion heals exactly twice level and rolls back when its target is not at zero',async()=>{
  const actor=build('doctor',6,'keeper-of-last-breaths').character,target=build('gunslinger',6).character;
  let s=store(actor,target),out=await s.call(option(actor,'keeper-heal'));assert.match(out.error.message,/zero Health/);assert.equal(s.read(actorId).documentRevision,0);
  target.rulesRuntime.health.current=0;s=store(actor,target);out=await s.call(option(actor,'keeper-heal'));assert.equal(out.error,undefined);assert.equal(s.read(targetId).rulesRuntime.health.current,12);
});
test('One More Dawn prevents failed-save death but rejects massive damage without spending its counter',async()=>{
  const actor=build('doctor',17,'keeper-of-last-breaths').character,target=build('gunslinger').character;
  target.rulesRuntime.health.current=0;target.rulesRuntime.deathSaves={successes:0,failures:3,stable:false,dead:true,cause:'massive-damage'};
  let s=store(actor,target),out=await s.call(option(actor,'keeper-dawn'));assert.match(out.error.message,/failed death saves/);assert.equal(s.read(actorId).rulesRuntime.pools['keeper-of-last-breaths:one-dawn'],1);
  target.rulesRuntime.deathSaves.cause='failed-saves';s=store(actor,target);out=await s.call(option(actor,'keeper-dawn'));assert.equal(out.error,undefined);assert.equal(s.read(targetId).rulesRuntime.health.current,1);assert.equal(s.read(targetId).rulesRuntime.deathSaves.dead,false);
});
test('Impossible Operation validates death, consent and all three costs in the same transaction',async()=>{
  const actor=build('doctor',17,'field-surgeon','yuma-core','field-medic').character,target=build('gunslinger').character;
  target.rulesRuntime.health.current=0;target.rulesRuntime.deathSaves.dead=true;
  const s=store(actor,target),out=await s.call(option(actor,'impossible-operation'),{bodyIntact:true,consent:true,deathSeconds:60});assert.equal(out.error,undefined);
  assert.equal(s.read(targetId).rulesRuntime.health.current,1);assert.equal(s.read(actorId).rulesRuntime.pools['field-surgeon:operation'],0);
  assert.equal(s.read(actorId).rulesRuntime.pools['doctor:channel-divinity'],2);assert.equal(s.read(actorId).inventory.find(i=>i.chargesCurrent!==undefined).chargesCurrent,5);
});
test('Plaguewarden ends actual condition records; Clean Bill spends one kit charge and cures its three conditions',async()=>{
  const actor=build('doctor',17,'plaguewarden').character,target=build('gunslinger',5).character;
  actor.inventory.push(gear.issue({definitionId:'healer-kit'}));target.rulesRuntime.health.current=1;
  target.rulesRuntime.conditions=['poisoned','blinded','deafened'].map(conditionId=>({conditionId,source:'hazard'}));
  let s=store(actor,target),out=await s.call(option(actor,'plague-antidote'));assert.equal(out.error,undefined);assert.deepEqual(s.read(targetId).rulesRuntime.conditions.map(c=>c.conditionId),['blinded','deafened']);
  s=store(actor,target);out=await s.call(option(actor,'clean-bill'));assert.equal(out.error,undefined);assert.equal(out.data.operationResult.rolls.length,6);assert.equal(s.read(targetId).rulesRuntime.conditions.length,0);assert.equal(s.read(actorId).inventory.at(-1).chargesCurrent,9);
});

test('Inoculated grants one actually healed native recipient a source-bound next Poisoned save and retry is idempotent',async()=>{
  const actor=build('doctor',6,'plaguewarden').character,target=build('gunslinger').character;actor.rulesRuntime.worldTime=1000;target.rulesRuntime.worldTime=1000;target.rulesRuntime.health.current=1;
  const summary=rules.replay(actor.rulesLedger),cast=require('../src/modules/archipelago/system/rules2024/spellOperations').cast(actor,summary,{spellId:'cure-wounds',callingId:'doctor',slotLevel:1,targets:[targetId]}),healing=require('../src/modules/archipelago/system/rules2024/healingSpells').apply(actor,summary,{castId:cast.castId,targetIds:[targetId],eventId:'actual-heal',confirmed:true});require('../src/modules/archipelago/system/rules2024/vitality').heal(target.rulesRuntime,healing.healing);
  const s=store(actor,target),parameters={confirmed:true,objectId:cast.castId,eventId:'actual-heal'},out=await s.call(option(actor,'rider-inoculate'),parameters);assert.equal(out.error,undefined);const recipient=s.read(targetId),effect=recipient.rulesRuntime.effects.find(e=>e.nextSaveOnly);assert.equal(effect.expiresAt-effect.createdAt,3600000);assert.equal(rules.runtime.project(rules.replay(recipient.rulesLedger),recipient.rulesRuntime).poisonedSaveAdvantage,true);const again=await s.call(option(actor,'rider-inoculate'),parameters);assert.deepEqual(again.data,out.data);assert.equal(s.read(targetId).rulesRuntime.effects.filter(e=>e.nextSaveOnly).length,1);
});

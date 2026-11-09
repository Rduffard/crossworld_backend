import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),casting=require('../src/modules/archipelago/system/rules2024/spellOperations'),persistence=require('../src/modules/archipelago/characters/rules2024');
function run(b,type,payload,context){const r=commands.apply(b.character,{operationId:'conduit-command-001',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload},context);b.character={...b.character,...r.changes};return r.result;}
function use(b,handler,targets=[],parameters={},turnId,context){const option=rules.replay(b.character.rulesLedger).abilityOptions.find(o=>o.handler===handler);assert.ok(option,handler);return run(b,'ability.activate',{optionId:option.id,targetIds:targets,parameters:{confirmed:true,...parameters},...(turnId?{turnId}:{})},context);}
function conduit(level=3,discipline='shelter'){
  const b=build('tidecaller',level,'sanguine-conduit');b.ledger.levels[2].choices.pathDiscipline=[discipline];b.summary=rules.replay(b.ledger);b.character.rulesLedger=b.ledger;b.character.rulesRuntime=rules.runtime.initialize(b.summary);return b;
}
for(const [level,count]of [[3,1],[6,2],[18,3]])test(`Blood Price ${level} pays raw Health and grants ${count}d8 Shelter to one chosen target`,()=>{
  const b=conduit(level),before=b.character.rulesRuntime.health.current;b.character.rulesRuntime.temporaryHealth=100;
  const r=use(b,'conduit-price',['ally']);assert.equal(r.rolls.length,count);assert.ok(r.rolls.every(d=>d>=1&&d<=8));assert.equal(r.temporaryHealthGrant.amount,r.rolls.reduce((a,b)=>a+b,0)+b.summary.attributeModifiers.spirit);assert.deepEqual(r.temporaryHealthGrant.targetIds,['ally']);assert.equal(b.character.rulesRuntime.health.current,before-2*b.summary.trainingBonus);assert.equal(b.character.rulesRuntime.temporaryHealth,100);assert.equal(r.temporaryHealthGrant.metadata.sourceCharacterId,'self');
});
test('Blood Price rejects missing/multiple targets and Health that would fall below one atomically',()=>{
  const b=conduit();for(const targets of [[],['a','b']]){const before=structuredClone(b.character);assert.throws(()=>use(b,'conduit-price',targets),/one creature/);assert.deepEqual(b.character,before);}
  b.character.rulesRuntime.health.current=2*b.summary.trainingBonus;const before=structuredClone(b.character);assert.throws(()=>use(b,'conduit-price',['self']),/at least one/);assert.deepEqual(b.character,before);
});
test('self Shelter grants one pool with source metadata and never replaces a larger pool',()=>{
  const b=conduit(6);const r=use(b,'conduit-price',['self']);assert.equal(b.character.rulesRuntime.temporaryHealth,r.temporaryHealthGrant.amount);assert.equal(b.character.rulesRuntime.temporaryHealthMetadata.grantId,r.temporaryHealthGrant.metadata.grantId);
  b.character.rulesRuntime.temporaryHealth=100;const old=structuredClone(b.character.rulesRuntime.temporaryHealthMetadata);use(b,'conduit-price',['self']);assert.equal(b.character.rulesRuntime.temporaryHealth,100);assert.deepEqual(b.character.rulesRuntime.temporaryHealthMetadata,old);
});
test('Measured Sacrifice pays six raw Health, restores at most two points and does not heal',()=>{
  const b=conduit(6),pool='tidecaller:sorcery-points',max=b.summary.resources[pool].max;b.character.rulesRuntime.pools[pool]=max-1;b.character.rulesRuntime.temporaryHealth=100;const health=b.character.rulesRuntime.health.current;
  const r=use(b,'conduit-sacrifice');assert.equal(r.sorceryRecovered,1);assert.equal(b.character.rulesRuntime.pools[pool],max);assert.equal(b.character.rulesRuntime.health.current,health-6);assert.equal(b.character.rulesRuntime.temporaryHealth,100);assert.equal(b.character.rulesRuntime.pools['sanguine-conduit:transfusion'],0);
});
test('Surge is attached once to the next damaging spell and failed casts cannot consume it',()=>{
  const b=conduit(6,'surge');b.character.rulesRuntime.preparations.tidecaller[0]='magic-missile';
  const r=use(b,'conduit-price'),amount=r.effect.extraNecrotic,before=structuredClone(b.character);assert.throws(()=>casting.cast(b.character,b.summary,{callingId:'tidecaller',spellId:'magic-missile',slotLevel:9}));assert.deepEqual(b.character,before);
  const cast=casting.cast(b.character,b.summary,{callingId:'tidecaller',spellId:'magic-missile',slotLevel:1});assert.equal(cast.sanguineSurge.amount,amount);assert.equal(cast.sanguineSurge.oneDamageRollOnly,true);assert.ok(!b.character.rulesRuntime.effects.some(e=>e.nextSpellOnly));
  const again=casting.cast(b.character,b.summary,{callingId:'tidecaller',spellId:'magic-missile',slotLevel:1});assert.equal(again.sanguineSurge,undefined);
});
test('Surge is forfeited by a nondamaging spell and expires at the next owner turn',()=>{
  let b=conduit(6,'surge');b.character.rulesRuntime.preparations.tidecaller[0]='shield';use(b,'conduit-price');const r=casting.cast(b.character,b.summary,{callingId:'tidecaller',spellId:'shield',slotLevel:1,trigger:{eventId:'incoming-attack',confirmed:true}});assert.equal(r.sanguineSurge.forfeited,true);assert.equal(r.sanguineSurge.amount,0);
  b=conduit(6,'surge');run(b,'turn.start',{turnId:'one',confirmed:true});use(b,'conduit-price');run(b,'turn.end',{turnId:'one',confirmed:true});run(b,'turn.start',{turnId:'two',confirmed:true});assert.ok(!b.character.rulesRuntime.effects.some(e=>e.nextSpellOnly));
});
test('Vital Circuit needs a real Blood Price grant, another recipient and an unused event/turn',()=>{
  const b=conduit(14),price=use(b,'conduit-price',['external-ally']),grant=price.temporaryHealthGrant.metadata.grantId;
  const parameters={targetId:'external-ally',objectId:grant,eventId:'damage-event'};const r=use(b,'conduit-circuit',['self'],parameters,'turn-one');assert.equal(r.temporaryHealthGrant.amount,Math.max(1,b.summary.attributeModifiers.spirit));assert.match(r.temporaryHealthGrant.metadata.source,/vital-circuit/);
  const before=structuredClone(b.character);for(const [target,p,turn]of [['other',parameters,'turn-two'],['other',{...parameters,eventId:'new-event'},'turn-one'],['external-ally',{...parameters,eventId:'another'},'turn-three'],['other',{...parameters,eventId:'bad-grant',objectId:'invented'},'turn-four']])assert.throws(()=>use(b,'conduit-circuit',[target],p,turn));assert.deepEqual(b.character,before);
});
test('native Vital Circuit cannot accept client-authored evidence and rejects secondary/expiry events',()=>{
  const b=conduit(14);const params={targetId:'222222222222222222222222',eventId:'damage'};
  for(const context of [undefined,{bloodPriceLoss:{source:'path:sanguine-conduit:vital-circuit:14',sourceCharacterId:'self',amount:1}},{bloodPriceLoss:{source:'path:sanguine-conduit:blood-price:3',sourceCharacterId:'other',amount:1}},{bloodPriceLoss:{source:'path:sanguine-conduit:blood-price:3',sourceCharacterId:'self',amount:0}}])assert.throws(()=>use(b,'conduit-circuit',['self'],params,'one',context),/recorded native/);
  assert.throws(()=>use(b,'conduit-circuit',['self'],{...params,circuitEvidence:{}},'one'),/parameters/);
});
test('Vital Circuit journal and outstanding grants survive Long Rest and advancement reconciliation',()=>{
  const b=conduit(14),grant=use(b,'conduit-price',['external']).temporaryHealthGrant.metadata.grantId;use(b,'conduit-circuit',['self'],{targetId:'external',objectId:grant,eventId:'damage'},'turn');
  const old=b.character.rulesRuntime,long=rules.runtime.update(b.summary,old,{type:'long-rest',expectedRevision:old.revision});assert.deepEqual(long.conduitCircuit,old.conduitCircuit);assert.deepEqual(long.conduitGrants,old.conduitGrants);
  const next=conduit(15),reconciled=persistence.reconcile(long,b.summary,next.summary);assert.deepEqual(reconciled.conduitCircuit,old.conduitCircuit);assert.deepEqual(reconciled.conduitGrants,old.conduitGrants);
});
test('damage records a Blood Price loss only when damage actually reduces that pool',()=>{
  const b=conduit(14);use(b,'conduit-price',['self']);const r=run(b,'health.damage',{amount:1,damageType:'force',confirmed:true});assert.equal(r.bloodPriceLoss.amount,1);assert.equal(r.bloodPriceLoss.eventId,'conduit-command-001');
  b.character.rulesRuntime.temporaryHealthMetadata.source='path:sanguine-conduit:vital-circuit:14';const secondary=run(b,'health.damage',{amount:1,damageType:'force',confirmed:true});assert.equal(secondary.bloodPriceLoss,undefined);
});
test('Unbroken Current resolves before Unconscious, preserves Concentration pending its damage save and spends once',()=>{
  const b=conduit(18);b.character.rulesRuntime.health.current=5;b.character.rulesRuntime.effects.push({id:'focus',featureId:'spell:fly',concentration:true});
  const r=run(b,'health.damage',{amount:5,damageType:'force',confirmed:true,unbrokenCurrent:true});assert.equal(b.character.rulesRuntime.health.current,1);assert.equal(b.character.rulesRuntime.temporaryHealth,18);assert.equal(b.character.rulesRuntime.pools['sanguine-conduit:unbroken-current'],0);assert.equal(r.unbrokenCurrent.reactionSpent,true);assert.equal(b.character.rulesRuntime.effects[0].id,'focus');assert.equal(b.character.rulesRuntime.concentrationChecks.length,1);assert.equal(r.deathSaves.dead,false);
  b.character.rulesRuntime.temporaryHealth=0;const before=structuredClone(b.character);assert.throws(()=>run(b,'health.damage',{amount:1,damageType:'force',confirmed:true,unbrokenCurrent:true}),/unspent/);assert.deepEqual(b.character,before);
});
test('Unbroken Current cannot bypass massive death, an existing incapacitation or its level requirement',()=>{
  let b=conduit(18);b.character.rulesRuntime.health.current=1;const r=run(b,'health.damage',{amount:b.summary.health.max+1,damageType:'force',confirmed:true,unbrokenCurrent:true});assert.equal(r.deathSaves.dead,true);assert.equal(r.unbrokenCurrent,undefined);assert.equal(b.character.rulesRuntime.pools['sanguine-conduit:unbroken-current'],1);
  b=conduit(18);b.character.rulesRuntime.health.current=1;b.character.rulesRuntime.conditions=[{conditionId:'stunned',source:'spell'}];assert.throws(()=>run(b,'health.damage',{amount:1,damageType:'force',confirmed:true,unbrokenCurrent:true}),/Reaction/);
  b=conduit(17);assert.throws(()=>run(b,'health.damage',{amount:1,damageType:'force',confirmed:true,unbrokenCurrent:true}),/eighteen/);assert.ok(!rules.replay(conduit(18).ledger).abilityOptions.some(o=>o.featureId.endsWith('unbroken-current:18')));
});
const actorId='111111111111111111111111',targetId='222222222222222222222222',recipientId='333333333333333333333333';
function nativeStore({foreignRecipient=false}={}){
  let records=[{...conduit(14).character,_id:actorId,owner:'owner'},{...build('gunslinger',14).character,_id:targetId,owner:'owner'},{...build('gunslinger',14).character,_id:recipientId,owner:foreignRecipient?'foreign':'owner'}],receipts=[];
  const match=(record,q)=>Object.entries(q).every(([k,v])=>k==='$or'?v.some(part=>match(record,part)):k.split('.').reduce((item,key)=>item?.[key],record)===v),query=fn=>({session(){return this;},lean:async()=>structuredClone(fn())});
  const Character={db:{startSession:async()=>({async withTransaction(fn){const before=structuredClone({records,receipts});try{await fn();}catch(e){({records,receipts}=before);throw e;}},endSession:async()=>{}})},
    findOne:q=>query(()=>records.find(r=>match(r,q))??null),findOneAndUpdate:(q,u)=>query(()=>{const record=records.find(r=>match(r,q));if(!record)return null;Object.assign(record,structuredClone(u.$set));return record;})};
  const Receipt={findOne:q=>query(()=>receipts.find(r=>match(r,q))??null),create:async list=>receipts.push(...structuredClone(list))};
  const handler=commands.handler(Character,Receipt);
  return {read:id=>structuredClone(records.find(r=>r._id===id)),clearRecent(){const state=records.find(r=>r._id===actorId).rulesRuntime;state.conduitCircuit=[];state.conduitGrants=[];},async call(id,type,payload,operationId,revision){let data,error;await handler({params:{characterId:id},user:{_id:'owner'},body:{operationId,expectedRevision:revision??records.find(r=>r._id===id).documentRevision,rulesVersion:'SA-CHAR-1',type,payload}},{send(value){data=value;}},e=>{error=e;});return {data,error};}};
}
const pricePayload={optionId:'path:sanguine-conduit:blood-price:3#price',targetIds:[targetId],parameters:{confirmed:true}};
function circuitPayload(recipient=recipientId){return {optionId:'path:sanguine-conduit:vital-circuit:14#circuit',targetIds:[recipient],turnId:'native-turn-one',parameters:{confirmed:true,targetId,eventId:'native-damage-001'}};}
test('native Shelter, damage evidence and Circuit update recipients atomically and receipts replay without duplicate grants',async()=>{
  const db=nativeStore(),price=await db.call(actorId,'ability.activate',pricePayload,'native-price-001');assert.equal(price.error,undefined);
  assert.equal(db.read(targetId).rulesRuntime.temporaryHealth,price.data.operationResult.temporaryHealthGrant.amount);assert.equal(db.read(targetId).rulesRuntime.temporaryHealthMetadata.sourceCharacterId,actorId);
  const damage=await db.call(targetId,'health.damage',{amount:1,damageType:'force',confirmed:true},'native-damage-001');assert.equal(damage.error,undefined);assert.equal(damage.data.operationResult.bloodPriceLoss.sourceCharacterId,actorId);
  const revision=db.read(actorId).documentRevision,result=await db.call(actorId,'ability.activate',circuitPayload(),'native-circuit-001',revision);assert.equal(result.error,undefined);assert.ok(db.read(recipientId).rulesRuntime.temporaryHealth>=1);assert.match(db.read(recipientId).rulesRuntime.temporaryHealthMetadata.source,/vital-circuit/);
  const replay=await db.call(actorId,'ability.activate',circuitPayload(),'native-circuit-001',revision);assert.deepEqual(replay.data,result.data);assert.equal(db.read(recipientId).documentRevision,1);
  db.clearRecent();
  const duplicate=await db.call(actorId,'ability.activate',{...circuitPayload(),turnId:'different-turn'},'native-circuit-002');assert.match(duplicate.error.message,/already resolved/);assert.equal(db.read(recipientId).documentRevision,1);
});
test('external Blood Price grants remain usable from receipts after the recent-state cache rotates',async()=>{
  const db=nativeStore(),price=await db.call(actorId,'ability.activate',{...pricePayload,targetIds:['table-ally']},'external-price-001');assert.equal(price.error,undefined);db.clearRecent();
  const payload={optionId:'path:sanguine-conduit:vital-circuit:14#circuit',targetIds:[actorId],turnId:'external-turn',parameters:{confirmed:true,targetId:'table-ally',eventId:'external-damage',objectId:price.data.operationResult.temporaryHealthGrant.metadata.grantId}};
  const result=await db.call(actorId,'ability.activate',payload,'external-circuit-001');assert.equal(result.error,undefined);assert.ok(db.read(actorId).rulesRuntime.temporaryHealth>0);
});
test('native Circuit rejects absent damage evidence and unauthorized recipient with no partial writes',async()=>{
  const db=nativeStore({foreignRecipient:true});await db.call(actorId,'ability.activate',pricePayload,'native-price-001');
  let before=db.read(actorId),result=await db.call(actorId,'ability.activate',circuitPayload(),'native-circuit-001');assert.match(result.error.message,/saved damage/);assert.deepEqual(db.read(actorId),before);
  await db.call(targetId,'health.damage',{amount:1,damageType:'force',confirmed:true},'native-damage-001');before=db.read(actorId);result=await db.call(actorId,'ability.activate',circuitPayload(),'native-circuit-002');assert.equal(result.error.statusCode,404);assert.deepEqual(db.read(actorId),before);assert.equal(db.read(recipientId).rulesRuntime.temporaryHealth,0);
  result=await db.call(actorId,'ability.activate',circuitPayload(actorId),'native-circuit-003');assert.equal(result.error,undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),persistence=require('../src/modules/archipelago/characters/rules2024');
const charId='111111111111111111111111',player='222222222222222222222222',gm='333333333333333333333333',campaignId='444444444444444444444444';
function store({registered=true,solo=false,callingId='gunslinger'}={}){
  let character={...build(callingId).character,_id:charId,owner:player,campaignId:solo?null:campaignId},receipts=[];
  const campaign={_id:campaignId,owner:gm,players:[player],characterIds:registered?[charId]:[]};
  const match=(c,q)=>Object.entries(q).every(([k,v])=>String(c[k])===String(v)),query=fn=>({session(){return this;},lean:async()=>structuredClone(fn())});
  const Character={db:{startSession:async()=>({async withTransaction(fn){const before=structuredClone({character,receipts});try{await fn();}catch(e){({character,receipts}=before);throw e;}},endSession:async()=>{}})},findOne:q=>query(()=>match(character,q)?character:null),findOneAndUpdate:(q,u)=>query(()=>{if(!match(character,q))return null;Object.assign(character,structuredClone(u.$set));return character;})};
  const Campaign={findOne:q=>query(()=>match(campaign,q)?campaign:null)},Receipt={findOne:q=>query(()=>receipts.find(c=>match(c,q))??null),create:async list=>receipts.push(...structuredClone(list))};
  const handler=commands.handler(Character,Receipt,undefined,Campaign),handlers=persistence.handlers(Character,Campaign);
  return {read:()=>structuredClone(character),receipts:()=>structuredClone(receipts),async call(userId,type,payload,operationId,revision){let data,error;await handler({params:{characterId:charId},user:{_id:userId},body:{operationId,expectedRevision:revision??character.documentRevision,rulesVersion:'SA-CHAR-1',type,payload}},{send(v){data=v;}},e=>{error=e;});return {data,error};},async get(userId){let data,error;await handlers.get({params:{characterId:charId},user:{_id:userId}},{send(v){data=v;}},e=>{error=e;});return {data,error};}};
}
test('registered campaign GM authorizes a milestone; only its owner commits it once and permission updates',async()=>{
  const db=store(),choices=build('gunslinger',2).ledger.levels[1].choices;
  const denied=await db.call(player,'advance',{level:2,choices},'player-advance-001');assert.equal(denied.error.statusCode,403);assert.equal(db.read().rulesLedger.levels.length,1);
  const authorized=await db.call(gm,'milestone.authorize',{level:2,reason:'Finished the harbor chapter'},'gm-milestone-001');assert.equal(authorized.error,undefined);assert.equal(db.read().rulesRuntime.milestones[0].authorizedBy,gm);assert.equal(authorized.data.permissions.isOwner,false);
  assert.equal((await db.get(player)).data.permissions.canAdvance,true);
  const advanced=await db.call(player,'advance',{level:2,choices},'player-advance-002');assert.equal(advanced.error,undefined);assert.equal(advanced.data.rulesSummary.totalLevel,2);assert.equal(db.read().rulesRuntime.milestones[0].used,true);assert.equal(advanced.data.permissions.canAdvance,false);
  assert.equal(db.receipts()[0].actor,gm);assert.equal(db.receipts()[0].owner,player);assert.equal(db.receipts()[0].actorRole,'campaign-gm');
});
test('player checkboxes cannot authorize milestones, issue awards or grant GM Inspiration',async()=>{
  const db=store(),before=db.read();for(const[type,payload]of [['milestone.authorize',{level:2,reason:'Self approval',confirmed:true}],['equipment.award',{goldCp:100000,reason:'Fake GM'}],['inspiration.grant',{confirmed:true}]]){const out=await db.call(player,type,payload,'forged-gm-'+type.replace('.','-'));assert.equal(out.error.statusCode,403);assert.deepEqual(db.read(),before);}
  assert.equal(Object.hasOwn(persistence.handlers({}),'advance'),false);
});
test('GM identity and actual campaign registration are both required',async()=>{
  let db=store();assert.equal((await db.call('555555555555555555555555','milestone.authorize',{level:2,reason:'Forged'},'foreign-milestone')).error.statusCode,404);
  db=store({registered:false});assert.equal((await db.call(gm,'milestone.authorize',{level:2,reason:'Unlinked'},'unlinked-milestone')).error.statusCode,404);assert.equal((await db.get(gm)).error.statusCode,404);assert.equal((await db.get(player)).data.permissions.canAdvance,false);
});
test('milestone retries return the stored result; changed payload and duplicate level fail without writes',async()=>{
  const db=store(),payload={level:2,reason:'Chapter complete'},first=await db.call(gm,'milestone.authorize',payload,'milestone-repeat',0);const again=await db.call(gm,'milestone.authorize',payload,'milestone-repeat',0);assert.deepEqual(again.data,first.data);assert.equal(db.read().rulesRuntime.milestones.length,1);
  assert.equal((await db.call(gm,'milestone.authorize',{...payload,reason:'Changed'},'milestone-repeat',0)).error.statusCode,409);
  assert.equal((await db.call(gm,'milestone.authorize',payload,'milestone-duplicate')).error.statusCode,422);assert.equal(db.read().documentRevision,1);
});
test('authorized catalog and copper awards preserve ownership and cannot forge mechanics',async()=>{
  const db=store(),before=db.read(),out=await db.call(gm,'equipment.award',{definitionId:'rations',quantity:5,goldCp:123,reason:'Harbor supplies'},'gm-gear-award');assert.equal(out.error,undefined);assert.equal(db.read().owner,player);assert.equal(db.read().goldCp,before.goldCp+123);assert.equal(db.read().inventory.length,before.inventory.length+1);assert.deepEqual(db.read().loadout,before.loadout);
  const saved=db.read();assert.ok((await db.call(gm,'equipment.award',{goldCp:100,reason:'Fake',attributes:{might:30}},'gm-invalid-award')).error);assert.deepEqual(db.read(),saved);
});
test('solo owner keeps advancement and GM control while a campaign GM cannot advance someone else directly',async()=>{
  const solo=store({solo:true}),choices=build('gunslinger',2).ledger.levels[1].choices;assert.equal((await solo.get(player)).data.permissions.canGM,true);assert.equal((await solo.call(player,'advance',{level:2,choices},'solo-advance-001')).error,undefined);
  const campaign=store();assert.equal((await campaign.call(gm,'advance',{level:2,choices},'gm-forged-advance')).error.statusCode,404);
});
test('GM discovery and owner transcription use distinct roles; receipt retry cannot charge the owner twice',async()=>{
  const db=store({callingId:'shipwright'}),rules=require('../src/modules/archipelago/system/rules2024'),s=rules.replay(db.read().rulesLedger).spellcasting.shipwright,spell=rules.blueprint.spells.find(spell=>spell.callings.includes('shipwright')&&spell.level===1&&!s.folio.includes(spell.id));assert.ok(spell);
  const discovery={discoveryId:'captain-folio',spellId:spell.id,reason:'Found in cabin'};
  assert.equal((await db.call(player,'spells.discover',discovery,'forged-discovery')).error.statusCode,403);assert.equal((await db.call(gm,'spells.discover',discovery,'gm-discovery-001')).error,undefined);
  await db.call(gm,'equipment.award',{goldCp:10000,reason:'Transcription funds'},'gm-folio-funds');const before=db.read().goldCp,revision=db.read().documentRevision,payload={discoveryId:discovery.discoveryId,spellId:spell.id,startedAt:1000,completedAt:7201000,confirmed:true};
  const first=await db.call(player,'spells.copy',payload,'copy-approved-001',revision);assert.equal(first.error,undefined);assert.equal(db.read().goldCp,before-5000);const again=await db.call(player,'spells.copy',payload,'copy-approved-001',revision);assert.deepEqual(again.data,first.data);assert.equal(db.read().goldCp,before-5000);
});

test('rebuild approval uses the real campaign GM and immutable receipts; GM cannot commit the owner build',async()=>{
  const db=store(),ledger=build('gunslinger').ledger,preview=await db.call(player,'rebuild.preview',{ledger,reason:'Reconsider Training'},'rebuild-preview-001');assert.equal(preview.error,undefined);const proposalId=preview.data.operationResult.proposalId;
  assert.equal((await db.call(player,'rebuild.approve',{proposalId},'rebuild-forged-approval')).error.statusCode,403);
  const revision=db.read().documentRevision,approved=await db.call(gm,'rebuild.approve',{proposalId},'rebuild-approval-001',revision);assert.equal(approved.error,undefined);assert.equal(approved.data.operationResult.approvedBy,gm);const retry=await db.call(gm,'rebuild.approve',{proposalId},'rebuild-approval-001',revision);assert.deepEqual(retry.data,approved.data);
  assert.equal((await db.call(gm,'rebuild.commit',{proposalId,acceptConsequences:true},'rebuild-gm-commit')).error.statusCode,404);const committed=await db.call(player,'rebuild.commit',{proposalId,acceptConsequences:true},'rebuild-owner-commit');assert.equal(committed.error,undefined);assert.equal(committed.data.operationResult.approvedBy,gm);assert.equal(db.receipts().at(-1).actor,player);assert.equal(db.receipts().at(-2).actor,gm);
});

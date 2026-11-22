import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from '../helpers/phase2.mjs';
import {campaignStore,campaignMatches} from '../helpers/campaign-store.mjs';
import loomContract from '../fixtures/loom-character-contract-v1.json' with { type: 'json' };

const require=createRequire(import.meta.url);
const {handlers}=require('../../src/modules/archipelago/campaigns/controller');
const authority=require('../../src/modules/archipelago/characters/authority');
const gm='111111111111111111111111', player='222222222222222222222222', outsider='333333333333333333333333';

test('campaign session hosting, joining and reload respect campaign membership',async()=>{
  const {store,call}=fixture();
  const {data:campaign}=await call('create',gm,{name:'Salt Fleet'});
  await call('join',player,{inviteCode:campaign.inviteCode});
  const sessions=require('../../src/modules/archipelago/sessions/controller').handlers(store.Campaign,store.Session);
  async function request(action,user,body){
    let data,status=200;
    await sessions[action]({user:{_id:user},params:{campaignId:campaign._id},body},{status(value){status=value;return this;},send(value){data=value;}});
    return {status,data};
  }
  await assert.rejects(()=>request('create',player,{name:'Unauthorized'}),{statusCode:403});
  const hosted=await request('create',gm,{name:'First voyage'});
  assert.equal(hosted.status,201);
  assert.equal(hosted.data.host,true);
  assert.match(hosted.data.roomCode,/^[A-F0-9]{12}$/);
  const payload={roomCode:hosted.data.roomCode.toLowerCase()};
  await assert.rejects(()=>request('join',outsider,payload),{statusCode:404});
  assert.equal((await request('list',player)).data[0].joined,false);
  const joined=await request('join',player,payload);
  assert.equal(joined.data.joined,true);
  assert.equal(joined.data.roomCode,undefined);
  await request('join',player,payload);
  assert.deepEqual(store.sessions[0].connectedUsers,[player]);
  assert.deepEqual((await request('list',player)).data,[joined.data]);
});

function fixture({
  character = build('doctor',6,'field-surgeon').character,
  characterId = '444444444444444444444444',
  owner = player,
} = {}){
  let records=[{...character,_id:characterId,owner,status:'active',campaignId:null}];
  const store=campaignStore(()=>records);
  const Character={...store.Character,
    db:{startSession:async()=>({
      async withTransaction(fn){
        const before=structuredClone({records,campaigns:store.campaigns});
        try{await fn();}catch(error){records=before.records;store.campaigns=before.campaigns;throw error;}
      },endSession:async()=>{},
    })},
    async create([data]){
      const copy={...structuredClone(data),_id:String(records.length+1).padStart(24,'0')};
      records.push(copy);
      return [structuredClone(copy)];
    },
    findOne(filter){return {session(){return this;},async lean(){return structuredClone(records.find(row=>campaignMatches(row,filter))??null);}};},
  };
  const api=handlers(store.Campaign,Character);
  async function call(action,user,body,params={}){
    let status=200,data;
    await api[action]({user:{_id:user},body,params},{status(value){status=value;return this;},send(value){data=value;}});
    return {status,data};
  }
  return {store,characterId,read:()=>records[0],copies:()=>records.slice(1),call};
}

test('campaign creation and opening are membership scoped, with private invite codes and an atomic capacity check',async()=>{
  const {store,call}=fixture();
  await assert.rejects(()=>call('create',player,{name:'Forged',owner:gm}),{statusCode:422});
  const created=await call('create',gm,{name:' Salt Fleet ',description:' Crew log '});
  assert.equal(created.status,201);
  const campaign=created.data, params={campaignId:campaign._id};
  assert.equal(campaign.name,'Salt Fleet');
  assert.match(campaign.inviteCode,/^[A-F0-9]{12}$/);
  await assert.rejects(()=>call('open',outsider,undefined,params),{statusCode:404});
  assert.deepEqual((await call('list',player)).data,[]);
  store.campaigns[0].maxPlayers=1;
  const joined=await call('join',player,{inviteCode:campaign.inviteCode.toLowerCase()});
  assert.equal(joined.data.canGM,false);
  assert.equal(joined.data.inviteCode,undefined);
  assert.equal((await call('join',player,{inviteCode:campaign.inviteCode})).data.playerCount,1);
  await assert.rejects(()=>call('join',outsider,{inviteCode:campaign.inviteCode}),{statusCode:409});
  assert.equal((await call('list',player)).data[0]._id,campaign._id);
});

test('Loom fixture matches campaign ownership, approval authority, and source independence', async () => {
  const { input, expected } = loomContract.campaignOwnership;
  const character = require('../../src/modules/archipelago/characters/persistence')
    .build(loomContract.creation.input, { equip: true });
  character.documentRevision = input.sourceRevision;
  character.rulesRuntime.health.current = input.sourceHealth;
  const { call, copies, read, store } = fixture({
    character, characterId: input.sourceCharacterId, owner: input.playerId,
  });
  const { data: campaign } = await call('create', input.gmId, input.campaign);
  await call('join', input.playerId, { inviteCode: campaign.inviteCode });
  const { data: admission } = await call('register', input.playerId, {
    expectedSourceRevision: input.sourceRevision,
  }, { campaignId: campaign._id, characterId: input.sourceCharacterId });
  const copy = copies()[0];
  assert.equal(admission.admissionState, expected.pendingState);
  assert.equal(copy.documentRevision, expected.copyRevisionOnCreate);
  assert.equal(copy.campaignId, campaign._id);
  assert.equal(copy.owner, input.playerId);
  assert.equal(copy.sourceCharacterId, input.sourceCharacterId);
  assert.equal(copy.campaignAdmission.sourceRevision, expected.copySourceRevision);
  assert.deepEqual(copy.inventory, read().inventory);
  assert.deepEqual(copy.loadout, read().loadout);

  const params = { campaignId: campaign._id, characterId: admission.characterId };
  await assert.rejects(() => call('decideAdmission', input.playerId, input.decision, params),
    { statusCode: 404 });
  await call('decideAdmission', input.gmId, input.decision, params);
  const approved = copies()[0];
  assert.equal(approved.campaignAdmission.state, expected.approvedState);
  assert.equal(approved.documentRevision, expected.copyRevisionAfterApproval);
  assert.deepEqual(approved.rulesRuntime.health, expected.copyHealth);
  assert.equal(read().rulesRuntime.health.current, expected.sourceHealthAfterApproval);
  read().name = input.sourceRenamedTo;
  assert.equal(approved.name, expected.copyName);
  const playerAccess = await authority.context(approved, input.playerId, store.Campaign);
  const gmAccess = await authority.context(approved, input.gmId, store.Campaign);
  assert.equal(authority.permissions(approved, playerAccess).canAdvance,
    expected.playerCanAdvanceBeforeMilestone);
  assert.equal(authority.permissions(approved, gmAccess).canGM, expected.gmCanAuthorizeMilestone);
  assert.equal(authority.permissions(approved, gmAccess).canAdvance, expected.gmCanAdvancePlayerCharacter);

  const { apply } = require('../../src/modules/archipelago/characters/commands');
  const milestone = {
    type: 'milestone.authorize', payload: input.milestone, rulesVersion: loomContract.rulesVersion,
    operationId: 'loom-milestone', expectedRevision: approved.documentRevision,
  };
  assert.throws(() => apply(approved, milestone, playerAccess), /campaign GM/);
  const { changes } = apply(approved, milestone, gmAccess);
  assert.equal(authority.permissions({ ...approved, ...changes }, playerAccess).canAdvance,
    expected.playerCanAdvanceAfterMilestone);
});

test('admission rolls back failed writes and produces independent campaign copies',async()=>{
  const {store,call,characterId,read,copies}=fixture();
  const {data:campaign}=await call('create',gm,{name:'Salt Fleet'}), params={campaignId:campaign._id,characterId};
  await assert.rejects(()=>call('register',player,undefined,params),{statusCode:404});
  await call('join',player,{inviteCode:campaign.inviteCode});
  await assert.rejects(()=>call('register',gm,undefined,params),{statusCode:404});
  read().rulesRuntime.milestones=[{level:6,used:true},{level:7,used:false}];
  read().rulesRuntime.rebuildProposal={approvedBy:player};
  const before=structuredClone(read());
  store.rejectRosterWrite=true;
  await assert.rejects(()=>call('register',player,undefined,params),{statusCode:409});
  assert.deepEqual(read(),before);
  assert.deepEqual(store.campaigns[0].characterIds,[]);
  assert.deepEqual(copies(),[]);
  store.rejectRosterWrite=false;
  const {data:enrollment}=await call('register',player,undefined,params);
  const copy=copies()[0];
  assert.deepEqual(read(),before);
  assert.equal(copy.sourceCharacterId,characterId);
  assert.equal(copy.owner,player);
  assert.equal(copy.campaignId,campaign._id);
  assert.equal(copy.documentRevision,0);
  assert.deepEqual(copy.inventory,before.inventory);
  assert.deepEqual(copy.rulesRuntime.milestones??[],[]);
  assert.equal(copy.rulesRuntime.rebuildProposal,undefined);
  assert.equal((await call('register',player,undefined,params)).data.characterId,enrollment.characterId);
  assert.deepEqual(store.campaigns[0].characterIds,[copy._id]);
  const gmAccess=await authority.context(copy,gm,store.Campaign);
  const playerAccess=await authority.context(copy,player,store.Campaign);
  assert.equal(gmAccess.gmAllowed,true);
  assert.equal(playerAccess.isOwner,true);
  assert.equal(authority.permissions(copy,playerAccess).canAdvance,false);
  const roster=(await call('open',gm,undefined,params)).data.characters;
  assert.equal(roster[0]._id,copy._id);
  assert.deepEqual(Object.keys(roster[0]),['_id','name','calling']);
  const {data:second}=await call('create',player,{name:'Other Fleet'});
  const {data:secondEnrollment}=await call('register',player,undefined,{campaignId:second._id,characterId});
  assert.notEqual(secondEnrollment.characterId,copy._id);
  assert.deepEqual(read(),before);
  const baseline=structuredClone(copies()[1]);
  assert.equal(copy.campaignAdmission.sourceRevision,before.documentRevision);
  read().name='Edited personal character';
  read().documentRevision++;
  read().inventory.length=0;
  read().rulesRuntime.health.current=1;
  read().rulesRuntime.slots.fill(0);
  read().rulesLedger.levels.pop();
  read().rulesRuntime.effects.push({id:'personal-only'});
  assert.deepEqual(copies()[1],baseline);
  assert.deepEqual(copy.inventory,before.inventory);
  assert.equal(copy.rulesLedger.levels.length,before.rulesLedger.levels.length);
  copy.rulesRuntime.health.current=2;
  copy.inventory.length=0;
  assert.equal(read().rulesRuntime.health.current,1);
  assert.deepEqual(copies()[1],baseline);
  read().status='deleted';
  assert.equal((await call('open',gm,undefined,params)).data.characters[0]._id,copy._id);
});

test('campaign requirements and GM decisions gate activation of a reviewed copy',async()=>{
  const {call,characterId,copies}=fixture();
  const {data:campaign}=await call('create',gm,{name:'Review Fleet',startingLevel:6,requireAdmissionApproval:true});
  const params={campaignId:campaign._id,characterId};
  await call('join',player,{inviteCode:campaign.inviteCode});
  const candidate=await call('register',player,undefined,params);
  assert.equal(candidate.data.admissionState,'pending');
  const pending=await call('open',player,undefined,params);
  assert.deepEqual(pending.data.characters,[]);
  assert.equal(pending.data.admissions[0]._id,candidate.data.characterId);
  const reviewParams={...params,characterId:candidate.data.characterId};
  await assert.rejects(()=>call('decideAdmission',player,{decision:'approve',reason:'Forged'},reviewParams),{statusCode:404});
  await call('decideAdmission',gm,{decision:'approve',reason:'Build reviewed'},reviewParams);
  assert.equal(copies()[0].documentRevision,1);
  assert.equal(copies()[0].campaignAdmission.decidedBy,gm);
  assert.equal(copies()[0].campaignAdmission.reason,'Build reviewed');
  await assert.rejects(()=>call('decideAdmission',gm,{decision:'reject',reason:'Stale'},reviewParams),{statusCode:409});
  const active=await call('open',player,undefined,params);
  assert.equal(active.data.characters[0]._id,candidate.data.characterId);
  assert.deepEqual(active.data.admissions,[]);
  const {data:second}=await call('create',player,{name:'First Level Fleet',startingLevel:1});
  await assert.rejects(()=>call('register',player,undefined,{...params,campaignId:second._id}),/requires a level 1/);
  assert.equal(copies().length,1);
  const adaptedParams={...params,campaignId:second._id};
  await assert.rejects(()=>call('register',player,{expectedSourceRevision:10,adaptStartingLevel:true},adaptedParams),{statusCode:409});
  await call('register',player,{expectedSourceRevision:0,adaptStartingLevel:true},adaptedParams);
  assert.equal(copies()[1].rulesLedger.levels.length,1);
  assert.equal(copies()[1].campaignAdmission.originalLevel,6);
});

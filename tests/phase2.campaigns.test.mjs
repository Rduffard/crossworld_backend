import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from './helpers/phase2.mjs';
import {campaignStore,campaignMatches} from './helpers/campaign-store.mjs';

const require=createRequire(import.meta.url);
const {handlers}=require('../src/modules/archipelago/campaigns/controller');
const authority=require('../src/modules/archipelago/characters/authority');
const gm='111111111111111111111111', player='222222222222222222222222', outsider='333333333333333333333333';

test('campaign session hosting, joining and reload respect campaign membership',async()=>{
  const {store,call}=fixture();
  const {data:campaign}=await call('create',gm,{name:'Salt Fleet'});
  await call('join',player,{inviteCode:campaign.inviteCode});
  const sessions=require('../src/modules/archipelago/sessions/controller').handlers(store.Campaign,store.Session);
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

function fixture(){
  const {character}=build('doctor',6,'field-surgeon');
  const characterId='444444444444444444444444';
  let records=[{...character,_id:characterId,owner:player,status:'active',campaignId:null}];
  const store=campaignStore(()=>records);
  const Character={...store.Character,
    db:{startSession:async()=>({
      async withTransaction(fn){
        const before=structuredClone({records,campaigns:store.campaigns});
        try{await fn();}catch(error){records=before.records;store.campaigns=before.campaigns;throw error;}
      },endSession:async()=>{},
    })},
    findOne(filter){return {session(){return this;},async lean(){return structuredClone(records.find(row=>campaignMatches(row,filter))??null);}};},
  };
  const api=handlers(store.Campaign,Character);
  async function call(action,user,body,params={}){
    let status=200,data;
    await api[action]({user:{_id:user},body,params},{status(value){status=value;return this;},send(value){data=value;}});
    return {status,data};
  }
  return {store,characterId,read:()=>records[0],call};
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

test('registration rolls back a rejected roster write and drops solo approval while retaining the character owner',async()=>{
  const {store,call,characterId,read}=fixture();
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
  store.rejectRosterWrite=false;
  await call('register',player,undefined,params);
  assert.equal(read().owner,player);
  assert.equal(read().campaignId,campaign._id);
  assert.equal(read().documentRevision,before.documentRevision+1);
  assert.deepEqual(read().rulesRuntime.milestones,[{level:6,used:true}]);
  assert.equal(read().rulesRuntime.rebuildProposal,undefined);
  await call('register',player,undefined,params);
  assert.equal(read().documentRevision,before.documentRevision+1);
  assert.deepEqual(store.campaigns[0].characterIds,[characterId]);
  const gmAccess=await authority.context(read(),gm,store.Campaign);
  const playerAccess=await authority.context(read(),player,store.Campaign);
  assert.equal(gmAccess.gmAllowed,true);
  assert.equal(playerAccess.isOwner,true);
  assert.equal(authority.permissions(read(),playerAccess).canAdvance,false);
  const roster=(await call('open',gm,undefined,params)).data.characters;
  assert.equal(roster[0]._id,characterId);
  assert.deepEqual(Object.keys(roster[0]),['_id','name','calling']);
  const {data:second}=await call('create',player,{name:'Other Fleet'});
  await assert.rejects(()=>call('register',player,undefined,{campaignId:second._id,characterId}),{statusCode:409});
});

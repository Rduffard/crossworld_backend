import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

test('shared router preserves user, WTWR, Squash, Community and Pale Shelter HTTP contracts',async t=>{
  const express=require('express'),jwt=require('jsonwebtoken');
  const {JWT_SECRET}=require('../src/config/env');
  const modules='../src/modules/';
  const owner='111111111111111111111111';
  const user={_id:owner,name:'Fixture User',email:'fixture@example.com',password:'hidden'};
  const items=[{name:'Coat',weather:'cold',owner}];
  const projects=[{name:'Fixture Project',owner}];
  const plays=[{trackId:'fixture-track',count:2}];
  t.mock.method(require(modules+'users/model'),'findById',id=>{
    assert.equal(id,owner);
    return {orFail:async()=>user};
  });
  t.mock.method(require(modules+'wtwr/model'),'find',async filter=>{
    assert.deepEqual(filter,{});
    return items;
  });
  t.mock.method(require(modules+'squash/projects/model'),'find',filter=>{
    assert.deepEqual(filter,{$or:[{owner},{members:owner}]});
    return {sort:()=>({lean:async()=>projects})};
  });
  t.mock.method(require(modules+'community/models/CommunitySpace'),'find',filter=>{
    assert.deepEqual(filter,{visibility:'public'});
    return {sort:()=>({populate:async()=>[]})};
  });
  t.mock.method(require(modules+'paleshelter/model'),'aggregate',async()=>plays);

  const app=express();
  app.use(express.json(),require('../src/routes'));
  app.use(require('celebrate').errors(),require('../src/core/middleware/errorHandler'));
  const server=await new Promise((resolve,reject)=>{
    const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));
    listener.once('error',reject);
  });
  t.after(()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
  const base='http://127.0.0.1:'+server.address().port;
  const headers={Authorization:'Bearer '+jwt.sign({_id:owner},JWT_SECRET)};
  for(const route of ['/users/me','/wtwr/items','/squash/projects','/archipelago/system/rules-2024']){
    assert.equal((await fetch(base+route)).status,401,route);
  }
  const response=await fetch(base+'/users/me',{headers});
  assert.equal(response.status,200);
  const me=await response.json();
  assert.equal(me._id,owner);
  assert.equal(me.displayName,'Fixture User');
  assert.equal(me.settings.theme,'default');
  assert.equal(me.password,undefined);
  for(const [route,expected,auth] of [
    ['/wtwr/items',items,true],['/squash/projects',projects,true],
    ['/community/spaces',[],false],['/paleshelter',plays,false],
  ]){
    const response=await fetch(base+route,auth?{headers}:{});
    assert.equal(response.status,200,route);
    assert.deepEqual(await response.json(),expected,route);
  }
  const rules=await fetch(base+'/archipelago/system/rules-2024',{headers});
  assert.equal(rules.status,200);
  assert.equal((await rules.json()).callings.length,8);
});

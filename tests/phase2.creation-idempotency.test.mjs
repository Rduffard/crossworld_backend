import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),persistence=require('../src/modules/archipelago/characters/rules2024');
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
function fixture(){const b=build('gunslinger');return {name:'Retry Sailor',attributes:b.ledger.baseAttributes,creation:b.ledger.creation,firstLevel:b.ledger.levels[0]};}
function store(){
  const documents=[];let creates=0,limit=0;
  const model={findOne:q=>({lean:async()=>clone(documents.find(d=>d.owner===q.owner&&d.creationRequest?.operationId===q['creationRequest.operationId']))}),countDocuments:async()=>limit,
    create:async value=>{await Promise.resolve();if(documents.some(d=>d.owner===value.owner&&d.creationRequest.operationId===value.creationRequest.operationId))throw Object.assign(new Error('duplicate'),{code:11000});creates++;documents.push(clone(value));return value;}};
  const handler=persistence.handlers(model).create;
  async function call(body,key='creation-retry-001',owner='111111111111111111111111'){let data,error,status;await handler({body,user:{_id:owner},get:()=>key},{status(n){status=n;return this;},send(v){data=clone(v);}},e=>{error=e;});return {data,error,status};}
  return {call,documents,get creates(){return creates;},setLimit(n){limit=n;}};
}
test('creation retry returns the original result after response loss, later changes and character-limit exhaustion',async()=>{
  const db=store(),body=fixture(),first=await db.call(body);assert.equal(first.status,201);assert.equal(first.error,undefined);
  db.documents[0].name='Later edit';db.documents[0].documentRevision=5;db.setLimit(20);
  const retry=await db.call(body);assert.deepEqual(retry.data,first.data);assert.equal(db.creates,1);assert.equal(retry.data.creationRequest,undefined);
});
test('creation request digest ignores object key order but rejects changed choices for the same key',async()=>{
  const db=store(),body=fixture(),first=await db.call(body);
  const reordered=Object.fromEntries(Object.entries(body).reverse());assert.deepEqual((await db.call(reordered)).data,first.data);
  const conflict=await db.call({...body,name:'Different Sailor'});assert.equal(conflict.error.statusCode,409);assert.equal(conflict.error.code,'operation_conflict');assert.equal(db.creates,1);
});
test('concurrent identical creates converge on one character through the unique-key winner',async()=>{
  const db=store(),body=fixture(),results=await Promise.all([db.call(body),db.call(body)]);
  assert.equal(db.creates,1);for(const r of results){assert.equal(r.error,undefined);assert.equal(r.status,201);}assert.deepEqual(results[0].data,results[1].data);
});
test('creation operation keys are owner-scoped and malformed keys fail before creation',async()=>{
  const db=store(),body=fixture();await db.call(body);const other=await db.call(body,'creation-retry-001','222222222222222222222222');assert.equal(other.error,undefined);assert.equal(db.creates,2);
  for(const key of ['bad','', 'x'.repeat(81)]){const r=await db.call(body,key);assert.equal(r.error.statusCode,422);assert.equal(r.error.fieldPath,'Idempotency-Key');}assert.equal(db.creates,2);
});
test('creation validates all choices before writing a keyed request',async()=>{
  const db=store(),r=await db.call({...fixture(),owner:'forged'});assert.ok(r.error);assert.equal(db.creates,0);
});

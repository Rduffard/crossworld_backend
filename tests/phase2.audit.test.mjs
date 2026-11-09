import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{handler}=require('../src/modules/archipelago/characters/audit');
function store(){
  let reads=0;const records=Array.from({length:5},(_,i)=>({_id:(5-i).toString(16).padStart(24,'0'),operationId:'operation-'+i,createdAt:new Date(2026,0,i+1).toISOString(),response:{name:'Hidden character snapshot',operationResult:{type:'identity.patch'}}}));
  const Character={findOne:q=>({lean:async()=>q.owner==='owner'&&q._id==='character'?{_id:'character'}:null})};
  const Receipt={find:q=>{reads++;assert.equal(q.owner,'owner');assert.equal(q.characterId,'character');return {select(fields){assert.equal(fields,'_id operationId createdAt response.operationResult');return this;},sort(value){assert.deepEqual(value,{_id:-1});return this;},limit(n){this.n=n;return this;},async lean(){return records.filter(r=>!q._id||r._id<q._id.$lt).slice(0,this.n);}};}};
  async function call(query={},owner='owner'){let data,error;await handler(Character,Receipt)({params:{characterId:'character'},user:{_id:owner},query},{send(v){data=v;}},e=>{error=e;});return {data,error};}
  return {call,get reads(){return reads;}};
}
test('audit pages are bounded, stable and contain operation results without character snapshots',async()=>{
  const db=store(),first=await db.call({limit:'2'});assert.equal(first.error,undefined);assert.equal(first.data.items.length,2);assert.equal(first.data.nextCursor,'000000000000000000000004');
  assert.equal(first.data.items[0].result.type,'identity.patch');assert.equal(first.data.items[0].response,undefined);
  const second=await db.call({limit:'2',cursor:first.data.nextCursor}),third=await db.call({limit:'2',cursor:second.data.nextCursor});
  assert.equal(third.data.items.length,1);assert.equal(third.data.nextCursor,null);assert.equal(new Set([...first.data.items,...second.data.items,...third.data.items].map(r=>r.id)).size,5);
});
test('audit rejects foreign ownership before reading receipts',async()=>{
  const db=store(),r=await db.call({},'other');assert.equal(r.error.statusCode,404);assert.equal(db.reads,0);
});
test('audit rejects invalid cursors, bounds, arrays and unknown query keys',async()=>{
  const db=store();for(const query of [{limit:'0'},{limit:'101'},{limit:'2.5'},{limit:['2']},{cursor:'bad'},{cursor:{$gt:''}},{owner:'someone-else'}]){const r=await db.call(query);assert.equal(r.error.statusCode,422);assert.equal(r.error.code,'invalid_pagination');}assert.equal(db.reads,0);
});

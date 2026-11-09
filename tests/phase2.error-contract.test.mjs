import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),handler=require('../src/core/middleware/errorHandler'),commands=require('../src/modules/archipelago/characters/commands');
function response(error,url='/archipelago/characters/character/commands'){let status,body;handler(error,{originalUrl:url},{status(value){status=value;return this;},send(value){body=value;}},()=>{});return {status,body};}
test('character validation errors expose a stable status, code and field path while unrelated error behavior stays unchanged',()=>{
  const error=Object.assign(new Error('Bad selection'),{statusCode:400}),character=response(error);assert.equal(character.status,422);assert.equal(character.body.code,'validation_error');assert.equal(character.body.fieldPath,'body');
  const unrelated=response(error,'/auth/signin');assert.equal(unrelated.status,400);assert.deepEqual(unrelated.body,{message:'Bad selection'});
});
test('stale commands report the authoritative revision and mismatch versions identify their exact field',()=>{
  const c=build('gunslinger').character,envelope={operationId:'error-operation-001',expectedRevision:5,rulesVersion:'SA-CHAR-1',type:'identity.patch',payload:{notes:'Test'}};
  let error;try{commands.apply(c,envelope);}catch(e){error=e;}const stale=response(error);assert.equal(stale.status,409);assert.equal(stale.body.code,'revision_conflict');assert.equal(stale.body.fieldPath,'expectedRevision');assert.equal(stale.body.currentRevision,0);
  try{commands.apply(c,{...envelope,rulesVersion:'wrong'});}catch(e){error=e;}assert.equal(response(error).body.code,'rules_version_mismatch');
});
test('unexpected failures do not expose internal exception text',()=>{
  const result=response(new Error('Secret database details'));assert.equal(result.status,500);assert.equal(result.body.message,'An error occurred on the server');assert.ok(!JSON.stringify(result).includes('Secret'));
});

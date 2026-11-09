import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),persistence=require('../src/modules/archipelago/characters/rules2024'),commands=require('../src/modules/archipelago/characters/commands');
const details={pronouns:' they/them ',appearance:' A red coat. ',portraitUrl:' https://example.com/portrait.png ',notes:' Session notes '};
function patch(character,payload){return commands.apply(character,{operationId:'identity-operation-001',rulesVersion:'SA-CHAR-1',expectedRevision:character.documentRevision,type:'identity.patch',payload});}
test('creation preserves each narrative field and validates the full saved model',async()=>{
  const b=build('gunslinger'),c=persistence.build({name:'Sailor',...details,attributes:b.ledger.baseAttributes,creation:b.ledger.creation,firstLevel:b.ledger.levels[0]});
  for(const[key,value]of Object.entries(details))assert.equal(c[key],value.trim());
  const Model=require('../src/modules/archipelago/characters/model');await new Model({...c,owner:'111111111111111111111111'}).validate();
});
test('identity command preserves mechanics, supports clearing optional fields and returns precise invalid fields',()=>{
  const b=build('corsair',3),before=structuredClone(b.character),r=patch(b.character,details);
  assert.deepEqual(b.character,before);for(const[key,value]of Object.entries(details))assert.equal(r.changes[key],value.trim());
  for(const key of ['rulesRuntime','rulesLedger','attributes','inventory','goldCp'])assert.deepEqual(r.changes[key],before[key]);
  const cleared=patch({...b.character,...r.changes},{pronouns:'',appearance:'',portraitUrl:''});assert.equal(cleared.changes.portraitUrl,'');
  for(const [key,value]of [['pronouns','x'.repeat(1001)],['appearance',{}],['portraitUrl','http://example.com/p.png'],['portraitUrl','https://'],['name','x']]){
    assert.throws(()=>patch(b.character,{[key]:value}),e=>e.statusCode===422&&e.fieldPath===key);assert.deepEqual(b.character,before);
  }
  assert.throws(()=>patch(b.character,{health:1000}),/narrative/);
});
test('creation rejects invalid portrait or identity fields before saving',()=>{
  const b=build('doctor'),body={name:'Sailor',attributes:b.ledger.baseAttributes,creation:b.ledger.creation,firstLevel:b.ledger.levels[0]};
  for(const value of ['javascript:alert(1)','http://example.com/p.png','not a URL'])assert.throws(()=>persistence.build({...body,portraitUrl:value}),e=>e.statusCode===422&&e.fieldPath==='portraitUrl');
  assert.throws(()=>persistence.build({...body,appearance:'x'.repeat(1001)}),e=>e.fieldPath==='appearance');
});

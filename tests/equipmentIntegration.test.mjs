import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build as buildPhase2, rules, creation } from './helpers/phase2.mjs';
function build(id){const b=buildPhase2(id);return {...b.character,attributes:b.ledger.baseAttributes};}
const require = createRequire(import.meta.url);
const persistence = require('../src/modules/archipelago/characters/rules2024');
const equipment = require('../src/modules/archipelago/equipment');
const packages = require('../src/modules/archipelago/system/rules2024/equipment');
for (const calling of rules.blueprint.callings) {
  test(`${calling.name}: every starting package has persistent inventory and valid item definitions`, async () => {
    for (const selection of packages.options(calling.id)) {
      const fixture = build(calling.id);
      const firstLevel = fixture.rulesLedger.levels[0];
      firstLevel.choices.equipment = [selection];
      const character = persistence.build({ name: 'Sailor', origin: 'Yuma', attributes: fixture.attributes, firstLevel, creation:creation() });
      const Model = require('../src/modules/archipelago/characters/model');
      await new Model({ ...character, owner: '111111111111111111111111' }).validate();
      assert.ok(Number.isInteger(character.goldCp));
      assert.ok(character.inventory.length || selection === 'starting-gold');
      const sheet = persistence.decorate(character);
      assert.equal(sheet.equipment.guard, calling.id === 'reaver' ? 14 : 12);
      assert.deepEqual(sheet.inventory, character.inventory);
      const withSword = equipment.update(character, { expectedRevision: 0, add: [{ definitionId: 'cutlass' }] });
      const sword = withSword.inventory.at(-1);
      const equipped = { ...character, ...withSword, loadout: { ...character.loadout, mainHand: sword.instanceId } };
      const derived = persistence.decorate(equipped).equipment;
      assert.equal(derived.attacks[0].trained, ['corsair', 'gunslinger', 'navigator', 'warden', 'reaver', 'doctor'].includes(calling.id));
      assert.throws(() => equipment.update(equipped, { expectedRevision: 1, remove: [sword.instanceId] }));
      assert.throws(() => equipment.update(equipped, { expectedRevision: 0, remove: [sword.instanceId] }));
    }
  });
}
test('equipment mutation is owner-scoped and detects concurrent writes', async () => {
  let document = { _id: 'id', owner: 'owner', ...persistence.build({ name: 'Sailor', origin: 'Yuma',
    attributes: build('gunslinger').attributes, firstLevel: build('gunslinger').rulesLedger.levels[0], creation:creation() }) };
  let race = false;
  let receipts=[];
  const model = {
    db:{startSession:async()=>({withTransaction:async fn=>{const before=structuredClone(document),count=receipts.length;try{await fn();}catch(error){document=before;receipts=receipts.slice(0,count);throw error;}},endSession:async()=>{}})},
    findOne: query => ({ session(){return this;},lean: async () => query.owner === document.owner ? structuredClone(document) : null }),
    findOneAndUpdate: (query, update) => ({ session(){return this;},lean: async () => {
      if (race || query.documentRevision !== document.documentRevision || query.owner !== document.owner) return null;
      document = { ...document, ...structuredClone(update.$set) }; return document;
    } }),
  };
  const Receipt={findOne:q=>({session(){return this;},lean:async()=>structuredClone(receipts.find(r=>r.operationId===q.operationId&&r.owner===q.owner)??null)}),create:async rows=>receipts.push(...structuredClone(rows))},handler=require('../src/modules/archipelago/characters/commands').handler(model,Receipt);
  async function save(body, owner = 'owner') {
    let data, error;
    const {expectedRevision,...payload}=body;
    await handler({body:{operationId:require('node:crypto').randomUUID(),expectedRevision,rulesVersion:'SA-CHAR-1',type:'equipment.equip',payload},params:{characterId:'id'},user:{_id:owner}},
      { send(value) { data = value; } }, e => { error = e; });
    return { data, error };
  }
  const armor=document.inventory.find(i=>i.definitionId==='chain-mail');
  const operation = { expectedRevision: 0, loadout:{...document.loadout,armor:armor.instanceId} };
  assert.equal((await save(operation, 'other')).error.statusCode, 404);
  assert.equal((await save({expectedRevision:0,add:[{definitionId:'pistol'}]})).error.statusCode,422);
  const result = await save(operation);
  assert.equal(result.data.documentRevision, 1);
  assert.equal(result.data.loadout.armor,armor.instanceId);
  const before = structuredClone(document);
  assert.ok((await save(operation)).error);
  race = true;
  assert.equal((await save({ ...operation, expectedRevision: 1 })).error.statusCode, 409);
  assert.deepEqual(document, before);
});

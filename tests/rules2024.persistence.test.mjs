import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const rules = require("../src/modules/archipelago/system/rules2024");
const persistence = require("../src/modules/archipelago/characters/rules2024");
import { complete, creation, scores } from './helpers/phase2.mjs';
function completed(callingId, levels = [], pathId) {
 return complete({version:3,ruleset:'srd-5.2.1',revision:levels.length,baseAttributes:scores,creation:creation(),levels:[...structuredClone(levels),{callingId,choices:{}}]},pathId).ledger.levels.at(-1);
}
for (const path of rules.blueprint.paths) {
  test(`${path.name}: persistent advancement and automatic grants at every level through 20`, async () => {
    const db = store();
    let result = await db.call("create", { name: "Roster Test", origin: "Archipelago",
      attributes: scores, creation: creation(), firstLevel: completed(path.callingId) });
    assert.equal(result.error, undefined);
    for (let level = 2; level <= 20; level++) {
      const c = result.data;
      const event = completed(path.callingId, c.rulesLedger.levels, path.id);
      const before = structuredClone(c);
      result = await db.call("advance", { expectedRevision: c.documentRevision,
        operation: { expectedRevision: c.rulesLedger.revision, ...event } });
      assert.equal(result.error, undefined, `${path.id} level ${level}: ${result.error?.message}`);
      const reloaded = (await db.call("get")).data;
      const {operationResult,...savedResponse}=result.data;assert.equal(operationResult.type,'advance');assert.deepEqual(reloaded,savedResponse);
      assert.equal(reloaded.rulesSummary.totalLevel, level);
      assert.equal(reloaded.rulesSummary.decisionsComplete, true);
      assert.equal(reloaded.rulesSummary.tabletopReady, false);
      if (level >= 3) {
        assert.equal(reloaded.rulesSummary.paths[path.callingId], path.id);
        const expected = path.grants.filter(id => rules.blueprint.features.find(f => f.id === id).callingLevel <= level);
        assert.deepEqual(reloaded.rulesSummary.features.filter(f => f.ownerId === path.id).map(f => f.id), expected);
      }
      assert.deepEqual(before.rulesLedger.levels, reloaded.rulesLedger.levels.slice(0, -1));
      const Model = require("../src/modules/archipelago/characters/model");
      await new Model({ ...db.read(), owner: "222222222222222222222222" }).validate();
    }
  });
}
function store() {
  let document;
  let receipts=[];
  let race = false;
  const clone = value => value && structuredClone(value);
  const model = {
    db:{startSession:async()=>({withTransaction:async fn=>{const before=clone(document),count=receipts.length;try{await fn();}catch(error){document=before;receipts=receipts.slice(0,count);throw error;}},endSession:async()=>{}})},
    countDocuments: async () => document ? 1 : 0,
    create: async payload => { document = { _id: "111111111111111111111111", ...clone(payload) }; return clone(document); },
    findOne: query => ({ session(){return this;},lean: async () => document && query._id === document._id && query.owner === document.owner ? clone(document) : null }),
    findOneAndUpdate: (query, update) => ({ session(){return this;},lean: async () => {
      if (race || !document || query.owner !== document.owner || query.documentRevision !== document.documentRevision) return null;
      Object.assign(document, clone(update.$set)); return clone(document);
    } }),
  };
  const handlers = persistence.handlers(model);
  const Receipt={findOne:q=>({session(){return this;},lean:async()=>clone(receipts.find(r=>r.characterId===q.characterId&&r.owner===q.owner&&r.operationId===q.operationId)??null)}),create:async rows=>receipts.push(...clone(rows))},command=require('../src/modules/archipelago/characters/commands').handler(model,Receipt);
  async function call(method, body, owner = "owner") {
    let data, error, status = 200;
    if(['advance','patch','resource'].includes(method)){
      const {expectedRevision,...identity}=body??{},operation={...body?.operation};delete operation.expectedRevision;
      const type=method==='advance'?'advance':method==='patch'?'identity.patch':['slot-to-sorcery','sorcery-to-slot','restore-feature'].includes(operation.type)?'resource.convert':'resource.adjust';
      body={operationId:require('node:crypto').randomUUID(),expectedRevision:expectedRevision??document.documentRevision,rulesVersion:'SA-CHAR-1',type,payload:method==='advance'?{level:document.rulesLedger.levels.length+1,choices:operation.choices??{}}:method==='patch'?identity:operation};
    }
    await (handlers[method]??command)({ body, user: { _id: owner }, params: { characterId: "111111111111111111111111" } },
      { status(value) { status = value; return this; }, send(value) { data = value; } }, e => { error = e; });
    return { data, error, status };
  }
  return { call, read: () => clone(document), race: () => { race = true; } };
}
for (const callingId of rules.blueprint.callings.map(c => c.id)) {
  test(`${callingId}: complete level-one choices survive model validation and persistence reload`, async () => {
    const db = store();
    const body = { name: "Test Sailor", origin: "Yuma", attributes: scores, creation: creation(), firstLevel: completed(callingId) };
    const result = await db.call("create", body);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 201);
    assert.deepEqual((await db.call("get")).data.rulesSummary, result.data.rulesSummary);
    assert.equal(result.data.rulesSummary.decisionsComplete, true);
    const Model = require("../src/modules/archipelago/characters/model");
    await new Model({ ...db.read(), owner: "222222222222222222222222" }).validate();
  });
}
test("creation rejects incomplete choices, forged ownership, and submitted derived mechanics", () => {
  const body = { name: "Test Sailor", origin: "Yuma", attributes: scores, creation: creation(), firstLevel: completed("gunslinger") };
  for (const key of ["owner", "rulesLedger", "rulesRuntime", "resources", "training", "progression"])
    assert.throws(() => persistence.build({ ...body, [key]: {} }));
  assert.throws(() => persistence.build({ ...body, creation: creation(), firstLevel: { callingId: "doctor", choices: {} } }));
});
test("owner-scoped reads and every mutation reject a different user", async () => {
  const db = store();
  await db.call("create", { name: "Test Sailor", origin: "Yuma", attributes: scores, creation: creation(), firstLevel: completed("gunslinger") });
  const before = db.read();
  for (const action of ["get", "patch", "preview", "advance", "resource"])
    assert.equal((await db.call(action, {}, "intruder")).error.statusCode, 404);
  assert.deepEqual(db.read(), before);
});
test("receipted identity edits preserve mechanics and reject stale or forged updates", async () => {
  const db = store();
  await db.call("create", { name: "Test Sailor", origin: "Yuma", attributes: scores, creation: creation(), firstLevel: completed("gunslinger") });
  const before = db.read();
  assert.equal((await db.call("patch", { expectedRevision: 0 })).data.documentRevision, 1);
  const result = await db.call("patch", { expectedRevision: 1, notes: "A narrative wound; no penalty." });
  assert.equal(result.data.documentRevision, 2);
  assert.deepEqual(result.data.rulesLedger, before.rulesLedger);
  assert.deepEqual(result.data.rulesRuntime, before.rulesRuntime);
  assert.equal((await db.call("patch", { expectedRevision: 0, name: "Stale" })).error.statusCode, 409);
  assert.equal((await db.call("patch", { expectedRevision: 2, attributes: scores })).error.statusCode, 422);
});
test("atomic advancement requires the level-three Path, preserves expenditure, and detects write races", async () => {
  const db = store();
  await db.call("create", { name: "Test Sailor", origin: "Yuma", attributes: scores, creation: creation(), firstLevel: completed("gunslinger") });
  await db.call("resource", { expectedRevision: 0, operation: { expectedRevision: 0, type: "spend-pool", poolId: "gunslinger:second-wind", amount: 1 } });
  const event = completed("gunslinger", db.read().rulesLedger.levels);
  const advanced = await db.call("advance", { expectedRevision: 1, operation: { expectedRevision: 0, ...event } });
  assert.equal(advanced.data.rulesSummary.totalLevel, 2);
  assert.equal(advanced.data.rulesRuntime.pools["gunslinger:second-wind"], 1);
  const before = db.read();
  const missingPath = await db.call("advance", { expectedRevision: 2, operation: { expectedRevision: 1, callingId: "gunslinger", choices: {} } });
  assert.equal(missingPath.error.statusCode, 400);
  assert.deepEqual(db.read(), before);
  const preview = await db.call("preview", { callingId: "gunslinger", choices: {} });
  assert.equal(preview.data.requiredChoices[0].key, "pathId");
  assert.deepEqual(db.read(), before);
  const third = completed("gunslinger", before.rulesLedger.levels);
  db.race();
  assert.equal((await db.call("advance", { expectedRevision: 2, operation: { expectedRevision: 1, ...third } })).error.statusCode, 409);
  assert.deepEqual(db.read(), before);
});
test("resource saves reject stale revisions and cannot bypass the timed rest planner", async () => {
  const db = store();
  await db.call("create", { name: "Test Sailor", origin: "Lilin", attributes: scores, creation: creation(), firstLevel: completed("doctor") });
  const spent = await db.call("resource", { expectedRevision: 0, operation: { expectedRevision: 0, type: "spend-slot", slotLevel: 1 } });
  assert.equal(spent.data.rulesRuntime.slots[0], 1);
  assert.equal((await db.call("resource", { expectedRevision: 0, operation: { expectedRevision: 0, type: "long-rest" } })).error.statusCode, 409);
  const rested = await db.call("resource", { expectedRevision: 1, operation: { expectedRevision: 1, type: "long-rest" } });
  assert.equal(rested.error.statusCode,422);
  assert.equal(db.read().rulesRuntime.slots[0],1);
});

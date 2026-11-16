import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {build,rules} from '../helpers/phase2.mjs';
const require=createRequire(import.meta.url);
const commands=require('../../src/modules/archipelago/characters/commands');
const gear=require('../../src/modules/archipelago/equipment');
const envelope=(type,payload,expectedRevision=0)=>({operationId:'command-test-0001',expectedRevision,rulesVersion:'SA-CHAR-1',type,payload});

function transactionalStore(character,initialReceipts=[]){
  let saved={_id:'111111111111111111111111',owner:'owner',...structuredClone(character)},receipts=structuredClone(initialReceipts);
  const query=value=>({session(){return this;},lean:async()=>structuredClone(value())});
  const Character={
    db:{startSession:async()=>({withTransaction:async fn=>{
      const before=structuredClone(saved),previous=structuredClone(receipts);
      try{await fn();}catch(e){saved=before;receipts=previous;throw e;}
    },endSession:async()=>{}})},
    findOne:q=>query(()=>q._id===saved._id&&q.owner===saved.owner?saved:null),
    findOneAndUpdate:(q,u)=>query(()=>{
      if(q.owner!==saved.owner||q.documentRevision!==saved.documentRevision)return null;
      saved={...saved,...structuredClone(u.$set)};return saved;
    }),
  };
  const Receipt={findOne:q=>query(()=>receipts.find(r=>r.operationId===q.operationId&&r.owner===q.owner&&r.characterId===q.characterId)??null),create:async entries=>{receipts.push(...structuredClone(entries));}};
  const handler=commands.handler(Character,Receipt);
  return {read:()=>structuredClone(saved),receipts:()=>structuredClone(receipts),async call(body,owner='owner'){
    let data,error;await handler({body,user:{_id:owner},params:{characterId:saved._id}},{send(value){data=value;}},e=>{error=e;});return {data,error};
  }};
}

const sorceryPool = 'tidecaller:sorcery-points';
test('movement rejects duplicate events and replays the saved open turn after closure', async () => {
  const store = transactionalStore(build('reaver', 1).character);
  const command = (id, type, payload, revision) => ({
    ...envelope(type, payload, revision),
    operationId: `movement-history-${id}`,
  });
  const turn = { turnId: 'movement-turn', confirmed: true };
  const movement = { feet: 15, voluntarySpeed: true, eventId: 'step-one', confirmed: true };
  assert.ifError((await store.call(command('start', 'turn.start', turn, 0))).error);
  const record = command('record', 'movement.record', movement, 1);
  const first = await store.call(record);
  assert.ifError(first.error);
  assert.equal(first.data.operationResult.movementFeet, 15);
  const before = store.read();
  assert.match(
    (await store.call(command('duplicate', 'movement.record', movement, 2))).error?.message,
    /Movement event already recorded/,
  );
  assert.deepEqual(store.read(), before);
  assert.equal(store.receipts().length, 2);
  assert.ifError((await store.call(command('end', 'turn.end', turn, 2))).error);
  const closed = store.read();
  const replay = await store.call(record);
  assert.ifError(replay.error);
  assert.deepEqual(replay.data, first.data);
  assert.deepEqual(store.read(), closed);
  assert.equal(store.receipts().length, 3);
});

const wardenPool = 'iron-covenant:standard';

test('Sorcery Point conversions preserve gameplay and reject malformed command payloads', () => {
  const outcomes = [];
  function capture(character, payload) {
    const before = structuredClone(character);
    try {
      const { changes, result } = commands.apply(character, envelope('resource.convert', payload));
      const { inventory, loadout, ...stableChanges } = changes;
      assert.deepEqual(inventory, character.inventory);
      assert.deepEqual(loadout, character.loadout);
      outcomes.push({ result, changes: stableChanges });
    } catch (error) {
      if (!error.statusCode) throw error;
      outcomes.push({ statusCode: error.statusCode, code: error.code, message: error.message });
    }
    assert.deepEqual(character, before);
  }

  const full = build('tidecaller', 20).character;
  for (let slotLevel = 1; slotLevel <= 9; slotLevel++) {
    for (const [available, created] of [[0, 0], [1, 0], [2, 1], [0, 3], [1, 3], [1, 99], [1, 100], [1, 101]]) {
      for (const points of [0, 1, 2, 3, 4, 5, 6, 7, 20 - slotLevel, 21 - slotLevel, 20]) {
        const character = structuredClone(full);
        const state = character.rulesRuntime;
        state.slots[slotLevel - 1] = available;
        state.createdSlots[slotLevel - 1] = created;
        state.pools[sorceryPool] = points;
        for (const type of ['slot-to-sorcery', 'sorcery-to-slot']) {
          capture(character, { type, slotLevel });
        }
      }
    }
  }
  for (const level of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const { character } = build('tidecaller', level);
    for (const slotLevel of [1, 2, 3, 4, 5, 6]) {
      capture(character, { type: 'sorcery-to-slot', slotLevel });
    }
  }
  const noPool = build('warden', 5).character;
  for (const type of ['slot-to-sorcery', 'sorcery-to-slot']) {
    capture(noPool, { type, slotLevel: 1 });
    capture(noPool, { type, slotLevel: 10, amount: 1 });
    for (const slotLevel of [undefined, '1', null, 0, -1, 1.5, 10]) {
      capture(full, { type, slotLevel });
    }
  }
  assert.equal(outcomes.length, 1656);
  assert.equal(createHash('sha256').update(JSON.stringify(outcomes)).digest('hex'),
    'd141b32208931a27134e31af2e9c35906cc193205bb4a8f96e521d6741a04f1e');
});

test('sequential Sorcery Point conversions preserve slot balances and commit each receipt once', async () => {
  const { character } = build('tidecaller', 5);
  character.rulesRuntime.pools[sorceryPool] = 4;
  const initialSlots = character.rulesRuntime.slots[0];
  const store = transactionalStore(character);
  const command = (id, type, revision) => ({
    ...envelope('resource.convert', { type, slotLevel: 1 }, revision),
    operationId: 'sorcery-conversion-' + id,
  });
  const accepted = [];
  for (const [type, points, available, created] of [
    ['sorcery-to-slot', 2, initialSlots + 1, 1],
    ['sorcery-to-slot', 0, initialSlots + 2, 2],
    ['slot-to-sorcery', 1, initialSlots + 1, 1],
    ['slot-to-sorcery', 2, initialSlots, 0],
    ['slot-to-sorcery', 3, initialSlots - 1, 0],
  ]) {
    const revision = accepted.length;
    const body = command(revision, type, revision);
    const { data, error } = await store.call(body);
    assert.ifError(error);
    accepted.push({ body, data });
    const { documentRevision, rulesRuntime: state } = store.read();
    assert.equal(documentRevision, revision + 1);
    assert.equal(state.revision, revision + 1);
    assert.equal(state.pools[sorceryPool], points);
    assert.equal(state.slots[0], available);
    assert.equal(state.createdSlots[0], created);
    assert.deepEqual(data.operationResult, { type: 'resource.convert' });
    assert.equal(store.receipts().length, revision + 1);
    assert.deepEqual(store.receipts().at(-1).response, data);

    if (points === 0) {
      const saved = store.read(), receipts = store.receipts();
      const rejection = await store.call(command('insufficient', type, documentRevision));
      assert.equal(rejection.error.statusCode, 400);
      assert.equal(rejection.error.message, 'Insufficient Sorcery Points or Calling level');
      assert.deepEqual(store.read(), saved);
      assert.deepEqual(store.receipts(), receipts);
    }
  }
  const saved = store.read(), receipts = store.receipts();
  for (const { body, data } of accepted) {
    const stale = await store.call({ ...body, operationId: body.operationId + '-stale' });
    assert.equal(stale.error.code, 'revision_conflict');
    assert.deepEqual((await store.call(body)).data, data);
  }
  assert.deepEqual(store.read(), saved);
  assert.deepEqual(store.receipts(), receipts);

  const cappedCharacter = structuredClone(character);
  cappedCharacter.rulesRuntime.createdSlots[0] = 99;
  const capped = transactionalStore(cappedCharacter);
  const lastCreation = await capped.call(command('marker-100', 'sorcery-to-slot', 0));
  assert.ifError(lastCreation.error);
  const atLimit = capped.read(), limitReceipts = capped.receipts();
  assert.equal(atLimit.rulesRuntime.createdSlots[0], 100);
  assert.equal(atLimit.rulesRuntime.pools[sorceryPool], 2);
  const overflow = await capped.call(command('marker-101', 'sorcery-to-slot', 1));
  assert.equal(overflow.error.statusCode, 400);
  assert.equal(overflow.error.message, 'Invalid saved spell slots');
  assert.deepEqual(capped.read(), atLimit);
  assert.deepEqual(capped.receipts(), limitReceipts);
});

test('slot resource commands preserve gameplay and reject malformed slot and restoration payloads', () => {
  const tidecaller = build('tidecaller', 20);
  const warden = build('warden', 20, 'iron-covenant');
  const outcomes = [];
  function capture(character, type, payload) {
    const before = JSON.stringify(character);
    try {
      const { changes, result } = commands.apply(character, envelope(type, payload));
      const { inventory, loadout, ...stableChanges } = changes;
      assert.deepEqual(inventory, character.inventory);
      assert.deepEqual(loadout, character.loadout);
      outcomes.push({ result, changes: stableChanges });
    } catch (error) {
      if (!error.statusCode) throw error;
      outcomes.push({ statusCode: error.statusCode, code: error.code, message: error.message });
    }
    assert.equal(JSON.stringify(character), before);
  }
  for (const slotLevel of [undefined, '5', 0, 1.5, 10, ...Array.from({ length: 9 }, (_, i) => i + 1)]) {
    for (const available of [0, 1, 2]) {
      for (const created of [0, 1, 3]) {
        const character = structuredClone(tidecaller.character);
        const state = character.rulesRuntime;
        const index = slotLevel - 1;
        if (Number.isInteger(slotLevel) && index >= 0 && index < state.slots.length) {
          if (available > tidecaller.summary.spellSlots[index] + created) continue;
          state.slots[index] = available;
          state.createdSlots[index] = created;
        } else if (available || created) continue;
        capture(character, 'resource.adjust', { type: 'spend-slot', slotLevel });
        for (const points of [0, tidecaller.summary.resources[sorceryPool].max]) {
          state.pools[sorceryPool] = points;
          capture(character, 'resource.convert', { type: 'slot-to-sorcery', slotLevel });
        }
      }
    }
  }
  for (const slotLevel of [undefined, 4, 5, 6]) {
    for (const available of [0, 1, 2]) {
      for (const created of [0, 1, 3]) {
        for (const uses of [0, 1]) {
          if (available > warden.summary.spellSlots[4] + created) continue;
          const character = structuredClone(warden.character);
          character.rulesRuntime.slots[4] = available;
          character.rulesRuntime.createdSlots[4] = created;
          character.rulesRuntime.pools[wardenPool] = uses;
          character.rulesRuntime.effects.push({ id: 'action-fixture', featureId: 'fixture:ends-after-action', endsAfterAction: true });
          capture(character, 'resource.convert', { type: 'restore-feature', poolId: wardenPool, slotLevel });
        }
      }
    }
  }
  capture(warden.character, 'resource.convert', { type: 'slot-to-sorcery', slotLevel: 1 });
  capture(tidecaller.character, 'resource.adjust', { type: 'spend-slot', slotLevel: 1, amount: 2 });
  const hash = createHash('sha256').update(JSON.stringify(outcomes, function (key, value) {
    // Preserve the earlier mechanics baseline for records that acquired an ID.
    if (key === 'id' && (this.id === 'action-fixture' || this.featureId && this.note !== undefined && /^[a-f0-9-]{36}$/.test(value))) return undefined;
    return value;
  })).digest('hex');
  assert.equal(outcomes.length, 326);
  assert.equal(hash, 'edf6e5797f58ab005546a31506f6de3a3102b3027e39052cae898cc988c9badc');
});

test('resource slot deductions commit once and reject stale or ineligible commands atomically', async t => {
  const random = t.mock.method(require('node:crypto'), 'randomInt', () => assert.fail('Unexpected die roll'));
  const { character } = build('tidecaller', 20);
  character.rulesRuntime.slots[0] = 2;
  character.rulesRuntime.createdSlots[0] = 3;
  character.rulesRuntime.pools[sorceryPool] = 19;
  const tidecaller = transactionalStore(character);
  const wardenCharacter = build('warden', 20, 'iron-covenant').character;
  wardenCharacter.rulesRuntime.pools[wardenPool] = 0;
  wardenCharacter.rulesRuntime.createdSlots[4] = 1;
  const warden = transactionalStore(wardenCharacter);
  const adjust = envelope('resource.adjust', { type: 'spend-slot', slotLevel: 1 });
  const convert = {
    ...envelope('resource.convert', { type: 'slot-to-sorcery', slotLevel: 1 }, 1),
    operationId: 'slot-resource-convert',
  };
  const restore = envelope('resource.convert', { type: 'restore-feature', poolId: wardenPool, slotLevel: 5 });
  for (const [store, command, level, totals, markers, pool, points] of [
    [tidecaller, adjust, 1, 1, 2, sorceryPool, 19],
    [tidecaller, convert, 1, 0, 1, sorceryPool, 20],
    [warden, restore, 5, wardenCharacter.rulesRuntime.slots[4] - 1, 0, wardenPool, 1],
  ]) {
    const before = store.read(), receiptsBefore = store.receipts().length;
    assert.equal((await store.call(command, 'outsider')).error.statusCode, 404);
    const { data, error } = await store.call(command);
    assert.ifError(error);
    const saved = store.read(), receipts = store.receipts();
    assert.equal(saved.documentRevision, before.documentRevision + 1);
    assert.equal(saved.rulesRuntime.revision, before.rulesRuntime.revision + 1);
    assert.equal(saved.rulesRuntime.slots[level - 1], totals);
    assert.equal(saved.rulesRuntime.createdSlots[level - 1], markers);
    assert.equal(saved.rulesRuntime.pools[pool], points);
    assert.deepEqual(data.operationResult, { type: command.type });
    assert.equal(receipts.length, receiptsBefore + 1);
    assert.deepEqual(receipts.at(-1).response, data);
    const stale = { ...command, operationId: 'slot-resource-stale' };
    assert.equal((await store.call(stale)).error.code, 'revision_conflict');
    assert.deepEqual((await store.call(command)).data, data);
    assert.deepEqual(store.read(), saved);
    assert.deepEqual(store.receipts(), receipts);
  }
  for (const [store, command, message] of [
    [tidecaller, adjust, 'Unavailable spell slot'],
    [tidecaller, convert, 'No slot or Sorcery Point capacity'],
    [warden, restore, 'Feature must be exhausted'],
  ]) {
    const saved = store.read(), receipts = store.receipts();
    const { error } = await store.call({
      ...command, operationId: 'slot-resource-reject', expectedRevision: saved.documentRevision,
    });
    assert.equal(error.statusCode, 400);
    assert.equal(error.message, message);
    assert.deepEqual(store.read(), saved);
    assert.deepEqual(store.receipts(), receipts);
  }
  assert.equal(random.mock.callCount(), 0);
});
test('casting budget rejection and receipt replay preserve saved slots, charges, Sorcery Points and journals', async () => {
  const { character } = build('tidecaller', 3);
  character.rulesRuntime.slots[0]++;
  character.rulesRuntime.createdSlots[0] = 1;
  character.rulesLedger.levels[1].choices.metamagic = ['quickened-spell', 'subtle-spell'];
  const casting = rules.replay(character.rulesLedger).spellcasting.tidecaller;
  const spellId = casting.prepared.find(id => rules.blueprint.spells.find(spell => spell.id === id).castingTime === 'Action');
  const wand = gear.issue({ definitionId: 'wand-of-magic-missiles' });
  character.inventory.push(wand);
  character.loadout = { ...character.loadout, mainHand: wand.instanceId, offHand: null, grip: 'one' };
  const store = transactionalStore(character);
  const command = (id, type, payload, revision = store.read().documentRevision) => ({
    ...envelope(type, payload, revision), operationId: 'casting-budget-' + id,
  });
  async function accepted(body) {
    const { data, error } = await store.call(body);
    assert.ifError(error);
    return data;
  }
  const turnId = 'receipt-owner-turn';
  await accepted(command('start', 'turn.start', { turnId, confirmed: true }));
  const item = command('item', 'item.cast', { instanceId: wand.instanceId, charges: 1, confirmed: true });
  const itemCast = await accepted(item);
  const spell = command('spell', 'spell.cast', { callingId: 'tidecaller', spellId, slotLevel: 1 });
  const spellCast = await accepted(spell);
  const saved = store.read(), receipts = store.receipts();
  assert.equal(saved.rulesRuntime.slots[0], character.rulesRuntime.slots[0] - 1);
  assert.equal(saved.rulesRuntime.createdSlots[0], 0);
  assert.equal(spellCast.operationResult.spentSlot, true);
  assert.equal(saved.rulesRuntime.castings[1].usedSlot, true);
  assert.equal(saved.inventory.find(entry => entry.instanceId === wand.instanceId).chargesCurrent, wand.chargesCurrent - 1);
  assert.equal(saved.rulesRuntime.castings.length, 2);
  const reloaded = JSON.parse(JSON.stringify(saved));
  assert.deepEqual(reloaded.rulesRuntime.turnCasting[turnId],
    { slotSpent: true, leveled: true, quickened: false, freeMetamagic: false });
  assert.equal(rules.runtime.validate(rules.replay(reloaded.rulesLedger), reloaded.rulesRuntime), true);
  assert.match((await store.call(command('repeat-slot', 'spell.cast', spell.payload))).error.message, /Only one spell slot/);
  const quickened = command('quickened', 'spell.cast', {
    callingId: 'tidecaller', spellId: casting.cantrips[0], metamagic: ['quickened-spell'],
  });
  assert.match((await store.call(quickened)).error.message, /Quickened prohibits/);
  assert.equal((await store.call({ ...item, operationId: 'casting-budget-stale' })).error.statusCode, 409);
  assert.deepEqual(store.read(), saved);
  assert.deepEqual(store.receipts(), receipts);
  await accepted(command('end', 'turn.end', { turnId, confirmed: true }));
  const ended = store.read(), endedReceipts = store.receipts();
  assert.deepEqual(await accepted(item), itemCast);
  assert.deepEqual(await accepted(spell), spellCast);
  assert.deepEqual(store.read(), ended);
  assert.deepEqual(store.receipts(), endedReceipts);
});

test('Spell Recall after a spent turn budget preserves the created slot and replays without rolling', async t => {
  const { character } = build('tidecaller', 19);
  const choices = character.rulesLedger.levels.at(-1).choices;
  choices.feat = 'boon-of-spell-recall';
  choices.increases = { spirit: 1 };
  const summary = rules.replay(character.rulesLedger);
  assert.ok(summary.feats.includes(choices.feat));
  character.rulesRuntime = rules.runtime.initialize(summary);
  character.rulesRuntime.slots[0] += 2;
  character.rulesRuntime.createdSlots[0] = 2;
  const profiles = require('@crossworld/sanguine-engine/spells').profiles;
  const spellId = summary.spellcasting.tidecaller.prepared.find(id => rules.blueprint.spells.some(
    spell => spell.id === id && spell.level === 1 && spell.castingTime === 'Action' && !profiles[id].components.includes('M')));
  assert.ok(spellId);
  const store = transactionalStore(character);
  const command = (operationId, type, payload) => ({
    ...envelope(type, payload, store.read().documentRevision), operationId,
  });
  const start = await store.call(command('recall-start', 'turn.start', { turnId: 'recall-turn', confirmed: true }));
  assert.ifError(start.error);
  const dice = [2, 1, 2];
  const random = t.mock.method(require('node:crypto'), 'randomInt', (min, max) => {
    assert.deepEqual([min, max], [1, 5]);
    return dice.shift();
  });
  const payload = { spellId, callingId: 'tidecaller', slotLevel: 1 };
  const spent = await store.call(command('recall-spent', 'spell.cast', payload));
  assert.ifError(spent.error);
  assert.deepEqual(spent.data.operationResult.spellRecall, { roll: 2, slotLevel: 1, preserved: false });
  assert.equal(store.read().rulesRuntime.createdSlots[0], 1);
  const preserved = command('recall-preserved', 'spell.cast', payload);
  const result = await store.call(preserved);
  assert.ifError(result.error);
  assert.deepEqual(result.data.operationResult.spellRecall, { roll: 1, slotLevel: 1, preserved: true });
  const saved = store.read(), receipts = store.receipts();
  assert.equal(saved.rulesRuntime.slots[0], character.rulesRuntime.slots[0] - 1);
  assert.equal(saved.rulesRuntime.createdSlots[0], 1);
  assert.equal(saved.rulesRuntime.castings.at(-1).usedSlot, true);
  assert.equal(saved.rulesRuntime.castings.at(-1).spentSlot, false);
  assert.match((await store.call(command('recall-rejected', 'spell.cast', payload))).error.message, /Only one spell slot/);
  assert.deepEqual((await store.call(preserved)).data, result.data);
  assert.equal(random.mock.callCount(), 3);
  assert.deepEqual(store.read(), saved);
  assert.deepEqual(store.receipts(), receipts);
});

test('scaled Path pools preserve spending and receipt safety through advancement, rebuild and rest', async () => {
  for (const [calling, path, key, alternate] of [
    ['shipwright', 'drydock-ghost', 'ghost-work', 'powder-saint'],
    ['navigator', 'storm-broker', 'squall', 'gray-net'],
    ['doctor', 'field-surgeon', 'triage', 'sanctuary-hand'],
    ['shipwright', 'breakwater', 'bastion', 'powder-saint'],
  ]) {
    const id = path + ':' + key;
    const { character } = build(calling, 6, path);
    const store = transactionalStore(character);
    const command = (name, type, payload, revision = store.read().documentRevision) => ({
      ...envelope(type, payload, revision), operationId: 'scaled-pool-' + name,
    });
    async function accepted(body) {
      const { data, error } = await store.call(body);
      assert.ifError(error);
      return data;
    }
    async function rebuild(ledger, name, expected) {
      const prior = store.read().rulesRuntime.pools;
      const preview = await accepted(command(name + '-preview', 'rebuild.preview', { ledger, reason: name }));
      assert.deepEqual(preview.rulesRuntime.pools, prior);
      assert.equal(preview.rebuildReview.consequences.pools[id], expected);
      const result = await accepted(command(name + '-commit', 'rebuild.commit', {
        proposalId: preview.rulesRuntime.rebuildProposal.proposalId, acceptConsequences: true,
      }));
      assert.equal(result.rulesRuntime.pools[id], expected);
      return result;
    }

    const spent = await accepted(command('spend', 'resource.adjust', { type: 'spend-pool', poolId: id, amount: 1 }));
    assert.equal(spent.rulesRuntime.pools[id], 1);
    const { ledger } = build(calling, 7, path);
    const advance = command('advance', 'advance', { level: 7, choices: ledger.levels[6].choices });
    const advanced = await accepted(advance);
    assert.equal(advanced.rulesSummary.resources[id].max, 3);
    assert.deepEqual(advanced.rulesRuntime.pools, { ...spent.rulesRuntime.pools, [id]: 2 });
    const reloaded = JSON.parse(JSON.stringify(store.read()));
    const replayed = rules.replay(reloaded.rulesLedger);
    assert.equal(replayed.resources[id].max, 3);
    assert.equal(reloaded.rulesRuntime.pools[id], 2);
    assert.equal(rules.runtime.validate(replayed, reloaded.rulesRuntime), true);

    const saved = store.read(), receipts = store.receipts();
    assert.equal(receipts.length, 2);
    assert.deepEqual(await accepted(advance), advanced);
    assert.equal((await store.call({ ...advance, operationId: 'scaled-pool-stale' })).error.statusCode, 409);
    assert.equal((await store.call(command('invalid', 'advance', { level: 9, choices: {} }))).error.statusCode, 422);
    assert.deepEqual(store.read(), saved);
    assert.deepEqual(store.receipts(), receipts);

    const away = await rebuild(build(calling, 7, alternate).ledger, 'away', undefined);
    assert.equal(away.rulesSummary.resources[id], undefined);
    const restored = await rebuild(advanced.rulesLedger, 'into', 0);
    assert.equal(restored.rulesSummary.resources[id].max, 3);
    const restId = 'scaled-pool-short';
    await accepted(command('rest-start', 'rest.start', { restId, kind: 'short-rest', startedAt: 0 }));
    const rested = await accepted(command('rest-complete', 'rest.complete', { restId, completedAt: 3600000 }));
    assert.equal(rested.rulesRuntime.pools[id], 1);
    assert.deepEqual(rested.rulesRuntime.restHistory, [restId]);
  }
});

test('rest-selected preparations survive advancement, reload and receipt replay', async () => {
  const { character } = build('doctor', 2);
  const store = transactionalStore(character);
  const command = (id, type, payload, revision) => ({
    ...envelope(type, payload, revision), operationId: 'preparation-receipt-' + id,
  });
  async function accepted(body) {
    const { data, error } = await store.call(body);
    assert.ifError(error);
    return data;
  }
  const restChoices = ['cure-wounds', 'sanctuary', 'command', 'bane', 'bless'];
  const restId = 'preparation-rest';
  await accepted(command('rest-start', 'rest.start', {
    restId, kind: 'long-rest', startedAt: 0, options: { preparations: { doctor: restChoices } },
  }, 0));
  const rested = await accepted(command('rest-complete', 'rest.complete', { restId, completedAt: 8 * 3600000 }, 1));
  assert.deepEqual(rested.rulesRuntime.preparations.doctor, restChoices);
  const { ledger, summary } = build('doctor', 3);
  const advance = command('advance', 'advance', { level: 3, choices: ledger.levels[2].choices }, 2);
  const advanced = await accepted(advance);
  const prepared = ['sanctuary', 'command', 'bane', 'detect-evil-and-good', 'detect-magic', 'detect-poison-and-disease'];
  assert.deepEqual(advanced.rulesRuntime.preparations.doctor, prepared);
  assert.deepEqual(advanced.rulesSummary.spellcasting.doctor.alwaysPrepared, ['aid', 'bless', 'cure-wounds', 'lesser-restoration']);
  assert.deepEqual(advanced.rulesRuntime.restHistory, [restId]);
  const reloaded = JSON.parse(JSON.stringify(store.read()));
  assert.deepEqual(commands.apply(reloaded, command('check', 'identity.patch', { notes: 'Reloaded' }, 3))
    .changes.rulesRuntime.preparations.doctor, prepared);

  const preview = await accepted(command('preview', 'rebuild.preview', {
    ledger: advanced.rulesLedger, reason: 'Keep existing level choices',
  }, 3));
  assert.deepEqual(preview.rulesRuntime.preparations.doctor, prepared);
  assert.ok(preview.rebuildReview);
  const committed = await accepted(command('commit', 'rebuild.commit', {
    proposalId: preview.rulesRuntime.rebuildProposal.proposalId,
    acceptConsequences: true,
  }, 4));
  assert.deepEqual(committed.rulesRuntime.preparations.doctor, summary.spellcasting.doctor.prepared);
  const saved = store.read(), receipts = store.receipts();
  assert.equal(receipts.length, 5);
  assert.deepEqual(await accepted(advance), advanced);
  assert.equal((await store.call({ ...advance, operationId: 'preparation-receipt-stale' })).error.statusCode, 409);
  assert.equal((await store.call(command('invalid', 'advance', { level: 8, choices: {} }, 5))).error.statusCode, 422);
  assert.deepEqual(store.read(), saved);
  assert.deepEqual(store.receipts(), receipts);
});

test('spell-slot advancement receipts preserve balances and reject stale commands atomically', async () => {
  const { character } = build('tidecaller', 2);
  const store = transactionalStore(character);
  const command = (id, type, payload, revision) => ({
    ...envelope(type, payload, revision), operationId: 'slot-receipt-' + id,
  });
  async function accepted(body) {
    const { data, error } = await store.call(body);
    assert.ifError(error);
    return data;
  }
  await accepted(command('spend-1', 'resource.adjust', { type: 'spend-slot', slotLevel: 1 }, 0));
  await accepted(command('spend-2', 'resource.adjust', { type: 'spend-slot', slotLevel: 1 }, 1));
  await accepted(command('create', 'resource.convert', { type: 'sorcery-to-slot', slotLevel: 1 }, 2));
  const { ledger } = build('tidecaller', 4);
  const firstCommand = command('advance-3', 'advance', { level: 3, choices: ledger.levels[2].choices }, 3);
  const first = await accepted(firstCommand);
  assert.deepEqual(first.rulesRuntime.slots, [3, 2]);
  assert.deepEqual(first.rulesRuntime.createdSlots, [1, 0]);
  const second = await accepted(command('advance-4', 'advance', { level: 4, choices: ledger.levels[3].choices }, 4));
  assert.deepEqual(second.rulesRuntime.slots, [3, 3]);
  assert.deepEqual(second.rulesRuntime.createdSlots, [1, 0]);
  const before = store.read();
  const receipts = store.receipts();
  assert.equal(receipts.length, 5);
  assert.deepEqual(await accepted(firstCommand), first);
  assert.equal((await store.call({ ...firstCommand, operationId: 'slot-receipt-stale' })).error.statusCode, 409);
  assert.equal((await store.call(command('invalid', 'advance', { level: 8, choices: {} }, 5))).error.statusCode, 422);
  assert.deepEqual(store.read(), before);
  assert.deepEqual(store.receipts(), receipts);
  const reloaded = JSON.parse(JSON.stringify(before));
  assert.equal(rules.runtime.validate(rules.replay(reloaded.rulesLedger), reloaded.rulesRuntime), true);
  assert.deepEqual(reloaded.rulesRuntime.slots, [3, 3]);
  assert.deepEqual(reloaded.rulesRuntime.createdSlots, [1, 0]);
});

test('transactional command receipts replay prior result, reject changed body and isolate ownership',async()=>{
  const store=transactionalStore(build('gunslinger').character);
  const command=envelope('identity.patch',{name:'First command'});
  const first=await store.call(command);assert.equal(first.error,undefined);assert.equal(first.data.documentRevision,1);
  const second=await store.call({...envelope('identity.patch',{notes:'Later command'},1),operationId:'command-test-0002'});assert.equal(second.error,undefined);
  const replay=await store.call(command);assert.deepEqual(replay.data,first.data);assert.equal(store.read().documentRevision,2);assert.equal(store.receipts().length,2);
  assert.equal((await store.call({...command,payload:{name:'Different'}})).error.statusCode,409);
  assert.equal((await store.call(command,'intruder')).error.statusCode,404);
  assert.equal(store.read().name,'First command');
});
test('failed transactions do not save a character mutation or operation receipt',async()=>{
  const store=transactionalStore(build('tidecaller',3).character),before=store.read();
  const invalid=envelope('spell.cast',{callingId:'tidecaller',spellId:'wish',slotLevel:1});
  const result=await store.call(invalid);assert.ok(result.error);assert.deepEqual(store.read(),before);assert.equal(store.receipts().length,0);
  assert.equal((await store.call(envelope('identity.patch',{name:'Stale'},5))).error.statusCode,409);
});

test('manual resource expenditure uses receipts and cannot bypass revision conflicts or invoke an untyped recovery',async()=>{
  const store=transactionalStore(build('tidecaller',3).character),before=store.read().rulesRuntime.pools['tidecaller:sorcery-points'],body=envelope('resource.adjust',{type:'spend-pool',poolId:'tidecaller:sorcery-points',amount:1});const first=await store.call(body);assert.equal(first.error,undefined);assert.equal(first.data.rulesRuntime.pools['tidecaller:sorcery-points'],before-1);assert.deepEqual((await store.call(body)).data,first.data);assert.equal(store.receipts().length,1);assert.equal((await store.call({...body,operationId:'stale-resource-command'})).error.statusCode,409);assert.equal((await store.call({...envelope('resource.adjust',{type:'long-rest'},1),operationId:'invalid-recovery-command'})).error.statusCode,422);
});

test('manual Initiative recovery requires a recorded Initiative and resolves only once per combat',()=>{
  let c=build('reaver',15,'bloodwake').character;c.rulesRuntime.pools['reaver:rage']=0;const recovery=envelope('resource.adjust',{type:'initiative-recovery',poolId:'reaver:rage'});assert.throws(()=>commands.apply(c,recovery),/saved combat Initiative/);let out=commands.apply(c,envelope('initiative.record',{combatId:'one',roll:10,confirmed:true}));c={...c,...out.changes};out=commands.apply(c,{...recovery,expectedRevision:c.documentRevision});c={...c,...out.changes};assert.ok(c.rulesRuntime.pools['reaver:rage']>0);assert.throws(()=>commands.apply(c,{...recovery,expectedRevision:c.documentRevision}),/only once/);
});

test('manual pool expenditure pins exact depletion, rejected inputs, and receipt replay after a later revision', async () => {
  const { character } = build('tidecaller', 3);
  const poolId = 'tidecaller:sorcery-points';
  const store = transactionalStore(character);
  const command = envelope('resource.adjust', { type: 'spend-pool', poolId, amount: 3 });
  const before = store.read();
  assert.equal(before.rulesRuntime.pools[poolId], 3);
  for (const [payload, statusCode, message] of [
    [{ amount: 4 }, 400, 'Unavailable feature resource'],
    [{ amount: 0 }, 422, 'Choose a positive integer resource amount'],
    [{ amount: -1 }, 422, 'Choose a positive integer resource amount'],
    [{ amount: 1.5 }, 422, 'Choose a positive integer resource amount'],
    [{ amount: '1' }, 422, 'Choose a positive integer resource amount'],
    [{ poolId: 'unknown' }, 400, 'Unavailable feature resource'],
    [{ poolId: '__proto__' }, 400, 'Unavailable feature resource'],
    [{ poolId: [poolId] }, 422, 'Choose a resource pool by ID'],
    [{ value: 1 }, 422, 'Unexpected resource command fields'],
  ]) {
    const result = await store.call({ ...command, payload: { ...command.payload, ...payload } });
    assert.equal(result.error.message, message);
    assert.equal(result.error.statusCode, statusCode);
    assert.deepEqual(store.read(), before);
    assert.deepEqual(store.receipts(), []);
  }
  const malformed = structuredClone(character);
  malformed.rulesRuntime.pools[poolId] = 4;
  assert.throws(() => commands.apply(malformed, command), { message: 'Invalid saved pools', statusCode: 400 });
  const direct = rules.runtime.update(rules.replay(character.rulesLedger), character.rulesRuntime, {
    ...command.payload, expectedRevision: character.rulesRuntime.revision, poolId: [poolId],
  });
  assert.equal(direct.pools[poolId], 0);
  const accepted = await store.call(command);
  assert.equal(accepted.error, undefined);
  assert.equal(accepted.data.rulesRuntime.pools[poolId], 0);
  assert.deepEqual(accepted.data.operationResult, { type: 'resource.adjust' });
  const later = await store.call({
    ...envelope('identity.patch', { notes: 'later revision' }, 1), operationId: 'later-resource-command',
  });
  assert.equal(later.error, undefined);
  assert.deepEqual((await store.call(command)).data, accepted.data);
  assert.equal(store.read().rulesRuntime.pools[poolId], 0);
  assert.equal(store.read().documentRevision, 2);
  assert.equal(store.receipts().length, 2);
});

test('Initiative recovery preserves full and partial restoration, reserve expenditure, and atomic rejection', async () => {
  for (const [calling, level, path, poolId, reserve, current, restored] of [
    ['reaver', 15, 'bloodwake', 'reaver:rage', 'reaver:persistent-reserve', 1, 5],
    ['reaver', 15, 'bloodwake', 'reaver:rage', 'reaver:persistent-reserve', 5, 5],
    ['navigator', 15, 'storm-broker', 'storm-broker:squall', 'storm-broker:eye-reserve', 0, 1],
    ['reaver', 14, 'reef-colossus', 'reef-colossus:colossus', 'reef-colossus:colossus-reserve', 0, 1],
  ]) {
    const { character } = build(calling, level, path);
    character.rulesRuntime.inCombat = true;
    character.rulesRuntime.initiative = { combatId: 'fixture-combat' };
    character.rulesRuntime.pools[poolId] = current;
    const command = envelope('resource.adjust', { type: 'initiative-recovery', poolId });
    const exhausted = structuredClone(character);
    exhausted.rulesRuntime.pools[reserve] = 0;
    const blocked = transactionalStore(exhausted);
    const before = blocked.read();
    const rejected = await blocked.call(command);
    assert.equal(rejected.error.message, 'Insufficient feature resource: ' + reserve);
    assert.equal(rejected.error.statusCode, 400);
    assert.deepEqual(blocked.read(), before);
    assert.deepEqual(blocked.receipts(), []);
    if (poolId !== 'reaver:rage') {
      const nonempty = structuredClone(character);
      nonempty.rulesRuntime.pools[poolId] = 1;
      assert.throws(() => commands.apply(nonempty, command), { message: 'Pool must be empty', statusCode: 400 });
    }
    const store = transactionalStore(character);
    const accepted = await store.call(command);
    assert.equal(accepted.error, undefined);
    assert.equal(accepted.data.rulesRuntime.pools[poolId], restored);
    assert.equal(accepted.data.rulesRuntime.pools[reserve], 0);
    assert.deepEqual(accepted.data.rulesRuntime.counters.initiativeRecoveries, ['fixture-combat:' + poolId]);
    assert.deepEqual((await store.call(command)).data, accepted.data);
    assert.equal(store.receipts().length, 1);
    assert.equal(store.read().documentRevision, 1);
  }
  const { character } = build('reaver', 14, 'bloodwake');
  character.rulesRuntime.inCombat = true;
  character.rulesRuntime.initiative = { combatId: 'fixture-combat' };
  assert.throws(() => commands.apply(character, envelope('resource.adjust', {
    type: 'initiative-recovery', poolId: 'reaver:rage',
  })), { message: 'Unavailable initiative recovery', statusCode: 400 });
});

test('advancement retains spent uses and short rest restores only the existing allowance', () => {
  const { character, summary } = build('gunslinger', 3);
  const poolId = 'gunslinger:second-wind';
  const { changes } = commands.apply(character, envelope('resource.adjust', { type: 'spend-pool', poolId, amount: 2 }));
  const saved = JSON.parse(JSON.stringify(changes.rulesRuntime));
  assert.equal(saved.pools[poolId], 0);
  const after = build('gunslinger', 4).summary;
  const { reconcile } = require('../../src/modules/archipelago/characters/persistence');
  const advanced = reconcile(saved, summary, after);
  assert.equal(after.resources[poolId].max, 3);
  assert.equal(advanced.pools[poolId], 1);
  const recovered = rules.runtime.update(after, advanced, { type: 'short-rest', expectedRevision: advanced.revision });
  assert.equal(recovered.pools[poolId], 2);
  assert.equal(rules.runtime.validate(after, recovered), true);
});

test('advancement receipts preserve Health, Hit Dice, depleted pools, and new Path grants through reload and replay', async () => {
  const { character } = build('gunslinger', 2);
  const poolId = 'gunslinger:second-wind';
  character.rulesRuntime.pools[poolId] = 0;
  character.rulesRuntime.hitDice.d10 = 0;
  character.rulesRuntime.health.current = 15;
  const store = transactionalStore(JSON.parse(JSON.stringify(character)));
  const choices = build('gunslinger', 3, 'iron-suppressor').ledger.levels[2].choices;
  const advance = envelope('advance', { level: 3, choices });
  const before = store.read();
  const rejected = await store.call({ ...advance, payload: { level: 4, choices } });
  assert.match(rejected.error.message, /Advance exactly one level/);
  assert.deepEqual(store.read(), before);
  assert.deepEqual(store.receipts(), []);
  const accepted = await store.call(advance);
  assert.equal(accepted.error, undefined);
  assert.equal(accepted.data.rulesRuntime.pools[poolId], 0);
  assert.deepEqual(accepted.data.rulesRuntime.hitDice, { d10: 1 });
  assert.deepEqual(accepted.data.rulesSummary.hitDice, { d10: 3 });
  assert.deepEqual(accepted.data.rulesRuntime.health, { current: 23, max: 28 });
  assert.equal(accepted.data.rulesRuntime.pools['iron-suppressor:suppression'], 4);
  const nextChoices = build('gunslinger', 4, 'iron-suppressor').ledger.levels[3].choices;
  const next = await store.call({
    ...envelope('advance', { level: 4, choices: nextChoices }, 1), operationId: 'next-advance-command',
  });
  assert.equal(next.error, undefined);
  assert.equal(next.data.rulesRuntime.pools[poolId], 1);
  assert.deepEqual(next.data.rulesRuntime.hitDice, { d10: 2 });
  assert.deepEqual(next.data.rulesSummary.hitDice, { d10: 4 });
  assert.deepEqual(next.data.rulesRuntime.health, { current: 31, max: 36 });
  const committed = store.read();
  const receipts = store.receipts();
  assert.deepEqual((await store.call(advance)).data, accepted.data);
  assert.equal((await store.call({ ...advance, operationId: 'stale-advance-command' })).error.statusCode, 409);
  assert.deepEqual(store.read(), committed);
  assert.deepEqual(store.receipts(), receipts);
  const reloaded = JSON.parse(JSON.stringify(store.read()));
  assert.equal(rules.runtime.validate(rules.replay(reloaded.rulesLedger), reloaded.rulesRuntime), true);
  assert.deepEqual(reloaded.rulesRuntime.pools, next.data.rulesRuntime.pools);
  assert.deepEqual(reloaded.rulesRuntime.hitDice, { d10: 2 });
  assert.deepEqual(reloaded.rulesRuntime.health, { current: 31, max: 36 });
  assert.equal(store.receipts().length, 2);
});
test('rest start/completion persists its choices, enforces duration and the 24-hour Long Rest restriction',async()=>{
  const fixture=build('doctor',2).character;fixture.rulesRuntime.slots[0]=0;
  const store=transactionalStore(fixture),start=100*24*3600000;
  let result=await store.call(envelope('rest.start',{restId:'rest-001',kind:'long-rest',startedAt:start,options:{}}));
  assert.equal(result.error,undefined);assert.equal(store.read().rulesRuntime.slots[0],0);
  const complete={...envelope('rest.complete',{restId:'rest-001',completedAt:start+8*3600000},1),operationId:'complete-rest-001'};
  const short={...complete,payload:{...complete.payload,completedAt:start+7*3600000}};
  assert.match((await store.call(short)).error.message,/too short/);assert.equal(store.read().rulesRuntime.slots[0],0);
  result=await store.call(complete);assert.equal(result.error,undefined);assert.equal(result.data.rulesRuntime.slots[0],3);
  result=await store.call({...envelope('rest.start',{restId:'rest-002',kind:'long-rest',startedAt:start+9*3600000,options:{}},2),operationId:'start-rest-002'});assert.equal(result.error,undefined);
  result=await store.call({...envelope('rest.complete',{restId:'rest-002',completedAt:start+17*3600000},3),operationId:'complete-rest-002'});assert.match(result.error.message,/24 hours/);
  assert.equal(store.read().rulesRuntime.restSession.id,'rest-002');
});
test('Triage uses scaled healing, exact kit charges and a persisted target rest lock',()=>{
  const b=build('doctor',6,'field-surgeon','yuma-core','field-medic'),c=structuredClone(b.character);
  const option=b.summary.abilityOptions.find(o=>o.handler==='triage');
  const beforeKit=c.inventory.find(i=>i.chargesCurrent!==undefined);assert.equal(beforeKit.chargesCurrent,10);
  const before=structuredClone(c);
  const payload={optionId:option.id,targetIds:['patient-one'],parameters:{targetRestEpoch:'rest-1'}};
  assert.throws(()=>commands.apply(c,envelope('ability.activate',payload)),/within 5 feet/);
  assert.deepEqual(c,before);
  payload.parameters.confirmed=true;
  const result=commands.apply(c,envelope('ability.activate',payload));
  assert.equal(result.changes.rulesRuntime.pools['field-surgeon:triage'],1);
  assert.equal(result.changes.inventory.find(i=>i.instanceId===beforeKit.instanceId).chargesCurrent,9);
  assert.equal(result.result.rolls.length,3);assert.equal(result.result.healing,result.result.rolls.reduce((a,b)=>a+b,0)+6);
  assert.throws(()=>commands.apply({...c,...result.changes},envelope('ability.activate',payload,1)),/already received Triage/);
  assert.equal(c.inventory.find(i=>i.instanceId===beforeKit.instanceId).chargesCurrent,10);
});
test('Triage finds a charged catalog kit and ignores a misleading custom name',()=>{
  const b=build('doctor',6,'field-surgeon','yuma-core','field-medic');
  const gear=require('../../src/modules/archipelago/equipment');
  const depleted=b.character.inventory.find(i=>i.definitionId==='healer-kit');
  depleted.chargesCurrent=0;
  const renamed=gear.issue({definitionId:'wand-of-magic-missiles'});
  renamed.customName='Healer Kit';
  b.character.inventory.push(renamed);
  const payload={optionId:b.summary.abilityOptions.find(o=>o.handler==='triage').id,targetIds:['patient-one'],parameters:{confirmed:true,targetRestEpoch:'rest-1'}};
  const command=envelope('ability.activate',payload);
  assert.throws(()=>commands.apply(b.character,command),/available charges/);
  const charged=gear.issue({definitionId:'healer-kit'});
  charged.customName='Surgeon supplies';
  b.character.inventory.push(charged);
  const {changes}=commands.apply(b.character,command);
  const saved=id=>changes.inventory.find(i=>i.instanceId===id);
  assert.equal(saved(charged.instanceId).chargesCurrent,9);
  assert.equal(saved(depleted.instanceId).chargesCurrent,0);
  assert.equal(saved(renamed.instanceId).chargesCurrent,renamed.chargesCurrent);
});
test('barriers persist scaled object statistics and replace previous barriers',()=>{
  const b=build('shipwright',10,'breakwater'),option=b.summary.abilityOptions.find(o=>o.handler==='barrier');
  const first=commands.apply(b.character,envelope('ability.activate',{optionId:option.id,parameters:{confirmed:true}}));
  const barrier=first.changes.rulesRuntime.effects.find(e=>e.objectType==='barrier');
  assert.deepEqual(barrier.health,{current:70,max:70});assert.equal(barrier.width,20);assert.equal(barrier.height,10);assert.equal(barrier.cover,'three-quarters');
  const next=commands.apply({...b.character,...first.changes},envelope('ability.activate',{optionId:option.id,parameters:{confirmed:true}},1));
  assert.equal(next.changes.rulesRuntime.effects.filter(e=>e.objectType==='barrier').length,1);
});
test('Second Wind heals from the server roll and does not mutate the input character',()=>{
  const b=build('gunslinger',5),character=structuredClone(b.character);character.rulesRuntime.health.current=1;
  const option=b.summary.abilityOptions.find(o=>o.handler==='second-wind');
  const result=commands.apply(character,envelope('ability.activate',{optionId:option.id,parameters:{}}));
  assert.equal(result.changes.rulesRuntime.health.current,1+5+result.result.rolls[0]);
  assert.equal(result.changes.rulesRuntime.pools['gunslinger:second-wind'],2);assert.equal(character.rulesRuntime.health.current,1);
});
test('firearm package and Powder Drill alter shot capacity without adding attacks or ignoring ammunition',()=>{
  const b=build('gunslinger',5),c=structuredClone(b.character),pistol=gear.issue({definitionId:'pistol'});c.inventory.push(pistol);c.loadout.mainHand=pistol.instanceId;
  assert.equal(gear.derive(c).attacks[0].maxShotsPerAction,1);
  const firstFour=c.rulesLedger.levels.slice(0,4);firstFour[3].choices={...firstFour[3].choices,feat:'powder-drill',increases:{agility:1}};
  c.rulesLedger={...c.rulesLedger,levels:[...firstFour,c.rulesLedger.levels[4]]};
  assert.equal(rules.replay(c.rulesLedger).attacksPerAction,2);assert.equal(gear.derive(c).attacks[0].maxShotsPerAction,2);
});

const sacrificeFeature = 'path:sanguine-conduit:measured-sacrifice:6';
const sacrificeReserve = 'sanguine-conduit:transfusion';
const restorationReserve = 'tidecaller:restoration';
const restHour = 3600000;
const sacrificeAbility = { optionId: sacrificeFeature + '#sacrifice', parameters: { confirmed: true } };
const sacrificeOperation = { type: 'use-feature', featureId: sacrificeFeature };

function recoveryFixture(calling = 'tidecaller', level = 6, path = 'sanguine-conduit') {
  const fixture = build(calling, level, path);
  const inventoryIds = new Map(fixture.character.inventory.map((item, index) => [item.instanceId, 'fixture-item-' + index]));
  fixture.character = JSON.parse(JSON.stringify(fixture.character, (_key, value) => inventoryIds.get(value) ?? value));
  fixture.character.rulesRuntime.worldTime = 0;
  return fixture;
}

function stableRecoveryResult(result) {
  if (!result?.effect?.id) return result;
  assert.match(result.effect.id, /^[a-f0-9]+$/);
  return { ...result, effect: { ...result.effect, id: '<generated>' } };
}

test('capped Sorcery Point recovery matches serialized Pass 14 behavior', async () => {
  const outcomes = [];
  const conduit = recoveryFixture();
  const rest = (options = { restoreSorcery: true }, kind = 'short-rest') =>
    envelope('rest.start', { restId: 'recovery-rest', kind, startedAt: 0, options });

  function capture(fixture, label, input, execute, setup = () => {}) {
    const { character, summary } = structuredClone(fixture);
    setup(character.rulesRuntime);
    const before = structuredClone({ character, summary, input });
    let outcome;
    try {
      const value = execute(character, summary, input);
      if (value.changes) {
        const { inventory, loadout, ...changes } = value.changes;
        assert.deepEqual(inventory, character.inventory);
        assert.deepEqual(loadout, character.loadout);
        outcome = { changes, result: stableRecoveryResult(value.result) };
      } else {
        outcome = value;
      }
    } catch (error) {
      if (!error.statusCode) throw error;
      outcome = { statusCode: error.statusCode, code: error.code, message: error.message };
    }
    assert.deepEqual({ character, summary, input }, before);
    outcomes.push({ label, outcome });
  }

  const command = (character, _summary, input) => commands.apply(character, input);
  const ability = (fixture, setup, patch = {}) => capture(fixture, 'typed-sacrifice',
    envelope('ability.activate', { ...sacrificeAbility, ...patch }), command, setup);

  for (const points of [0, 2, 4, 5, 6]) {
    for (const health of [0, 1, 5, 6, 7, conduit.summary.health.max]) {
      for (const reserve of [0, 1]) {
        const setup = state => {
          state.health.current = health;
          state.pools[sorceryPool] = points;
          state.pools[sacrificeReserve] = reserve;
        };

        ability(conduit, setup);
      }
    }
  }
  for (const fixture of [recoveryFixture('warden', 6, 'iron-covenant'),
    recoveryFixture('tidecaller', 5), recoveryFixture('tidecaller', 6, 'omen-diver')]) {

    ability(fixture);
  }
  for (const id of [sorceryPool, sacrificeReserve, restorationReserve]) {
    for (const value of [undefined, -1, 1.5, 999, '1']) {
      const setup = state => {
        if (value === undefined) delete state.pools[id];
        else state.pools[id] = value;
      };

      ability(conduit, setup);
      capture(conduit, 'rest-invalid-pool', rest(), command, setup);
    }
  }
  for (const expectedRevision of [-1, 1, '0', undefined]) {
    capture(conduit, 'ability-document-revision',
      { ...envelope('ability.activate', sacrificeAbility), expectedRevision }, command);
    capture(conduit, 'rest-document-revision', { ...rest(), expectedRevision }, command);
  }
  for (const revision of [-1, 1, '0']) {
    const setup = state => { state.revision = revision; };

    ability(conduit, setup);
    capture(conduit, 'rest-runtime-revision', rest(), command, setup);
  }
  for (const patch of [{ extra: true }, { parameters: {} }, { parameters: { unknown: true } },
    { parameters: { confirmed: false }, targetIds: ['ally'] }, { targetIds: ['ally'] },
    { targetIds: [42] }, { optionId: null }, { note: 7 }]) {
    ability(conduit, undefined, patch);
  }
  for (const setup of [
    state => { state.conditions = [{ conditionId: 'incapacitated' }]; },
    state => {
      state.effects = [{ id: 'action-fixture', featureId: 'fixture:ends-after-action', endsAfterAction: true }];
      state.inCombat = true;
    },
  ]) {

    ability(conduit, setup);
    capture(conduit, 'rest-action-state', rest(), command, setup);
  }
  for (const [calling, level, path] of [['warden', 5, 'iron-covenant'], ['tidecaller', 4],
    ['tidecaller', 5], ['tidecaller', 6], ['tidecaller', 7], ['tidecaller', 20]]) {
    const fixture = recoveryFixture(calling, level, path);
    const max = fixture.summary.resources[sorceryPool]?.max;
    const pointsCases = max === undefined ? [undefined] : [0, 1, max - Math.floor(level / 2), max - 1, max];
    for (const points of pointsCases) {
      for (const reserve of [0, 1]) {
        const setup = state => {
          if (points !== undefined) state.pools[sorceryPool] = points;
          if (Object.hasOwn(state.pools, restorationReserve)) state.pools[restorationReserve] = reserve;
        };
        capture(fixture, 'rest-start', rest(), command, setup);
        capture(fixture, 'rest-complete', envelope('rest.complete', {
          restId: 'recovery-rest', completedAt: restHour,
        }), command, state => {
          setup(state);
          state.restSession = { id: 'recovery-rest', kind: 'short-rest', startedAt: 0,
            segmentStart: 0, interruptions: [], options: { restoreSorcery: true } };
        });
      }
    }
  }
  for (const options of [[], { extra: true }, { restoreSorcery: false }, { restoreSorcery: 0 },
    { restoreSorcery: -1 }, { restoreSorcery: true, hitDice: [{}] },
    { restoreSorcery: true, recoverSlots: [1] }]) {
    capture(conduit, 'rest-malformed', rest(options), command);
  }
  capture(conduit, 'long-rest-with-restoration', rest(undefined, 'long-rest'), command);
  for (const completedAt of [-1, 0, restHour - 1, restHour, '3600000']) {
    capture(conduit, 'rest-duration', envelope('rest.complete', { restId: 'recovery-rest', completedAt }),
      command, state => {
        state.restSession = { id: 'recovery-rest', kind: 'short-rest', startedAt: 0,
          segmentStart: 0, interruptions: [], options: { restoreSorcery: true } };
      });
  }

  for (const [label, sequence] of [
    ['typed-sacrifice', [envelope('ability.activate', sacrificeAbility)]],
    ['restoration', [rest(), { ...envelope('rest.complete', {
      restId: 'recovery-rest', completedAt: restHour,
    }, 1), operationId: 'recovery-rest-completion' }]],
  ]) {
    const initial = structuredClone(conduit.character);
    initial.rulesRuntime.pools[sorceryPool] = 0;
    const store = transactionalStore(initial);
    for (const [index, body] of sequence.entries()) {
      const before = structuredClone(body);
      const { data, error } = await store.call(body);
      assert.ifError(error);
      assert.deepEqual(body, before);
      const saved = store.read(), receipts = store.receipts();
      assert.equal(saved.documentRevision, index + 1);
      assert.equal(receipts.length, index + 1);
      assert.equal(saved.rulesRuntime.revision, label === 'restoration' && index === 1 ? 3 : 1);
      assert.equal(saved.rulesRuntime.pools[sorceryPool], label === 'restoration' ? index * 3 : 2);
      assert.equal(saved.rulesRuntime.health.current, initial.rulesRuntime.health.current - (label === 'restoration' ? 0 : 6));
      assert.equal(saved.rulesRuntime.pools[sacrificeReserve], label === 'restoration' ? 1 : 0);
      assert.equal(saved.rulesRuntime.pools[restorationReserve], label === 'restoration' ? 1 - index : 1);
      const replay = await store.call(body);
      assert.deepEqual(body, before);
      assert.ifError(replay.error);
      assert.deepEqual(replay.data, data);
      assert.deepEqual(store.read(), saved);
      assert.deepEqual(store.receipts(), receipts);
      outcomes.push({ label, response: { ...data, operationResult: stableRecoveryResult(data.operationResult) },
        saved, receiptCount: receipts.length });
      for (const [request, statusCode] of [
        [{ ...body, operationId: 'recovery-stale-command' }, 409],
        [{ ...body, operationId: 'recovery-rejected-command', expectedRevision: saved.documentRevision,
          payload: { ...body.payload, unexpected: true } }, 422],
      ]) {
        const snapshot = structuredClone(request);
        const rejected = await store.call(request);
        assert.equal(rejected.error?.statusCode, statusCode);
        assert.deepEqual(request, snapshot);
        assert.deepEqual(store.read(), saved);
        assert.deepEqual(store.receipts(), receipts);
        outcomes.push({ label, statusCode, code: rejected.error.code, message: rejected.error.message });
      }
    }
    const saved = store.read(), receipts = store.receipts();
    const repeat = label === 'restoration'
      ? envelope('rest.start', { ...sequence[0].payload, restId: 'second-recovery-rest', startedAt: restHour })
      : sequence[0];
    const request = { ...repeat, operationId: 'recovery-depleted-reserve', expectedRevision: saved.documentRevision };
    const before = structuredClone(request);
    const { error } = await store.call(request);
    const expected = {
      'typed-sacrifice': [422, 'Insufficient resource: ' + sacrificeReserve],
      restoration: [400, 'Sorcerous Restoration unavailable'],
    }[label];
    assert.deepEqual([error?.statusCode, error?.message], expected);
    assert.deepEqual(request, before);
    const replay = await store.call(sequence[0]);
    assert.ifError(replay.error);
    assert.deepEqual(replay.data, receipts[0].response);
    assert.deepEqual(store.read(), saved);
    assert.deepEqual(store.receipts(), receipts);
  }
  const digest = createHash('sha256').update(JSON.stringify(outcomes, function (key, value) {
    // Preserve the earlier mechanics baseline for records that acquired an ID.
    if (key === 'id' && (this.id === 'action-fixture' || this.featureId && this.note !== undefined && /^[a-f0-9-]{36}$/.test(value))) return undefined;
    return value;
  })).digest('hex');
  assert.equal(outcomes.length, 245);
  assert.equal(digest, 'f33f2aecd8e982ddae6dfe49e8276a790f0bf0d938d788bf940b14f7f085ab92');
});

const effectEndingCases = [
  ['by ID', { effectId: 'effect-one' }],
  ['by feature', { featureId: 'fixture:legacy' }],
  ['explicit end', { type: 'end-effect', featureId: 'fixture:legacy' }],
  ['explicit runtime revision', { expectedRevision: 0, featureId: 'fixture:legacy' }],
  ['unknown ID', { effectId: 'missing' }],
  ['unknown feature', { featureId: 'missing' }],
  ['protected ID', { effectId: 'protected' }],
  ['protected feature', { featureId: 'fixture:protected' }],
  ['missing selector', {}],
  ['null payload', null],
  ['array payload', []],
  ['null ID', { effectId: null }],
  ['invalid feature', { featureId: 42 }],
  ['mixed selectors', { effectId: 'effect-one', featureId: 'fixture:legacy' }],
  ['unknown field', { featureId: 'fixture:legacy', extra: true }],
  ['typed sacrifice', sacrificeAbility, 'ability.activate'],
  ['fallback sacrifice', sacrificeOperation],
  ['temporary Health', { type: 'temporary-health', value: 5 }],
  ['Health', { type: 'health', healthDelta: -1 }],
  ['spend pool', { type: 'spend-pool', poolId: sacrificeReserve, amount: 1 }],
  ['spend slot', { type: 'spend-slot', slotLevel: 1 }],
  ['slot conversion', { type: 'slot-to-sorcery', slotLevel: 1 }],
  ['point conversion', { type: 'sorcery-to-slot', slotLevel: 1 }],
  ['restore feature', { type: 'restore-feature', poolId: 'tidecaller:innate-sorcery' }],
  ['initiative recovery', { type: 'initiative-recovery', poolId: 'tidecaller:innate-sorcery' }],
  ['relentless rage', { type: 'relentless-rage', value: 20 }],
  ['short rest', { type: 'short-rest' }],
  ['long rest', { type: 'long-rest' }],
  ['unknown operation', { type: 'unknown' }],
  ['operation with effect ID', { type: 'health', healthDelta: -1, effectId: 'protected' }],
  ['stale effect', { effectId: 'effect-one' }, 'effect.end', 1],
  ['stale cross-operation', sacrificeOperation, 'effect.end', 1],
];
function effectEndingFixture() {
  const { character } = recoveryFixture();
  character.rulesRuntime.pools[sorceryPool] = 2;
  character.rulesRuntime.effects = [
    { id: 'effect-one', featureId: 'fixture:one', name: 'One', endsAfterAction: true },
    { id: 'legacy-first', featureId: 'fixture:legacy', name: 'Legacy' },
    { id: 'legacy-instance', featureId: 'fixture:legacy', name: 'Another' },
    { id: 'protected', featureId: 'fixture:protected', name: 'Protected', uncancelable: true },
  ];
  return character;
}

test('effect ending by exact ID commits once and replays the original receipt', async () => {
  for (const [payload, remaining] of [
    [{ effectId: 'effect-one' }, ['legacy-first', 'legacy-instance', 'protected']],
    [{ effectId: 'legacy-first' }, ['effect-one', 'legacy-instance', 'protected']],
  ]) {
    const store = transactionalStore(effectEndingFixture());
    const request = envelope('effect.end', payload);
    const { data, error } = await store.call(request);
    assert.ifError(error);
    const saved = store.read(), receipts = store.receipts();
    assert.deepEqual(data.operationResult, { type: 'effect.end' });
    assert.deepEqual(saved.rulesRuntime.effects.map(e => e.id), remaining);
    assert.equal(saved.rulesRuntime.revision, 1);
    assert.equal(saved.documentRevision, 1);
    assert.equal(receipts.length, 1);
    assert.deepEqual(await store.call(request), { data, error: undefined });
    assert.equal((await store.call({ ...request, operationId: 'effect-end-stale' })).error?.code, 'revision_conflict');
    assert.equal((await store.call({ ...request, payload: sacrificeOperation })).error?.code, 'operation_conflict');
    assert.deepEqual(store.read(), saved);
    assert.deepEqual(store.receipts(), receipts);
  }
});

test('effect ending rejects malformed selectors and other runtime operations without writes', async () => {
  const store = transactionalStore(effectEndingFixture());
  const saved = store.read();
  for (const [label, payload, type = 'effect.end', revision = 0] of effectEndingCases) {
    if (type !== 'effect.end' || label === 'by ID') continue;
    const { error } = await store.call(envelope(type, payload, revision));
    let expected = [422, 'Choose an owned effect'];
    if (revision) expected = [409, 'Character changed; reload before saving'];
    if (label === 'protected ID') expected = [422, 'This effect must finish its printed duration'];
    if (['null payload', 'array payload'].includes(label)) expected = [422, 'Command requires a type and payload'];
    assert.deepEqual([error?.statusCode, error?.message], expected, label);
    assert.deepEqual(store.read(), saved, label);
    assert.deepEqual(store.receipts(), [], label);
  }
});

test('historical cross-operation receipts still replay after authorization', async () => {
  const character = effectEndingFixture();
  character.documentRevision = 2;
  character.rulesRuntime.revision = 2;
  const request = envelope('effect.end', sacrificeOperation);
  const response = { documentRevision: 1, operationResult: { type: 'effect.end' } };
  const receipt = { characterId: '111111111111111111111111', owner: 'owner',
    operationId: request.operationId, digest: commands.validateEnvelope(request), response };
  const store = transactionalStore(character, [receipt]);
  const saved = store.read();
  assert.equal((await store.call(request, 'outsider')).error?.statusCode, 404);
  assert.deepEqual(await store.call(request), { data: response, error: undefined });
  assert.equal((await store.call({ ...request, payload: { effectId: 'effect-one' } })).error?.code, 'operation_conflict');
  assert.deepEqual(store.read(), saved);
  assert.deepEqual(store.receipts(), [receipt]);
});

test('generic runtime activation is isolated from authenticated command dispatch', async () => {
  const { character } = recoveryFixture();
  const store = transactionalStore(character);
  const initial = store.read();
  for (const type of ['use-feature', 'ability.activate', 'effect.end', 'resource.adjust', 'resource.convert']) {
    const request = envelope(type, sacrificeOperation);
    assert.equal((await store.call(request, 'outsider')).error?.statusCode, 404, type);
    assert.equal((await store.call(request)).error?.statusCode, 422, type);
    const stale = { ...request, expectedRevision: 1 };
    assert.equal((await store.call(stale)).error?.code, 'revision_conflict', type);
    assert.deepEqual(store.read(), initial, type);
    assert.deepEqual(store.receipts(), [], type);
  }
});

test('Measured Sacrifice keeps typed action expiration and rejects generic runtime activation', async () => {
  const { character, summary } = recoveryFixture();
  const state = character.rulesRuntime;
  state.pools[sorceryPool] = summary.resources[sorceryPool].max - 1;
  state.effects = [
    { id: 'action-fixture', featureId: 'fixture:action', endsAfterAction: true },
    { id: 'earlier-record', featureId: sacrificeFeature, name: 'Earlier record', note: 'GM note' },
  ];
  const original = structuredClone(state);
  assert.throws(() => rules.runtime.update(summary, state, { ...sacrificeOperation, expectedRevision: 0 }),
    /Unknown resource operation/);
  assert.deepEqual(state, original);

  const store = transactionalStore(character);
  const request = envelope('ability.activate', sacrificeAbility);
  assert.equal((await store.call(request, 'outsider')).error?.statusCode, 404);
  const { data, error } = await store.call(request);
  assert.ifError(error);
  assert.equal(data.operationResult.healthLost, 6);
  assert.equal(data.operationResult.sorceryRecovered, 1);
  assert.equal(data.operationResult.recordOnly, true);
  const saved = store.read(), receipts = store.receipts();
  assert.deepEqual(saved.rulesRuntime.effects, [original.effects[1]]);
  assert.equal(saved.rulesRuntime.revision, 1);
  assert.equal(saved.documentRevision, 1);
  assert.equal(receipts.length, 1);
  assert.deepEqual(receipts[0].response, data);
  assert.deepEqual(await store.call(request), { data, error: undefined });
  assert.equal((await store.call(request, 'outsider')).error?.statusCode, 404);
  assert.equal((await store.call({ ...request, payload: sacrificeOperation })).error?.code, 'operation_conflict');
  assert.equal((await store.call({ ...request, operationId: 'stale-sacrifice' })).error?.code, 'revision_conflict');
  assert.deepEqual(store.read(), saved);
  assert.deepEqual(store.receipts(), receipts);
});

test('resource subtype contracts preserve gameplay, authorization, and receipt precedence', async () => {
  const observations = [];
  const tidecaller = build('tidecaller', 9, 'omen-diver').character;
  tidecaller.rulesRuntime.pools[sorceryPool] = 4;
  tidecaller.rulesRuntime.pools['tidecaller:innate-sorcery'] = 0;
  const warden = build('warden', 20, 'iron-covenant').character;
  warden.rulesRuntime.pools[wardenPool] = 0;
  const reaver = build('reaver', 15, 'bloodwake').character;
  reaver.rulesRuntime.inCombat = true;
  reaver.rulesRuntime.initiative = { combatId: 'fixture-combat' };
  reaver.rulesRuntime.pools['reaver:rage'] = 0;
  const cases = [
    ['resource.adjust', { type: 'spend-pool', poolId: sorceryPool, amount: 1 }, tidecaller, 'amount', { amount: 5 }, { poolId: [sorceryPool] }],
    ['resource.adjust', { type: 'spend-slot', slotLevel: 1 }, tidecaller, 'slotLevel', { slotLevel: 9 }, { amount: 1 }],
    ['resource.adjust', { type: 'initiative-recovery', poolId: 'reaver:rage' }, reaver, 'poolId', { poolId: 'tidecaller:sorcery-points' }, { note: 'ignored', slotLevel: 1 }],
    ['resource.convert', { type: 'slot-to-sorcery', slotLevel: 1 }, tidecaller, 'slotLevel', { slotLevel: 9 }, { poolId: sorceryPool }],
    ['resource.convert', { type: 'sorcery-to-slot', slotLevel: 1 }, tidecaller, 'slotLevel', { slotLevel: 5 }, { amount: 1 }],
    ['resource.convert', { type: 'restore-feature', poolId: wardenPool, slotLevel: 5 }, warden, 'slotLevel', {}, { featureId: 'unused' }],
    ['resource.convert', { type: 'restore-feature', poolId: 'tidecaller:innate-sorcery' }, tidecaller, 'poolId', {}, { slotLevel: 5 }],
  ];
  for (const [type, payload, character, required, ineligible, mixed] of cases) {
    const command = envelope(type, payload);
    const { [required]: missing, ...incomplete } = payload;
    const resourceFailure = structuredClone(character);
    for (const id of Object.keys(resourceFailure.rulesRuntime.pools)) resourceFailure.rulesRuntime.pools[id] = 0;
    resourceFailure.rulesRuntime.slots.fill(0);
    async function run(label, store, body, owner) {
      const before = store.read(), prior = store.receipts();
      const { data, error } = await store.call(body, owner);
      if (error) {
        assert.deepEqual(store.read(), before);
        assert.deepEqual(store.receipts(), prior);
      }
      observations.push({ type, subtype: payload.type, poolId: payload.poolId, label,
        error: error && { statusCode: error.statusCode, message: error.message, code: error.code, fieldPath: error.fieldPath, currentRevision: error.currentRevision },
        data, document: store.read(), receipts: store.receipts() });
    }
    const store = transactionalStore(character);
    await run('valid', store, command);
    await run('replay', store, { ...command, payload: Object.fromEntries(Object.entries(payload).reverse()) });
    await run('unauthorized replay', store, command, 'outsider');
    await run('changed payload', store, { ...command, payload: { ...payload, ...mixed, unexpected: true } });
    await run('stale malformed', store, { ...command, operationId: 'new-stale-id', payload: { ...payload, unexpected: true } });
    for (const [label, variant] of Object.entries({
      missing: incomplete, unknown: { ...payload, type: 'unregistered' }, unexpected: { ...payload, unexpected: true },
      mixed: { ...payload, ...mixed }, 'invalid type': { ...payload, [required]: String(missing) === missing ? [missing] : String(missing) },
      'same runtime revision': { ...payload, expectedRevision: 0 }, 'different runtime revision': { ...payload, expectedRevision: 1 },
      'invalid pool': { ...payload, poolId: 'unknown:pool' },
      'invalid quantity': required === 'poolId' ? { ...payload, amount: 0 } : { ...payload, [required]: 0 },
      ineligible: { ...payload, ...ineligible },
    })) await run(label, transactionalStore(character), { ...command, payload: variant });
    await run('insufficient', transactionalStore(resourceFailure), command);
  }
  const ids = new Map();
  const serialized = JSON.stringify(observations).replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, id => {
    if (!ids.has(id)) ids.set(id, 'generated-id-' + ids.size);
    return ids.get(id);
  });
  assert.equal(observations.length, 112);
  assert.equal(createHash('sha256').update(serialized).digest('hex'),
    '07b7427732d2a3d3fa4a2f290db5c7ad3996d6d4071a922b2569157b2745858a');
});

test('historical resource receipts replay payloads that fresh resource commands reject', async () => {
  const { character } = build('tidecaller', 9, 'omen-diver');
  const poolId = 'tidecaller:innate-sorcery';
  character.rulesRuntime.pools[poolId] = 0;

  const request = envelope('resource.convert', { type: 'restore-feature', poolId });
  const original = transactionalStore(character);
  const { data: response, error } = await original.call(request);
  assert.ifError(error);

  // The old non-slot restoration ignored these fields. Its receipt used the full digest.
  const legacy = { ...request, payload: { ...request.payload, slotLevel: 5, note: 'ignored' } };
  const receipt = { ...original.receipts()[0], digest: commands.validateEnvelope(legacy) };
  const store = transactionalStore(original.read(), [receipt]);
  const saved = store.read();
  assert.equal((await store.call(legacy, 'outsider')).error?.statusCode, 404);
  assert.deepEqual(await store.call(legacy), { data: response, error: undefined });
  assert.equal((await store.call(request)).error?.code, 'operation_conflict');
  assert.equal((await store.call({ ...legacy, expectedRevision: 1, operationId: 'fresh-resource-command' })).error?.statusCode, 422);
  assert.deepEqual(store.read(), saved);
  assert.deepEqual(store.receipts(), [receipt]);
});

test('rest recovery commits once and historical start and completion receipts replay after later revisions', async () => {
  const { character } = build('gunslinger', 5);
  const pool = 'gunslinger:second-wind';
  character.rulesRuntime.pools[pool] = 0;
  character.rulesRuntime.health.current = 1;
  const store = transactionalStore(character);
  const restId = 'recovery-replay';
  const options = { hitDice: [{ die: 'd10', roll: 4 }] };
  const start = envelope('rest.start', { restId, kind: 'short-rest', startedAt: 0, options });
  const started = await store.call(start);
  assert.ifError(started.error);
  assert.equal(store.read().rulesRuntime.hitDice.d10, 5);
  assert.equal(store.read().rulesRuntime.health.current, 1);
  const complete = {
    ...envelope('rest.complete', { restId, completedAt: 3600000 }, 1),
    operationId: 'recovery-replay-complete',
  };
  const beforeCompletion = store.read();
  const beforeReceipts = store.receipts();
  const tooEarly = { ...complete, payload: { restId, completedAt: 3599999 } };
  assert.equal((await store.call(tooEarly)).error?.statusCode, 422);
  assert.deepEqual(store.read(), beforeCompletion);
  assert.deepEqual(store.receipts(), beforeReceipts);

  const completed = await store.call(complete);
  assert.ifError(completed.error);
  const saved = store.read(), receipts = store.receipts();
  assert.equal(saved.documentRevision, 2);
  assert.equal(saved.rulesRuntime.hitDice.d10, 4);
  assert.equal(saved.rulesRuntime.health.current, 7);
  assert.equal(saved.rulesRuntime.pools[pool], 1);
  assert.equal(receipts.length, 2);

  const reloaded = transactionalStore(saved, receipts);
  assert.equal((await reloaded.call(start, 'outsider')).error?.statusCode, 404);
  assert.deepEqual(await reloaded.call(start), started);
  assert.deepEqual(await reloaded.call(complete), completed);
  assert.equal((await reloaded.call(tooEarly)).error?.code, 'operation_conflict');
  assert.equal((await reloaded.call({ ...complete, operationId: 'recovery-replay-stale' })).error?.code, 'revision_conflict');
  assert.deepEqual(reloaded.read(), saved);
  assert.deepEqual(reloaded.receipts(), receipts);
});

test('healing commits once, retains its receipt and leaves rejected requests atomic', async () => {
  const { character } = build('doctor', 3);
  character.rulesRuntime.health.current = 0;
  character.rulesRuntime.deathSaves.failures = 2;
  character.rulesRuntime.temporaryHealth = 3;
  const store = transactionalStore(character);
  const request = envelope('health.apply', { healthDelta: 4 });
  const rejected = { ...request, payload: { healthDelta: -1 } };
  const before = store.read();
  assert.equal((await store.call(rejected)).error?.statusCode, 422);
  assert.deepEqual(store.read(), before);
  assert.deepEqual(store.receipts(), []);

  const accepted = await store.call(request);
  assert.ifError(accepted.error);
  const saved = store.read(), receipts = store.receipts();
  assert.equal(saved.documentRevision, 1);
  assert.equal(saved.rulesRuntime.health.current, 4);
  assert.equal(saved.rulesRuntime.deathSaves.failures, 0);
  assert.equal(saved.rulesRuntime.temporaryHealth, 3);
  assert.equal(receipts.length, 1);

  const reloaded = transactionalStore(saved, receipts);
  assert.equal((await reloaded.call(request, 'outsider')).error?.statusCode, 404);
  assert.deepEqual(await reloaded.call(request), accepted);
  assert.equal((await reloaded.call(rejected)).error?.code, 'operation_conflict');
  assert.equal((await reloaded.call({ ...request, operationId: 'stale-healing-command' })).error?.code, 'revision_conflict');
  assert.deepEqual(reloaded.read(), saved);
  assert.deepEqual(reloaded.receipts(), receipts);
});

test('Unbroken Current spends only once on replay and an exhausted new trigger rolls back', async () => {
  const { character } = build('tidecaller', 18, 'sanguine-conduit');
  character.rulesRuntime.health.current = 2;
  const db = transactionalStore(character);
  const drop = { amount: 2, damageType: 'force', confirmed: true, unbrokenCurrent: true };
  const body = envelope('health.damage', drop);
  const first = await db.call(body);
  assert.ifError(first.error);
  assert.equal(db.read().rulesRuntime.pools['sanguine-conduit:unbroken-current'], 0);
  assert.deepEqual(await db.call(body), first);
  assert.equal((await db.call(body, 'outsider')).error?.statusCode, 404);
  assert.equal((await db.call({ ...body, payload: { ...drop, amount: 1 } })).error?.code, 'operation_conflict');
  const saved = db.read(), receipts = db.receipts();
  const second = { ...envelope('health.damage', { ...drop, amount: 19 }, saved.documentRevision), operationId: 'second-unbroken-current' };
  const { error } = await db.call(second);
  assert.equal(error?.statusCode, 422);
  assert.match(error.message, /unspent use/);
  assert.deepEqual(db.read(), saved);
  assert.deepEqual(db.receipts(), receipts);
});

test('concentration failure preserves separately identified duplicates and replays once', async () => {
  const { character } = build('doctor', 3);
  character.rulesRuntime.worldTime = 100;
  character.rulesRuntime.effects = [
    { id: 'scroll-instance', featureId: 'spell:guidance', concentration: true, source: 'scroll:legacy' },
    { id: 'item-instance', featureId: 'spell:guidance', concentration: true, source: 'item:legacy' },
    { id: 'replacement', featureId: 'spell:guidance', concentration: true, source: 'doctor' },
    { id: 'expired', featureId: 'spell:fly', concentration: true, expiresAt: 99 },
  ];
  character.rulesRuntime.concentrationChecks = [
    { id: 'check', dc: 30, damage: 60, effects: ['scroll-instance', 'item-instance', 'missing'] },
    { id: 'overlap', dc: 30, damage: 60, effects: ['scroll-instance'] },
    { id: 'expired-check', dc: 10, damage: 1, effects: ['expired'] },
  ];
  const store = transactionalStore(character);
  const request = envelope('concentration.resolve', { checkId: 'check', rolls: [1], confirmed: true });
  const before = store.read();
  const rejected = { ...request, payload: { ...request.payload, checkId: 'expired-check' } };
  const missing = await store.call(rejected);
  assert.equal(missing.error?.statusCode, 422);
  assert.match(missing.error.message, /No matching pending Concentration save/);
  assert.deepEqual(store.read(), before);
  assert.deepEqual(store.receipts(), []);
  const resolved = await store.call(request);
  assert.ifError(resolved.error);
  assert.equal(resolved.data.operationResult.success, false);
  const saved = store.read(), receipts = store.receipts();
  assert.deepEqual(saved.rulesRuntime.effects.map(effect => effect.id), ['replacement']);
  assert.deepEqual(saved.rulesRuntime.concentrationChecks, []);
  assert.deepEqual(await store.call(request), resolved);
  assert.equal((await store.call(request, 'outsider')).error?.statusCode, 404);
  assert.equal((await store.call(rejected)).error?.code, 'operation_conflict');
  assert.equal((await store.call({ ...request, operationId: 'stale-concentration' })).error?.code, 'revision_conflict');
  assert.deepEqual(store.read(), saved);
  assert.deepEqual(store.receipts(), receipts);
});

test('concentration uses worn item bonuses and Exhaustion once across receipt replay', async () => {
  const { character, summary } = build('warden', 6);
  const gear = require('../../src/modules/archipelago/equipment/inventory');
  character.inventory.push({ ...gear.issue({ definitionId: 'ring-of-protection' }), worn: true, attuned: true });
  character.rulesRuntime.worldTime = 100;
  character.rulesRuntime.exhaustion = 1;
  character.rulesRuntime.effects = [{ id: 'focus', featureId: 'spell:guidance', concentration: true }];
  const dc = 12 + summary.savingThrowModifiers.resolve - 1;
  character.rulesRuntime.concentrationChecks = [{ id: 'check', dc, damage: 24, effects: ['focus'] }];
  const store = transactionalStore(character);
  const request = envelope('concentration.resolve', { checkId: 'check', rolls: [12], confirmed: true });
  const first = await store.call(request);
  assert.ifError(first.error);
  assert.equal(first.data.operationResult.total, dc);
  assert.equal(first.data.operationResult.success, true);
  const saved = store.read(), receipts = store.receipts();
  assert.equal(saved.rulesRuntime.effects[0].id, 'focus');
  assert.deepEqual(saved.rulesRuntime.concentrationChecks, []);
  assert.deepEqual(await store.call(request), first);
  assert.equal((await store.call(request, 'outsider')).error?.statusCode, 404);
  assert.equal((await store.call({ ...request, payload: { ...request.payload, rolls: [11] } })).error?.code, 'operation_conflict');
  assert.deepEqual(store.read(), saved);
  assert.deepEqual(store.receipts(), receipts);
});
test('invalid effect identities reject fresh writes while historical responses remain immutable', async () => {
  for (const ids of [[undefined], ['', 'valid'], ['same', 'same']]) {
    const c = effectEndingFixture();
    c.rulesRuntime.effects = ids.map(id => ({ id, featureId: 'fixture:legacy' }));
    const oldRequest = envelope('effect.end', { featureId: 'fixture:legacy' });
    const response = { documentRevision: 1, rulesRuntime: { effects: [{ featureId: 'fixture:older' }] } };
    const oldReceipt = {
      characterId: '111111111111111111111111', owner: 'owner',
      operationId: oldRequest.operationId, digest: commands.validateEnvelope(oldRequest), response,
    };
    const store = transactionalStore(c, [oldReceipt]);
    const before = store.read();
    assert.equal((await store.call(oldRequest, 'outsider')).error?.statusCode, 404);
    assert.deepEqual((await store.call(oldRequest)).data, response);
    const fresh = { ...envelope('effect.end', { effectId: 'same' }), operationId: 'fresh-effect-identity' };
    const { error } = await store.call(fresh);
    assert.equal(error?.statusCode, 400);
    assert.equal(error.message, 'Active effects require unique instance IDs');
    assert.deepEqual(store.read(), before);
    assert.deepEqual(store.receipts(), [oldReceipt]);
  }
});

test('explicit runtime feature-wide cleanup removes matching instances only', () => {
  const c = effectEndingFixture();
  const summary = rules.replay(c.rulesLedger);
  const next = rules.runtime.update(summary, c.rulesRuntime, {
    expectedRevision: 0, type: 'end-feature-effects', featureId: 'fixture:legacy',
  });
  assert.deepEqual(next.effects.map(e => e.id), ['effect-one', 'protected']);
  assert.equal(c.rulesRuntime.effects.length, 4);
});

test('engine-owned Second Wind spends once and replays its exact effect identity', async () => {
  const {character} = build('gunslinger', 5, 'deadeye');
  character.rulesRuntime.worldTime = 0;
  character.rulesRuntime.health.current = 1;
  character.rulesRuntime.pools['gunslinger:second-wind'] = 1;
  const store = transactionalStore(character);
  const request = envelope('ability.activate', {optionId:'calling:gunslinger:second-wind:1#main',targetIds:[]});
  const first = await store.call(request);
  assert.ifError(first.error);
  const saved = store.read(), receipts = store.receipts();
  assert.equal(saved.rulesRuntime.pools['gunslinger:second-wind'], 0);
  const {effect, rolls, healing} = first.data.operationResult;
  assert.ok(effect.id);
  assert.equal(saved.rulesRuntime.effects.at(-1).id, effect.id);
  assert.equal(healing, rolls[0] + 5);
  assert.deepEqual(await store.call(request), first);
  assert.equal((await store.call({...request,operationId:'second-wind-stale'})).error?.code, 'revision_conflict');
  assert.equal((await store.call({...request,operationId:'second-wind-empty',expectedRevision:1})).error?.statusCode, 422);
  assert.deepEqual(store.read(), saved);
  assert.deepEqual(store.receipts(), receipts);
});

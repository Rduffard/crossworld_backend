import { startHttp, stopHttp } from '../helpers/http.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build, rules } from '../helpers/phase2.mjs';
import { restartSnapshot, startTestMongo } from '../support/mongo-fixture.mjs';
const require = createRequire(import.meta.url);
test(
  'isolated real MongoDB: martial/caster/complex-Path HTTP workflows, transaction receipts, reload and owner isolation',
  { timeout: 120000 },
  async (t) => {
    const fixtureMongo = await startTestMongo(t);
    const { uri, database } = fixtureMongo;
    process.env.DOTENV_CONFIG_QUIET = 'true';
    const mongoose = require('mongoose'),
      express = require('express'),
      jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../../src/config/env');
    let server;
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
      assert.equal(mongoose.connection.name, database);
      assert.deepEqual(await mongoose.connection.db.listCollections().toArray(), []);
      const Character = require('../../src/modules/archipelago/characters/model'),
        Receipt = require('../../src/modules/archipelago/characters/commandReceipt');
      await Character.init();
      await Receipt.init();
      const app = express();
      app.use(express.json());
      app.use('/archipelago', require('../../src/modules/archipelago/routes'));
      app.use((e, _req, res, _next) => res.status(e.statusCode ?? 500).send({ message: e.message }));
      server = await startHttp(app);
      const base = 'http://127.0.0.1:' + server.address().port + '/archipelago/characters';
      const owner = '111111111111111111111111',
        other = '222222222222222222222222';
      const headers = (id) => ({
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + jwt.sign({ _id: id }, JWT_SECRET),
      });
      async function request(path, body, user = owner, extraHeaders = {}) {
        const response = await fetch(base + path, {
          method: body ? 'POST' : 'GET',
          headers: { ...headers(user), ...extraHeaders },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: response.status, body: await response.json() };
      }
      async function command(character, type, payload, operationId, user = owner) {
        return request('/' + character._id + '/commands', {
          operationId,
          expectedRevision: character.documentRevision,
          rulesVersion: 'SA-CHAR-1',
          type,
          payload,
        }, user);
      }
      await t.test('Ledger v4 creation receipts and multi-level advancement survive persistence and rollback', async () => {
        const { ledger } = build('gunslinger', 5);
        const { size, ...roots } = ledger.creation;
        void size;
        const initial = {
          attributes: ledger.baseAttributes, firstLevel: ledger.levels[0],
          creation: { ...roots, lineage: {
            id: 'beastshifters', size: 'small', choices: { skill: 'intimidation', formId: 'dock-rat' },
          } },
        };
        const preview = await request('/preview', initial);
        assert.equal(preview.status, 200, JSON.stringify(preview.body));
        assert.equal(preview.body.lineage.id, 'beastshifters');
        const idempotency = { 'Idempotency-Key': 'mongo-lineage-create' };
        const body = { ...initial, name: 'Isolated Beastshifter' };
        const created = await request('', body, owner, idempotency);
        assert.equal(created.status, 201, JSON.stringify(created.body));
        assert.equal(created.body.rulesLedger.version, 4);
        const levels = ledger.levels.slice(1).map(({ choices }, index) => ({ level: index + 2, choices }));
        levels[1].lineageForm = {
          learnFormId: 'gray-wolf', replaceForm: { fromFormId: 'dock-rat', toFormId: 'reef-fox' },
        };
        levels[3].lineageForm = {
          learnFormId: 'river-otter', replaceForm: { fromFormId: 'reef-fox', toFormId: 'dock-rat' },
        };
        const characterId = created.body._id;
        const operationId = 'mongo-lineage-advance';
        const createReceipt = Receipt.create;
        Receipt.create = async function(entries, ...args) {
          if (entries[0]?.operationId === operationId) throw new Error('Injected receipt failure');
          return createReceipt.call(this, entries, ...args);
        };
        try {
          const failed = await command(created.body, 'advance', { levels }, operationId);
          assert.equal(failed.status, 500);
          assert.equal(failed.body.message, 'Injected receipt failure');
        } finally {
          Receipt.create = createReceipt;
        }
        const rolledBack = await request('/' + characterId);
        assert.deepEqual(rolledBack.body.rulesLedger, created.body.rulesLedger);
        assert.deepEqual(rolledBack.body.rulesRuntime, created.body.rulesRuntime);
        assert.equal(await Receipt.countDocuments({ characterId, operationId }), 0);

        const committed = await command(created.body, 'advance', { levels }, operationId);
        assert.equal(committed.status, 200, JSON.stringify(committed.body));
        const reloaded = await request('/' + characterId);
        assert.deepEqual(reloaded.body.rulesSummary.lineage.animalForms.knownForms, ['dock-rat', 'gray-wolf', 'river-otter']);
        assert.deepEqual(reloaded.body.rulesRuntime.animalForms.healthByForm,
          { 'dock-rat': 3, 'reef-fox': 5, 'gray-wolf': 7, 'river-otter': 7 });
        assert.deepEqual(await command(created.body, 'advance', { levels }, operationId), committed);
        assert.deepEqual(await request('', body, owner, idempotency), created);
        assert.equal((await request('', { ...body, name: 'Different Lineage Request' }, owner, idempotency)).status, 409);
        assert.equal(await Character.countDocuments({ owner, name: body.name }), 1);
        const transformed = await command(reloaded.body, 'ability.activate', {
          optionId: 'lineage:beastshifters:transform',
          parameters: { formId: 'dock-rat', legalPlacement: true },
        }, 'mongo-lineage-transform');
        assert.equal(transformed.status, 200, JSON.stringify(transformed.body));
        const damaged = await command(transformed.body, 'health.damage', {
          amount: 3, damageType: 'piercing', confirmed: true,
        }, 'mongo-lineage-damage');
        assert.equal(damaged.status, 200, JSON.stringify(damaged.body));
        const recoveryPayload = {
          optionId: 'lineage:beastshifters:primal-recovery',
          parameters: { formId: 'dock-rat', hitDie: Object.keys(damaged.body.rulesRuntime.hitDice)[0] },
        };
        const recoveryId = 'mongo-lineage-recovery';
        Receipt.create = async function(entries, ...args) {
          if (entries[0]?.operationId === recoveryId) throw new Error('Injected recovery receipt failure');
          return createReceipt.call(this, entries, ...args);
        };
        try {
          const rejected = await command(damaged.body, 'ability.activate', recoveryPayload, recoveryId);
          assert.equal(rejected.status, 500);
        } finally {
          Receipt.create = createReceipt;
        }
        const unchanged = await request('/' + characterId);
        assert.deepEqual(unchanged.body.rulesRuntime, damaged.body.rulesRuntime);
        assert.equal(await Receipt.countDocuments({ characterId, operationId: recoveryId }), 0);
        const recovered = await command(damaged.body, 'ability.activate', recoveryPayload, recoveryId);
        assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
        assert.ok(recovered.body.operationResult.roll > 0);
        assert.deepEqual(await command(damaged.body, 'ability.activate', recoveryPayload, recoveryId), recovered);
        assert.deepEqual((await request('/' + characterId)).body.rulesRuntime, recovered.body.rulesRuntime);
      });
      for (const [callingId, pathId, background] of [
        ['gunslinger', 'iron-suppressor', 'deckhand'],
        ['tidecaller', 'memory-echo', 'archive-apprentice'],
        ['doctor', 'field-surgeon', 'field-medic'],
      ]) {
        const fixture = build(callingId, 20, pathId, 'yuma-core', background);
        const created = await request('', {
          name: 'Isolated ' + callingId,
          attributes: fixture.ledger.baseAttributes,
          creation: fixture.ledger.creation,
          firstLevel: fixture.ledger.levels[0],
        });
        assert.equal(created.status, 201, JSON.stringify(created.body));
        let character = created.body;
        for (let level = 2; level <= 20; level++) {
          const result = await command(
            character,
            'advance',
            { level, choices: fixture.ledger.levels[level - 1].choices },
            'advance-' + callingId + '-' + level
          );
          assert.equal(result.status, 200, callingId + ' ' + level + ': ' + JSON.stringify(result.body));
          character = result.body;
        }
        assert.equal(character.rulesSummary.totalLevel, 20);
        assert.equal(character.rulesSummary.paths[callingId], pathId);
        assert.equal((await request('/' + character._id, undefined, other)).status, 404);
        const snapshot = JSON.stringify(character.rulesRuntime),
          bad = await command(
            character,
            'identity.patch',
            { attributes: { might: 30 } },
            'invalid-patch-' + callingId
          );
        assert.equal(bad.status, 422);
        assert.equal(JSON.stringify((await request('/' + character._id)).body.rulesRuntime), snapshot);
        const updated = await command(
          character,
          'identity.patch',
          { notes: 'Saved in a real transaction' },
          'saved-note-' + callingId
        );
        assert.equal(updated.status, 200);
        const replay = await command(
          character,
          'identity.patch',
          { notes: 'Saved in a real transaction' },
          'saved-note-' + callingId
        );
        assert.deepEqual(replay, updated);
        const changed = await command(
          character,
          'identity.patch',
          { notes: 'Different request' },
          'saved-note-' + callingId
        );
        assert.equal(changed.status, 409);
        assert.equal(
          (await command(character, 'identity.patch', { notes: 'Stale' }, 'stale-note-' + callingId))
            .status,
          409
        );
        character = updated.body;
        if (callingId === 'doctor') {
          const option = character.rulesSummary.abilityOptions.find((o) => o.handler === 'triage');
          const triage = await command(
            character,
            'ability.activate',
            {
              optionId: option.id,
              targetIds: ['external-patient'],
              parameters: { confirmed: true, targetRestEpoch: 'rest-one' },
            },
            'triage-real-mongo'
          );
          assert.equal(triage.status, 200, JSON.stringify(triage.body));
          assert.equal(triage.body.operationResult.rolls.length, 6);
          const kit = triage.body.inventory.find((i) => i.chargesCurrent !== undefined);
          assert.equal(kit.chargesCurrent, 9);
          assert.equal(
            (
              await command(
                triage.body,
                'ability.activate',
                {
                  optionId: option.id,
                  targetIds: ['external-patient'],
                  parameters: { confirmed: true, targetRestEpoch: 'rest-one' },
                },
                'repeat-triage-real-mongo'
              )
            ).status,
            422
          );
          character = triage.body;
        }
        if (callingId === 'tidecaller') {
          const spellId = 'burning-hands',
            ally = 'careful-ally';
          assert.ok(character.rulesSummary.spellcasting.tidecaller.prepared.includes(spellId));
          assert.ok(
            character.rulesSummary.pathSelections.tidecaller.metamagic.includes('careful-spell')
          );
          const casting = await command(
            character,
            'spell.cast',
            {
              callingId,
              spellId,
              slotLevel: 1,
              metamagic: ['careful-spell'],
              targets: [ally, 'careful-foe'],
              parameters: { exemptTargets: [ally] },
              turnId: 'real-round-one',
            },
            'real-spell-cast'
          );
          assert.equal(casting.status, 200, JSON.stringify(casting.body));
          assert.deepEqual(casting.body.operationResult.management.carefulTargets, [ally]);
          assert.equal(casting.body.operationResult.management.carefulNoHalfDamage, true);
          assert.equal(casting.body.rulesRuntime.slots[0], character.rulesRuntime.slots[0] - 1);
          assert.equal(
            casting.body.rulesRuntime.pools['tidecaller:sorcery-points'],
            character.rulesRuntime.pools['tidecaller:sorcery-points'] - 1
          );
          const reloaded = await request('/' + character._id);
          assert.equal(reloaded.status, 200);
          assert.deepEqual(reloaded.body.rulesRuntime, casting.body.rulesRuntime);
          character = casting.body;
        }
        const race = await Promise.all([
          command(character, 'identity.patch', { notes: 'Concurrent A' }, 'concurrent-a-' + callingId),
          command(character, 'identity.patch', { notes: 'Concurrent B' }, 'concurrent-b-' + callingId),
        ]);
        assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
        const persisted = await Character.findById(character._id).lean();
        assert.equal(rules.replay(persisted.rulesLedger).totalLevel, 20);
        assert.ok((await Receipt.countDocuments({ characterId: character._id })) >= 20);
      }
      // Exercise actual multi-document transactions, including rollback after a
      // treatment-lock insert and source expenditure, against the isolated DB.
      const surgeonRecord = await Character.findOne({ calling: 'doctor' }).lean(),
        livingRecord = await Character.findOne({ owner, calling: 'gunslinger', 'rulesLedger.version': 3 }).lean(),
        deadRecord = await Character.findOne({ calling: 'tidecaller' }).lean();
      await Character.updateOne(
        { _id: livingRecord._id },
        { $set: { 'rulesRuntime.health.current': 1 } }
      );
      const nativeOption = rules
          .replay(surgeonRecord.rulesLedger)
          .abilityOptions.find((o) => o.handler === 'triage'),
        surgeonBefore = (await request('/' + surgeonRecord._id)).body;
      const native = await command(
        surgeonBefore,
        'ability.activate',
        {
          optionId: nativeOption.id,
          targetIds: [String(livingRecord._id)],
          parameters: { confirmed: true, targetRestEpoch: 'ignored-for-native' },
        },
        'native-triage-real-mongo'
      );
      assert.equal(native.status, 200, JSON.stringify(native.body));
      const healed = await Character.findById(livingRecord._id).lean();
      assert.ok(healed.rulesRuntime.health.current > 1);
      assert.equal(healed.documentRevision, livingRecord.documentRevision + 1);
      await Character.updateOne(
        { _id: deadRecord._id },
        {
          $set: {
            'rulesRuntime.health.current': 0,
            'rulesRuntime.deathSaves': {
              successes: 0,
              failures: 3,
              stable: false,
              dead: true,
              cause: 'failed-saves',
            },
          },
        }
      );
      const beforeFailure = await Character.findById(surgeonRecord._id).lean(),
        receiptCount = await Receipt.countDocuments({ characterId: surgeonRecord._id });
      const failed = await command(
        native.body,
        'ability.activate',
        {
          optionId: nativeOption.id,
          targetIds: [String(deadRecord._id)],
          parameters: { confirmed: true, targetRestEpoch: 'ignored-for-native' },
        },
        'dead-native-triage-real-mongo'
      );
      assert.equal(failed.status, 422);
      assert.match(failed.body.message, /revive a dead/);
      const afterFailure = await Character.findById(surgeonRecord._id).lean();
      assert.deepEqual(afterFailure.rulesRuntime, beforeFailure.rulesRuntime);
      assert.deepEqual(afterFailure.inventory, beforeFailure.inventory);
      assert.equal(afterFailure.documentRevision, beforeFailure.documentRevision);
      assert.equal(await Receipt.countDocuments({ characterId: surgeonRecord._id }), receiptCount);
      assert.equal(
        await require('../../src/modules/archipelago/characters/treatmentLock').countDocuments({
          target: String(deadRecord._id),
        }),
        0
      );
      const second = build('doctor', 6, 'field-surgeon', 'yuma-core', 'field-medic');
      let surgeon = (
        await request('', {
          name: 'Second Surgeon',
          attributes: second.ledger.baseAttributes,
          creation: second.ledger.creation,
          firstLevel: second.ledger.levels[0],
        })
      ).body;
      for (let level = 2; level <= 6; level++) {
        const result = await command(
          surgeon,
          'advance',
          { level, choices: second.ledger.levels[level - 1].choices },
          'second-surgeon-advance-' + level
        );
        assert.equal(result.status, 200, JSON.stringify(result.body));
        surgeon = result.body;
      }
      const option = surgeon.rulesSummary.abilityOptions.find((o) => o.handler === 'triage');
      const repeat = await command(
        surgeon,
        'ability.activate',
        {
          optionId: option.id,
          targetIds: ['external-patient'],
          parameters: { confirmed: true, targetRestEpoch: 'rest-one' },
        },
        'cross-surgeon-treatment'
      );
      assert.equal(repeat.status, 422);
      assert.match(repeat.body.message, /already received Triage/);
      const unchanged = (await request('/' + surgeon._id)).body;
      assert.equal(unchanged.documentRevision, surgeon.documentRevision);
      assert.equal(unchanged.inventory.find((i) => i.chargesCurrent !== undefined).chargesCurrent, 10);
      // Exercise campaign authority in this disposable database only.
      async function campaigns(path, user, method = 'GET', body) {
        const response = await fetch(base.replace(/characters$/, 'campaigns') + path, {
          method,
          headers: headers(user),
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: response.status, body: await response.json() };
      }
      const createdCampaign = await campaigns('', other, 'POST', { name: 'Isolated Phase Two' });
      assert.equal(createdCampaign.status, 201, JSON.stringify(createdCampaign.body));
      const campaign = createdCampaign.body,
        campaignPath = '/' + campaign._id;
      const registerPath = campaignPath + '/characters/' + surgeon._id;
      assert.equal((await campaigns(campaignPath, owner)).status, 404);
      assert.equal((await campaigns(registerPath, owner, 'PUT')).status, 404);
      const joined = await campaigns('/join', owner, 'POST', {
        inviteCode: campaign.inviteCode.toLowerCase(),
      });
      assert.equal(joined.status, 200, JSON.stringify(joined.body));
      assert.equal(joined.body.inviteCode, undefined);
      assert.equal((await campaigns(registerPath, other, 'PUT')).status, 404);
      const soloAuthorization = await command(
        surgeon,
        'milestone.authorize',
        { level: 7, reason: 'Solo milestone before joining' },
        'solo-before-campaign'
      );
      assert.equal(soloAuthorization.status, 200, JSON.stringify(soloAuthorization.body));
      const enrolled = await campaigns(registerPath, owner, 'PUT');
      assert.equal(enrolled.status, 200, JSON.stringify(enrolled.body));
      const associated = (await request('/' + surgeon._id)).body;
      assert.equal(associated.documentRevision, soloAuthorization.body.documentRevision + 1);
      assert.equal((await campaigns(registerPath, owner, 'PUT')).status, 200);
      assert.equal(
        (await request('/' + surgeon._id)).body.documentRevision,
        associated.documentRevision
      );
      assert.deepEqual(
        (await campaigns(campaignPath, other)).body.characters.map((character) => character._id),
        [surgeon._id]
      );
      assert.equal((await campaigns('', owner)).body[0]._id, campaign._id);
      assert.equal(associated.permissions.campaignRegistered, true);
      assert.equal(associated.permissions.canGM, false);
      assert.equal(associated.permissions.canAdvance, false);
      assert.equal((await request('/' + surgeon._id, undefined, other)).status, 200);
      const authorizeBody = {
        operationId: 'campaign-milestone-seven',
        expectedRevision: associated.documentRevision,
        rulesVersion: 'SA-CHAR-1',
        type: 'milestone.authorize',
        payload: { level: 7, reason: 'Isolated acceptance milestone' },
      };
      assert.equal((await request('/' + surgeon._id + '/commands', authorizeBody)).status, 403);
      assert.equal(
        (await request('/' + surgeon._id + '/commands', authorizeBody, '333333333333333333333333'))
          .status,
        404
      );
      const milestone = await request('/' + surgeon._id + '/commands', authorizeBody, other);
      assert.equal(milestone.status, 200, JSON.stringify(milestone.body));
      assert.equal((await request('/' + surgeon._id)).body.permissions.canAdvance, true);
      const seventh = build('doctor', 7, 'field-surgeon', 'yuma-core', 'field-medic');
      const advanced = await command(
        milestone.body,
        'advance',
        { level: 7, choices: seventh.ledger.levels[6].choices },
        'campaign-advance-seven'
      );
      assert.equal(advanced.status, 200, JSON.stringify(advanced.body));
      assert.equal(advanced.body.rulesRuntime.milestones[0].used, true);
      const wrongVersion = await request('/' + surgeon._id + '/commands', {
        operationId: 'wrong-rules-version',
        expectedRevision: advanced.body.documentRevision,
        rulesVersion: 'obsolete',
        type: 'identity.patch',
        payload: { notes: 'Must not save' },
      });
      assert.equal(wrongVersion.status, 409);
      assert.equal(
        (await request('/' + surgeon._id)).body.documentRevision,
        advanced.body.documentRevision
      );
      assert.throws(
        () => new Character({ ...second.character, owner, obsoleteCharacterField: true }),
        /strict mode/
      );
      await t.test('Human Long Rest transfers only the excess Inspiration and replays once', async () => {
        const donorOwner = '444444444444444444444444', allyOwner = '555555555555555555555555';
        const Campaign = require('../../src/modules/archipelago/campaigns/model');
        const { ledger } = build('gunslinger');
        const { size, ...roots } = ledger.creation;
        void size;
        const base = { attributes: ledger.baseAttributes, firstLevel: ledger.levels[0] };
        const human = await request('', {
          ...base, name: 'Human Inspiration Donor', creation: {
            ...roots, lineage: { id: 'human', size: 'small', choices: { skill: 'stealth', originFeat: { id: 'alert' } } },
          },
        }, donorOwner);
        assert.equal(human.status, 201, JSON.stringify(human.body));
        const ally = await request('', { ...base, name: 'Inspiration Recipient', creation: ledger.creation }, allyOwner);
        assert.equal(ally.status, 201, JSON.stringify(ally.body));
        const party = await Campaign.create({
          name: 'Inspiration Test', owner: donorOwner, players: [allyOwner], inviteCode: 'INSPIRE',
          characterIds: [human.body._id, ally.body._id],
        });
        await Character.updateMany({ _id: { $in: party.characterIds } }, { $set: { campaignId: party._id } });
        const donor = await request('/' + human.body._id, undefined, donorOwner);
        const first = await command(donor.body, 'rest.start', { restId: 'first', kind: 'long-rest', startedAt: 0 }, 'human-rest-one-start', donorOwner);
        const granted = await command(first.body, 'rest.complete', { restId: 'first', completedAt: 28_800_000 }, 'human-rest-one-end', donorOwner);
        assert.equal(granted.status, 200, JSON.stringify(granted.body));
        assert.equal(granted.body.rulesRuntime.inspiration, true);
        const second = await command(granted.body, 'rest.start', { restId: 'second', kind: 'long-rest', startedAt: 86_400_000 }, 'human-rest-two-start', donorOwner);
        const payload = { restId: 'second', completedAt: 115_200_000, inspirationRecipientId: ally.body._id };
        const transferred = await command(second.body, 'rest.complete', payload, 'human-rest-two-end', donorOwner);
        assert.equal(transferred.status, 200, JSON.stringify(transferred.body));
        assert.equal(transferred.body.rulesRuntime.inspiration, true);
        assert.deepEqual(await command(second.body, 'rest.complete', payload, 'human-rest-two-end', donorOwner), transferred);
        const recipient = await request('/' + ally.body._id, undefined, allyOwner);
        assert.equal(recipient.body.rulesRuntime.inspiration, true);
        assert.equal(recipient.body.documentRevision, ally.body.documentRevision + 1);
      });
      // Stop the original HTTP server and its DB connection, then start a new Node
      // process with fresh modules/models and compare actual owner-protected HTTP reads.
      const keys = [
        '_id',
        'documentRevision',
        'rulesLedger',
        'rulesRuntime',
        'inventory',
        'loadout',
        'goldCp',
        'campaignId',
      ];
      const snapshots = [];
      for (const c of await Character.find().sort({ _id: 1 }).lean()) {
        const body = (await request('/' + c._id, undefined, String(c.owner))).body;
        snapshots.push(Object.fromEntries(keys.map((k) => [k, body[k]])));
      }
      await stopHttp(server);
      await mongoose.disconnect();
      assert.deepEqual(await restartSnapshot(fixtureMongo), snapshots);
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
      assert.equal(await Character.countDocuments(), 7);
      for (const c of await Character.find().lean()) {
        assert.equal(rules.replay(c.rulesLedger).decisionsComplete, true);
        assert.equal(rules.runtime.validate(rules.replay(c.rulesLedger), c.rulesRuntime), true);
      }
    } finally {
      try {
        if (server?.listening) await stopHttp(server);
      } finally {
        await mongoose.disconnect();
      }
    }
  }
);

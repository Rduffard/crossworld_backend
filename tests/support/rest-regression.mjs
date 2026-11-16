import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build, rules } from '../helpers/phase2.mjs';

const require = createRequire(import.meta.url);
const commands = require('../../src/modules/archipelago/characters/commands');
const { reconcileDice } = require('../../src/modules/archipelago/characters/runtime/resourceTransitions');
const timing = require('@crossworld/sanguine-engine/rest');
const { reconcileHitDice } = require('@crossworld/sanguine-engine/hit-dice');
const { recoverRestPools } = require('@crossworld/sanguine-engine/resources');
const H = 3_600_000;
const START = 48 * H;
const SHORT = 'short-rest';
const LONG = 'long-rest';
const levels = [1, 3, 5, 10, 20];
const profiles = ['depleted', 'near-cap', 'full', 'strained'];
const offsets = [-1, 0, 1];
const timelines = [];
for (const delta of offsets) {
  timelines.push(
    { kind: SHORT, complete: H + delta, minimum: H },
    { kind: LONG, complete: 8 * H + delta, minimum: 8 * H },
    { kind: SHORT, stops: [{ at: H + delta, grants: false }], resume: true },
    { kind: LONG, stops: [{ at: H + delta, grants: delta >= 0 }], resume: false },
  );
  for (const completionDelta of offsets) {
    timelines.push({
      kind: LONG, stops: [{ at: H + delta, grants: delta >= 0 }], resume: true,
      complete: 9 * H + completionDelta, minimum: 9 * H,
    });
  }
}
timelines.push(
  { kind: LONG, stops: [{ at: H, grants: true }, { at: H, grants: false }],
    resume: true, complete: 10 * H, minimum: 10 * H },
  { kind: LONG, stops: [{ at: H, grants: true }, { at: 2 * H, grants: true }],
    resume: true, complete: 10 * H, minimum: 10 * H },
);

const envelope = (c, operationId, type, payload) => ({
  operationId, expectedRevision: c.documentRevision, rulesVersion: 'SA-CHAR-1', type, payload,
});
const { stringify } = JSON;
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return stringify(value);
}

const hash = createHash('sha256');
let observations = 0;
function record(input, expected) {
  hash.update(canonical({ input, expected }) + '\n', 'utf8');
  observations++;
}

function issue(c, type, payload, error) {
  const before = structuredClone(c);
  const operation = envelope(c, 'rest-matrix-operation', type, payload);
  if (error) {
    const expected = error instanceof RegExp ? { statusCode: 422, message: error } : error;
    assert.throws(() => commands.apply(c, operation), expected);
    assert.deepEqual(c, before);
    return c;
  }
  const { changes, result } = commands.apply(c, operation);
  assert.deepEqual(c, before);
  assert.equal(changes.documentRevision, c.documentRevision + 1);
  return { ...c, ...changes, result };
}

function project(c) {
  const r = c.rulesRuntime;
  return {
    worldTime: r.worldTime, health: r.health.current, hitDice: r.hitDice,
    pools: r.pools, slots: r.slots, createdSlots: r.createdSlots, temporaryHealth: r.temporaryHealth,
    temporaryHealthMetadata: r.temporaryHealthMetadata ?? null,
    exhaustion: r.exhaustion, effects: r.effects.map(e => e.id),
    session: r.restSession ?? null, history: r.restHistory ?? [],
    epoch: r.restEpoch ?? null, lastLongRest: r.lastLongRest ?? null,
  };
}

function configure(c, summary, profile) {
  const r = c.rulesRuntime;
  const balance = max => ({ depleted: 0, 'near-cap': Math.max(0, max - 1), full: max, strained: 0 })[profile];
  r.health.current = Math.max(1, balance(r.health.max));
  r.pools = Object.fromEntries(Object.entries(summary.resources).map(([id, pool]) => [id, balance(pool.max)]));
  r.slots = summary.spellSlots.map(balance);
  r.hitDice = Object.fromEntries(Object.entries(summary.hitDice).map(([die, max]) => [
    die, profile === 'strained' ? 0 : Math.max(1, balance(max)),
  ]));
  if (profile === 'strained' && summary.callingLevels.tidecaller >= 2) r.createdSlots[0] = 1;
  r.worldTime = START;
  r.exhaustion = 2;
  r.temporaryHealth = 3;
  if (profile === 'strained') {
    r.temporaryHealthMetadata = { source: 'matrix-fixture', expiresAt: START + H };
  }
  r.effects = [
    { id: 'lasting', featureId: 'spell:geas', expiresAt: START + 30 * H },
    { id: 'timed', featureId: 'spell:light', expiresAt: START + H },
    { id: 'concentration', featureId: 'spell:guidance', concentration: true },
  ];
}

function recover(expected, summary, kind, options) {
  const pools = {};
  for (const [id, { max, recovery }] of Object.entries(summary.resources)) {
    const policy = recovery.shortRest;
    pools[id] = kind === LONG || policy === 'all' ? max :
      Math.min(max, expected.pools[id] + (Number.isInteger(policy) ? policy : 0));
  }
  assert.deepEqual(recoverRestPools(expected.pools, summary.resources, { kind }), pools);
  expected.pools = pools;
  if (kind === LONG) {
    expected.health = summary.health.max;
    expected.hitDice = { ...summary.hitDice };
    expected.slots = [...summary.spellSlots];
    expected.createdSlots = summary.spellSlots.map(() => 0);
    expected.temporaryHealth = 0;
    expected.temporaryHealthMetadata = null;
    expected.effects = ['lasting'];
  } else if (options.hitDice) {
    const [{ die, roll }] = options.hitDice;
    expected.hitDice[die]--;
    const healing = Math.max(0, roll + Math.floor((summary.attributes.resolve - 10) / 2));
    expected.health = Math.min(summary.health.max, expected.health + healing);
  }
  if (kind === LONG ? options.nourished : summary.callingLevels.navigator >= 10) {
    expected.exhaustion = Math.max(0, expected.exhaustion - 1);
  }
}

function runTimeline(template, input) {
  const { profile, timeline } = input;
  const { kind, stops = [], resume, complete, minimum } = timeline;
  const { summary } = template;
  let c = structuredClone(template.character);
  configure(c, summary, profile);
  const options = kind === LONG ? { nourished: profile === 'depleted' || profile === 'full' } : {};
  if (kind === SHORT && profile !== 'strained') {
    options.hitDice = [{ die: Object.keys(summary.hitDice)[0], roll: 4 }];
  }
  const expected = structuredClone(project(c));
  const steps = [];
  const check = () => {
    assert.deepEqual(project(c), expected);
    steps.push(structuredClone(expected));
  };
  const tick = at => {
    expected.worldTime = START + at;
    if (at >= H) {
      expected.effects = expected.effects.filter(id => id !== 'timed');
      if (profile === 'strained') {
        expected.temporaryHealth = 0;
        expected.temporaryHealthMetadata = null;
      }
    }
  };
  const restId = 'matrix-rest';
  assert.equal(timing.restDuration(kind, stops.length), kind === SHORT ? H : (8 + stops.length) * H);
  c = issue(c, 'rest.start', { restId, kind, startedAt: START, options });
  expected.session = { id: restId, kind, startedAt: START, segmentStart: START, interruptions: [], options };
  check();
  let previous = 0;
  for (const [index, { at, grants }] of stops.entries()) {
    const reason = index === 0 ? 'initiative' : 'damage';
    const resumed = kind === LONG && resume;
    const result = { shortRestGranted: grants, resumed };
    assert.deepEqual(timing.restInterruptionOutcome({ kind, elapsed: at - previous, resume }), result);
    const shortRestOptions = grants && profile !== 'strained' && index === 0
      ? { hitDice: [{ die: Object.keys(summary.hitDice)[0], roll: 4 }] } : {};
    c = issue(c, 'rest.interrupt', { restId, at: START + at, resume, reason, shortRestOptions, confirmed: true });
    assert.deepEqual(c.result, { type: 'rest.interrupt', interrupted: true, ...result });
    tick(at);
    if (grants) {
      recover(expected, summary, SHORT, shortRestOptions);
      expected.epoch = createHash('sha256').update(restId + ':interruption:' + index).digest('hex');
    }
    if (resumed) {
      expected.session.segmentStart = START + at;
      expected.session.interruptions.push({ at: START + at, reason, shortRestGranted: grants });
    } else {
      expected.session = null;
      expected.history = [restId];
    }
    steps.push(result);
    check();
    previous = at;
  }
  if (complete !== undefined) {
    const durationError = complete < minimum;
    assert.equal(timing.restCompletionTimingError(kind, complete, stops.length), durationError ? 'duration' : null);
    c = issue(c, 'rest.complete', { restId, completedAt: START + complete }, durationError ? /duration is too short/ : undefined);
    if (durationError) steps.push('duration');
    else {
      tick(complete);
      recover(expected, summary, kind, options);
      expected.session = null;
      expected.history = [restId];
      expected.epoch = restId;
      if (kind === LONG) expected.lastLongRest = START + complete;
    }
    check();
  }
  record({ ...input, options }, steps);
}

function start(c, kind, options = {}, restId = 'focused-rest', error) {
  return issue(c, 'rest.start', { restId, kind, startedAt: c.rulesRuntime.worldTime, options }, error);
}
function end(c, elapsed, error, restId = 'focused-rest') {
  return issue(c, 'rest.complete', { restId, completedAt: START + elapsed }, error);
}
function fixture(calling = 'gunslinger', level = 5, path) {
  const { character, summary } = build(calling, level, path);
  configure(character, summary, 'depleted');
  return { character, summary };
}

function focused() {
  for (const delta of offsets) {
    const { character } = fixture();
    character.rulesRuntime.lastLongRest = START - 16 * H;
    const eligible = delta >= 0;
    assert.equal(timing.restCompletionTimingError(LONG, 8 * H + delta, 0, 24 * H + delta),
      delta < 0 ? 'duration' : null);
    // Provide a valid duration even when it is one millisecond too soon since the previous Long Rest.
    character.rulesRuntime.lastLongRest++;
    const c = start(character, LONG);
    const elapsed = 8 * H + 1 + delta;
    assert.equal(timing.restCompletionTimingError(LONG, elapsed, 0, 24 * H + delta), eligible ? null : 'interval');
    const after = end(c, elapsed, eligible ? undefined : /24 hours/);
    const last = eligible ? START + elapsed : START - 16 * H + 1;
    assert.equal(after.rulesRuntime.lastLongRest, last);
    record({ intervalDelta: delta }, { eligible, last });
  }

  const { character } = fixture();
  for (const [health, dead] of [[0, false], [1, true], [1, false]]) {
    const c = structuredClone(character);
    c.rulesRuntime.health.current = health;
    c.rulesRuntime.deathSaves.dead = dead;
    const eligible = health === 1 && !dead;
    assert.equal(timing.restStartHealthEligible(health, dead), eligible);
    for (const kind of [SHORT, LONG]) {
      const started = start(c, kind, {}, 'focused-rest', eligible ? undefined : /living creature/);
      assert.equal(Boolean(started.rulesRuntime.restSession), eligible);
      record({ health, dead, kind }, eligible);
    }
  }

  for (const [kind, options, message, statusCode] of [
    [SHORT, { extra: true }, /valid rest options/, 422],
    [SHORT, { hitDice: [{ die: 'd10', roll: 11 }] }, /invalid GM-recorded roll/, 400],
    [LONG, { hitDice: [] }, /cannot spend Hit Dice/, 400],
    [LONG, { nourished: 'yes' }, /food and water/, 400],
    [LONG, { restoreSorcery: true }, /Short Rest features/, 400],
  ]) {
    start(character, kind, options, 'focused-rest', { statusCode, message });
    record({ kind, options }, { statusCode, message: message.source });
  }
  const c = start(character, SHORT);
  end(c, H, /matching active rest/, 'different-rest');
  start(c, SHORT, {}, 'different-rest', /current rest/);
  const completed = end(c, H);
  assert.equal(completed.rulesRuntime.pools['gunslinger:second-wind'], 1);
  end(completed, H, /matching active rest/);
  start(completed, SHORT, {}, 'focused-rest', /already been used/);
  const canceled = issue(c, 'rest.cancel', { restId: 'focused-rest' });
  assert.deepEqual(canceled.rulesRuntime.restHistory, ['focused-rest']);
  assert.equal(canceled.rulesRuntime.pools['gunslinger:second-wind'], 0);
  end(canceled, H, /matching active rest/);
  start(canceled, SHORT, {}, 'focused-rest', /already been used/);
  record({ identity: 'focused-rest' }, { completed: 1, canceled: 0, duplicate: 'rejected', mismatched: 'rejected' });

  const active = start(character, LONG);
  const interrupt = (state, at, error) => issue(state, 'rest.interrupt', {
    restId: 'focused-rest', at, reason: 'exertion-hour', resume: true, confirmed: true,
    shortRestOptions: { hitDice: [{ die: 'd10', roll: 4 }] },
  }, error);
  interrupt(active, START + H - 1, /No completed hour/);
  const rested = interrupt(active, START + H);
  interrupt(rested, START + H - 1, /valid rest interruption/);
  issue(rested, 'time.advance', { worldTime: START + H - 1, confirmed: true }, /cannot move backward/);
  assert.equal(rested.rulesRuntime.hitDice.d10, 0);
  assert.equal(rested.rulesRuntime.health.current, 7);
  const full = end(rested, 9 * H);
  assert.equal(full.rulesRuntime.hitDice.d10, 5);
  assert.equal(full.rulesRuntime.pools['gunslinger:second-wind'], 3);
  record({ interruptionRoll: 4, calling: 'gunslinger', level: 5 }, {
    afterInterruptedRest: { health: 7, hitDice: 0, secondWind: 1 },
    afterLongRest: { hitDice: 5, secondWind: 3 },
    invalidBeforeHour: 422, backwardsClock: 422,
  });
  for (const [policy, available, maximum, expected] of [
    ['advance', 0, 6, 1], ['rebuild', 0, 6, 0], ['rebuild', 5, 3, 3], ['advance', 5, 6, 6],
  ]) {
    const saved = available === 0 ? rested : full;
    const inputs = [{ d10: 5 }, saved.rulesRuntime.hitDice, { d10: maximum }, policy];
    assert.deepEqual(reconcileHitDice(...inputs), { d10: expected });
    assert.deepEqual(reconcileDice(...inputs), { d10: expected });
    record({ policy, available, maximum }, { d10: expected, afterInterruptedRest: 0, afterLongRest: 5 });
  }
  assert.throws(() => reconcileDice({ d10: 5 }, { d10: 6 }, { d10: 6 }, 'advance'),
    { statusCode: 400, message: 'Invalid saved hitDice' });
  record({ invalidSavedDieCount: 6, allocation: 5 }, { statusCode: 400 });
}

function replacementAndCasting() {
  const shipwright = fixture('shipwright', 5).character;
  shipwright.rulesRuntime.pools['shipwright:arcane-recovery'] = 1;
  const restored = end(start(shipwright, SHORT, { recoverSlots: [1, 2] }), H);
  assert.deepEqual(restored.rulesRuntime.slots.slice(0, 3), [1, 1, 0]);
  assert.equal(restored.rulesRuntime.pools['shipwright:arcane-recovery'], 0);
  start(shipwright, SHORT, { recoverSlots: [2, 2] }, 'focused-rest', { statusCode: 400, message: /budget|combined|recovery/i });
  start(restored, SHORT, { recoverSlots: [1] }, 'next-rest', { statusCode: 400, message: /Invalid Arcane Recovery/ });
  record({ shipwrightLevel: 5, requested: [1, 2], overBudget: [2, 2] }, { slots: [1, 1, 0], uses: 0 });

  const tidecaller = fixture('tidecaller', 5).character;
  tidecaller.rulesRuntime.pools['tidecaller:restoration'] = 1;
  const restoredSorcery = end(start(tidecaller, SHORT, { restoreSorcery: true }), H);
  assert.equal(restoredSorcery.rulesRuntime.pools['tidecaller:sorcery-points'], 2);
  assert.equal(restoredSorcery.rulesRuntime.pools['tidecaller:restoration'], 0);
  start(fixture('tidecaller', 3).character, SHORT, { restoreSorcery: true }, 'focused-rest', { statusCode: 400, message: /unavailable/ });
  record({ tidecallerLevel: 5, unavailableAt: 3 }, { points: 2, uses: 0 });

  const navigator = fixture('navigator', 7, 'gray-net').character;
  navigator.rulesRuntime.selections.navigator = { hunterPrey: ['colossus-slayer'] };
  const selections = { navigator: { hunterPrey: ['horde-breaker'] } };
  for (const [kind, duration] of [[SHORT, H], [LONG, 8 * H]]) {
    const rested = end(start(navigator, kind, { selections }), duration);
    assert.deepEqual(rested.rulesRuntime.selections.navigator.hunterPrey, ['horde-breaker']);
    start(navigator, kind, { selections: { navigator: { hunterPrey: ['invalid'] } } }, 'focused-rest', { statusCode: 400, message: /invalid|choose/i });
    record({ kind, old: 'colossus-slayer', requested: 'horde-breaker' }, { selection: 'horde-breaker' });
  }

  const doctor = fixture('doctor', 20).character;
  doctor.rulesRuntime.interventionCooldown = { rolls: [1, 1], longRestsRemaining: 2 };
  const short = end(start(doctor, SHORT), H);
  const firstLong = end(start(doctor, LONG), 8 * H);
  const secondId = 'second-long-rest';
  const later = issue(firstLong, 'time.advance', { worldTime: START + 24 * H, confirmed: true });
  const secondLong = end(start(later, LONG, {}, secondId), 32 * H, undefined, secondId);
  const cooldown = rest => [
    rest.rulesRuntime.interventionCooldown.longRestsRemaining, rest.rulesRuntime.pools['doctor:intervention'],
  ];
  const expected = [[2, 0], [1, 0], [0, 1]];
  assert.deepEqual([short, firstLong, secondLong].map(cooldown), expected);
  record({ doctorLevel: 20, wishRolls: [1, 1], rests: [SHORT, LONG, LONG] }, expected);
}

async function receipts() {
  const { character } = fixture();
  const initial = start(character, SHORT);
  let saved = { ...initial, _id: '111111111111111111111111', owner: 'owner' };
  let rows = [];
  let failWrite = true;
  const query = read => ({ session() { return this; }, lean: async () => structuredClone(read()) });
  const Character = {
    db: { startSession: async () => ({
      async withTransaction(fn) {
        const before = structuredClone(saved);
        const beforeRows = structuredClone(rows);
        try { await fn(); } catch (error) {
          saved = before;
          rows = beforeRows;
          throw error;
        }
      },
      async endSession() {},
    }) },
    findOne: ({ _id, owner }) => query(() => saved._id === _id && saved.owner === owner ? saved : null),
    findOneAndUpdate: (filter, { $set }) => query(() => {
      if (saved.owner !== filter.owner || saved.documentRevision !== filter.documentRevision) return null;
      saved = { ...saved, ...structuredClone($set) };
      return saved;
    }),
  };
  const Receipt = {
    findOne: filter => query(() => rows.find(row => Object.keys(filter).every(key => row[key] === filter[key])) ?? null),
    async create(entries) {
      assert.equal(saved.documentRevision, initial.documentRevision + 1);
      rows.push(...structuredClone(entries));
      if (failWrite) throw new Error('injected receipt failure');
    },
  };
  const handler = commands.handler(Character, Receipt);
  async function call(body) {
    let error;
    let data;
    await handler({ body, user: { _id: 'owner' }, params: { characterId: saved._id } },
      { send(result) { data = result; } }, failure => { error = failure; });
    return { error, data };
  }
  const before = structuredClone(saved);
  const command = envelope(saved, 'rest-complete-receipt', 'rest.complete', { restId: 'focused-rest', completedAt: START + H });
  assert.match((await call(command)).error?.message, /injected receipt failure/);
  assert.deepEqual(saved, before);
  assert.deepEqual(rows, []);
  failWrite = false;
  const committed = await call(command);
  assert.equal(committed.error, undefined);
  assert.ok(committed.data);
  assert.equal(rows.length, 1);
  assert.equal(saved.rulesRuntime.pools['gunslinger:second-wind'], 1);
  const committedState = structuredClone(saved);
  const committedRows = structuredClone(rows);
  assert.deepEqual(await call(command), committed);
  assert.equal((await call({ ...command, payload: { ...command.payload, completedAt: START + H + 1 } })).error?.statusCode, 409);
  assert.equal((await call({ ...command, operationId: 'rest-stale-revision' })).error?.statusCode, 409);
  assert.equal((await call({ ...command, expectedRevision: saved.documentRevision, operationId: 'rest-duplicate-complete' })).error?.statusCode, 422);
  assert.deepEqual(saved, committedState);
  assert.deepEqual(rows, committedRows);
  record({ receipt: 'rest-complete-receipt' }, { rollback: true, replay: true, conflict: 409, stale: 409, duplicate: 422, uses: 1 });
}

focused();
replacementAndCasting();
await receipts();
for (const calling of rules.blueprint.callings.map(({ id }) => id).sort()) {
  for (const level of levels) {
    const template = build(calling, level);
    for (const profile of profiles) {
      for (const timeline of timelines) {
        const input = { calling, level, profile, timeline };
        try { runTimeline(template, input); } catch (error) {
          throw new Error('Rest regression failed for ' + stringify(input), { cause: error });
        }
      }
    }
  }
}
const result = { observations, sha256: hash.digest('hex') };
console.log(stringify(result));
if (!process.argv.includes('--print-baseline')) {
  assert.deepEqual(result, JSON.parse(readFileSync(new URL('rest-regression.expected.json', import.meta.url), 'utf8')));
}

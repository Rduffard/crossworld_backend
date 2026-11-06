import assert from "node:assert/strict";
import { test } from "node:test";
import engine from "../src/modules/archipelago/system/advancement.js";
import rules from "../src/modules/archipelago/system/blueprints/progression.js";
import packages from "../src/modules/archipelago/system/blueprints/startingProficiencies.js";
import training from "../src/modules/archipelago/system/blueprints/training.js";
import catalog from "../src/modules/archipelago/system/blueprints/catalogs.js";
import Character from "../src/modules/archipelago/characters/model.js";
import controller from "../src/modules/archipelago/characters/controller.js";
import validators from "../src/modules/archipelago/characters/validators.js";
const scores = {
  might: 16,
  agility: 14,
  wit: 13,
  spirit: 12,
  resolve: 10,
  instinct: 8,
};
const fresh = () => engine.initialize("corsair", scores);
const op = (ledger, changes) => ({
  expectedRevision: ledger.revision,
  ...changes,
});
// Synthetic definitions exercise the engine; these are never published as game content.
const fixtures = {
  callingAbilities: [
    { id: "test-basic", calling: "corsair", minimumLevel: 1 },
    {
      id: "test-advanced",
      calling: "corsair",
      minimumLevel: 5,
      prerequisites: {
        callingAbilities: ["test-basic"],
        attributes: { might: 18 },
      },
    },
  ],
  pathAbilities: [1, 2, 3, 4].map((tier) => ({
    id: "test-" + tier,
    pathId: "drydock-ghost",
    tier,
  })),
};
const spend = (rewardId, kind, rest = {}) => ({ rewardId, kind, ...rest });

test("canonical schedule yields exact totals, all boundaries, and stable distinct IDs", () => {
  assert.deepEqual(rules.callingLevels, [1, 2, 5, 7, 9, 10, 13, 14, 17, 20]);
  assert.deepEqual(rules.pathLevels, [3, 6, 11, 16]);
  assert.deepEqual(rules.attributeLevels, [4, 8, 12, 16, 19]);
  for (let n = 1; n <= 20; n++) {
    const rewards = engine.rewardsAt(n);
    assert.equal(new Set(rewards.map((r) => r.id)).size, rewards.length);
    for (const [kind, levels] of [
      ["calling", rules.callingLevels],
      ["path", rules.pathLevels],
      ["attribute", rules.attributeLevels],
    ])
      assert.equal(
        rewards.filter((r) => r.kind === kind).length,
        levels.filter((x) => x <= n).length
      );
  }
  assert.equal(engine.rewardsAt(20).length, 19);
  assert.deepEqual(
    engine
      .rewardsAt(16)
      .filter((r) => r.level === 16)
      .map((r) => r.kind),
    ["attribute", "path"]
  );
  for (const n of [15, 18])
    assert.equal(engine.rewardsAt(n).length, engine.rewardsAt(n - 1).length);
  for (const n of [0, 21, 1.5, "1", null])
    assert.throws(() => engine.rewardsAt(n));
});
test("all six packages have valid skills and distinct saving throws; equipment remains metadata", () => {
  assert.equal(training.length, 20);
  assert.equal(packages.equipmentStatus, undefined);
  for (const calling of catalog.callings) {
    const p = packages.callings[calling.id];
    assert.equal(p.skills.length, 2);
    assert.equal(new Set(p.saves).size, 2);
    assert.ok(p.skills.every((id) => training.some((s) => s.id === id)));
    assert.deepEqual(
      engine.initialize(calling.id, scores).savingThrows,
      p.saves
    );
  }
});
test("initial passive ownership is automatic and first Calling reward remains unspent pending content", () => {
  const ledger = fresh();
  assert.equal(ledger.passive.name, "Sea Legs");
  assert.deepEqual(
    engine.summarize(ledger, 1).unspent.map((r) => r.id),
    ["calling:1"]
  );
  assert.deepEqual(rules.callingAbilities, []);
  assert.deepEqual(rules.pathAbilities, []);
  assert.throws(
    () =>
      engine.advance(
        ledger,
        1,
        op(ledger, {
          spends: [spend("calling:1", "calling", { abilityId: "rushing-cut" })],
        })
      ),
    /unavailable/
  );
});
test("level increases retain every reward and do not mutate inputs", () => {
  const ledger = fresh(),
    before = structuredClone(ledger);
  const next = engine.advance(ledger, 1, op(ledger, { level: 20 }));
  assert.equal(next.summary.unspent.length, 19);
  assert.deepEqual(ledger, before);
  assert.equal(next.ledger.revision, 1);
  assert.throws(
    () => engine.advance(next.ledger, 20, op(next.ledger, { level: 19 })),
    /respec/
  );
  assert.throws(
    () => engine.advance(next.ledger, 20, { expectedRevision: 0 }),
    /reload/
  );
});
test("attribute patterns, maximum, and duplicate spending are enforced atomically", () => {
  const ledger = fresh();
  const next = engine.advance(
    ledger,
    1,
    op(ledger, {
      level: 8,
      spends: [
        spend("attribute:4", "attribute", { increases: { might: 2 } }),
        spend("attribute:8", "attribute", {
          increases: { agility: 1, wit: 1 },
        }),
      ],
    })
  );
  assert.equal(next.summary.attributes.might, 18);
  assert.equal(next.summary.attributes.agility, 15);
  for (const increases of [
    { might: 1 },
    { might: 3 },
    { might: 2, wit: 1 },
    { unknown: 2 },
    {},
  ])
    assert.throws(() =>
      engine.advance(
        ledger,
        1,
        op(ledger, {
          level: 4,
          spends: [spend("attribute:4", "attribute", { increases })],
        })
      )
    );
  const capped = engine.initialize("corsair", { ...scores, might: 20 });
  assert.throws(
    () =>
      engine.advance(
        capped,
        1,
        op(capped, {
          level: 4,
          spends: [
            spend("attribute:4", "attribute", { increases: { might: 2 } }),
          ],
        })
      ),
    /maximum/
  );
  assert.throws(
    () =>
      engine.advance(
        next.ledger,
        8,
        op(next.ledger, {
          spends: [
            spend("attribute:4", "attribute", { increases: { might: 2 } }),
          ],
        })
      ),
    /already spent/
  );
});
test("exchanges can remain unspent; cap, direction, and irreversibility are enforced", () => {
  const ledger = fresh();
  const next = engine.advance(
    ledger,
    1,
    op(ledger, {
      level: 12,
      exchanges: [
        { rewardId: "attribute:4", kind: "calling" },
        { rewardId: "attribute:8", kind: "path" },
      ],
    })
  );
  assert.equal(next.summary.exchanges, 2);
  assert.equal(
    next.summary.unspent.find((r) => r.id === "attribute:8").kind,
    "path"
  );
  assert.throws(
    () =>
      engine.advance(
        next.ledger,
        12,
        op(next.ledger, {
          exchanges: [{ rewardId: "attribute:12", kind: "path" }],
        })
      ),
    /two/
  );
  assert.throws(
    () =>
      engine.advance(
        next.ledger,
        12,
        op(next.ledger, {
          spends: [
            spend("attribute:4", "attribute", { increases: { might: 2 } }),
          ],
        })
      ),
    /conversion/
  );
  for (const rewardId of ["calling:1", "path:3", "attribute:19"])
    assert.throws(() =>
      engine.advance(
        ledger,
        1,
        op(ledger, { level: 8, exchanges: [{ rewardId, kind: "calling" }] })
      )
    );
  const used = engine.advance(
    ledger,
    1,
    op(ledger, {
      level: 4,
      spends: [spend("attribute:4", "attribute", { increases: { might: 2 } })],
    })
  );
  assert.throws(
    () =>
      engine.advance(
        used.ledger,
        4,
        op(used.ledger, {
          exchanges: [{ rewardId: "attribute:4", kind: "path" }],
        })
      ),
    /respec/
  );
});
test("Calling eligibility, prerequisites, duplicates, foreign Calling, and reward types", () => {
  const ledger = fresh();
  assert.throws(() =>
    engine.advance(
      ledger,
      1,
      op(ledger, {
        spends: [spend("calling:1", "calling", { abilityId: "test-advanced" })],
      }),
      fixtures
    )
  );
  const next = engine.advance(
    ledger,
    1,
    op(ledger, {
      level: 5,
      spends: [
        spend("attribute:4", "attribute", { increases: { might: 2 } }),
        spend("calling:1", "calling", { abilityId: "test-basic" }),
        spend("calling:5", "calling", { abilityId: "test-advanced" }),
      ],
    }),
    fixtures
  );
  assert.deepEqual(next.summary.callingAbilities, [
    "test-basic",
    "test-advanced",
  ]);
  assert.throws(() =>
    engine.advance(
      next.ledger,
      5,
      op(next.ledger, {
        spends: [spend("calling:2", "calling", { abilityId: "test-basic" })],
      }),
      fixtures
    )
  );
  assert.throws(
    () =>
      engine.advance(
        ledger,
        1,
        op(ledger, {
          level: 5,
          spends: [
            spend("calling:5", "calling", { abilityId: "test-advanced" }),
          ],
        }),
        fixtures
      ),
    /prerequisite/
  );
  for (const kind of ["attribute", "path"])
    assert.throws(
      () =>
        engine.advance(
          ledger,
          1,
          op(ledger, {
            level: 6,
            spends: [spend("calling:1", kind, { increases: { might: 2 } })],
          }),
          fixtures
        ),
      /conversion/
    );
});
test("Path investments immediately own sequential tiers; all gates and cross-Path access", () => {
  let ledger = fresh(),
    current = 1;
  for (const [i, n] of rules.pathTierLevels.entries()) {
    const tier = i + 1;
    const next = engine.advance(
      ledger,
      current,
      op(ledger, {
        level: n,
        spends: [spend("path:" + n, "path", { pathId: "drydock-ghost", tier })],
      }),
      fixtures
    );
    assert.equal(next.summary.pathTiers["drydock-ghost"], tier);
    ledger = next.ledger;
    current = n;
  }
  assert.throws(
    () =>
      engine.advance(
        fresh(),
        1,
        op(fresh(), {
          level: 16,
          spends: [
            spend("path:16", "path", { pathId: "drydock-ghost", tier: 4 }),
          ],
        }),
        fixtures
      ),
    /sequential/
  );
  for (const calling of catalog.callings)
    for (const path of catalog.specializations) {
      const initial = engine.initialize(calling.id, scores),
        content = {
          callingAbilities: [],
          pathAbilities: [{ pathId: path.id, tier: 1 }],
        };
      assert.equal(
        engine.advance(
          initial,
          1,
          op(initial, {
            level: 3,
            spends: [spend("path:3", "path", { pathId: path.id, tier: 1 })],
          }),
          content
        ).summary.pathTiers[path.id],
        1
      );
    }
  assert.throws(
    () =>
      engine.advance(
        fresh(),
        1,
        op(fresh(), {
          level: 3,
          spends: [
            spend("path:3", "path", { pathId: "drydock-ghost", tier: 1 }),
          ],
        })
      ),
    /review/
  );
});
test("unknown fields and spoofed ownership or spend timestamps are rejected", () => {
  const ledger = fresh();
  for (const changes of [
    { pathTiers: {} },
    { revision: 8 },
    { spends: [{ rewardId: "calling:1", kind: "calling", spentAtLevel: 20 }] },
  ])
    assert.throws(() => engine.advance(ledger, 1, op(ledger, changes)));
});
test("all Calling band and Path tier level boundaries are enforced with retained rewards", () => {
  for (const band of rules.callingBands) {
    const content = {
      callingAbilities: [
        { id: "test-band", calling: "corsair", minimumLevel: band },
      ],
      pathAbilities: [],
    };
    const ledger = fresh();
    if (band > 1)
      assert.throws(() =>
        engine.advance(
          ledger,
          1,
          op(ledger, {
            level: band - 1,
            spends: [spend("calling:1", "calling", { abilityId: "test-band" })],
          }),
          content
        )
      );
    assert.equal(
      engine.advance(
        ledger,
        1,
        op(ledger, {
          level: band,
          spends: [spend("calling:1", "calling", { abilityId: "test-band" })],
        }),
        content
      ).summary.callingAbilities.length,
      1
    );
  }
  let ledger = fresh(),
    current = 1;
  for (const [i, minimum] of rules.pathTierLevels.entries()) {
    if (i > 0)
      assert.throws(() =>
        engine.advance(
          ledger,
          current,
          op(ledger, {
            level: minimum - 1,
            exchanges: [{ rewardId: "attribute:4", kind: "path" }],
            spends: [
              spend("attribute:4", "path", {
                pathId: "drydock-ghost",
                tier: i + 1,
              }),
            ],
          }),
          fixtures
        )
      );
    const next = engine.advance(
      ledger,
      current,
      op(ledger, {
        level: minimum,
        spends: [
          spend("path:" + minimum, "path", {
            pathId: "drydock-ghost",
            tier: i + 1,
          }),
        ],
      }),
      fixtures
    );
    ledger = next.ledger;
    current = minimum;
  }
});

const owner = "507f1f77bcf86cd799439011";
async function invoke(body) {
  let result, error;
  await controller.updateCharacter(
    { body, user: { _id: owner }, params: { characterId: owner } },
    {
      send(value) {
        result = value;
      },
    },
    (err) => {
      error = err;
    }
  );
  return { result, error };
}
test("controller persists advancement, clamps without healing, preserves history, and uses compare-and-set", async (t) => {
  const seed = {
    _id: owner,
    owner,
    updatedAt: "2026-11-04T12:00:00.000Z",
    calling: "corsair",
    origin: "rukka",
    attributes: scores,
    training: ["climb", "perception", "deceive", "navigate"],
    advancement: fresh(),
    progression: { rank: 1, unlockedNodes: ["historical"], opaque: "keep" },
    resources: {
      health: { current: 1, max: 15 },
      stamina: { current: 2, max: 15 },
      focus: { current: 3, max: 12 },
      corruption: { current: 4, max: 9 },
    },
    notes: "keep",
    identity: { background: { pastRole: "sailor" } },
  };
  t.mock.method(Character, "findById", () => ({
    lean: async () => structuredClone(seed),
  }));
  let query, update;
  t.mock.method(Character, "findOneAndUpdate", (q, u) => {
    query = q;
    update = u;
    return { lean: async () => ({ ...seed, ...u }) };
  });
  const outcome = await invoke({
    advancementOperation: {
      expectedRevision: 0,
      level: 4,
      spends: [spend("attribute:4", "attribute", { increases: { might: 2 } })],
    },
    identity: { background: { definingEvent: "new" } },
  });
  assert.ifError(outcome.error);
  assert.equal(query.updatedAt, seed.updatedAt);
  assert.equal(query.owner, owner);
  assert.equal(update.attributes.might, 18);
  assert.equal(update.advancement.revision, 1);
  assert.deepEqual(update.progression, { ...seed.progression, rank: 4 });
  assert.equal(update.resources.health.current, 1);
  assert.deepEqual(update.resources.corruption, seed.resources.corruption);
  assert.deepEqual(update.identity.background, {
    pastRole: "sailor",
    definingEvent: "new",
  });
  assert.equal("advancementOperation" in update, false);
  assert.equal("notes" in update, false);
  const serialized = new Character({
    ...seed,
    ...update,
    name: "Regression Sailor",
  });
  assert.ifError(serialized.validateSync());
  assert.equal(
    Character.hydrate(serialized.toObject()).advancement.spends.length,
    1
  );
  for (const body of [
    { attributes: { might: 20 } },
    { calling: "warden" },
    { progression: { rank: 20 } },
    { advancement: {} },
    { trainingRulesVersion: 99 },
    { abilities: [{ name: "fake", source: "calling" }] },
  ])
    assert.ok((await invoke(body)).error);
});
test("concurrent changes reject stale saves rather than overwrite them", async (t) => {
  t.mock.method(Character, "findById", () => ({
    lean: async () => ({
      _id: owner,
      owner,
      advancement: fresh(),
      progression: { rank: 1 },
    }),
  }));
  t.mock.method(Character, "findOneAndUpdate", () => ({
    lean: async () => null,
  }));
  assert.match((await invoke({ notes: "changed" })).error.message, /reload/);
});
test("genuine legacy Training and Path records survive unrelated edits without conversion", async (t) => {
  const seed = {
    _id: owner,
    owner,
    training: ["board", "shoot", "scout", "sift"],
    progression: {
      rank: 5,
      specializationPath: "reef-knife",
      unlockedNodes: ["close-water"],
      corePoints: 9,
    },
    notes: "old",
  };
  t.mock.method(Character, "findById", () => ({
    lean: async () => structuredClone(seed),
  }));
  let saved;
  t.mock.method(Character, "findOneAndUpdate", (_query, update) => ({
    lean: async () => {
      saved = { ...seed, ...update };
      return saved;
    },
  }));
  assert.ifError((await invoke({ notes: "new" })).error);
  assert.deepEqual(saved.training, seed.training);
  assert.deepEqual(saved.progression, seed.progression);
  assert.equal(saved.advancement, undefined);
  assert.equal(saved.trainingRulesVersion, undefined);
  assert.ok(
    (await invoke({ advancementOperation: { expectedRevision: 0, level: 6 } }))
      .error
  );
});
test("request validation rejects persisted authority fields and malformed operations", async () => {
  for (const body of [
    { advancement: {} },
    { trainingRulesVersion: 1 },
    { advancementOperation: { expectedRevision: "0" } },
    {
      advancementOperation: {
        expectedRevision: 0,
        spends: [{ rewardId: "calling:1", kind: "calling", spentAtLevel: 20 }],
      },
    },
  ]) {
    let error;
    await validators.validateUpdateCharacter(
      { body, headers: {}, method: "PATCH" },
      {},
      (err) => {
        error = err;
      }
    );
    assert.ok(error);
  }
});

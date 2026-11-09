import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const engine = require("../src/modules/archipelago/system/rules2024");
const { blueprint } = engine;
const scores = {
  might: 13,
  agility: 13,
  resolve: 13,
  wit: 13,
  instinct: 13,
  spirit: 13,
};
const fixture = {
  corsair: {
    die: 8,
    saves: ["agility", "wit"],
    skills: 4,
    path: [3, 9, 13, 17],
    asi: [4, 8, 10, 12, 16, 19],
  },
  gunslinger: {
    die: 10,
    saves: ["might", "resolve"],
    skills: 2,
    path: [3, 7, 10, 15, 18],
    asi: [4, 6, 8, 12, 14, 16, 19],
  },
  navigator: {
    die: 10,
    saves: ["might", "agility"],
    skills: 3,
    path: [3, 7, 11, 15],
    asi: [4, 8, 12, 16, 19],
  },
  tidecaller: {
    die: 6,
    saves: ["resolve", "spirit"],
    skills: 2,
    path: [3, 6, 14, 18],
    asi: [4, 8, 12, 16, 19],
  },
  warden: {
    die: 10,
    saves: ["instinct", "spirit"],
    skills: 2,
    path: [3, 7, 15, 20],
    asi: [4, 8, 12, 16, 19],
  },
  reaver: {
    die: 12,
    saves: ["might", "resolve"],
    skills: 2,
    path: [3, 6, 10, 14],
    asi: [4, 8, 12, 16, 19],
  },
  doctor: {
    die: 8,
    saves: ["instinct", "spirit"],
    skills: 2,
    path: [3, 6, 17],
    asi: [4, 8, 12, 16, 19],
  },
  shipwright: {
    die: 6,
    saves: ["wit", "instinct"],
    skills: 2,
    path: [3, 6, 10, 14],
    asi: [4, 8, 12, 16, 19],
  },
};
function complete(base, events) {
  const ledger = {
    version: 3,
    ruleset: "srd-5.2.1",
    revision: events.length - 1,
    baseAttributes: base,
    levels: structuredClone(events),
  };
  const last = ledger.levels.at(-1);
  last.choices ??= {};
  for (let i = 0; i < 25; i++) {
    const summary = engine.replay(ledger);
    if (summary.decisionsComplete) return { ledger, summary };
    const r = summary.requiredChoices[0];
    if (r.key === "feat") {
      last.choices.feat = "ability-score-improvement";
      const key = Object.keys(base)
        .filter((k) => summary.attributes[k] <= 18)
        .sort((a, b) => summary.attributes[a] - summary.attributes[b])[0];
      last.choices.increases = { [key]: 2 };
    } else if (r.key === "spellMastery") {
      last.choices[r.key] = [1, 2].map((level) =>
        r.options.find(
          (id) => blueprint.spells.find((s) => s.id === id).level === level
        )
      );
    } else if (r.key === 'prepared' && ledger.levels.length > 1) {
      const old = engine.replay({ ...ledger, levels: ledger.levels.slice(0, -1) }).spellcasting[r.callingId]?.prepared ?? [];
      last.choices.prepared = [...old.filter(id => r.options.includes(id)), ...r.options.filter(id => !old.includes(id))].slice(0, r.count);
    } else last.choices[r.key] = r.options.slice(0, r.count);
  }
  throw new Error("Could not resolve choices");
}
function build(id, n = 1, base = scores) {
  let result;
  for (let i = 1; i <= n; i++)
    result = complete(base, [
      ...(result?.ledger.levels ?? []),
      { callingId: id, choices: {} },
    ]);
  return result;
}
test("all eight canonical Calling progressions independently match source schedules at every level", () => {
  assert.equal(engine.validate(), true);
  assert.equal(blueprint.callings.length, 8);
  for (const [id, f] of Object.entries(fixture)) {
    const c = blueprint.callings.find((c) => c.id === id);
    assert.equal(c.hitDie, f.die);
    assert.deepEqual(c.starting.saves, f.saves);
    assert.equal(c.starting.skillCount, f.skills);
    assert.deepEqual(
      c.progression
        .filter((r) => r.pathFeatureGrant)
        .map((r) => r.callingLevel),
      f.path
    );
    assert.deepEqual(
      c.progression.filter((r) => r.featChoice).map((r) => r.callingLevel),
      f.asi
    );
    let previous;
    for (let level = 1; level <= 20; level++) {
      const { ledger, summary } = complete(scores, [
        ...(previous?.ledger.levels ?? []),
        { callingId: id, choices: {} },
      ]);
      assert.equal(summary.totalLevel, level);
      assert.equal(summary.callingLevels[id], level);
      assert.equal(summary.trainingBonus, 2 + Math.floor((level - 1) / 4));
      assert.equal(summary.decisionsComplete, true);
      assert.equal(summary.hitDice["d" + f.die], level);
      assert.equal(summary.paths[id] !== undefined, level >= 3);
      assert.equal(
        summary.health.max,
        f.die +
          (level - 1) * (f.die / 2 + 1) +
          level * Math.floor((summary.attributes.resolve - 10) / 2) +
          (id === "tidecaller" && level >= 3 ? level : 0)
      );
      assert.equal(summary.tabletopReady, false);
      assert.equal(ledger.version, 3);
      previous = { ledger, summary };
    }
  }
});
test("Path choice is mandatory, Calling-owned and non-purchasable", () => {
  const b = build("doctor", 2),
    before = structuredClone(b.ledger);
  assert.throws(
    () =>
      engine.advance(b.ledger, {
        expectedRevision: b.ledger.revision,
        callingId: "doctor",
        choices: {},
      }),
    /required choices/
  );
  for (const id of ["reef-knife", "drydock-ghost", "missing"])
    assert.throws(
      () =>
        engine.advance(b.ledger, {
          expectedRevision: b.ledger.revision,
          callingId: "doctor",
          choices: { pathId: [id] },
        }),
      /Invalid pathId/
    );
  assert.throws(
    () =>
      engine.advance(b.ledger, {
        expectedRevision: b.ledger.revision,
        callingId: "doctor",
        choices: { pathId: ["sanctuary-hand"], tier: 1 },
      }),
    /Invalid rules fields/
  );
  assert.deepEqual(b.ledger, before);
  const a = complete(scores, [
    ...b.ledger.levels,
    { callingId: "doctor", choices: {} },
  ]);
  assert.equal(a.summary.paths.doctor, "sanctuary-hand");
  assert.ok(
    a.summary.features.some(
      (f) => f.ownerId === "sanctuary-hand" && f.callingLevel === 3
    )
  );
});
test("single Calling rejects multiclass entry while preserving original saves and attacks", () => {
const b=build("gunslinger",5),before=structuredClone(b.ledger);
assert.throws(()=>complete(scores,[...b.ledger.levels,{callingId:"warden",choices:{}}]),/one Calling/);
assert.equal(b.summary.attacksPerAction,2);assert.deepEqual(b.summary.savingThrows,["might","resolve"]);assert.deepEqual(b.ledger,before);
});
test("spell slots use single Calling table or multiclass round-up contributions, preparation remains class-specific", () => {
  assert.deepEqual(build("navigator", 1).summary.spellSlots, [2]);
  assert.deepEqual(
    build("doctor", 20).summary.spellSlots,
    [4, 3, 3, 3, 3, 2, 2, 1, 1]
  );
  assert.equal(
    build("shipwright", 20).summary.spellcasting.shipwright.preparedCount,
    25
  );
  assert.equal(
    build("tidecaller", 20).summary.spellcasting.tidecaller.preparedCount,
    22
  );
  assert.throws(()=>complete(scores,[...build("navigator",1).ledger.levels,{callingId:"warden",choices:{}}]),/one Calling/);

});
test("forged, duplicate and out-of-level choices reject; replay is deterministic and does not mutate ledgers", () => {
  const b = build("corsair");
  const before = structuredClone(b.ledger);
  assert.deepEqual(engine.replay(b.ledger), b.summary);
  assert.deepEqual(b.ledger, before);
  assert.throws(
    () =>
      engine.advance(b.ledger, {
        expectedRevision: 999,
        callingId: "corsair",
        choices: {},
      }),
    /changed/
  );
  assert.throws(
    () =>
      engine.create(scores, {
        callingId: "corsair",
        choices: { skills: ["stealth", "stealth", "insight", "athletics"] },
      }),
    /Invalid skills/
  );
  assert.throws(
    () =>
      engine.create(scores, {
        callingId: "doctor",
        choices: { skills: ["history", "insight"], divineOrder: ["homebrew"] },
      }),
    /divineOrder/
  );
  assert.throws(
    () =>
      engine.advance(b.ledger, {
        expectedRevision: 0,
        callingId: "corsair",
        choices: { pathId: ["reef-knife"] },
      }),
    /unavailable/
  );
  assert.throws(
    () =>
      engine.replay({
        ...b.ledger,
        baseAttributes: { ...scores, might: "13" },
      }),
    /base attributes/
  );
});
test("all feature rules and spell descriptions have source provenance and distinguish readable rules from automation", () => {
  assert.equal(blueprint.spells.length, 316);
  assert.equal(blueprint.features.filter(f => f.source.document === "SRD").length, 150);
  assert.equal(blueprint.features.filter(f => f.source.document === "Sanguine Archipelago").length, 15);
  for (const f of [...blueprint.features, ...blueprint.spells]) {
    assert.equal(f.rulesStatus, "tabletop-rules");
    assert.ok(f.description.length > 20);
    assert.ok(["5.2.1","2026-11-07","SA-CHAR-1"].includes(f.source.version));
  }
  assert.ok(
    blueprint.spells
      .find((s) => s.id === "minor-illusion")
      .description.includes("Casting Time:")
  );
  assert.ok(
    blueprint.features
      .find((f) => f.ownerId === "doctor" && f.sourceName === "Divine Order")
      .description.includes("Heavy armor")
  );
  assert.ok(
    blueprint.spells
      .find((s) => s.id === "cure-wounds")
      .description.includes("2d8")
  );
  assert.equal(blueprint.persistentCreationEnabled, true);
});
test("resources scale per Calling, track independently and recover without mutating source", () => {
  const b = build("gunslinger", 17),
    s = b.summary;
  assert.equal(s.resources["gunslinger:second-wind"].max, 4);
  assert.equal(s.resources["gunslinger:action-surge"].max, 2);
  assert.equal(s.resources["gunslinger:indomitable"].max, 3);
  let state = engine.runtime.initialize(s);
  const before = structuredClone(state);
  state = engine.runtime.update(s, state, {
    type: "spend-pool",
    poolId: "gunslinger:second-wind",
    amount: 3,
    expectedRevision: 0,
  });
  assert.equal(state.pools["gunslinger:second-wind"], 1);
  assert.equal(before.pools["gunslinger:second-wind"], 4);
  state = engine.runtime.update(s, state, {
    type: "short-rest",
    expectedRevision: 1,
  });
  assert.equal(state.pools["gunslinger:second-wind"], 2);
  state = engine.runtime.update(s, state, {
    type: "long-rest",
    expectedRevision: 2,
  });
  assert.equal(state.pools["gunslinger:second-wind"], 4);
  assert.throws(
    () =>
      engine.runtime.update(s, state, {
        type: "spend-pool",
        poolId: "gunslinger:second-wind",
        amount: 5,
        expectedRevision: 3,
      }),
    /Unavailable/
  );
  assert.throws(
    () =>
      engine.runtime.update(s, state, {
        type: "spend-pool",
        poolId: "gunslinger:second-wind",
        amount: 1,
        expectedRevision: 2,
      }),
    /revision/
  );
  assert.equal(
    build("warden", 20).summary.resources["warden:lay-on-hands"].max,
    100
  );
  assert.equal(build("reaver", 20).summary.resources["reaver:rage"].max, 6);
  assert.equal(
    build("doctor", 18).summary.resources["doctor:channel-divinity"].max,
    4
  );
});
test("recorded Health rolls, retrospective Resolve, Hit Dice and rest accounting remain bounded", () => {
  const b = build("doctor", 2);
  let s = engine.runtime.initialize(b.summary);
  s = engine.runtime.update(b.summary, s, {
    type: "health",
    healthDelta: -999,
    expectedRevision: 0,
  });
  assert.equal(s.health.current, 0);
  s = engine.runtime.update(b.summary, s, {
    type: "short-rest",
    hitDice: [{ die: "d8", roll: 8 }],
    expectedRevision: 1,
  });
  assert.equal(s.health.current, 9);
  assert.equal(s.hitDice.d8, 1);
  assert.throws(
    () =>
      engine.runtime.update(b.summary, s, {
        type: "short-rest",
        hitDice: [{ die: "d8", roll: 9 }],
        expectedRevision: 2,
      }),
    /Hit Die/
  );
  s = engine.runtime.update(b.summary, s, {
    type: "long-rest",
    expectedRevision: 2,
  });
  assert.equal(s.hitDice.d8, 2);
  assert.equal(s.health.current, b.summary.health.max);
  assert.throws(()=>complete(scores,[...b.ledger.levels,{callingId:"doctor",healthRoll:1,choices:{}}]),/fixed Health/);

});
export { build, complete, scores };

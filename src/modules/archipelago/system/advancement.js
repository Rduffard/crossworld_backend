const legacy = require("./advancementLegacy");
const catalog = require("./blueprints/abilities");
const { proficiencyBonus } = require("./trainingChecks");
const saves = require("./blueprints/startingProficiencies");
const { calculateResourceMaximums } = require("./resources");
function fail(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}
function level(n) {
  proficiencyBonus(n);
  return n;
}
function fields(value, allowed) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !allowed.includes(k))
  )
    fail("Invalid advancement fields");
}
function rewardsAt(n, calling) {
  level(n);
  if (!calling) return legacy.rewardsAt(n);
  if (!catalog.tables[calling]) fail("Unknown Calling");
  return catalog.tables[calling]
    .filter((row) => row.level <= n)
    .flatMap((row) => [
      ...row.selections,
      ...(row.pathOpportunity
        ? [
            {
              id: "path:" + row.level,
              kind: "path",
              level: row.level,
              required: false,
            },
          ]
        : []),
    ]);
}
function initialize(calling, scores, selections = {}, training = []) {
  if (!catalog.tables[calling]) fail("Unknown Calling");
  for (const key of [
    "might",
    "agility",
    "wit",
    "spirit",
    "resolve",
    "instinct",
  ])
    if (!Number.isInteger(scores[key]) || scores[key] < 1 || scores[key] > 20)
      fail("Invalid base attributes");
  fields(
    selections,
    rewardsAt(1, calling)
      .filter((r) => r.kind === "selection")
      .map((r) => r.id)
  );
  const spends = Object.entries(selections).map(([rewardId, abilityIds]) => ({
    rewardId,
    kind: "selection",
    abilityIds,
    spentAtLevel: 1,
  }));
  const ledger = {
    version: 2,
    revision: 0,
    calling,
    baseAttributes: { ...scores },
    spends,
    exchanges: [],
    passive: {
      id: calling + ":passive",
      name: catalog.items.find((a) => a.id === calling + ":passive").name,
      status: "reference-only",
    },
    savingThrows: [...saves.callings[calling].saves],
  };
  summarize(ledger, 1, { training });
  return ledger;
}
function checkPrerequisites(def, scores, acquired, paths, training) {
  const p = def.prerequisites ?? {};
  if (p.trainedSkill && !training.includes(p.trainedSkill))
    fail("Expertise requires an acquired General Skill");
  for (const [key, n] of Object.entries(p.attributes ?? {}))
    if (!Number.isInteger(n) || !(key in scores) || scores[key] < n)
      fail("Attribute prerequisite not met");
  for (const id of p.abilities ?? [])
    if (!acquired.has(id)) fail("Feature prerequisite not met");
  for (const [id, tier] of Object.entries(p.pathTiers ?? {}))
    if ((paths[id] ?? 0) < tier) fail("Path prerequisite not met");
}
function summarize(ledger, n, options = {}) {
  if (ledger?.version !== 2)
    return legacy.summarize(
      ledger,
      n,
      options.callingAbilities ? options : undefined
    );
  level(n);
  if (
    !catalog.tables[ledger.calling] ||
    !Array.isArray(ledger.spends) ||
    !Array.isArray(ledger.exchanges)
  )
    fail("Invalid advancement ledger");
  const training = options.training ?? ledger.training ?? [];
  const rewards = rewardsAt(n, ledger.calling),
    scores = { ...ledger.baseAttributes },
    used = new Set(),
    selected = new Set(),
    paths = {};
  const conversions = new Map();
  if (ledger.exchanges.length > 2) fail("Maximum two milestone exchanges");
  for (const e of ledger.exchanges) {
    fields(e, ["rewardId", "kind", "spentAtLevel"]);
    const r = rewards.find((r) => r.id === e.rewardId);
    if (
      !r ||
      r.kind !== "attribute" ||
      !["calling", "path"].includes(e.kind) ||
      conversions.has(r.id) ||
      e.spentAtLevel < r.level ||
      e.spentAtLevel > n
    )
      fail("Invalid milestone exchange");
    conversions.set(r.id, e);
  }
  const acquired = new Set();
  const ordered = [...ledger.spends];
  let previousLevel = 0;
  for (const spend of ordered) {
    fields(spend, [
      "rewardId",
      "kind",
      "abilityIds",
      "increases",
      "pathId",
      "tier",
      "spentAtLevel",
    ]);
    level(spend.spentAtLevel);
    if (spend.spentAtLevel < previousLevel || spend.spentAtLevel > n)
      fail("Advancement history must be chronological");
    previousLevel = spend.spentAtLevel;
    const reward = rewards.find((r) => r.id === spend.rewardId);
    if (!reward || reward.level > spend.spentAtLevel || used.has(reward.id))
      fail("Unavailable or duplicate reward");
    const conversion = conversions.get(reward.id);
    if (conversion && conversion.spentAtLevel > spend.spentAtLevel)
      fail("Exchange occurred after spending");
    const kind = conversion?.kind ?? reward.kind;
    if (kind !== spend.kind) fail("Wrong reward kind");
    for (const row of catalog.tables[ledger.calling].filter(
      (r) => r.level <= spend.spentAtLevel
    ))
      row.automatic.forEach((id) => acquired.add(id));
    if (kind === "attribute") {
      if (
        spend.abilityIds !== undefined ||
        spend.pathId !== undefined ||
        spend.tier !== undefined
      )
        fail("Mixed reward fields");
      const entries = Object.entries(spend.increases ?? {});
      if (
        !(entries.length === 1 && entries[0][1] === 2) &&
        !(entries.length === 2 && entries.every(([, v]) => v === 1))
      )
        fail("Choose +2 or +1 to two attributes");
      for (const [key, amount] of entries) {
        if (
          !(key in scores) ||
          !Number.isInteger(scores[key]) ||
          scores[key] + amount > 20
        )
          fail("Invalid attribute increase");
        scores[key] += amount;
      }
    } else if (kind === "selection") {
      if (
        spend.increases !== undefined ||
        spend.pathId !== undefined ||
        spend.tier !== undefined ||
        !Array.isArray(spend.abilityIds) ||
        spend.abilityIds.length !== reward.count ||
        new Set(spend.abilityIds).size !== reward.count
      )
        fail("Complete required ability selections");
      for (const id of spend.abilityIds) {
        const def = catalog.items.find((a) => a.id === id);
        if (
          !reward.options.includes(id) ||
          !def ||
          def.source.id !== ledger.calling ||
          def.minimumLevel > spend.spentAtLevel ||
          selected.has(id)
        )
          fail("Ability unavailable, duplicated or belongs to another Calling");
        checkPrerequisites(def, scores, acquired, paths, training);
        selected.add(id);
        acquired.add(id);
      }
    } else
      fail(
        kind === "path"
          ? "Path tier content awaits reviewed four-tier definitions"
          : "Exchanged Calling choice requires a reviewed choice group; opportunity remains unspent"
      );
    used.add(reward.id);
  }
  for (const row of catalog.tables[ledger.calling].filter((r) => r.level <= n))
    row.automatic.forEach((id) => acquired.add(id));
  const definitions = [...acquired].map((id) =>
    catalog.items.find((a) => a.id === id)
  );
  const row = catalog.tables[ledger.calling][n - 1];
  const effects = require("./featureHandlers").derive(definitions, row);
  const expertise = effects.expertise;
  const unspent = rewards
    .filter((r) => !used.has(r.id))
    .map((r) => ({
      ...r,
      kind: conversions.get(r.id)?.kind ?? r.kind,
      required: conversions.has(r.id) ? false : r.required,
    }));
  return {
    level: n,
    calling: ledger.calling,
    trainingBonus: proficiencyBonus(n),
    rewards,
    unspent,
    complete: !unspent.some((r) => r.required),
    buildStatus: "supported-subset",
    unresolvedSystems: [
      "spell-preparation",
      "weapon-mastery",
      "metamagic",
      "language-selection",
      "other-feats",
      "reference-only-source-features",
    ],
    attributes: scores,
    callingAbilities: [...acquired],
    abilities: definitions.map((a) => ({
      ...a,
      acquired: true,
      executableInCombat: [
        "extra-attack",
        "defense-style",
        "great-weapon-fighting",
      ].includes(a.mechanicalHandler),
      currentlyUsable: false,
    })),
    pathTiers: paths,
    exchanges: ledger.exchanges.length,
    expertise,
    combatCapabilities: effects.combatCapabilities,
    resources: calculateResourceMaximums(scores, n),
    limitations: [
      "Historical signatures are reference-only",
      "Spell preparation, mastery and metamagic choices are reference-only; their gameplay is unavailable",
      "No reviewed four-tier Path content",
      "Only attribute improvement is available from feat opportunities",
    ],
    progression: catalog.tables[ledger.calling],
  };
}
function advance(ledger, currentLevel, operation, options = {}) {
  if (ledger.version !== 2)
    return legacy.advance(ledger, currentLevel, operation);
  fields(operation, ["expectedRevision", "level", "spends", "exchanges"]);
  if (operation.expectedRevision !== ledger.revision)
    fail("Progression changed; reload before advancing");
  const n = level(operation.level ?? currentLevel);
  if (n < currentLevel) fail("Level decreases require respec");
  summarize(ledger, currentLevel, options);
  if (
    (operation.spends !== undefined && !Array.isArray(operation.spends)) ||
    (operation.exchanges !== undefined && !Array.isArray(operation.exchanges))
  )
    fail("Invalid advancement arrays");
  const next = {
    ...structuredClone(ledger),
    revision: ledger.revision + 1,
    spends: [
      ...ledger.spends,
      ...(operation.spends ?? []).map((s) => {
        fields(s, [
          "rewardId",
          "kind",
          "abilityIds",
          "increases",
          "pathId",
          "tier",
        ]);
        return { ...s, spentAtLevel: n };
      }),
    ],
    exchanges: [
      ...ledger.exchanges,
      ...(operation.exchanges ?? []).map((e) => {
        fields(e, ["rewardId", "kind"]);
        return { ...e, spentAtLevel: n };
      }),
    ],
  };
  return { ledger: next, level: n, summary: summarize(next, n, options) };
}
module.exports = { initialize, summarize, advance, rewardsAt };

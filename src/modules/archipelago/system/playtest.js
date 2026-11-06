const advancement = require("./advancement");
const equipment = require("../equipment");
function enabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ARCHIPELAGO_PLAYTEST_ENABLED === "true"
  );
}
function build(character, plan) {
  if (character.advancement?.version !== 2)
    throw new Error(
      "Playtests require a version-two character; recreate the experimental character"
    );
  if (!Number.isInteger(plan.level) || plan.level < 1 || plan.level > 20)
    throw new Error("Invalid target level");
  const selections =
    plan.levelOneSelections ??
    Object.fromEntries(
      character.advancement.spends
        .filter((s) => s.spentAtLevel === 1 && s.kind === "selection")
        .map((s) => [s.rewardId, s.abilityIds])
    );
  let ledger = advancement.initialize(
    character.calling,
    character.advancement.baseAttributes,
    selections,
    character.training
  );
  const decisions = plan.decisions ?? [];
  if (!Array.isArray(decisions) || decisions.length > 20)
    throw new Error("Invalid playtest decisions");
  const seen = new Set();
  for (const d of decisions) {
    if (
      !Number.isInteger(d.level) ||
      d.level < 2 ||
      d.level > plan.level ||
      seen.has(d.level) ||
      Object.keys(d).some((k) => !["level", "spends", "exchanges"].includes(k))
    )
      throw new Error("Invalid decision level");
    seen.add(d.level);
  }
  let summary;
  for (let n = 2; n <= plan.level; n++) {
    const decision = decisions.find((d) => d.level === n) ?? {};
    const next = advancement.advance(
      ledger,
      n - 1,
      {
        expectedRevision: ledger.revision,
        level: n,
        spends: decision.spends ?? [],
        exchanges: decision.exchanges ?? [],
      },
      { training: character.training }
    );
    ledger = next.ledger;
    summary = next.summary;
  }
  summary =
    summary ??
    advancement.summarize(ledger, 1, { training: character.training });
  const build = structuredClone(character);
  build._id = String(character._id);
  build.owner = String(character.owner);
  build.advancement = ledger;
  build.progression = { ...build.progression, rank: plan.level };
  build.attributes = summary.attributes;
  for (const [key, max] of Object.entries(summary.resources)) {
    build.resources[key] = {
      current: Math.min(character.resources?.[key]?.current ?? 0, max),
      max,
    };
  }
  return {
    character: build,
    progression: summary,
    equipment: equipment.derive(build),
    complete: summary.complete,
  };
}
module.exports = { enabled, build };

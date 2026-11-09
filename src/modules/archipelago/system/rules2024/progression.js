const {
  callings,
  timelines,
  prepared,
  fullSlots,
  halfSlots,
  slug,
} = require("./catalog");
const sourceRules = require("./rules");
const at = (level, entries) =>
  entries.reduce(
    (value, [threshold, next]) => (level >= threshold ? next : value),
    0
  );
function spellcasting(id, level, attributes) {
  const calling = callings[id];
  if (!calling.caster) return null;
  const mod = Math.floor((attributes[calling.castingAttribute] - 10) / 2);
  return {
    attribute: calling.castingAttribute,
    modifier: mod,
    saveDC: 8 + mod,
    attackModifier: mod,
    slots: (calling.caster === "half" ? halfSlots : fullSlots)[level - 1],
    preparedCount: prepared[id][level - 1],
    cantripCount:
      calling.caster === "half"
        ? 0
        : id === "tidecaller"
        ? at(level, [
            [1, 4],
            [4, 5],
            [10, 6],
          ])
        : at(level, [
            [1, 3],
            [4, 4],
            [10, 5],
          ]),
    folioMinimum: id === "shipwright" ? 6 + (level - 1) * 2 : null,
    preparationPolicy:
      id === "shipwright"
        ? "long-rest-from-folio"
        : id === "doctor"
        ? "long-rest-list"
        : ["navigator", "warden"].includes(id)
        ? "one-per-long-rest"
        : "one-per-calling-level",
    recovery: "long-rest",
    rulesStatus: "capacity-implemented-spell-effects-not-automated",
  };
}
function numerical(id, level) {
  const out = { attacksPerAction: 1, masteryCount: 0 };
  if (id === "corsair")
    Object.assign(out, {
      sneakAttackDice: Math.ceil(level / 2),
      masteryCount: 2,
      expertiseCount: level >= 6 ? 4 : 2,
    });
  if (id === "gunslinger")
    Object.assign(out, {
      attacksPerAction: at(level, [
        [1, 1],
        [5, 2],
        [11, 3],
        [20, 4],
      ]),
      masteryCount: at(level, [
        [1, 3],
        [4, 4],
        [10, 5],
        [16, 6],
      ]),
      secondWindUses: at(level, [
        [1, 2],
        [4, 3],
        [10, 4],
      ]),
      actionSurgeUses: at(level, [
        [2, 1],
        [17, 2],
      ]),
      indomitableUses: at(level, [
        [9, 1],
        [13, 2],
        [17, 3],
      ]),
    });
  if (id === "navigator")
    Object.assign(out, {
      attacksPerAction: level >= 5 ? 2 : 1,
      masteryCount: 2,
      favoredEnemyUses: at(level, [
        [1, 2],
        [5, 3],
        [9, 4],
        [13, 5],
        [17, 6],
      ]),
      expertiseCount: at(level, [
        [2, 1],
        [9, 3],
      ]),
      huntersMarkDie: level === 20 ? 10 : 6,
    });
  if (id === "tidecaller")
    Object.assign(out, {
      sorceryPoints: level >= 2 ? level : 0,
      innateSorceryUses: 2,
      metamagicCount: at(level, [
        [2, 2],
        [10, 4],
        [17, 6],
      ]),
    });
  if (id === "warden")
    Object.assign(out, {
      attacksPerAction: level >= 5 ? 2 : 1,
      masteryCount: 2,
      layOnHands: 5 * level,
      channelDivinityUses: at(level, [
        [3, 2],
        [11, 3],
      ]),
      auraRadius: at(level, [
        [6, 10],
        [18, 30],
      ]),
    });
  if (id === "reaver")
    Object.assign(out, {
      attacksPerAction: level >= 5 ? 2 : 1,
      masteryCount: at(level, [
        [1, 2],
        [4, 3],
        [10, 4],
      ]),
      rageUses: at(level, [
        [1, 2],
        [3, 3],
        [6, 4],
        [12, 5],
        [17, 6],
      ]),
      rageDamage: at(level, [
        [1, 2],
        [9, 3],
        [16, 4],
      ]),
    });
  if (id === "doctor")
    Object.assign(out, {
      channelDivinityUses: at(level, [
        [2, 2],
        [6, 3],
        [18, 4],
      ]),
      divineSparkDice: at(level, [
        [2, 1],
        [7, 2],
        [13, 3],
        [18, 4],
      ]),
    });
  if (id === "shipwright")
    Object.assign(out, { arcaneRecoveryLevels: Math.ceil(level / 2) });
  return out;
}
function progression(id) {
  const c = callings[id];
  if (!c) throw new Error("Unknown Calling");
  return timelines[id].map((text, index) => {
    const level = index + 1;
    return {
      callingLevel: level,
      features: text
        ? text
            .split("/")
            .filter((n) => !["Path", "ASI", "Epic Boon"].includes(n))
            .map((name) => ({
              name,
              sourceName: name,
              id: `calling:${id}:${slug(name)}`,
              rules: sourceRules.features.filter(
                (f) => f.ownerId === id && f.sourceName === name
              ),
            }))
        : [],
      pathChoiceRequired: level === 3,
      pathFeatureGrant: c.pathLevels.includes(level),
      featChoice:
        text.split("/").find((n) => ["ASI", "Epic Boon"].includes(n)) ?? null,
      numerical: numerical(id, level),
      spellcasting: c.caster
        ? {
            slots: (c.caster === "half" ? halfSlots : fullSlots)[index],
            preparedCount: prepared[id][index],
          }
        : null,
    };
  });
}
module.exports = { spellcasting, numerical, progression };

const callings = require("../characters/callings");
const sources = require("../characters/progressionSources");
const skills = require("../training");
const historical = require("./historical");
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-$/, "");
const items = [...historical];
const tables = {};
const details = {
  Expertise: {
    description:
      "Choose trained General Skills for doubled Training Bonus on applicable skill checks.",
    handler: "expertise",
    missing: [],
  },
  "Extra Attack": {
    description: "Make two weapon attacks as part of one Attack action.",
    handler: "extra-attack",
    missing: [],
  },
  "Two Extra Attacks": {
    description: "Make three weapon attacks as part of one Attack action.",
    handler: "extra-attack",
    missing: [],
  },
  "Three Extra Attacks": {
    description: "Make four weapon attacks as part of one Attack action.",
    handler: "extra-attack",
    missing: [],
  },
  "Fighting Style": {
    description:
      "Choose a combat specialization. Only Defense is executable with the present engine.",
    missing: ["Other styles require additional combat handling"],
  },
};
for (const c of callings) {
  const source = sources[c.id];
  const seen = new Set();
  tables[c.id] = Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const names = source.levels[i] ? source.levels[i].split("|") : [];
    const automatic = level === 1 ? [c.id + ":passive"] : [];
    const selections = [];
    const references = [];
    for (const name of names) {
      if (name === "Subclass") {
        references.push({
          name: "Primary-class subclass row",
          status: "replaced-by-universal-path-model",
        });
        continue;
      }
      if (name === "ASI" || name === "Epic Boon") {
        selections.push({
          id: "attribute:" + level,
          kind: "attribute",
          level,
          required: true,
          sourceFeature:
            name === "ASI" ? "Ability Score Improvement" : "Epic Boon",
          availableOptions: ["attribute-improvement"],
          pendingOptions: "Other feats and Epic Boons await a reviewed catalog",
        });
        continue;
      }
      const id = c.id + ":" + slug(name);
      const existing = items.find((a) => a.id === id);
      const info = details[name];
      if (!existing) {
        items.push({
          id,
          version: 1,
          name,
          description:
            info?.description ??
            "SRD-inspired " +
              source.primary +
              " progression feature. Its Archipelago conversion is not executable; consult the documented source before adjudicating it.",
          source: { type: "calling", id: c.id },
          inspiration: {
            document: "SRD 5.2",
            class: source.primary,
            feature: name,
            page: source.page,
          },
          minimumLevel: level,
          prerequisites: {},
          acquisition: "automatic",
          timing: "passive",
          contentStatus: info?.handler ? "adapted" : "reference",
          implementationStatus: info?.handler
            ? "implemented"
            : "reference-only",
          mechanicalHandler: info?.handler ?? null,
          missingDependencies: info?.missing ?? [
            "Reviewed attribute/resource/timing conversion and executable handler",
          ],
        });
      }
      if (!seen.has(id)) {
        automatic.push(id);
        seen.add(id);
      } else
        references.push({
          abilityId: id,
          name,
          status: "source-scaling-update",
        });
      if (name === "Expertise" || name === "Deft Explorer")
        selections.push({
          id: "choice:" + c.id + ":expertise:" + level,
          kind: "selection",
          level,
          required: true,
          count: name === "Deft Explorer" ? 1 : 2,
          options: skills.map((s) => c.id + ":expertise-" + s.id),
          eligibility: "trained-skill",
          uniqueAcrossGroups: true,
        });
      if (name === "Fighting Style")
        selections.push({
          id: "choice:" + c.id + ":style:" + level,
          kind: "selection",
          level,
          required: true,
          count: 1,
          options: [
            "defense",
            "archery",
            "great-weapon-fighting",
            "two-weapon-fighting",
          ].map((id) => c.id + ":style-" + id),
        });
      // Mastery/prepared spells/metamagic are deliberately reference-only until their choice contracts exist.
    }
    return {
      level,
      trainingBonus: 2 + Math.floor(i / 4),
      automatic,
      selections,
      pathOpportunity: [3, 6, 11, 16].includes(level),
      references,
      attacksPerAction:
        c.id === "gunslinger"
          ? level >= 20
            ? 4
            : level >= 11
            ? 3
            : level >= 5
            ? 2
            : 1
          : ["navigator", "warden", "reaver"].includes(c.id) && level >= 5
          ? 2
          : 1,
      resourcePolicy: "existing-health-stamina-focus-formulas",
      source: {
        primary: source.primary,
        secondary: source.secondary,
        page: source.page,
      },
    };
  });
  for (const s of skills)
    items.push({
      id: c.id + ":expertise-" + s.id,
      version: 1,
      name: s.name + " Expertise",
      description:
        "Apply twice the Training Bonus to " + s.name + " checks when trained.",
      source: { type: "calling", id: c.id },
      minimumLevel: 1,
      prerequisites: { trainedSkill: s.id },
      acquisition: "selected",
      timing: "passive",
      contentStatus: "adapted",
      implementationStatus: "implemented",
      mechanicalHandler: "expertise",
      skillId: s.id,
      missingDependencies: [],
    });
  for (const [id, name] of [
    ["defense", "Defense"],
    ["archery", "Archery"],
    ["great-weapon-fighting", "Great Weapon Fighting"],
    ["two-weapon-fighting", "Two-Weapon Fighting"],
  ])
    items.push({
      id: c.id + ":style-" + id,
      version: 1,
      name,
      description:
        id === "defense"
          ? "While wearing armor, increase Guard by 1."
          : id === "great-weapon-fighting"
          ? "When attacking with a Two-Handed or Versatile weapon held in two hands, treat damage dice showing 1 or 2 as 3."
          : id === "archery"
          ? "Add 2 to ranged weapon attack rolls. Ranged attacks are not automated."
          : "Add the attribute modifier to the Light extra attack damage. Light extra attacks are not automated.",
      source: { type: "calling", id: c.id },
      minimumLevel: 1,
      prerequisites: {},
      acquisition: "selected",
      timing: "passive",
      contentStatus: "adapted",
      implementationStatus: ["defense", "great-weapon-fighting"].includes(id)
        ? "implemented"
        : "reference-only",
      mechanicalHandler:
        id === "defense"
          ? "defense-style"
          : id === "great-weapon-fighting"
          ? "great-weapon-fighting"
          : null,
      inspiration: { document: "SRD 5.2", feature: name, page: 87 },
      missingDependencies: ["defense", "great-weapon-fighting"].includes(id)
        ? []
        : ["Ranged, extra-attack or damage-rule implementation"],
    });
}
function validate(definitions = items, progressions = tables) {
  const ids = new Set();
  for (const a of definitions) {
    if (!a.id || ids.has(a.id)) throw new Error("Duplicate ability ID");
    ids.add(a.id);
    if (!["calling", "path", "general"].includes(a.source.type))
      throw new Error("Invalid ability source");
    if (
      a.minimumLevel !== null &&
      (!Number.isInteger(a.minimumLevel) ||
        a.minimumLevel < 1 ||
        a.minimumLevel > 20)
    )
      throw new Error("Invalid ability level");
    if (
      a.implementationStatus === "implemented" &&
      ![
        "expertise",
        "extra-attack",
        "defense-style",
        "great-weapon-fighting",
      ].includes(a.mechanicalHandler)
    )
      throw new Error("Unknown handler");
  }
  const visited = new Set(),
    visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error("Cyclic ability prerequisites");
    if (visited.has(id)) return;
    const a = definitions.find((d) => d.id === id);
    if (!a) throw new Error("Unknown prerequisite feature");
    visiting.add(id);
    for (const ref of a.prerequisites.abilities ?? []) visit(ref);
    visiting.delete(id);
    visited.add(id);
  }
  for (const a of definitions) visit(a.id);
  for (const rows of Object.values(progressions)) {
    if (rows.length !== 20 || rows.some((row, i) => row.level !== i + 1))
      throw new Error("Missing progression level");
    for (const row of rows)
      for (const id of [
        ...row.automatic,
        ...row.selections.flatMap((g) => g.options ?? []),
      ])
        if (!ids.has(id)) throw new Error("Unknown feature reference");
  }
  return true;
}
const referenced = new Set(
  Object.values(tables).flatMap((rows) =>
    rows.flatMap((row) => [
      ...row.automatic,
      ...row.selections.flatMap((g) => g.options ?? []),
    ])
  )
);
items.splice(
  0,
  items.length,
  ...items.filter((a) => referenced.has(a.id) || a.acquisition === "unassigned")
);
for (const a of items) {
  if (a.inspiration) {
    const name = a.inspiration.feature;
    a.timing =
      {
        "Cunning Action": "bonus-action",
        "Steady Aim": "bonus-action",
        "Uncanny Dodge": "reaction",
        "Second Wind": "bonus-action",
        "Action Surge": "special",
        Indomitable: "special",
        Spellcasting: "special",
        Metamagic: "special",
        "Innate Sorcery": "bonus-action",
        "Font of Magic": "special",
        "Lay On Hands": "bonus-action",
        "Channel Divinity": "special",
        "Abjure Foes": "action",
        Rage: "bonus-action",
        "Reckless Attack": "special",
        "Stroke of Luck": "special",
      }[name] ?? a.timing;
  }
}
validate();
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
module.exports = freeze({ version: 1, items, tables, validate });

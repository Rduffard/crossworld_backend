const callings = require("../characters/callings");
const activeIds = {
  corsair: "ability-corsair-rushing-cut",
  gunslinger: "ability-gunslinger-marked-shot",
  navigator: "ability-navigator-shift-the-flow",
  tidecaller: "ability-tidecaller-tidal-burst",
  warden: "ability-warden-intercept",
  reaver: "ability-reaver-savage-strike",
};
module.exports = callings.flatMap((c) => [
  {
    id: c.id + ":passive",
    version: 1,
    name: c.passive,
    description: c.passiveRule,
    source: { type: "calling", id: c.id },
    minimumLevel: 1,
    prerequisites: {},
    acquisition: "automatic",
    timing: "passive",
    contentStatus: "historical",
    implementationStatus: "reference-only",
    mechanicalHandler: null,
    missingDependencies: ["2024 conversion of historical combat text"],
  },
  {
    id: activeIds[c.id],
    version: 1,
    name: c.starterAbility,
    description: c.starterAbilityRule,
    source: { type: "calling", id: c.id },
    minimumLevel: null,
    prerequisites: {},
    acquisition: "unassigned",
    timing: c.starterAbilityType === "Reaction" ? "reaction" : "action",
    contentStatus: "historical",
    implementationStatus: "reference-only",
    mechanicalHandler: null,
    missingDependencies: [
      "Reviewed acquisition level",
      "Movement, timing, conditions or resources appropriate to this feature",
    ],
  },
]);

const catalog = require("./catalog");
const rules = require("./rules");
const progression = require("./progression");
function validate() {
  const ids = new Set();
  for (const def of [
    ...rules.features,
    ...rules.paths,
    ...rules.spells,
    ...rules.feats,
  ]) {
    if (ids.has(def.id)) throw new Error("Duplicate rule ID: " + def.id);
    ids.add(def.id);
  }
  for (const path of rules.paths) {
    if (!catalog.callings[path.callingId]) throw new Error("Unknown Path Calling: " + path.id);
    if (path.status !== "available") throw new Error("Intended Path is unavailable: " + path.id);
    if (!path.grants.length || new Set(path.grants).size !== path.grants.length)
      throw new Error("Missing or duplicate Path grants: " + path.id);
    for (const id of path.grants) {
      const feature = rules.features.find(f => f.id === id);
      if (!feature || feature.ownerType !== "path" || feature.ownerId !== path.id ||
          !feature.description?.trim()) throw new Error("Invalid Path feature: " + id);
    }
  }
  for (const [id, c] of Object.entries(catalog.callings)) {
    if (rules.paths.filter(p => p.callingId === id).length !== 4)
      throw new Error('Each Calling requires exactly four Paths: ' + id);
    const rows = progression.progression(id);
    if (rows.length !== 20) throw new Error("Missing Calling levels");
    if (
      JSON.stringify(
        rows.filter((r) => r.pathFeatureGrant).map((r) => r.callingLevel)
      ) !== JSON.stringify(c.pathLevels)
    )
      throw new Error("Path schedule mismatch");
    for (const row of rows)
      for (const f of row.features)
        if (!f.rules.length)
          throw new Error("Missing feature rules: " + id + " " + f.sourceName);
    for (const p of rules.paths.filter(
      (p) => p.callingId === id && p.status === "available"
    )) {
      const levels = [
        ...new Set(
          p.grants.map(
            (g) => rules.features.find((f) => f.id === g)?.callingLevel
          )
        ),
      ];
      if (JSON.stringify(levels) !== JSON.stringify(c.pathLevels))
        throw new Error("Incomplete Path: " + p.id);
    }
  }
  const materials=require('./spellMaterials');
  for(const spell of rules.spells)if(spell.specificMaterial&&!Object.hasOwn(materials.requirements,spell.id))throw new Error('Missing priced material profile: '+spell.id);
  for(const id of Object.keys(materials.requirements))if(!rules.spells.some(s=>s.id===id&&s.specificMaterial))throw new Error('Foreign material profile: '+id);
  return true;
}
validate();
const blueprint = {
  version: 3,
  ruleset: "srd-5.2.1",
  abilities: catalog.abilities,
  skills: catalog.skills,
  languages: catalog.languages,
  equipment: require("../blueprints/equipment"),
  startingEquipment: require("./equipment").packages,
  creation: require('./creation'),
  metamagic: require('./metamagic').options,
  featOperations:require('./featOperations').options,
  strikeOptions:{cunning:require('./strikeOperations').available({callingLevels:{corsair:20},paths:{corsair:'reef-knife'}},'cunning'),brutal:require('./strikeOperations').available({callingLevels:{reaver:20}},'brutal')},
  spellMaterials:require('./spellMaterials').requirements,
  spellProfiles:require('./spellProfiles'),
  contingencySpellIds:require('./contingency').eligibleSpellIds,
  healingSpellProfiles:require('./healingSpells').profiles,
  objectUseProfiles:require('../../equipment/utilization').profiles,
  conditions:require('./vitality').conditions,
  damageTypes:require('./vitality').damageTypes,
  rulesVersion: 'SA-CHAR-1',
  callings: Object.entries(catalog.callings).map(([id, c]) => ({
    id,
    ...c,
    progression: progression.progression(id),
  })),
  ...rules,
  stage: "phase2-implementation-in-progress",
  persistentCreationEnabled: true,
  tabletopReady: false,
  limitations: [
    "Phase 2 is in progress; the complete Phase 1 acceptance contract is not yet met.",
    "Ability-clause parity, complete inventory operations, replacement choices and cross-character effects still require work.",
    "Combat positioning and effect adjudication belong to the GM; no VTT automation is claimed.",
  ],
};
blueprint.contentHash=require('node:crypto').createHash('sha256').update(JSON.stringify(blueprint)).digest('hex');
module.exports = {
  blueprint,
  validate,
  ...require("./engine"),
  runtime: require("./runtime"),
};

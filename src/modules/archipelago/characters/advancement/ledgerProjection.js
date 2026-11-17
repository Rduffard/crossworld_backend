const {
  pathPreparedGrants,
  acquiredCallingFeatures,
} = require('@crossworld/sanguine-engine/callings');

const {
  auraOfProtectionBonus,
} = require('@crossworld/sanguine-engine/callings');

const catalog = require('../../system/catalog');
const {
  attributeModifier: mod,
} = require('@crossworld/sanguine-engine/attributes');
const {
  baseSavingThrowModifier,
} = require('@crossworld/sanguine-engine/saving-throws');
const {
  trainingBonusForLevel,
} = require('@crossworld/sanguine-engine/training');
const {
  advancementSkillModifier,
  advancementResistances,
  advancementInitiative,
} = require('@crossworld/sanguine-engine/callings');
const {
  deriveVitalityProgression,
  advancementMovement,
} = require('@crossworld/sanguine-engine/progression');
const rules = require('../../system/rules');
const {
  numerical,
  resourcePools,
} = require('@crossworld/sanguine-engine/callings');
const { callings } = catalog;

const {
  spellCastingNumbers,
} = require('@crossworld/sanguine-engine/spells/casting-numbers');
const {
  callingPreparedGrants,
  omenDiverBonusHealth,
} = require('@crossworld/sanguine-engine/callings');
const {
  drydockToolExpertise,
} = require('@crossworld/sanguine-engine/callings');
const { attacksPerAction } = require('@crossworld/sanguine-engine/callings');
const {
  magicInitiateCasting,
  magicInitiatePool,
} = require('@crossworld/sanguine-engine/feats');
const attributeIds = Object.values(catalog.abilities);
const unique = (value) => [...new Set(value)];

function projectLedger({
  ledger,
  background,
  initiate,
  lineageInitiate,
  lineage,
  levels,
  paths,
  scores,
  choicesByCalling,
  casting,
  selectedFeats,
  saves,
  trained,
  expertise,
  languages,
  weapons,
  armor,
  tools,
  styles,
  requiredChoices,
}) {
  const totalLevel = ledger.levels.length,
    trainingBonus = trainingBonusForLevel(totalLevel);
  const { health, hitDice } = deriveVitalityProgression({
    level: totalLevel,
    hitDie: callings[ledger.levels[0].callingId].hitDie,
    resolve: scores.resolve,
    bonusHealth: omenDiverBonusHealth(paths.tidecaller, levels.tidecaller) + (lineage?.maxHealthAdjustment ?? 0),
  });
  const features = acquiredCallingFeatures(
    rules.features,
    rules.paths,
    levels,
    paths,
  );
  const pathSpells = {};
  for (const [id, pathId] of Object.entries(paths)) {
    const path = rules.paths.find((p) => p.id === pathId);
    pathSpells[id] = pathPreparedGrants(path, levels[id]);
  }
  for (const id of Object.keys(casting)) {
    const s = casting[id];
    // A different Calling's later Attribute Improvement can change this caster.
    Object.assign(s, spellCastingNumbers(scores[s.attribute], trainingBonus));
    s.alwaysPrepared = unique([
      ...(pathSpells[id] ?? []),
      ...s.spellMastery,
      ...s.signatureSpells,
      ...callingPreparedGrants(id, levels[id]),
    ]);
  }
  const casterEntries = Object.entries(levels).filter(
    ([id]) => callings[id].caster,
  );
  const slots = casterEntries.length ? casting[casterEntries[0][0]].slots : [];
  const pools = resourcePools(levels, scores, paths);
  const initiates = [
    ...(initiate?.spell ? [{ ...initiate, grantKey: 'background' }] : []),
    ...(lineageInitiate ? [lineageInitiate] : []),
    ...Object.values(choicesByCalling).flatMap((c) => c.initiates ?? []),
  ];
  for (const source of initiates) {
    const pool = magicInitiatePool(source.list);
    pools[pool.id] = pool;
  }
  for (const pool of lineage?.pools ?? []) pools[pool.id] = pool;
  if (selectedFeats.includes('boon-of-fate'))
    pools['feat:boon-of-fate'] = {
      id: 'feat:boon-of-fate',
      max: 1,
      recovery: { longRest: 'all', shortRest: 'all' },
    };
  for (const spellId of choicesByCalling.shipwright?.signatureSpells ?? [])
    pools[`shipwright:signature:${spellId}`] = {
      id: `shipwright:signature:${spellId}`,
      max: 1,
      recovery: { longRest: 'all', shortRest: 'all' },
    };
  const mechanics = {};
  for (const [id, n] of Object.entries(levels))
    mechanics[id] = numerical(id, n);
  const unresolved = [
    'complete-ability-clause-operation-parity',
    'all-equipment-ammunition-preset-and-purchase-workflows',
    'remaining-feat-and-spell-replacement-workflows',
    'cross-character-treatment-and-effect-transactions',
    'browser-acceptance-and-complete-behavioral-matrix',
  ];
  const auraOfProtection = auraOfProtectionBonus(
    levels.warden,
    mod(scores.spirit),
  );
  const attributeModifiers = Object.fromEntries(
    attributeIds.map((id) => [id, mod(scores[id])]),
  );
  const movement = advancementMovement(levels, paths, selectedFeats);
  const resistances = advancementResistances(levels, paths, choicesByCalling);
  if (lineage) {
    movement.walk += lineage.movement.walk - advancementMovement({}, {}, []).walk;
    if (movement.swim !== 'walk') movement.swim = Math.max(movement.swim, lineage.movement.swim);
    resistances.push(...lineage.damageResistances.filter(type => !resistances.includes(type)));
  }
  return {
    ruleset: ledger.ruleset,
    creation: ledger.creation ?? null,
    background: background
      ? { id: background.id, name: background.name }
      : null,
    originId: ledger.creation?.originId ?? null,
    ...(lineage ? { lineage, size: lineage.size, creatureType: lineage.type,
      senses: lineage.senses,
      innateSpells: lineage.spells.map(grant => ({ ...grant, castSupported: false })) } : {}),
    featSpellcasting: initiate
      ? magicInitiateCasting(
          initiate,
          scores[initiate.attribute] ?? 10,
          trainingBonus,
        )
      : null,
    featSpellcasters: initiates.map((source) => ({
      ...magicInitiateCasting(source, scores[source.attribute], trainingBonus),
      poolId: magicInitiatePool(source.list).id,
    })),
    totalLevel,
    callingLevels: { ...levels },
    paths,
    attributes: scores,
    attributeModifiers,
    savingThrowModifiers: Object.fromEntries(
      attributeIds.map((id) => [
        id,
        baseSavingThrowModifier({
          score: scores[id],
          trained: saves.includes(id),
          trainingBonus,
          auraBonus: auraOfProtection,
        }),
      ]),
    ),
    auraOfProtection,
    skillModifiers: Object.fromEntries(
      catalog.skills.map((skill) => [
        skill.id,
        advancementSkillModifier({
          skill,
          scores,
          trainingBonus,
          doctor: choicesByCalling.doctor,
          trained: trained.includes(skill.id),
          expertise: expertise.includes(skill.id),
        }),
      ]),
    ),
    trainingBonus,
    languages: unique(languages),
    training: unique(trained),
    expertise: unique(expertise),
    savingThrows: unique(saves),
    equipmentTraining: {
      weapons: unique(weapons),
      armor: unique(armor),
      tools: unique(tools),
    },
    health,
    hitDice,
    spellcasting: casting,
    spellSlots: [...slots],
    resources: pools,
    mechanics,
    attacksPerAction: attacksPerAction(mechanics),
    features,
    feats: selectedFeats,
    fightingStyles: styles,
    pathSelections: structuredClone(choicesByCalling),
    toolExpertise: drydockToolExpertise(paths.shipwright, levels.shipwright),
    resistances,
    initiative: advancementInitiative({
      agility: scores.agility,
      trainingBonus,
      feats: selectedFeats,
      levels,
      paths,
    }),
    movement,
    abilityOptions: require('../abilities/abilityOptions').list({
      features,
      callingLevels: levels,
      pathSelections: choicesByCalling,
      attributeModifiers,
      spellcasting: casting,
      trainingBonus,
      paths,
    }),
    weaponMastery: unique(
      Object.values(choicesByCalling).flatMap((c) => c.mastery ?? []),
    ),
    requiredChoices,
    decisionsComplete: requiredChoices.length === 0,
    tabletopReady: false,
    buildStatus: 'phase2-in-progress-not-accepted',
    unresolvedSystems: unresolved,
  };
}
module.exports = projectLedger;

const {
  spellGrantEligible,
  shipwrightFolioCount,
  powderSaintSavantCount,
  grayNetChoice,
} = require('@crossworld/sanguine-engine/callings');
const {
  shipwrightFolioGrantAtLevel,
  spellMasteryReplacements,
  pathPreparedGrants,
} = require('@crossworld/sanguine-engine/callings');
const {
  primalChampionAttributes,
  callingSaveGrants,
} = require('@crossworld/sanguine-engine/callings');
const {
  cantripAdvancementEligible,
  preparedAdvancementEligible,
} = require('@crossworld/sanguine-engine/preparations');
const {
  callingCantripEligible,
  leveledSpellWithinSlotLimit,
} = require('@crossworld/sanguine-engine/spells/casting-sources');
const {
  metamagicChoicesAtLevel,
  metamagicReplacementAvailable,
  replaceMetamagic,
} = require('@crossworld/sanguine-engine/spells/metamagic');
const {
  designedPathGrants,
  pathSpecialtyTools,
  pathAdvancementChoices,
} = require('@crossworld/sanguine-engine/callings');
const {
  trainingGrantDestination,
  weaponMasteryEligible,
} = require('@crossworld/sanguine-engine/training');

const {
  gunslingerLevelGrants,
} = require('@crossworld/sanguine-engine/callings');
const catalog = require('../../system/catalog');

const {
  maximumCharacterLevel,
  initialStandardLanguageCount,
  advancementCallingPolicyError,
} = require('@crossworld/sanguine-engine/progression');
const rules = require('../../system/rules');
const {
  numerical,
  spellcasting,
  progression,
  resourcePools,
} = require('@crossworld/sanguine-engine/callings');
const { callings } = catalog;
const {
  featAvailable,
  featPrerequisiteMet,
  featIncreaseShapeValid,
  featIncreaseError,
} = require('@crossworld/sanguine-engine/feats');
const {
  spellCastingNumbers,
} = require('@crossworld/sanguine-engine/spells/casting-numbers');
const {
  callingPreparedGrants,
} = require('@crossworld/sanguine-engine/callings');

const {
  callingTrainingChoices,
  trainedScholarSkills,
  divineOrderChoices,
  divineOrderTraining,
  callingCantripCount,
  cantripStyleSpellEligible,
  availableFightingStyles,
  pathChoiceAtLevel,
  omenDiverElementChoices,
  blessedStrikeChoices,
} = require('@crossworld/sanguine-engine/callings');
const {
  magicInitiateChoices,
  magicInitiateSpells,
  replaceMagicInitiateSpell,
} = require('@crossworld/sanguine-engine/feats');
const {
  magicInitiateReplacementAvailable,
  magicInitiateReplacementBatchEligible,
} = require('@crossworld/sanguine-engine/feats');
const {
  styleCantripReplacementAvailable,
} = require('@crossworld/sanguine-engine/callings');
const projectLedger = require('./ledgerProjection');
const attributeIds = Object.values(catalog.abilities);
function fail(message) {
  const e = new Error(message);
  e.statusCode = 400;
  throw e;
}
function object(value, allowed) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !allowed.includes(k))
  )
    fail('Invalid rules fields');
}
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail('Invalid ' + label);
  return value;
}
const unique = (value) => [...new Set(value)];
function attributes(value) {
  object(value, attributeIds);
  for (const key of attributeIds) integer(value[key], 1, 20, 'base attributes');
  return { ...value };
}
function create(
  baseAttributes,
  firstLevel,
  { allowIncomplete = false, creation } = {},
) {
  const ledger = {
    version: 3,
    ruleset: 'srd-5.2.1',
    revision: 0,
    baseAttributes: attributes(baseAttributes),
    levels: [structuredClone(firstLevel)],
    ...(creation ? { creation: structuredClone(creation) } : {}),
  };
  const summary = replay(ledger);
  if (!allowIncomplete && !summary.decisionsComplete)
    fail(
      'Complete required choices: ' +
        summary.requiredChoices.map((r) => r.id).join(', '),
    );
  return { ledger, summary };
}
function replay(ledger) {
  object(ledger, [
    'version',
    'ruleset',
    'revision',
    'baseAttributes',
    'levels',
    'creation',
  ]);
  if (ledger.version !== 3 || ledger.ruleset !== 'srd-5.2.1')
    fail('Unsupported rules ledger');
  integer(ledger.revision, 0, Number.MAX_SAFE_INTEGER, 'revision');
  if (
    !Array.isArray(ledger.levels) ||
    !ledger.levels.length ||
    ledger.levels.length > maximumCharacterLevel
  )
    fail('Character level must be 1-20');
  const scores = attributes(ledger.baseAttributes),
    levels = {},
    paths = {},
    trained = [],
    expertise = [],
    weapons = [],
    armor = [],
    tools = [],
    languages = ['common'],
    saves = [],
    requiredChoices = [],
    selectedFeats = [],
    styles = [],
    casting = {},
    choicesByCalling = {};
  let previousComplete = true,
    initiate = null;
  const background = ledger.creation
    ? require('./creation').validate(ledger.creation, scores)
    : null;
  if (background) {
    tools.push(background.tool);
    selectedFeats.push(background.feat);
    languages.push(background.origin.language);
  }
  for (const [index, event] of ledger.levels.entries()) {
    object(event, ['callingId', 'choices', 'healthRoll', 'folioAtSpellGrant']);
    if (!Object.hasOwn(callings, event.callingId)) fail('Unknown Calling');
    const c = callings[event.callingId];
    const id = event.callingId,
      n = (levels[id] ?? 0) + 1,
      total = index + 1,
      first = n === 1,
      initial = index === 0;
    if (!previousComplete)
      fail('Resolve earlier level choices before advancing');
    const policyError = advancementCallingPolicyError(
      initial ? undefined : ledger.levels[0].callingId,
      id,
      event.healthRoll,
    );
    if (policyError) fail(policyError);
    const savedFolio = event.folioAtSpellGrant;
    const folioGrant = shipwrightFolioGrantAtLevel(id, n);
    if (
      savedFolio !== undefined &&
      (!folioGrant ||
        !Array.isArray(savedFolio) ||
        savedFolio.length > rules.spells.length ||
        new Set(savedFolio).size !== savedFolio.length ||
        savedFolio.some(
          (id) =>
            !spellGrantEligible(
              rules.spells.find((s) => s.id === id),
              n,
            ),
        ))
    )
      fail('Invalid saved folio for spell grants');
    levels[id] = n;
    const before = requiredChoices.length,
      choice = event.choices ?? {};
    object(choice, [
      'skills',
      'expertise',
      'mastery',
      'languages',
      'callingLanguages',
      'style',
      'pathId',
      'feat',
      'increases',
      'divineOrder',
      'scholar',
      'metamagic',
      'cantrips',
      'prepared',
      'folio',
      'hunterPrey',
      'defensiveTactics',
      'element',
      'blessedStrikes',
      'spellMastery',
      'signatureSpells',
      'savant',
      'ghostTrade',
      'stormDiscipline',
      'stormResistance',
      'surgicalDiscipline',
      'clinicalAttribute',
      'fortification',
      'equipment',
      'pathDiscipline',
      'featSkills',
      'featTools',
      'featTraining',
      'backgroundSkills',
      'backgroundTool',
      'instrument',
      'initiateAttribute',
      'initiateCantrips',
      'initiateSpell',
      'initiateList',
      'styleCantrips',
      'metamagicReplacement',
      'styleCantripReplacement',
      'initiateReplacements',
    ]);
    const used = new Set();
    const request = (key, count, options, existing = [], distinct = true) => {
      used.add(key);
      const value = choice[key];
      if (count === 0 && value === undefined) return [];
      if (value === undefined) {
        requiredChoices.push({
          id: `${id}:${n}:${key}`,
          callingId: id,
          callingLevel: n,
          key,
          count,
          options: options.filter((v) => !distinct || !existing.includes(v)),
        });
        return [];
      }
      if (
        !Array.isArray(value) ||
        value.length !== count ||
        new Set(value).size !== count ||
        value.some(
          (v) => !options.includes(v) || (distinct && existing.includes(v)),
        )
      )
        fail('Invalid ' + key + ' choice at ' + id + ' ' + n);
      return value;
    };
    const single = (key, options) => request(key, 1, options, [], false)[0];
    if (initial && background?.feat === 'magic-initiate') {
      const list =
        background.list ?? single('initiateList', magicInitiateChoices.lists);
      const attribute = single(
        'initiateAttribute',
        magicInitiateChoices.attributes,
      );
      const cantrips = request(
        'initiateCantrips',
        magicInitiateChoices.cantripCount,
        magicInitiateSpells(list, 0),
      );
      const spell = single('initiateSpell', magicInitiateSpells(list, 1));
      initiate = { list, attribute, cantrips, spell };
    }
    if (first) {
      if (initial)
        single(
          'equipment',
          require('@crossworld/sanguine-engine/equipment/starting-equipment').options(
            id,
          ),
        );
      if (initial)
        languages.push(
          ...request(
            'languages',
            initialStandardLanguageCount(Boolean(background)),
            catalog.standardLanguages,
            languages,
          ),
        );
      const grants = initial ? c.starting : c.multiclass;
      trained.push(
        ...request(
          'skills',
          grants.skillCount,
          c.starting.skillOptions,
          trained,
        ),
      );
      if (initial && background) {
        if (grants.tools.includes(background.tool)) {
          tools.splice(tools.indexOf(background.tool), 1);
          tools.push(
            ...request(
              'backgroundTool',
              1,
              require('./creation').tools.filter(
                (t) => !grants.tools.includes(t),
              ),
            ),
          );
        }
        if (background.tool === 'musical-instrument') {
          tools.splice(tools.indexOf('musical-instrument'), 1);
          const instrument = single('instrument', [
            'bagpipes',
            'drum',
            'dulcimer',
            'flute',
            'horn',
            'lute',
            'lyre',
            'pan-flute',
            'shawm',
            'viol',
          ]);
          if (instrument) tools.push('instrument:' + instrument);
        }
        const required = background.skills.filter(
          (skill) => !trained.includes(skill),
        );
        const selected = request(
          'backgroundSkills',
          2,
          catalog.skills.map((s) => s.id),
          trained,
        );
        const pendingBackground = requiredChoices.find(
          (r) => r.key === 'backgroundSkills' && r.callingLevel === n,
        );
        if (pendingBackground) pendingBackground.requiredOptions = required;
        if (
          selected.length &&
          required.some((skill) => !selected.includes(skill))
        )
          fail(
            'Keep each nonduplicate background skill; replace duplicates only',
          );
        trained.push(...selected);
        if (background.feat === 'skilled') {
          const options = [
            ...catalog.skills
              .filter((s) => !trained.includes(s.id))
              .map((s) => 'skill:' + s.id),
            ...require('./creation')
              .tools.filter(
                (t) => !tools.includes(t) && !grants.tools.includes(t),
              )
              .map((t) => 'tool:' + t),
          ];
          for (const permission of request('featTraining', 3, options)) {
            const [kind, id] = permission.split(':');
            (kind === 'skill' ? trained : tools).push(id);
          }
        }
      }
      weapons.push(...grants.weapons);
      armor.push(...grants.armor);
      tools.push(...grants.tools);
      if (initial) saves.push(...c.starting.saves);
    }
    const trainingChoices = callingTrainingChoices(id, n, first);
    if (trainingChoices.thievesCant) languages.push('thieves-cant');
    if (trainingChoices.languageCount)
      languages.push(
        ...request(
          'callingLanguages',
          trainingChoices.languageCount,
          catalog.languages,
          languages,
        ),
      );
    if (trainingChoices.expertiseCount)
      expertise.push(
        ...request(
          'expertise',
          trainingChoices.expertiseCount,
          trained,
          expertise,
        ),
      );
    if (trainingChoices.skillCount)
      trained.push(
        ...request(
          'skills',
          trainingChoices.skillCount,
          c.starting.skillOptions,
          trained,
        ),
      );
    if (trainingChoices.scholarCount)
      expertise.push(
        ...request(
          'scholar',
          trainingChoices.scholarCount,
          trainedScholarSkills(trained),
          expertise,
        ),
      );
    const previous = choicesByCalling[id] ?? {};
    const stats = numerical(id, n);
    if (stats.masteryCount) {
      const eligible = require('../../system/blueprints/equipment/index')
        .items.filter((weapon) => weaponMasteryEligible(weapon, id, weapons))
        .map((weapon) => weapon.id);
      if ((previous.mastery?.length ?? 0) !== stats.masteryCount)
        previous.mastery = request(
          'mastery',
          stats.masteryCount,
          eligible,
          [],
          false,
        );
    }
    const orderChoices = divineOrderChoices(id, n);
    if (orderChoices) {
      const order = single('divineOrder', orderChoices);
      const grants = divineOrderTraining(order);
      weapons.push(...grants.weapons);
      armor.push(...grants.armor);
      previous.divineOrder = order;
    }
    const fightingStyleOptions = availableFightingStyles(
      id,
      n,
      paths[id],
      styles,
    );
    if (fightingStyleOptions) {
      const style = single('style', fightingStyleOptions);
      if (style) styles.push(style);
      if (style === 'cantrip-style') {
        previous.styleCantrips = request(
          'styleCantrips',
          2,
          rules.spells
            .filter((spell) => cantripStyleSpellEligible(id, spell))
            .map((spell) => spell.id),
        );
      }
    }
    if (pathChoiceAtLevel(n)) {
      const pathId = single(
        'pathId',
        rules.paths
          .filter((p) => p.callingId === id && p.status === 'available')
          .map((p) => p.id),
      );
      if (pathId) paths[id] = pathId;
    }
    const grayNet = grayNetChoice(paths[id], n);
    if (grayNet) previous[grayNet.key] = single(grayNet.key, grayNet.options);
    const omenElements = omenDiverElementChoices(paths[id], n);
    if (omenElements) previous.element = single('element', omenElements);
    const selectedPath = rules.paths.find((p) => p.id === paths[id]);
    const pathChoice = selectedPath?.choices?.[n];
    if (pathChoice)
      previous[pathChoice.key] = single(pathChoice.key, pathChoice.options);
    const { skill, tool: pathTool } = designedPathGrants(
      selectedPath,
      n,
      previous.pathDiscipline,
    );
    if (skill)
      ({ trained, expertise })[trainingGrantDestination(trained, skill)].push(
        skill,
      );
    if (pathTool) tools.push(pathTool);
    if (id === 'gunslinger') {
      const { tool } = gunslingerLevelGrants(n, paths[id]);
      if (tool) tools.push(tool);
    }
    const pathChoices = pathAdvancementChoices(paths[id], n);
    if (pathChoices.stormResistance)
      previous.stormResistance = single(
        'stormResistance',
        pathChoices.stormResistance,
      );
    tools.push(...pathSpecialtyTools(paths[id], n));
    if (pathChoices.clinicalAttribute) {
      previous.clinicalAttribute = single(
        'clinicalAttribute',
        pathChoices.clinicalAttribute,
      );
      ({ trained, expertise })[
        trainingGrantDestination(trained, 'medicine')
      ].push('medicine');
    }
    const blessedStrikes = blessedStrikeChoices(id, n);
    if (blessedStrikes)
      previous.blessedStrikes = single('blessedStrikes', blessedStrikes);
    const metamagicChoices =
      id === 'tidecaller' ? metamagicChoicesAtLevel(n) : null;
    if (metamagicChoices) {
      previous.metamagic = [
        ...(previous.metamagic ?? []),
        ...request(
          'metamagic',
          metamagicChoices.count,
          metamagicChoices.options,
          previous.metamagic ?? [],
        ),
      ];
    }
    if (
      metamagicReplacementAvailable(id, n) &&
      choice.metamagicReplacement !== undefined
    ) {
      used.add('metamagicReplacement');
      const replacement = choice.metamagicReplacement;
      object(replacement, ['from', 'to']);
      const next = replaceMetamagic(previous.metamagic, replacement);
      if (!next) fail('Invalid Metamagic replacement');
      previous.metamagic = next;
    }
    if (
      styleCantripReplacementAvailable(n) &&
      choice.styleCantripReplacement !== undefined
    ) {
      used.add('styleCantripReplacement');
      const replacement = choice.styleCantripReplacement;
      object(replacement, ['from', 'to']);
      if (
        !previous.styleCantrips?.includes(replacement.from) ||
        previous.styleCantrips.includes(replacement.to) ||
        !cantripStyleSpellEligible(
          id,
          rules.spells.find((s) => s.id === replacement.to),
        )
      )
        fail('Invalid cantrip-style replacement');
      previous.styleCantrips = previous.styleCantrips.map((id) =>
        id === replacement.from ? replacement.to : id,
      );
    }
    if (
      magicInitiateReplacementAvailable(n) &&
      choice.initiateReplacements !== undefined
    ) {
      used.add('initiateReplacements');
      const changes = choice.initiateReplacements;
      if (!magicInitiateReplacementBatchEligible(changes))
        fail('Replace at most one spell per Magic Initiate grant per level');
      for (const replacement of changes) {
        object(replacement, ['grantKey', 'from', 'to']);
        const source =
          replacement.grantKey === 'background'
            ? initiate
            : previous.initiates?.find(
                (s) => s.grantKey === replacement.grantKey,
              );
        const update = replaceMagicInitiateSpell(
          source,
          replacement.from,
          replacement.to,
        );
        if (!update) fail('Invalid Magic Initiate replacement');
        Object.assign(source, update);
      }
    }
    const row = progression(id)[n - 1];
    if (row.featChoice) {
      used.add('feat');
      used.add('increases');
      if (choice.feat === undefined)
        requiredChoices.push({
          id: `${id}:${n}:feat`,
          callingId: id,
          callingLevel: n,
          key: 'feat',
          count: 1,
          options: rules.feats
            .filter(
              (feat) =>
                feat.id === 'ability-score-improvement' ||
                featAvailable(feat, total, selectedFeats),
            )
            .map((feat) => feat.id),
        });
      else {
        const feat = rules.feats.find((f) => f.id === choice.feat);
        if (!featAvailable(feat, total, selectedFeats))
          fail('Unsupported or ineligible feat');
        if (
          !featPrerequisiteMet(feat, {
            scores,
            caster: c.caster,
            weapons,
            armor,
            trained,
          })
        )
          fail('Feat prerequisite not met');
        if (
          feat.id === 'boon-of-spell-recall' &&
          !Object.keys(levels).some((k) => callings[k].caster)
        )
          fail('Spellcasting required');
        object(choice.increases ?? {}, attributeIds);
        const entries = Object.entries(choice.increases ?? {});
        if (!featIncreaseShapeValid(feat, entries))
          fail('Invalid feat attribute increase');
        for (const [key, value] of entries) {
          const error = featIncreaseError(feat, key, scores[key], value);
          if (error) fail(error);
          scores[key] += value;
        }
        selectedFeats.push(feat.id);
        if (feat.id === 'skilled') {
          const options = [
            ...catalog.skills
              .filter((s) => !trained.includes(s.id))
              .map((s) => 'skill:' + s.id),
            ...require('./creation')
              .tools.filter((t) => !tools.includes(t))
              .map((t) => 'tool:' + t),
          ];
          for (const permission of request('featTraining', 3, options)) {
            const [kind, id] = permission.split(':');
            (kind === 'skill' ? trained : tools).push(id);
          }
        }
        if (feat.id === 'seasoned-voyager')
          tools.push(
            tools.includes('navigators-tools')
              ? single(
                  'featTools',
                  require('./creation').tools.filter((t) => !tools.includes(t)),
                )
              : 'navigators-tools',
          );
        if (feat.id === 'magic-initiate') {
          const list = single('initiateList', magicInitiateChoices.lists);
          if (
            initiate?.list === list ||
            previous.initiates?.some((s) => s.list === list)
          )
            fail('Magic Initiate repeats require a different list');
          const attribute = single(
            'initiateAttribute',
            magicInitiateChoices.attributes,
          );
          const cantrips = request(
            'initiateCantrips',
            magicInitiateChoices.cantripCount,
            magicInitiateSpells(list, 0),
          );
          const spell = single('initiateSpell', magicInitiateSpells(list, 1));
          previous.initiates = [
            ...(previous.initiates ?? []),
            { list, attribute, cantrips, spell, grantKey: `${id}:${n}:feat` },
          ];
        }
      }
    }
    if (id === 'reaver')
      Object.assign(scores, primalChampionAttributes(n, scores));
    saves.push(...callingSaveGrants(id, n));
    const spell = spellcasting(id, n, scores);
    if (spell) {
      if (id === 'doctor' && previous.clinicalAttribute) {
        spell.attribute = previous.clinicalAttribute;
        Object.assign(spell, spellCastingNumbers(scores[spell.attribute]));
      }
      const maxSpellLevel = spell.slots.length;
      const classSpells = rules.spells.filter((s) => s.callings.includes(id));
      const count = callingCantripCount(
        spell.cantripCount,
        previous.divineOrder,
      );
      const oldCantrips = previous.cantrips ?? [];
      if (
        count !== oldCantrips.length ||
        (choice.cantrips !== undefined && id !== 'shipwright')
      ) {
        previous.cantrips = request(
          'cantrips',
          count,
          classSpells
            .filter((s) => callingCantripEligible(s, id))
            .map((s) => s.id),
          [],
          false,
        );
        if (
          !cantripAdvancementEligible(
            id,
            n,
            oldCantrips,
            previous.cantrips,
            count,
          )
        )
          fail('Only one existing cantrip can be replaced per Calling level');
      }
      if (id === 'shipwright') {
        const newSpells = request(
          'folio',
          shipwrightFolioCount(n),
          classSpells
            .filter((s) => leveledSpellWithinSlotLimit(s, maxSpellLevel))
            .map((s) => s.id),
          previous.folio ?? [],
        );
        previous.folio = [...(previous.folio ?? []), ...newSpells];
        const savantCount = powderSaintSavantCount(
          paths[id],
          n,
          maxSpellLevel,
          spellcasting(id, n - 1, scores)?.slots?.length ?? 0,
        );
        if (savantCount) {
          previous.folio.push(
            ...request(
              'savant',
              savantCount,
              classSpells
                .filter(
                  (s) =>
                    s.school === 'evocation' &&
                    leveledSpellWithinSlotLimit(s, maxSpellLevel),
                )
                .map((s) => s.id),
              previous.folio,
            ),
          );
        }
      }
      const grantFolio =
        savedFolio === undefined
          ? previous.folio
          : unique([...savedFolio, ...(choice.folio ?? [])]);
      if (folioGrant) {
        const selected = request(
          folioGrant.key,
          folioGrant.count,
          grantFolio.filter((id) =>
            spellGrantEligible(
              rules.spells.find((s) => s.id === id),
              n,
            ),
          ),
          [],
          false,
        );
        if (
          folioGrant.key === 'spellMastery' &&
          selected.length &&
          !spellMasteryReplacements(
            selected.map((spellId) =>
              rules.spells.find((spell) => spell.id === spellId),
            ),
          )
        )
          fail(
            'Spell Mastery requires one level 1 and one level 2 Action spell',
          );
        previous[folioGrant.key] = selected;
      }
      const pathDefinition = rules.paths.find((p) => p.id === paths[id]);
      const alwaysPrepared = unique([
        ...pathPreparedGrants(pathDefinition, n),
        ...(previous.spellMastery ?? []),
        ...(previous.signatureSpells ?? []),
        ...callingPreparedGrants(id, n),
      ]);
      if (
        spell.preparedCount !== (previous.prepared?.length ?? 0) ||
        choice.prepared !== undefined ||
        previous.prepared?.some((s) => alwaysPrepared.includes(s))
      ) {
        const available =
          id === 'shipwright'
            ? previous.folio
            : classSpells
                .filter((s) => leveledSpellWithinSlotLimit(s, maxSpellLevel))
                .map((s) => s.id);
        const nextPrepared = request(
          'prepared',
          spell.preparedCount,
          available.filter((s) => !alwaysPrepared.includes(s)),
          [],
          false,
        );
        if (
          !preparedAdvancementEligible(
            id,
            previous.prepared,
            nextPrepared,
            alwaysPrepared,
            spell.preparedCount,
          )
        )
          fail(
            'Only one previously prepared Tidecaller spell can be replaced per Calling level',
          );
        previous.prepared = nextPrepared;
      }
      casting[id] = {
        ...spell,
        cantrips: unique([
          ...(previous.cantrips ?? []),
          ...(previous.styleCantrips ?? []),
        ]),
        prepared: previous.prepared ?? [],
        folio: previous.folio ?? [],
        spellMastery: previous.spellMastery ?? [],
        signatureSpells: previous.signatureSpells ?? [],
      };
    }
    for (const key of Object.keys(choice))
      if (!used.has(key))
        fail('Choice unavailable at this Calling level: ' + key);
    choicesByCalling[id] = previous;
    previousComplete = requiredChoices.length === before;
  }
  return projectLedger({
    ledger,
    background,
    initiate,
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
  });
}
function advance(ledger, operation, folioAtSpellGrant) {
  object(operation, ['expectedRevision', 'callingId', 'choices', 'healthRoll']);
  if (operation.expectedRevision !== ledger.revision)
    fail('Progression changed; reload before advancing');
  const current = replay(ledger);
  if (!current.decisionsComplete) fail('Complete current level choices first');
  const next = structuredClone(ledger);
  next.revision++;
  const { expectedRevision, ...event } = operation;
  void expectedRevision;
  next.levels.push(
    folioAtSpellGrant === undefined ? event : { ...event, folioAtSpellGrant },
  );
  const summary = replay(next);
  if (!summary.decisionsComplete)
    fail(
      'Complete required choices: ' +
        summary.requiredChoices.map((r) => r.id).join(', '),
    );
  return { ledger: next, summary };
}
module.exports = { create, replay, advance, resourcePools, spellGrantEligible };

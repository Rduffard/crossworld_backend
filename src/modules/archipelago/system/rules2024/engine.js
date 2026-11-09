const catalog = require("./catalog");
const rules = require("./rules");
const { numerical, spellcasting, progression } = require("./progression");
const { callings, slug } = catalog;
const attributeIds = Object.values(catalog.abilities);
function fail(message) {
  const e = new Error(message);
  e.statusCode = 400;
  throw e;
}
function object(value, allowed) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !allowed.includes(k))
  )
    fail("Invalid rules fields");
}
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail("Invalid " + label);
  return value;
}
const mod = (score) => Math.floor((score - 10) / 2);
const unique = (value) => [...new Set(value)];
function spellGrantEligible(spell, level) {
  if(!spell?.callings.includes('shipwright'))return false;
  return level===20?spell.level===3:[1,2].includes(spell.level)&&['Action','Action or Ritual'].includes(spell.castingTime);
}
function attributes(value) {
  object(value, attributeIds);
  for (const key of attributeIds) integer(value[key], 1, 20, "base attributes");
  return { ...value };
}
function create(baseAttributes, firstLevel, { allowIncomplete = false, creation } = {}) {
  const ledger = {
    version: 3,
    ruleset: "srd-5.2.1",
    revision: 0,
    baseAttributes: attributes(baseAttributes),
    levels: [structuredClone(firstLevel)],
    ...(creation ? { creation: structuredClone(creation) } : {}),
  };
  const summary = replay(ledger);
  if (!allowIncomplete && !summary.decisionsComplete)
    fail(
      "Complete required choices: " +
        summary.requiredChoices.map((r) => r.id).join(", ")
    );
  return { ledger, summary };
}
function replay(ledger) {
  object(ledger, [
    "version",
    "ruleset",
    "revision",
    "baseAttributes",
    "levels",
    "creation",
  ]);
  if (ledger.version !== 3 || ledger.ruleset !== "srd-5.2.1")
    fail("Unsupported rules ledger");
  integer(ledger.revision, 0, Number.MAX_SAFE_INTEGER, "revision");
  if (
    !Array.isArray(ledger.levels) ||
    !ledger.levels.length ||
    ledger.levels.length > 20
  )
    fail("Character level must be 1-20");
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
    healthDice = [],
    requiredChoices = [],
    selectedFeats = [],
    styles = [],
    casting = {},
    choicesByCalling = {};
  let previousComplete = true, initiate = null;
  const background = ledger.creation ? require('./creation').validate(ledger.creation, scores) : null;
  if (background) { tools.push(background.tool); selectedFeats.push(background.feat); languages.push(background.origin.language); }
  for (const [index, event] of ledger.levels.entries()) {
    object(event, ["callingId", "choices", "healthRoll", "folioAtSpellGrant"]);
    if (!Object.hasOwn(callings, event.callingId)) fail("Unknown Calling");
    const c = callings[event.callingId];
    const id = event.callingId,
      n = (levels[id] ?? 0) + 1,
      total = index + 1,
      first = n === 1,
      initial = index === 0;
    if (!previousComplete)
      fail("Resolve earlier level choices before advancing");
    if (!initial && id !== ledger.levels[0].callingId)
      fail("SA-CHAR-1 permits one Calling; multiclassing is unavailable");
    if (event.healthRoll !== undefined) fail("SA-CHAR-1 uses fixed Health gains");
    const savedFolio=event.folioAtSpellGrant;
    if(savedFolio!==undefined&&(id!=='shipwright'||![18,20].includes(n)||!Array.isArray(savedFolio)||savedFolio.length>rules.spells.length||
      new Set(savedFolio).size!==savedFolio.length||savedFolio.some(id=>!spellGrantEligible(rules.spells.find(s=>s.id===id),n))))fail('Invalid saved folio for spell grants');
    levels[id] = n;
    const before = requiredChoices.length,
      choice = event.choices ?? {};
    object(choice, [
      "skills",
      "expertise",
      "mastery",
      "languages",
      "callingLanguages",
      "style",
      "pathId",
      "feat",
      "increases",
      "divineOrder",
      "scholar",
      "metamagic",
      "cantrips",
      "prepared",
      "folio",
      "hunterPrey",
      "defensiveTactics",
      "element",
      "blessedStrikes",
      "spellMastery",
      "signatureSpells",
      "savant",
      "ghostTrade",
      "stormDiscipline",
      "stormResistance",
      "surgicalDiscipline",
      "clinicalAttribute",
      "fortification",
      "equipment",
      "pathDiscipline",
      'featSkills', 'featTools', 'featTraining', 'backgroundSkills', 'backgroundTool', 'instrument', 'initiateAttribute', 'initiateCantrips', 'initiateSpell', 'initiateList', 'styleCantrips', 'metamagicReplacement', 'styleCantripReplacement', 'initiateReplacements',
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
          (v) => !options.includes(v) || (distinct && existing.includes(v))
        )
      )
        fail("Invalid " + key + " choice at " + id + " " + n);
      return value;
    };
    const single = (key, options) => request(key, 1, options, [], false)[0];
    if (initial && background?.feat === 'magic-initiate') {
      const list = background.list ?? single('initiateList', ['doctor','druid','shipwright']);
      const attribute = single('initiateAttribute', ['wit', 'instinct', 'spirit']);
      const cantrips = request('initiateCantrips', 2, rules.spells.filter(s => s.level === 0 && s.callings.includes(list)).map(s => s.id));
      const spell = single('initiateSpell', rules.spells.filter(s => s.level === 1 && s.callings.includes(list)).map(s => s.id));
      initiate = { list, attribute, cantrips, spell };
    }
    if (first) {
      if (initial) single("equipment", require("./equipment").options(id));
      if (initial) languages.push(...request("languages", background ? 1 : 2, catalog.standardLanguages, languages));
      const grants = initial ? c.starting : c.multiclass;
      trained.push(
        ...request(
          "skills",
          grants.skillCount,
          c.starting.skillOptions,
          trained
        )
      );
      if (initial && background) {
        if(grants.tools.includes(background.tool)){
          tools.splice(tools.indexOf(background.tool),1);
          tools.push(...request('backgroundTool',1,require('./creation').tools.filter(t=>!grants.tools.includes(t))));
        }
        if(background.tool==='musical-instrument'){
          tools.splice(tools.indexOf('musical-instrument'),1);
          const instrument=single('instrument',['bagpipes','drum','dulcimer','flute','horn','lute','lyre','pan-flute','shawm','viol']);
          if(instrument)tools.push('instrument:'+instrument);
        }
        const required = background.skills.filter(skill => !trained.includes(skill));
        const selected = request('backgroundSkills', 2, catalog.skills.map(s=>s.id), trained);
        const pendingBackground=requiredChoices.find(r=>r.key==='backgroundSkills'&&r.callingLevel===n);
        if(pendingBackground)pendingBackground.requiredOptions=required;
        if (selected.length && required.some(skill=>!selected.includes(skill))) fail('Keep each nonduplicate background skill; replace duplicates only');
        trained.push(...selected);
        if (background.feat === 'skilled') {
          const options = [...catalog.skills.filter(s=>!trained.includes(s.id)).map(s=>'skill:'+s.id),
            ...require('./creation').tools.filter(t=>!tools.includes(t)&&!grants.tools.includes(t)).map(t=>'tool:'+t)];
          for (const permission of request('featTraining',3,options)) {
            const [kind,id]=permission.split(':');
            (kind==='skill'?trained:tools).push(id);
          }
        }
      }
      weapons.push(...grants.weapons);
      armor.push(...grants.armor);
      tools.push(...grants.tools);
      if (initial) saves.push(...c.starting.saves);
    }
    if (id === 'corsair' && first) {
      languages.push("thieves-cant");
      languages.push(...request("callingLanguages", 1, catalog.languages, languages));
    }
    if (id === 'navigator' && n === 2)
      languages.push(...request("callingLanguages", 2, catalog.languages, languages));
    if (id === "corsair" && [1, 6].includes(n))
      expertise.push(...request("expertise", 2, trained, expertise));
    if (id === "reaver" && n === 3)
      trained.push(...request("skills", 1, c.starting.skillOptions, trained));
    if (id === "navigator" && [2, 9].includes(n))
      expertise.push(
        ...request("expertise", n === 2 ? 1 : 2, trained, expertise)
      );
    if (id === "shipwright" && n === 2)
      expertise.push(
        ...request(
          "scholar",
          1,
          trained.filter((s) =>
            [
              "arcana",
              "history",
              "investigation",
              "medicine",
              "nature",
              "religion",
            ].includes(s)
          ),
          expertise
        )
      );
    const previous = choicesByCalling[id] ?? {};
    const stats = numerical(id, n);
    if (stats.masteryCount) {
      const eligible = require("../blueprints/equipment").items.filter(w =>
        w.kind === "weapon" && !w.baseWeaponId && w.mastery && (id !== "reaver" || w.type === "melee") && (weapons.includes(w.category) ||
          weapons.includes(w.id) || (weapons.includes("martial:finesse-or-light") &&
            w.category === "martial" && w.properties.some(p => ["finesse", "light"].includes(p.id))))
      ).map(w => w.id);
      if ((previous.mastery?.length ?? 0) !== stats.masteryCount)
        previous.mastery = request("mastery", stats.masteryCount, eligible, [], false);
    }
    if (id === "doctor" && n === 1) {
      const order = single("divineOrder", ["protector", "thaumaturge"]);
      if (order === "protector") {
        weapons.push("martial");
        armor.push("heavy");
      }
      previous.divineOrder = order;
    }
    if (
      (id === "gunslinger" && n === 1) ||
      (["warden", "navigator"].includes(id) && n === 2) ||
      (paths[id] === "deadeye" && n === 7)
    ) {
      const style = single(
        "style",
        [
          "archery",
          "defense",
          "great-weapon-fighting",
          "two-weapon-fighting",
          ...(['warden','navigator'].includes(id) ? ['cantrip-style'] : []),
        ].filter((s) => !styles.includes(s))
      );
      if (style) styles.push(style);
      if (style === 'cantrip-style') {
        const list=id==='warden'?'doctor':'druid';
        previous.styleCantrips=request('styleCantrips',2,rules.spells.filter(s=>s.level===0&&s.callings.includes(list)).map(s=>s.id));
      }
    }
    if (n === 3) {
      const pathId = single(
        "pathId",
        rules.paths
          .filter((p) => p.callingId === id && p.status === "available")
          .map((p) => p.id)
      );
      if (pathId) paths[id] = pathId;
    }
    if (paths[id] === "gray-net" && n === 3)
      previous.hunterPrey = single("hunterPrey", ["colossus-slayer", "horde-breaker"]);
    if (paths[id] === "gray-net" && n === 7)
      previous.defensiveTactics = single("defensiveTactics", ["escape-the-horde", "multiattack-defense"]);
    if (paths[id] === "omen-diver" && n === 6)
      previous.element = single("element", ["acid", "cold", "fire", "lightning", "poison"]);
    const selectedPath = rules.paths.find(p => p.id === paths[id]);
    const pathChoice = selectedPath?.choices?.[n];
    if (pathChoice) previous[pathChoice.key] = single(pathChoice.key, pathChoice.options);
    if (selectedPath?.design && n === 3) {
      const discipline = previous.pathDiscipline;
      const grants = {
        'black-flag-envoy': discipline === 'intimidation' ? 'intimidation' : 'persuasion',
        'hollow-lantern': discipline === 'watcher' ? 'perception' : 'investigation',
        'brass-outrider': discipline === 'rider' ? 'animal-handling' : 'athletics',
        'memory-echo': discipline === 'voice' ? 'deception' : 'insight',
      };
      if (grants[selectedPath.id]) {
        const skill = grants[selectedPath.id];
        if (trained.includes(skill)) expertise.push(skill); else trained.push(skill);
      }
      const tool = { 'starwake-pilot': 'navigators-tools', 'cinder-artillerist': 'smiths-tools',
        'plaguewarden': 'herbalism-kit', 'sparkwrite-aetherist': 'tinkers-tools' }[selectedPath.id];
      if (tool && selectedPath.id !== 'cinder-artillerist') tools.push(tool);
    }
    if (paths[id] === 'cinder-artillerist' && n === 7) tools.push('smiths-tools');
    if (paths[id] === "storm-broker" && n === 7)
      previous.stormResistance = single("stormResistance", ["lightning", "thunder"]);
    if (paths[id] === "drydock-ghost" && n === 3)
      tools.push("thieves-tools", "carpenters-tools");
    if (paths[id] === "storm-broker" && n === 3) tools.push("navigators-tools");
    if (paths[id] === "breakwater" && n === 3)
      tools.push("masons-tools", "carpenters-tools");
    if (paths[id] === "field-surgeon" && n === 3) {
      previous.clinicalAttribute = single("clinicalAttribute", ["wit", "instinct"]);
      tools.push("healers-kit", "herbalism-kit");
      if (trained.includes("medicine")) expertise.push("medicine");
      else trained.push("medicine");
    }
    if (id === "doctor" && n === 7)
      previous.blessedStrikes = single("blessedStrikes", ["divine-strike", "potent-spellcasting"]);
    if (id === "tidecaller" && [2, 10, 17].includes(n)) {
      const options = [
        "careful-spell",
        "distant-spell",
        "empowered-spell",
        "extended-spell",
        "heightened-spell",
        "quickened-spell",
        "seeking-spell",
        "subtle-spell",
        "transmuted-spell",
        "twinned-spell",
      ];
      previous.metamagic = [
        ...(previous.metamagic ?? []),
        ...request("metamagic", 2, options, previous.metamagic ?? []),
      ];
    }
    if (id==='tidecaller' && n>2 && choice.metamagicReplacement!==undefined) {
      used.add('metamagicReplacement');
      const replacement=choice.metamagicReplacement;
      object(replacement,['from','to']);
      if(!previous.metamagic.includes(replacement.from)||previous.metamagic.includes(replacement.to)||!require('./metamagic').options.some(o=>o.id===replacement.to))fail('Invalid Metamagic replacement');
      previous.metamagic=previous.metamagic.map(id=>id===replacement.from?replacement.to:id);
    }
    if(n>2&&choice.styleCantripReplacement!==undefined){
      used.add('styleCantripReplacement');
      const replacement=choice.styleCantripReplacement;object(replacement,['from','to']);
      const list=id==='navigator'?'druid':id==='warden'?'doctor':null;
      if(!list||!previous.styleCantrips?.includes(replacement.from)||previous.styleCantrips.includes(replacement.to)||!rules.spells.some(s=>s.id===replacement.to&&s.level===0&&s.callings.includes(list)))fail('Invalid cantrip-style replacement');
      previous.styleCantrips=previous.styleCantrips.map(id=>id===replacement.from?replacement.to:id);
    }
    if(n>1&&choice.initiateReplacements!==undefined){
      used.add('initiateReplacements');
      const changes=choice.initiateReplacements;
      if(!Array.isArray(changes)||changes.length>3||new Set(changes.map(c=>c?.grantKey)).size!==changes.length)fail('Replace at most one spell per Magic Initiate grant per level');
      for(const replacement of changes){
        object(replacement,['grantKey','from','to']);
        const source=replacement.grantKey==='background'?initiate:previous.initiates?.find(s=>s.grantKey===replacement.grantKey);
        const old=rules.spells.find(s=>s.id===replacement.from),next=rules.spells.find(s=>s.id===replacement.to);
        if(!source||!old||!next||old.level!==next.level||!next.callings.includes(source.list)||![...source.cantrips,source.spell].includes(old.id)||[...source.cantrips,source.spell].includes(next.id))fail('Invalid Magic Initiate replacement');
        if(old.level===0)source.cantrips=source.cantrips.map(id=>id===old.id?next.id:id);else source.spell=next.id;
      }
    }
    const row = progression(id)[n - 1];
    if (row.featChoice) {
      used.add("feat");
      used.add("increases");
      if (choice.feat === undefined)
        requiredChoices.push({
          id: `${id}:${n}:feat`,
          callingId: id,
          callingLevel: n,
          key: "feat",
          count: 1,
          options: rules.feats
            .filter(
              (f) =>
                f.id === "ability-score-improvement" ||
                (f.category !== 'fighting-style' && total >= f.minimumLevel &&
                  (f.repeatable || !selectedFeats.includes(f.id)))
            )
            .map((f) => f.id),
        });
      else {
        const feat = rules.feats.find((f) => f.id === choice.feat);
        if (
          !feat ||
          feat.category === 'fighting-style' ||
          total < feat.minimumLevel ||
          (!feat.repeatable && selectedFeats.includes(feat.id))
        )
          fail("Unsupported or ineligible feat");
        if (feat.id === 'grappler' && scores.might < 13 && scores.agility < 13 ||
            feat.prerequisite === 'spellcasting' && !c.caster ||
            feat.prerequisite === 'firearm' && !weapons.includes('martial') ||
            feat.prerequisite === 'shield' && !armor.includes('shield') ||
            feat.prerequisite === 'medicine' && !trained.includes('medicine')) fail('Feat prerequisite not met');
        if (
          feat.id === "boon-of-spell-recall" &&
          !Object.keys(levels).some((k) => callings[k].caster)
        )
          fail("Spellcasting required");
        object(choice.increases ?? {}, attributeIds);
        const entries = Object.entries(choice.increases ?? {});
        const asi = feat.id === "ability-score-improvement";
        if (
          asi
            ? !(
                (entries.length === 1 && entries[0][1] === 2) ||
                (entries.length === 2 && entries.every(([, v]) => v === 1))
              )
            : feat.category === 'origin' ? entries.length !== 0 : !(entries.length === 1 && entries[0][1] === 1)
        )
          fail("Invalid feat attribute increase");
        for (const [key, value] of entries) {
          if (
            feat.id === "boon-of-irresistible-offense" &&
            !["might", "agility"].includes(key)
          )
            fail("Invalid feat attribute");
          if (
            feat.id === "boon-of-spell-recall" &&
            !["wit", "instinct", "spirit"].includes(key)
          )
            fail("Invalid feat attribute");
          if (feat.attributeOptions && !feat.attributeOptions.includes(key)) fail('Invalid feat attribute');
          if (feat.id === 'grappler' && !['might','agility'].includes(key)) fail('Invalid Grappler attribute');
          if (scores[key] + value > (feat.category === 'epic-boon' ? 30 : 20))
            fail("Attribute maximum exceeded");
          scores[key] += value;
        }
        selectedFeats.push(feat.id);
        if (feat.id === 'skilled') {
          const options=[...catalog.skills.filter(s=>!trained.includes(s.id)).map(s=>'skill:'+s.id),...require('./creation').tools.filter(t=>!tools.includes(t)).map(t=>'tool:'+t)];
          for (const permission of request('featTraining',3,options)) { const[kind,id]=permission.split(':');(kind==='skill'?trained:tools).push(id); }
        }
        if (feat.id === 'seasoned-voyager') tools.push(tools.includes('navigators-tools') ? single('featTools',require('./creation').tools.filter(t=>!tools.includes(t))) : 'navigators-tools');
        if (feat.id === 'magic-initiate') {
          const list=single('initiateList',['doctor','druid','shipwright']);
          if (initiate?.list===list || previous.initiates?.some(s=>s.list===list)) fail('Magic Initiate repeats require a different list');
          const attribute=single('initiateAttribute',['wit','instinct','spirit']);
          const cantrips=request('initiateCantrips',2,rules.spells.filter(s=>s.level===0&&s.callings.includes(list)).map(s=>s.id));
          const spell=single('initiateSpell',rules.spells.filter(s=>s.level===1&&s.callings.includes(list)).map(s=>s.id));
          previous.initiates=[...(previous.initiates??[]),{list,attribute,cantrips,spell,grantKey:`${id}:${n}:feat`}];
        }
      }
    }
    if (id === "reaver" && n === 20) {
      scores.might = Math.min(25, scores.might + 4);
      scores.resolve = Math.min(25, scores.resolve + 4);
    }
    if (id === "corsair" && n === 15) saves.push("instinct", "spirit");
    const spell = spellcasting(id, n, scores);
    if (spell) {
      if (id === "doctor" && previous.clinicalAttribute) {
        spell.attribute = previous.clinicalAttribute;
        spell.modifier = mod(scores[spell.attribute]);
        spell.saveDC = 8 + spell.modifier;
        spell.attackModifier = spell.modifier;
      }
      const maxSpellLevel = spell.slots.length;
      const classSpells = rules.spells.filter((s) => s.callings.includes(id));
      const extraCantrip = previous.divineOrder === "thaumaturge" ? 1 : 0;
      const count = spell.cantripCount + extraCantrip;
      const oldCantrips=previous.cantrips??[];
      if (count !== oldCantrips.length || choice.cantrips!==undefined && id!=='shipwright') {
        previous.cantrips = request(
          "cantrips",
          count,
          classSpells.filter((s) => s.level === 0).map((s) => s.id),
          [],
          false
        );
        if(previous.cantrips.length&&previous.cantrips.filter(id=>!oldCantrips.includes(id)).length>count-oldCantrips.length+(n>1&&id!=='shipwright'?1:0))fail('Only one existing cantrip can be replaced per Calling level');
      }
      if (id === "shipwright") {
        const newSpells = request(
          "folio",
          n === 1 ? 6 : 2,
          classSpells
            .filter((s) => s.level > 0 && s.level <= maxSpellLevel)
            .map((s) => s.id),
          previous.folio ?? []
        );
        previous.folio = [...(previous.folio ?? []), ...newSpells];
        if (
          paths[id] === "powder-saint" &&
          (n === 3 ||
            maxSpellLevel >
              (spellcasting(id, n - 1, scores)?.slots.length ?? 0))
        ) {
          previous.folio.push(
            ...request(
              "savant",
              n === 3 ? 2 : 1,
              classSpells
                .filter(
                  (s) =>
                    s.school === "evocation" &&
                    s.level > 0 &&
                    s.level <= maxSpellLevel
                )
                .map((s) => s.id),
              previous.folio
            )
          );
        }
      }
      const grantFolio=savedFolio===undefined?previous.folio:unique([...savedFolio,...(choice.folio??[])]);
      if (id === "shipwright" && n === 18) {
        const mastery = request(
          "spellMastery",
          2,
          grantFolio.filter(id=>spellGrantEligible(rules.spells.find(s=>s.id===id),n)),
          [],
          false
        );
        if (
          mastery.length &&
          new Set(
            mastery.map((s) => rules.spells.find((v) => v.id === s).level)
          ).size !== 2
        )
          fail(
            "Spell Mastery requires one level 1 and one level 2 Action spell"
          );
        previous.spellMastery = mastery;
      }
      if (id === "shipwright" && n === 20)
        previous.signatureSpells = request(
          "signatureSpells",
          2,
          grantFolio.filter(id=>spellGrantEligible(rules.spells.find(s=>s.id===id),n)),
          [],
          false
        );
      const pathDefinition=rules.paths.find(p=>p.id===paths[id]);
      const alwaysPrepared=unique([
        ...Object.entries(pathDefinition?.spellsByCallingLevel??{}).filter(([level])=>+level<=n).flatMap(([,names])=>names.map(slug)),
        ...(previous.spellMastery??[]),...(previous.signatureSpells??[]),
        ...(id==='navigator'?['hunter-s-mark']:[]),
        ...(id==='warden'&&n>=2?['divine-smite']:[]),...(id==='warden'&&n>=5?['find-steed']:[]),
      ]);
      if (spell.preparedCount !== (previous.prepared?.length ?? 0) || choice.prepared !== undefined || previous.prepared?.some(s=>alwaysPrepared.includes(s))) {
        const available =
          id === "shipwright"
            ? previous.folio
            : classSpells
                .filter((s) => s.level > 0 && s.level <= maxSpellLevel)
                .map((s) => s.id);
        const nextPrepared = request(
          "prepared",
          spell.preparedCount,
          available.filter(s=>!alwaysPrepared.includes(s)),
          [],
          false
        );
        if (id === "tidecaller" && previous.prepared && nextPrepared.length &&
            nextPrepared.filter(s => !previous.prepared.includes(s)).length >
              Math.max(0, spell.preparedCount - previous.prepared.filter(s=>!alwaysPrepared.includes(s)).length) + 1)
          fail("Only one previously prepared Tidecaller spell can be replaced per Calling level");
        previous.prepared = nextPrepared;
      }
      casting[id] = {
        ...spell,
        cantrips: unique([...(previous.cantrips ?? []),...(previous.styleCantrips ?? [])]),
        prepared: previous.prepared ?? [],
        folio: previous.folio ?? [],
        spellMastery: previous.spellMastery ?? [],
        signatureSpells: previous.signatureSpells ?? [],
      };
    }
    if (event.healthRoll !== undefined && initial)
      fail("First character level uses maximum Hit Die");
    healthDice.push(
      initial
        ? c.hitDie
        : event.healthRoll === undefined
        ? c.hitDie / 2 + 1
        : integer(event.healthRoll, 1, c.hitDie, "Health roll")
    );
    for (const key of Object.keys(choice))
      if (!used.has(key))
        fail("Choice unavailable at this Calling level: " + key);
    choicesByCalling[id] = previous;
    previousComplete = requiredChoices.length === before;
  }
  const totalLevel = ledger.levels.length,
    trainingBonus = 2 + Math.floor((totalLevel - 1) / 4);
  let healthMax = healthDice.reduce(
    (sum, die) => sum + Math.max(1, die + mod(scores.resolve)),
    0
  );
  if (paths.tidecaller === "omen-diver") healthMax += levels.tidecaller;
  const features = rules.features.filter((f) =>
    f.ownerType === "calling"
      ? f.callingLevel <= (levels[f.ownerId] ?? 0)
      : Object.values(paths).includes(f.ownerId) &&
        f.callingLevel <=
          (levels[rules.paths.find((p) => p.id === f.ownerId).callingId] ?? 0)
  );
  const pathSpells = {};
  for (const [id, pathId] of Object.entries(paths)) {
    const path = rules.paths.find((p) => p.id === pathId);
    pathSpells[id] = Object.entries(path.spellsByCallingLevel)
      .filter(([n]) => +n <= levels[id])
      .flatMap(([, names]) => names.map(slug));
  }
  for (const id of Object.keys(casting)) {
    const s = casting[id];
    // A different Calling's later Attribute Improvement can change this caster.
    s.modifier = mod(scores[s.attribute]);
    s.attackModifier = s.modifier + trainingBonus;
    s.saveDC = 8 + s.modifier + trainingBonus;
    s.alwaysPrepared = unique([
      ...(pathSpells[id] ?? []),
      ...s.spellMastery,
      ...s.signatureSpells,
      ...(id === "navigator" ? ["hunter-s-mark"] : []),
      ...(id === "warden" && levels[id] >= 2 ? ["divine-smite"] : []),
      ...(id === "warden" && levels[id] >= 5 ? ["find-steed"] : []),
    ]);
  }
  const casterEntries = Object.entries(levels).filter(
    ([id]) => callings[id].caster
  );
  const slots = casterEntries.length ? casting[casterEntries[0][0]].slots : [];
  const pools = resourcePools(levels, scores, paths);
  const initiates = [...(initiate?.spell ? [{...initiate,grantKey:'background'}] : []),...Object.values(choicesByCalling).flatMap(c=>c.initiates??[])];
  for (const source of initiates) {
    const key=`feat:magic-initiate:${source.list}`;
    pools[key]={id:key,max:1,recovery:{longRest:'all',shortRest:0}};
  }
  if (selectedFeats.includes('boon-of-fate')) pools['feat:boon-of-fate'] = { id: 'feat:boon-of-fate', max: 1, recovery: { longRest: 'all', shortRest: 'all' } };
  for (const spellId of choicesByCalling.shipwright?.signatureSpells ?? [])
    pools[`shipwright:signature:${spellId}`] = { id: `shipwright:signature:${spellId}`, max: 1,
      recovery: { longRest: "all", shortRest: "all" } };
  const hitDice = {};
  for (const [id, n] of Object.entries(levels))
    hitDice["d" + callings[id].hitDie] =
      (hitDice["d" + callings[id].hitDie] ?? 0) + n;
  const mechanics = {};
  for (const [id, n] of Object.entries(levels))
    mechanics[id] = numerical(id, n);
  const unresolved = [
    "complete-ability-clause-operation-parity",
    "all-equipment-ammunition-preset-and-purchase-workflows",
    "remaining-feat-and-spell-replacement-workflows",
    "cross-character-treatment-and-effect-transactions",
    "browser-acceptance-and-complete-behavioral-matrix",
  ];
  const auraOfProtection = (levels.warden ?? 0) >= 6 ? Math.max(1, mod(scores.spirit)) : 0;
  const attributeModifiers = Object.fromEntries(attributeIds.map(id => [id, mod(scores[id])]));
  return {
    ruleset: ledger.ruleset,
    creation: ledger.creation ?? null,
    background: background ? { id: background.id, name: background.name } : null,
    originId: ledger.creation?.originId ?? null,
    featSpellcasting: initiate ? { ...initiate,
      modifier: mod(scores[initiate.attribute] ?? 10),
      saveDC: 8 + trainingBonus + mod(scores[initiate.attribute] ?? 10),
      attackModifier: trainingBonus + mod(scores[initiate.attribute] ?? 10) } : null,
    featSpellcasters: initiates.map(s=>({...s,modifier:mod(scores[s.attribute]),saveDC:8+trainingBonus+mod(scores[s.attribute]),attackModifier:trainingBonus+mod(scores[s.attribute]),poolId:`feat:magic-initiate:${s.list}`})),
    totalLevel,
    callingLevels: { ...levels },
    paths,
    attributes: scores,
    attributeModifiers,
    savingThrowModifiers: Object.fromEntries(attributeIds.map(id => [id,
      mod(scores[id]) + (saves.includes(id) ? trainingBonus : 0) + auraOfProtection])),
    auraOfProtection,
    skillModifiers: Object.fromEntries(catalog.skills.map(skill => [skill.id,
      mod(scores[skill.attribute]) + (expertise.includes(skill.id) ? 2 * trainingBonus :
        trained.includes(skill.id) ? trainingBonus : 0) +
        (choicesByCalling.doctor?.divineOrder === "thaumaturge" &&
          ["arcana", "religion"].includes(skill.id) ? Math.max(1, mod(scores[choicesByCalling.doctor?.clinicalAttribute ?? 'instinct'])) : 0)])),
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
    health: { max: healthMax },
    hitDice,
    spellcasting: casting,
    spellSlots: [...slots],
    resources: pools,
    mechanics,
    attacksPerAction: Math.max(
      ...Object.values(mechanics).map((m) => m.attacksPerAction)
    ),
    features,
    feats: selectedFeats,
    fightingStyles: styles,
    pathSelections: structuredClone(choicesByCalling),
    toolExpertise: paths.shipwright === "drydock-ghost" && levels.shipwright >= 6
      ? ["thieves-tools", "carpenters-tools"] : [],
    resistances: unique([
      ...(choicesByCalling.navigator?.stormResistance ? [choicesByCalling.navigator.stormResistance] : []),
      ...(choicesByCalling.tidecaller?.element ? [choicesByCalling.tidecaller.element] : []),
      ...Object.entries(paths).flatMap(([id, pathId]) => {
        const design = rules.paths.find(p => p.id === pathId)?.design;
        const chosen = choicesByCalling[id]?.pathDiscipline;
        return [...(design?.resistances ?? []).filter(([n]) => levels[id] >= n).map(([, type]) => type),
          ...(pathId === 'tempest-heart' || (pathId === 'thunderhide' && levels[id] >= 6) ? [chosen] : [])].filter(Boolean);
      }),
    ]),
    initiative: { modifier: mod(scores.agility) + (selectedFeats.includes('alert') ? trainingBonus : 0), advantage: (levels.reaver ?? 0) >= 7 || paths.gunslinger === 'deadeye' },
    movement: { walk: 30 + (selectedFeats.includes('seasoned-voyager')?5:0) + ((levels.reaver ?? 0) >= 5 ? 10 : 0) + ((levels.navigator ?? 0) >= 6 ? 10 : 0) +
      Object.entries(paths).reduce((sum, [id, pathId]) => sum + (rules.paths.find(p => p.id === pathId)?.design?.speed ?? [])
        .filter(([n]) => levels[id] >= n).reduce((v, [, amount]) => v + amount, 0), 0),
      climb: paths.corsair === 'reef-knife' || (levels.navigator ?? 0) >= 6 ? 'walk' : 0,
      swim: (levels.navigator ?? 0) >= 6 ? 'walk' : 0,
      fly: paths.tidecaller === 'tempest-heart' && levels.tidecaller >= 14 ? 30 : 0,
      heavyArmorRemovesCallingSpeedBonuses: true },
    featureActions: features.filter(f => f.action).map(f => ({ featureId: f.id, name: f.name, ...f.action })),
    abilityOptions: require('./abilityOperations').list({features,callingLevels:levels,pathSelections:choicesByCalling,attributeModifiers,spellcasting:casting,trainingBonus,paths}),
    weaponMastery: unique(Object.values(choicesByCalling).flatMap(c => c.mastery ?? [])),
    requiredChoices,
    decisionsComplete: requiredChoices.length === 0,
    tabletopReady: false,
    buildStatus: "phase2-in-progress-not-accepted",
    unresolvedSystems: unresolved,
  };
}
function resourcePools(levels, scores, paths) {
  const pools = {};
  const add = (id, key, max, shortRest = 0) => {
    if (max > 0)
      pools[`${id}:${key}`] = {
        id: `${id}:${key}`,
        max,
        recovery: { longRest: "all", shortRest },
      };
  };
  for (const [id, n] of Object.entries(levels)) {
    const v = numerical(id, n);
    if (id === "gunslinger") {
      add(id, "second-wind", v.secondWindUses, 1);
      add(id, "action-surge", v.actionSurgeUses, "all");
      add(id, "indomitable", v.indomitableUses);
    }
    if (id === "reaver") {
      add(id, "rage", v.rageUses, 1);
      if (n >= 15) add(id, 'persistent-reserve', 1);
    }
    if (id === "navigator") {
      add(id, "favored-enemy", v.favoredEnemyUses);
      if (n >= 10) add(id, "tireless", Math.max(1, mod(scores.instinct)));
      if (n >= 14) add(id, "natures-veil", Math.max(1, mod(scores.instinct)));
    }
    if (id === "tidecaller") {
      add(id, "sorcery-points", v.sorceryPoints);
      if (n >= 5) add(id, "restoration", 1);
      add(id, "innate-sorcery", 2);
      if (paths[id] === "omen-diver" && n >= 14) add('omen-diver', "wings", 1);
      if (paths[id] === "omen-diver" && n >= 18) add('omen-diver', "companion", 1);
    }
    if (id === "warden") {
      add(id, "lay-on-hands", v.layOnHands);
      add(id, "channel-divinity", v.channelDivinityUses, 1);
      if (n >= 2) add(id, "smite-free", 1);
      if (n >= 5) add(id, "steed-free", 1);
      if (paths[id] === "leviathan-anchor" && n === 20)
        add('leviathan-anchor', "nimbus", 1);
    }
    if (id === "doctor") {
      add(id, "channel-divinity", v.channelDivinityUses, 1);
      if (n >= 10) add(id, "intervention", 1);
      if (n === 20)
        pools["doctor:intervention"].recovery.longRest =
          "after-Wish-cooldown";
    }
    if (id === "shipwright") add(id, "arcane-recovery", 1);
    if (paths[id] === "drydock-ghost") {
      add('drydock-ghost', "ghost-work", 2 + Math.floor((n - 3) / 4), 1);
      if (n >= 6) add('drydock-ghost', "salvage", 1);
    }
    if (paths[id] === "storm-broker") {
      add('storm-broker', "squall", 2 + Math.floor((n - 3) / 4), 1);
      if (n >= 15) add('storm-broker', "eye-reserve", 1);
    }
    if (paths[id] === "field-surgeon") {
      add('field-surgeon', "triage", 2 + Math.floor((n - 3) / 4), 1);
      if (n >= 17) add('field-surgeon', "operation", 1);
    }
    if (paths[id] === "breakwater") {
      add('breakwater', "bastion", 2 + Math.floor((n - 3) / 4), 1);
      if (n >= 14) add('breakwater', "hold-sea", 1);
    }
    if (id === "corsair" && n === 20) add(id, "stroke-of-luck", 1, "all");
    if (paths[id] === "bloodwake" && n >= 14)
      add('bloodwake', "presence", 1);
    const path = rules.paths.find(p => p.id === paths[id]);
    for (const [key, spec] of Object.entries(path?.pools ?? {}))
      if (n >= (spec.level ?? 3)) add(path.id, key, spec.max, spec.short ?? 0);
  }
  return pools;
}
function advance(ledger, operation, folioAtSpellGrant) {
  object(operation, ["expectedRevision", "callingId", "choices", "healthRoll"]);
  if (operation.expectedRevision !== ledger.revision)
    fail("Progression changed; reload before advancing");
  const current = replay(ledger);
  if (!current.decisionsComplete) fail("Complete current level choices first");
  const next = structuredClone(ledger);
  next.revision++;
  const { expectedRevision, ...event } = operation;
  void expectedRevision;
  next.levels.push(folioAtSpellGrant===undefined?event:{...event,folioAtSpellGrant});
  const summary = replay(next);
  if (!summary.decisionsComplete)
    fail(
      "Complete required choices: " +
        summary.requiredChoices.map((r) => r.id).join(", ")
    );
  return { ledger: next, summary };
}
module.exports = { create, replay, advance, resourcePools, spellGrantEligible };

module.exports = {
  callings: [
    {
      id: "corsair",
      name: "Corsair",
      focus: "Frontline duelist",
      primaryStats: ["Might", "Agility"],
      passive: "Sea Legs",
      passiveRule:
        "The first time each scene you would be shoved, knocked prone, or lose footing, ignore it. Until the end of your next turn, gain advantage on balance, climb, and shipboard movement checks.",
      starterAbility: "Rushing Cut",
      starterAbilityType: "Action",
      starterAbilityRule:
        "Move up to 1 zone, then make a melee attack. If you moved before the attack, gain advantage on the strike and deal +2 damage on a hit.",
      description: "Aggressive melee fighter who thrives in direct, chaotic combat.",
    },
    {
      id: "gunslinger",
      name: "Gunslinger",
      focus: "Precision ranged damage",
      primaryStats: ["Agility", "Wit"],
      passive: "Deadeye",
      passiveRule:
        "Your ranged attacks ignore the first source of cover. Once each turn, if you did not move before making a ranged attack, gain advantage on that attack and deal +1 damage on a hit.",
      starterAbility: "Marked Shot",
      starterAbilityType: "Action",
      starterAbilityRule:
        "Choose a visible target. Your next ranged attack against it before the end of your next turn gains advantage, ignores cover, and deals +2 damage on a hit.",
      description: "Controlled and tactical, built around positioning and burst damage.",
    },
    {
      id: "navigator",
      name: "Navigator",
      focus: "Support and battlefield control",
      primaryStats: ["Wit", "Instinct"],
      passive: "Read the Tides",
      passiveRule:
        "Once each round after initiative is revealed, move yourself or one ally in sight up or down 1 place in the turn order. That character gains advantage on its next awareness or positioning check this round.",
      starterAbility: "Shift the Flow",
      starterAbilityType: "Action",
      starterAbilityRule:
        "Move one ally 1 zone or slide one enemy 1 zone. The moved ally, or an ally adjacent to the moved enemy, gains advantage on its next attack or maneuver before your next turn.",
      description: "Supports allies, manipulates tempo, and reads the battle before it breaks.",
    },
    {
      id: "tidecaller",
      name: "Tidecaller",
      focus: "Magic with risk",
      primaryStats: ["Spirit", "Resolve"],
      passive: "Surge",
      passiveRule:
        "When you use an Arcane ability, you may Surge it for advantage on the roll or +2 effect. If you do, suffer 1 strain after it resolves.",
      starterAbility: "Tidal Burst",
      starterAbilityType: "Action",
      starterAbilityRule:
        "Unleash a wave at a target or small group in sight. Make a Spirit attack with advantage. On a hit, deal 2 damage and push targets 1 zone. If Surged, push 2 zones instead.",
      description: "Channels unstable sea-born power that can amplify or punish the caster.",
    },
    {
      id: "warden",
      name: "Warden",
      focus: "Protection and durability",
      primaryStats: ["Might", "Resolve"],
      passive: "Hold the Line",
      passiveRule:
        "Adjacent allies gain +1 Guard while you are standing and not Staggered. The first time each round an adjacent ally resists forced movement, it does so with advantage.",
      starterAbility: "Intercept",
      starterAbilityType: "Reaction",
      starterAbilityRule:
        "When an adjacent ally is hit, become the target instead. Gain +2 Guard against that hit, and if the attack still misses you may make the attacker suffer disadvantage on its next attack before the end of its turn.",
      description: "Anchors the party, absorbs punishment, and protects weaker allies.",
    },
    {
      id: "reaver",
      name: "Reaver",
      focus: "High risk damage",
      primaryStats: ["Might", "Instinct"],
      passive: "Bloodrush",
      passiveRule:
        "While you are below half Vitality, your melee attacks deal +2 damage and you gain advantage on checks to intimidate, chase, or force your way through an enemy.",
      starterAbility: "Savage Strike",
      starterAbilityType: "Action",
      starterAbilityRule:
        "Make a brutal melee attack with advantage. On a hit, deal +3 damage. After it resolves, suffer 1 damage or take disadvantage on Guard checks until your next turn.",
      description: "Violent and relentless, growing more dangerous as the fight turns bloody.",
    },
  ],
  originPaths: [
    {
      id: "yuma",
      name: "Yuma",
      description: "Industrial order, iron discipline, and engineered precision from the western empire.",
      summary: "A steampunk republic of iron lungs, sparking towers, and disciplined fleets.",
      selectedBio:
        "To the West, the Republic of Yuma answers fear with engines. After a devastating magical tragedy, the republic outlawed arcane practice and turned instead to iron, powder, and disciplined invention. Its Sparkwrights build wonders and weapons in the same breath, and with the Pirate King gone, Yuma sees the Archipelago not as a border, but as unfinished business.",
    },
    {
      id: "lilin",
      name: "Lilin",
      description: "Arcane power, ritual lineage, and spirits from the eastern empire.",
      summary: "An eastern power of whispered rites, storm-shaping arcanists, and ancient magic.",
      selectedBio:
        "To the East, Lilin still trusts in old power. Its arcanists speak with spirits older than sand and shape sea and storm through ritual rather than steel. Where Yuma builds engines, Lilin cultivates lineage, omen, and command of the unseen. Now that the Pirate King no longer bars the passage, Lilin turns its gaze back toward the islands with spells sharpened for war.",
    },
    {
      id: "archipelago",
      name: "The Archipelago",
      description: "Freedom, chaos, and survival on the fractured islands between empires.",
      summary:
        "The fractured middle sea where empires stall, pirates rise, and every island carries its own law.",
      selectedBio:
        "Between Yuma and Lilin lies the Sanguine Archipelago, a scatter of jagged islands and haunted waters once held together by the Pirate King alone. He kept both empires from claiming the Vale. Now he is dead, his throne sits empty, old grudges rise from the deep, and every captain, warlord, duchy, and hidden power feels the pull of the vacuum he left behind. Choosing the Archipelago means stepping into that uncertainty and choosing which island history shaped you.",
    },
  ],
  origins: [
    {
      id: "yuma-core",
      path: "yuma",
      name: "Yuma",
      bonus: "+1 Wit",
      passive: "Engineered Precision",
      passiveRule:
        "Once each scene, gain advantage on one Wit-based check, or reduce the reload/cooldown of a gadget or firearm ability by 1 round.",
      drawback: "Rigid Thinking",
      drawbackRule:
        "The first improvised, unplanned action you take each scene is made with disadvantage unless an ally has already created an opening for you.",
      recommendedCallings: ["gunslinger", "navigator", "warden"],
      summary: "Raised in structure, industry, and firearms doctrine.",
      lore: "You were shaped by foundries, fleets, and systems that reward planning over improvisation.",
    },
    {
      id: "lilin-core",
      path: "lilin",
      name: "Lilin",
      bonus: "+1 Spirit",
      passive: "Arcane Affinity",
      passiveRule:
        "The first Arcane ability you use each scene gains advantage or +1 effect without costing Surge strain.",
      drawback: "Unstable Power",
      drawbackRule:
        "Whenever you fail an Arcane check by 5 or more, or roll a natural failure, suffer 1 strain.",
      recommendedCallings: ["tidecaller", "navigator"],
      summary: "Raised in ritual, spirits, and dangerous magical inheritance.",
      lore: "You come from an empire of whispered rites where power is expected, but backlash is never far behind.",
    },
    {
      id: "yayimi",
      path: "archipelago",
      name: "Yayimi",
      identityTag: "Occupied Spark",
      identityTagDetail:
        "Yayimi lives under Yuma pressure, where rebellion, bunkers, and propaganda make every loyalist and every dissenter matter.",
      bonus: "+1 Resolve",
      passive: "Unbroken",
      passiveRule:
        "The first time each scene you would be reduced to 0 Vitality, remain at 1 instead. Until your next turn, gain advantage on Resolve checks and +2 Focus.",
      drawback: "Marked by Authority",
      drawbackRule:
        "Imperial officers, checkpoints, and bounty hunters identify you quickly. Your first social check against authority each scene is made with disadvantage.",
      recommendedCallings: ["corsair", "warden", "reaver"],
      summary: "Occupied foothold of rebellion, bunkers, and simmering rage.",
      lore: "Yayimi lives under Yuma pressure. Resistance, propaganda, and survival define the island.",
    },
    {
      id: "klechi",
      path: "archipelago",
      name: "Klechi",
      identityTag: "Master Dock",
      identityTagDetail:
        "Klechi is the island of shipwright dynasties, drydock intrigue, and the builders who keep fleets alive and war profitable.",
      bonus: "+1 Wit",
      passive: "Tinkerer's Edge",
      passiveRule:
        "During a short rest, tune one weapon, relic, or tool. The next allied use of it gains advantage or +1 effect, your choice.",
      drawback: "Overreliance",
      drawbackRule:
        "When your gear is broken, lost, or suppressed, the first related check each scene is made with disadvantage.",
      recommendedCallings: ["gunslinger", "navigator"],
      summary: "Shipwright culture built on craft, repair, and clever invention.",
      lore: "Klechi is famous for builders, upgrades, and the kind of minds that can keep a fleet alive.",
    },
    {
      id: "tetlanco",
      path: "archipelago",
      name: "Grand Duchy of Tetlanco",
      identityTag: "Rose Court",
      identityTagDetail:
        "Tetlanco wears polished nobility on the surface, but beneath it sits succession panic, poisoned etiquette, and hungry ambition.",
      bonus: "+1 Wit",
      passive: "Silver Tongue",
      passiveRule:
        "Once each scene, when you fail a social check, reroll it with advantage. On a success, the GM introduces a complication.",
      drawback: "Web of Lies",
      drawbackRule:
        "When you contradict an established lie, your next social check is made with disadvantage until you repair the story.",
      recommendedCallings: ["navigator", "gunslinger"],
      summary: "New monarchs, court intrigue, and fragile legitimacy after the Pirate King.",
      lore: "Tetlanco looks orderly from the outside, but succession, treason, and noble ambition rot beneath the surface.",
    },
    {
      id: "harshanum",
      path: "archipelago",
      name: "Harshanum",
      identityTag: "Storm Crag",
      identityTagDetail:
        "Harshanum is a brutal pirate stronghold of volcanic stone, war camps, and trials that only respect the ruthless.",
      bonus: "+1 Might",
      passive: "Arena Blood",
      passiveRule:
        "When you drop an enemy or win a duel, your next attack this scene gains advantage and +1 damage.",
      drawback: "Glory Bound",
      drawbackRule:
        "Backing down from a direct challenge costs 1 Focus, and your next morale or presence check is made with disadvantage.",
      recommendedCallings: ["reaver", "corsair"],
      summary: "Jagged rocks, pirate war camps, and brutal survival.",
      lore: "Harshanum rewards the ruthless. Arena combat, storms, and volcanic terrain make weakness expensive.",
    },
    {
      id: "khiz",
      path: "archipelago",
      name: "Khiz",
      identityTag: "Waterbound",
      identityTagDetail:
        "Khiz is ruled by scarcity, where ration laws, buried reservoirs, and desert rebellion turn water into power.",
      bonus: "+1 Resolve",
      passive: "Endure the Dry",
      passiveRule:
        "Ignore the first fatigue, thirst, or environmental penalty you would suffer each scene, and gain advantage on checks to endure heat or deprivation.",
      drawback: "Resource Driven",
      drawbackRule:
        "When supplies run low, your first related negotiation or morale check each scene is made with disadvantage.",
      recommendedCallings: ["warden", "reaver"],
      summary: "Desert scarcity where water is power and rebellion grows in the dust.",
      lore: "Khiz is ruled through necessity: ration laws, reservoirs, sandstorms, and the politics of thirst.",
    },
    {
      id: "dengz-guo",
      path: "archipelago",
      name: "Dengz Guo",
      identityTag: "Powder Wall",
      identityTagDetail:
        "Dengz Guo hides cannon foundries, black-powder doctrine, and fortress secrecy behind monumental walls.",
      bonus: "+1 Wit",
      passive: "Volatile Genius",
      passiveRule:
        "Explosive, alchemical, and artillery effects you create gain +1 area or +1 damage. Checks to control collateral fallout gain advantage.",
      drawback: "Unstable Creations",
      drawbackRule:
        "On a failed gadget or powder check, you or an adjacent ally suffer 1 collateral damage, and your next check to stabilize the scene is made with disadvantage.",
      recommendedCallings: ["gunslinger", "navigator"],
      summary: "Walled gunpowder nation with cannon foundries and strict martial law.",
      lore: "Dengz Guo mastered artillery before Yuma and treats black powder like both weapon and doctrine.",
    },
    {
      id: "arannia",
      path: "archipelago",
      name: "Arannia",
      identityTag: "Velvet Feast",
      identityTagDetail:
        "Arannia dresses danger in hospitality, where cuisine, diplomacy, and quiet assassination all share the same table.",
      bonus: "+1 Agility",
      passive: "Veiled Touch",
      passiveRule:
        "Once each scene, when you attack from disguise, concealment, or surprise, gain advantage and +2 damage on the attack.",
      drawback: "Fragile Trust",
      drawbackRule:
        "Allies and NPCs begin one step more suspicious of you. Your first trust-building social check with them is made with disadvantage.",
      recommendedCallings: ["gunslinger", "navigator"],
      summary: "Culinary paradise where hospitality, poison, and politics share the same table.",
      lore: "Arannia hides assassin networks behind kitchens, festivals, and soft diplomacy.",
    },
    {
      id: "dazibinian",
      path: "archipelago",
      name: "Dazibinian Principality",
      identityTag: "Cloud Court",
      identityTagDetail:
        "The Dazibinian Principality floats on airship ambition, young leadership, and conspirators hiding behind polished spectacle.",
      bonus: "+1 Agility",
      passive: "Skyborne Grace",
      passiveRule:
        "When climbing, leaping, swinging, or fighting from height, gain advantage on the check or attack.",
      drawback: "Courtly Naivete",
      drawbackRule:
        "Your first streetwise or underworld check each scene is made with disadvantage unless an ally guides you.",
      recommendedCallings: ["gunslinger", "navigator"],
      summary: "Young sky kingdom of blimps, conspirators, and airborne heists.",
      lore: "The prince is not as secure as he looks. Airship culture and noble manipulation define the principality.",
    },
    {
      id: "kirkia",
      path: "archipelago",
      name: "Kirkia",
      identityTag: "Green Maw",
      identityTagDetail:
        "Kirkia is primordial jungle power: ruins, living beasts, spirits, and nature old enough to swallow civilization whole.",
      bonus: "+1 Instinct",
      passive: "Nature's Whisper",
      passiveRule:
        "You always act in the first round of an ambush, and once each scene may ask the GM one question about nearby terrain or beasts; your next related check gains advantage.",
      drawback: "Greenblight",
      drawbackRule:
        "Corruption, disease, and hostile flora effects against you gain +1 severity, and your first save against them each scene is made with disadvantage.",
      recommendedCallings: ["tidecaller", "navigator", "reaver"],
      summary: "Primordial jungle of spirits, ruins, and dangerous living power.",
      lore: "Kirkia is all lost temples, intelligent beasts, and the question of whether nature should be guided or feared.",
    },
    {
      id: "silvia",
      path: "archipelago",
      name: "Silvia",
      identityTag: "Moon Court",
      identityTagDetail:
        "Silvia moves with ancient grace and ancient arrogance, where prophecy, crystal forests, and elven patience outlast empires.",
      bonus: "+1 Spirit",
      passive: "Ancient Bearing",
      passiveRule:
        "Once each scene, force a lesser foe, spirit, or courtier to hesitate; it loses its reaction or next minor action, and your next command or ritual check against it gains advantage.",
      drawback: "Aloof Distance",
      drawbackRule:
        "When relying on empathy or quick rapport, your roll is made with disadvantage unless you first reveal vulnerability or respect.",
      recommendedCallings: ["tidecaller", "navigator"],
      summary: "Timeless elven island of crystal forests and ancient prophecy.",
      lore: "Silvia carries old magic and older arrogance. Time itself seems less urgent there.",
    },
    {
      id: "sha-ni",
      path: "archipelago",
      name: "Grand Duchy of Sha-Ni",
      identityTag: "Iron Blossom",
      identityTagDetail:
        "Sha-Ni is an honor-bound warrior state of duels, feudal pride, and traditions sharp enough to cut their own heirs.",
      bonus: "+1 Might",
      passive: "Duelist's Focus",
      passiveRule:
        "In one-on-one combat, gain +1 Guard against your chosen rival, and your first attack against that rival each round gains advantage.",
      drawback: "Code of Honor",
      drawbackRule:
        "Breaking your word or striking a helpless foe costs 1 Focus and disables this passive for the scene. Social checks with honorable characters are made with disadvantage until amends are made.",
      recommendedCallings: ["corsair", "warden"],
      summary: "Feudal honor-state of legendary warriors, duels, and closed borders.",
      lore: "Sha-Ni values discipline and tradition so deeply that breaking custom can cost more than losing a fight.",
    },
    {
      id: "purapet",
      path: "archipelago",
      name: "Purapet",
      identityTag: "Quiet Sanctum",
      identityTagDetail:
        "Purapet appears humble and devout, but its peace shelters sacred truths powerful enough to redraw the map.",
      bonus: "+1 Spirit",
      passive: "Sacred Quiet",
      passiveRule:
        "Once each scene, calm fear, panic, or magical noise in a small area. Allies there gain +2 Focus and advantage on their next fear or concentration check.",
      drawback: "Burden of Revelation",
      drawbackRule:
        "When a secret of your homeland is at stake, hesitation or guilt gives you disadvantage on your next attack or social check until you choose a side.",
      recommendedCallings: ["tidecaller", "warden"],
      summary: "Devout refuge hiding a sacred truth beneath apparent weakness.",
      lore: "Purapet looks humble and harmless, but it protects something holy enough to redraw the map.",
    },
    {
      id: "thult",
      path: "archipelago",
      name: "Thult",
      identityTag: "Coral Accord",
      identityTagDetail:
        "Thult looks toward peace and memory, carrying the dignity of a sea-born people who still remember what was taken from them.",
      bonus: "+1 Instinct",
      passive: "Born of the Tide",
      passiveRule:
        "Swimming, diving, and fighting in water never cost extra movement, and your first water-based check or attack each scene gains advantage.",
      drawback: "Tethered to Water",
      drawbackRule:
        "After a long time away from open water, your first Focus check each day is made with disadvantage.",
      recommendedCallings: ["navigator", "corsair"],
      summary: "Aquatic nation seeking peace, memory, and dignity beneath the surface.",
      lore: "Thult leans toward reconciliation with surface peoples, even while carrying the wounds of history.",
    },
    {
      id: "rukka",
      path: "archipelago",
      name: "Rukka",
      identityTag: "Red Current",
      identityTagDetail:
        "Rukka is the warlike tide: vengeance, raids, and inherited grief hardened into militant pride.",
      bonus: "+1 Might",
      passive: "Deep Wrath",
      passiveRule:
        "When an ally is wounded, your next melee attack gains advantage, deals +2 damage, and ignores fear effects.",
      drawback: "Scorched Mercy",
      drawbackRule:
        "De-escalation checks against hated enemies are made with disadvantage unless someone you trust intervenes.",
      recommendedCallings: ["reaver", "corsair"],
      summary: "Aquatic sister nation shaped by vengeance, raids, and inherited trauma.",
      lore: "Rukka remembers every wound and answers peace with suspicion, fury, and militant pride.",
    },
    {
      id: "busha",
      path: "archipelago",
      name: "Busha",
      identityTag: "Breakwater",
      identityTagDetail:
        "Busha survives between raiders, sea-peoples, and exhausted fishing villages that have learned how grief becomes prejudice.",
      bonus: "+1 Resolve",
      passive: "Storm-Hardened",
      passiveRule:
        "Wind, rain, surf, and shipboard hazards never impose disadvantage on you. Once each storm scene, shrug off 1 damage and gain advantage on your next balance or seamanship check.",
      drawback: "Old Hatreds",
      drawbackRule:
        "The first diplomacy check with fishfolk, raiders, or imperial sailors each scene is made with disadvantage.",
      recommendedCallings: ["warden", "navigator"],
      summary: "Fishing communities trapped between fishmen conflict, raids, and retaliation.",
      lore: "Busha suffers the consequences of everyone else’s war and is full of grief, prejudice, and exhausted survival.",
    },
    {
      id: "akshan",
      path: "archipelago",
      name: "Tribes of Akshan",
      identityTag: "Stormclaw",
      identityTagDetail:
        "Akshan is a tribal shield of proud warriors, spirit-tamers, and hard-won unity forged against repeated invasion.",
      bonus: "+1 Instinct",
      passive: "Totem Legacy",
      passiveRule:
        "Choose one terrain tied to your totem during downtime. In that terrain, gain advantage on tracking, scouting, and ambush checks.",
      drawback: "Empire Distrust",
      drawbackRule:
        "When taking orders from imperial authorities or entering imperial strongholds, begin with -1 Focus, and your first social check there is made with disadvantage until trust is earned.",
      recommendedCallings: ["navigator", "warden", "reaver"],
      summary: "Eastern tribal shield forged by resistance, pride, and sea-bound tradition.",
      lore: "Akshan is a federation of proud tribes that learned unity by driving back repeated invasion.",
    },
  ],
  pairings: [
    {
      key: "skirmish",
      name: "Skirmish",
      attributes: ["might", "agility"],
      category: "combat",
      summary: "Fast violence, dueling tempo, and closing the gap before someone can react.",
      examples: ["boarding actions", "sword duels", "aggressive chases"],
      formulaLabel: "Might + Agility",
    },
    {
      key: "leverage",
      name: "Leverage",
      attributes: ["might", "wit"],
      category: "utility",
      summary:
        "Using strength intelligently: breaching, hauling, engineering under strain, and forcing the environment to cooperate.",
      examples: ["forcing a hatch", "improvised siege work", "muscling through a machine jam"],
      formulaLabel: "Might + Wit",
    },
    {
      key: "conviction",
      name: "Conviction",
      attributes: ["might", "spirit"],
      category: "social",
      summary: "The force of soul behind a declaration, oath, prayer, or war cry.",
      examples: ["rallying with zeal", "prophetic declarations", "sacred menace"],
      formulaLabel: "Might + Spirit",
    },
    {
      key: "pressure",
      name: "Pressure",
      attributes: ["might", "resolve"],
      category: "social",
      summary: "Command presence, intimidation, and forcing someone to bend under your will.",
      examples: ["threats", "hard bargaining", "battlefield authority"],
      formulaLabel: "Might + Resolve",
    },
    {
      key: "pursuit",
      name: "Pursuit",
      attributes: ["might", "instinct"],
      category: "exploration",
      summary: "Predatory momentum, relentless tracking, and running something down.",
      examples: ["hunting prey", "survival chases", "pressing an advantage through wilderness"],
      formulaLabel: "Might + Instinct",
    },
    {
      key: "precision",
      name: "Precision",
      attributes: ["agility", "wit"],
      category: "combat",
      summary: "Aim, control, and exact action under pressure.",
      examples: ["marksmanship", "fine sabotage", "surgical strikes"],
      formulaLabel: "Agility + Wit",
    },
    {
      key: "flourish",
      name: "Flourish",
      attributes: ["agility", "spirit"],
      category: "social",
      summary: "Style, magnetism, and performative grace that turns motion into influence.",
      examples: ["performance", "ceremonial display", "seductive presence"],
      formulaLabel: "Agility + Spirit",
    },
    {
      key: "balance",
      name: "Balance",
      attributes: ["agility", "resolve"],
      category: "exploration",
      summary: "Control under stress, footwork, and staying steady when the world lurches.",
      examples: ["rope bridges", "storm decks", "keeping your footing under fire"],
      formulaLabel: "Agility + Resolve",
    },
    {
      key: "reflex",
      name: "Reflex",
      attributes: ["agility", "instinct"],
      category: "combat",
      summary: "Pure reaction speed, evasive motion, and split-second positioning.",
      examples: ["dodging ambushes", "quickdraw contests", "reactive movement"],
      formulaLabel: "Agility + Instinct",
    },
    {
      key: "guile",
      name: "Guile",
      attributes: ["wit", "spirit"],
      category: "social",
      summary: "Misdirection, layered lies, reading the room, and steering attention away from the truth.",
      examples: ["deception", "secret negotiations", "double meanings"],
      formulaLabel: "Wit + Spirit",
    },
    {
      key: "tactics",
      name: "Tactics",
      attributes: ["wit", "resolve"],
      category: "combat",
      summary: "Discipline, planning, and making the smart move when panic would be easier.",
      examples: ["battle plans", "coordinating allies", "staying sharp in chaos"],
      formulaLabel: "Wit + Resolve",
    },
    {
      key: "sense",
      name: "Sense",
      attributes: ["wit", "instinct"],
      category: "exploration",
      summary: "Reading danger, seeing patterns, and noticing what others miss.",
      examples: ["scouting", "trap reading", "navigational judgment"],
      formulaLabel: "Wit + Instinct",
    },
    {
      key: "grace",
      name: "Grace",
      attributes: ["spirit", "resolve"],
      category: "social",
      summary: "Poise, diplomacy, trust-building, and holding yourself with calm authority.",
      examples: ["persuasion", "court etiquette", "soft leadership"],
      formulaLabel: "Spirit + Resolve",
    },
    {
      key: "attunement",
      name: "Attunement",
      attributes: ["spirit", "instinct"],
      category: "arcane",
      summary: "Sensitivity to spirits, relic resonance, omens, and the unseen pulse of a place.",
      examples: ["reading relics", "spirit contact", "feeling corruption in the air"],
      formulaLabel: "Spirit + Instinct",
    },
    {
      key: "nerve",
      name: "Nerve",
      attributes: ["resolve", "instinct"],
      category: "exploration",
      summary: "Staying sharp in danger, trusting your gut, and not breaking when fear arrives first.",
      examples: ["fear resistance", "disaster response", "making the call under stress"],
      formulaLabel: "Resolve + Instinct",
    },
  ],
  specializations: [
    {
      id: "drydock-ghost",
      name: "Drydock Ghost",
      summary:
        "A sabotage-and-survival path built around ship systems, hidden routes, and making damaged infrastructure work for you.",
      recommendedCallings: ["navigator", "gunslinger"],
      affinity: {
        categories: ["utility", "exploration"],
        skills: ["jury-rig", "patch", "salvage", "navigate", "hide"],
      },
      nodes: [
        {
          id: "ghost-patch",
          name: "Ghost Patch",
          rankRequired: 2,
          cost: 1,
          summary: "Your repairs leave no obvious trace until the moment they matter.",
          effect:
            "When you Patch or Jury-Rig during a scene, the fix also masks tampering. The first enemy inspection against it is made with disadvantage.",
        },
        {
          id: "paid-in-scrap",
          name: "Paid in Scrap",
          rankRequired: 2,
          cost: 1,
          summary: "Broken things become inventory instead of waste.",
          effect:
            "After a fight, collapse, or sabotage, salvage one useful component without spending extra downtime. The first related crafting check gains advantage.",
        },
        {
          id: "silent-keel",
          name: "Silent Keel",
          rankRequired: 3,
          cost: 2,
          summary: "You move a vessel or machine through dangerous spaces without announcing it.",
          effect:
            "Once per scene, reduce the detection profile of a ship, engine room, or moving platform. Allies gain advantage on the next stealth, escape, or infiltration action tied to it.",
        },
      ],
    },
    {
      id: "storm-broker",
      name: "Storm Broker",
      summary:
        "A control path for captains and ritual tacticians who turn weather, timing, and leverage into battlefield dominance.",
      recommendedCallings: ["navigator", "tidecaller"],
      affinity: {
        categories: ["arcane", "exploration", "social"],
        skills: ["attune", "invoke", "navigate", "signal", "command"],
      },
      nodes: [
        {
          id: "barometer-instinct",
          name: "Barometer Instinct",
          rankRequired: 2,
          cost: 1,
          summary: "You feel the turn of pressure before everyone else does.",
          effect:
            "At the start of a scene, ask one question about incoming danger, weather, or reinforcement timing. Your next related Sense, Navigate, or Attune check gains advantage.",
        },
        {
          id: "borrowed-squall",
          name: "Borrowed Squall",
          rankRequired: 3,
          cost: 2,
          summary: "You can throw confusion into one zone by calling the edge of a storm.",
          effect:
            "Spend 1 Focus to impose poor visibility, unstable footing, or signal interference in a nearby zone until your next turn.",
        },
        {
          id: "captains-credit",
          name: "Captain's Credit",
          rankRequired: 4,
          cost: 2,
          summary: "When your call is right, it pays the whole crew back.",
          effect:
            "After an ally succeeds on a setup, maneuver, or repositioning action you created, recover 1 shared skill point or 1 Focus for that ally once per scene.",
        },
      ],
    },
    {
      id: "reef-knife",
      name: "Reef Knife",
      summary:
        "A duelist-infiltrator path for characters who strike from angles, thrive in cramped fights, and weaponize concealment.",
      recommendedCallings: ["corsair", "gunslinger", "reaver"],
      affinity: {
        categories: ["combat", "exploration"],
        skills: ["board", "shoot", "hide", "maneuver", "suppress"],
      },
      nodes: [
        {
          id: "close-water",
          name: "Close Water",
          rankRequired: 2,
          cost: 1,
          summary: "Tight spaces are where you become dangerous.",
          effect:
            "Gain advantage on your first melee or sidearm attack each scene made from cover, concealment, or within a cramped zone.",
        },
        {
          id: "hookline-feint",
          name: "Hookline Feint",
          rankRequired: 3,
          cost: 1,
          summary: "Your movement pulls attention away from the real threat.",
          effect:
            "After you reposition, one ally attacking the same target before your next turn gains advantage or +1 effect.",
        },
        {
          id: "bloodwake",
          name: "Bloodwake",
          rankRequired: 4,
          cost: 2,
          summary: "A clean takedown turns the whole deck in your favor.",
          effect:
            "When you drop a target, choose another enemy in the zone: it loses its reaction or suffers disadvantage on its next Guard check.",
        },
      ],
    },
    {
      id: "powder-saint",
      name: "Powder Saint",
      summary:
        "A volatile invention path for black-powder tacticians, artificers, and battlefield problem-solvers who treat risk like fuel.",
      recommendedCallings: ["gunslinger", "navigator"],
      affinity: {
        categories: ["utility", "combat"],
        skills: ["shoot", "suppress", "jury-rig", "signal", "patch"],
      },
      nodes: [
        {
          id: "measured-burn",
          name: "Measured Burn",
          rankRequired: 2,
          cost: 1,
          summary: "You know exactly how much chaos a device can survive.",
          effect:
            "The first explosive, gadget, or firearm complication you trigger each scene is reduced by 1 severity.",
        },
        {
          id: "ember-route",
          name: "Ember Route",
          rankRequired: 3,
          cost: 1,
          summary: "Smoke and sparks become part of your map.",
          effect:
            "After using a powder, signal, or volatile tech effect, gain advantage on the next reposition, escape, or suppress action in that zone.",
        },
        {
          id: "saints-rebuke",
          name: "Saint's Rebuke",
          rankRequired: 4,
          cost: 2,
          summary: "Your heaviest shot leaves doctrine behind and fear in front of it.",
          effect:
            "Once per scene, a firearm or explosive hit also shatters cover, breaks formation, or forces a morale check from nearby enemies.",
        },
      ],
    },
    {
      id: "leviathan-anchor",
      name: "Leviathan Anchor",
      summary:
        "A protection path for defenders who turn themselves into the line the rest of the crew can stand behind.",
      recommendedCallings: ["warden", "corsair"],
      affinity: {
        categories: ["combat", "social"],
        skills: ["brace", "protect", "threaten", "endure", "command"],
      },
      nodes: [
        {
          id: "braced-soul",
          name: "Braced Soul",
          rankRequired: 2,
          cost: 1,
          summary: "You hold steady even when the whole scene wants to move you.",
          effect:
            "The first forced movement, stagger, or panic effect against you each scene is ignored. An adjacent ally gains +1 Guard against the same source.",
        },
        {
          id: "chain-of-duty",
          name: "Chain of Duty",
          rankRequired: 3,
          cost: 1,
          summary: "Protection ripples outward from your position.",
          effect:
            "When you Intercept, Brace, or otherwise cover an ally, one second nearby ally gains advantage on its next Endure, Guard, or retreat action.",
        },
        {
          id: "harbor-oath",
          name: "Harbor Oath",
          rankRequired: 4,
          cost: 2,
          summary: "Once you take the line, enemies have to break themselves on it.",
          effect:
            "Once per scene, mark your zone as defended until your next turn. Enemies entering or forcing movement through it suffer disadvantage unless they pay extra resources or setup.",
        },
      ],
    },
    {
      id: "omen-diver",
      name: "Omen Diver",
      summary:
        "An arcane path for characters who push deeper into relic resonance, drowned memory, and dangerous communion with the unseen.",
      recommendedCallings: ["tidecaller", "navigator"],
      affinity: {
        categories: ["arcane", "utility"],
        skills: ["attune", "invoke", "read", "salvage", "signal"],
      },
      nodes: [
        {
          id: "undertow-listen",
          name: "Undertow Listen",
          rankRequired: 2,
          cost: 1,
          summary: "The drowned world answers if you are willing to hear it.",
          effect:
            "Once per scene, ask one question of a relic, haunted site, or spirit current. Your next Attune, Invoke, or Read check against it gains advantage.",
        },
        {
          id: "salt-memory",
          name: "Salt Memory",
          rankRequired: 3,
          cost: 1,
          summary: "Old scenes cling to you long enough to be useful.",
          effect:
            "After using an arcane ability, capture one fleeting clue, echo, or emotional imprint about the zone without spending extra Focus.",
        },
        {
          id: "sunken-price",
          name: "Sunken Price",
          rankRequired: 4,
          cost: 2,
          summary: "You can borrow power from corruption and decide later how to pay it back.",
          effect:
            "Once per session, reduce the cost of an arcane ability by 1 Focus or 1 Corruption. After the scene, the GM introduces a spiritual consequence tied to what answered you.",
        },
      ],
    },
  ],
  reputation: {
    min: -3,
    max: 3,
    tracks: [
      {
        key: "yumaRepublic",
        name: "Yuma Republic",
        scope: "Imperial industry, officers, state inventors, and western occupation forces.",
      },
      {
        key: "lilinEmpire",
        name: "Lilin Empire",
        scope: "Eastern arcanists, spirit courts, and ritual-aligned imperial interests.",
      },
      {
        key: "freeCaptains",
        name: "Free Captains",
        scope: "Pirate crews, independent sailors, and people loyal to the Pirate King myth.",
      },
      {
        key: "rebelMovements",
        name: "Rebel Movements",
        scope: "Insurgents, anti-occupation cells, labor agitators, and revolutionary networks.",
      },
      {
        key: "guildConsortium",
        name: "Guild Consortium",
        scope: "Shipwrights, artificers, trade guilds, and industrial craft elites.",
      },
      {
        key: "nobleCourts",
        name: "Noble Courts",
        scope: "Duchies, principalities, feudal houses, court functionaries, and legitimacy politics.",
      },
      {
        key: "underworld",
        name: "Underworld Networks",
        scope: "Smugglers, assassins, black markets, secret police, and criminal brokers.",
      },
      {
        key: "faithOrders",
        name: "Faith Orders",
        scope: "Monastics, shrine keepers, spirit clergy, and sacred institutions.",
      },
      {
        key: "seaPeoples",
        name: "Sea Peoples",
        scope: "Fishfolk nations, coralborn communities, tide mystics, and submerged polities.",
      },
      {
        key: "frontierTribes",
        name: "Frontier Tribes",
        scope: "Akshan tribes, wildland guardians, spirit-tamers, and non-imperial ancestral cultures.",
      },
    ],
    tiers: [
      {
        score: -3,
        label: "Hated",
        effect: "Hostile attention, closed doors, and routine disadvantage on social checks with that track.",
      },
      {
        score: -2,
        label: "Distrusted",
        effect: "Suspicion, worse prices, and frequent scrutiny or extra demands.",
      },
      {
        score: -1,
        label: "Wary",
        effect: "People hesitate, ask for proof, and start guarded rather than friendly.",
      },
      {
        score: 0,
        label: "Unknown",
        effect: "No built-in edge or penalty. Your actions in play define the relationship.",
      },
      {
        score: 1,
        label: "Known Favorably",
        effect: "Small courtesies, easier introductions, and occasional advantage on first impressions.",
      },
      {
        score: 2,
        label: "Trusted",
        effect: "Reliable access, material help, and support when risk is reasonable.",
      },
      {
        score: 3,
        label: "Champion",
        effect: "You are treated as an insider, symbol, or protected asset by that track.",
      },
    ],
    originModifiers: {
      "yuma-core": {
        yumaRepublic: 2,
        guildConsortium: 1,
        lilinEmpire: -2,
        freeCaptains: -1,
        rebelMovements: -1,
      },
      "lilin-core": {
        lilinEmpire: 2,
        faithOrders: 1,
        yumaRepublic: -2,
        guildConsortium: -1,
      },
      yayimi: {
        yumaRepublic: -2,
        freeCaptains: 1,
        rebelMovements: 2,
      },
      klechi: {
        guildConsortium: 2,
        freeCaptains: 1,
        underworld: 1,
        nobleCourts: -1,
      },
      tetlanco: {
        nobleCourts: 2,
        underworld: 1,
        freeCaptains: -1,
        rebelMovements: -1,
      },
      harshanum: {
        freeCaptains: 2,
        rebelMovements: 1,
        nobleCourts: -2,
        faithOrders: -1,
      },
      khiz: {
        rebelMovements: 1,
        nobleCourts: -1,
        guildConsortium: -1,
        underworld: 1,
      },
      "dengz-guo": {
        guildConsortium: 1,
        nobleCourts: 1,
        yumaRepublic: -1,
        lilinEmpire: -1,
        rebelMovements: -1,
      },
      arannia: {
        nobleCourts: 1,
        underworld: 2,
        faithOrders: 1,
      },
      dazibinian: {
        nobleCourts: 1,
        guildConsortium: 1,
        rebelMovements: 1,
      },
      kirkia: {
        frontierTribes: 2,
        faithOrders: 1,
        nobleCourts: -1,
        guildConsortium: -1,
      },
      silvia: {
        nobleCourts: 2,
        faithOrders: 1,
        freeCaptains: -1,
      },
      "sha-ni": {
        nobleCourts: 2,
        frontierTribes: 1,
        freeCaptains: -2,
        underworld: -1,
      },
      purapet: {
        faithOrders: 2,
        nobleCourts: 1,
        underworld: -1,
      },
      thult: {
        seaPeoples: 2,
        freeCaptains: 1,
        yumaRepublic: -1,
      },
      rukka: {
        seaPeoples: 2,
        rebelMovements: 1,
        nobleCourts: -1,
        yumaRepublic: -1,
      },
      busha: {
        seaPeoples: -1,
        underworld: 1,
        freeCaptains: -1,
        rebelMovements: 1,
      },
      akshan: {
        frontierTribes: 2,
        rebelMovements: 1,
        yumaRepublic: -1,
        lilinEmpire: -1,
      },
    },
  },
};

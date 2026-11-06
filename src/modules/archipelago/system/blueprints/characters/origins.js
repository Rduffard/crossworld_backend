module.exports = [
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
  ];

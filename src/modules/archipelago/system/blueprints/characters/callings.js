module.exports = [
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
  ];

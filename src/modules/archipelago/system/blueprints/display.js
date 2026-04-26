module.exports = {
  attributes: {
    might: {
      description: "Raw power, endurance, and physical force.",
    },
    agility: {
      description: "Reflexes, aim, speed, and evasive movement.",
    },
    wit: {
      description: "Planning, observation, engineering, and tactics.",
    },
    spirit: {
      description: "Magic, emotion, relic strain, and the unseen.",
    },
    resolve: {
      description: "Willpower, grit, and resistance under pressure.",
    },
    instinct: {
      description: "Survival sense, navigation, and reading the world.",
    },
  },
  derivedStats: {
    vitality: {
      category: "derived",
      formula: "10 + Might + Resolve",
      description: "Your health pool and ability to stay standing through punishment.",
    },
    guard: {
      category: "derived",
      formula: "10 + Agility",
      description: "Your baseline defense against direct attacks and incoming pressure.",
    },
    initiative: {
      category: "derived",
      formula: "10 + Agility + Instinct",
      description: "How quickly you react, reposition, and act when the action starts.",
    },
    focus: {
      category: "derived",
      formula: "10 + Spirit + Resolve",
      description: "Mental stability, magical control, and resistance against strain.",
    },
  },
  socialStats: {
    grace: {
      category: "social",
      formula: "10 + Spirit + Resolve",
      description: "Charm, diplomacy, poise, and the ability to win trust without force.",
    },
    guile: {
      category: "social",
      formula: "10 + Wit + Spirit",
      description: "Lies, misdirection, concealment, and reading the hidden angle in a conversation.",
    },
    pressure: {
      category: "social",
      formula: "10 + Might + Resolve",
      description: "Threat, command presence, hard bargaining, and forcing someone to fold.",
    },
  },
  pairingCategories: {
    combat: {
      label: "Combat",
      description: "Fast reads for direct conflict, tempo, positioning, and execution under pressure.",
    },
    social: {
      label: "Social",
      description: "How the character persuades, deceives, performs, commands, or bends a room.",
    },
    exploration: {
      label: "Exploration",
      description: "Navigation, survival, reaction speed, and steady judgment when the world turns hostile.",
    },
    utility: {
      label: "Utility",
      description: "Practical problem-solving, force applied intelligently, and making environments cooperate.",
    },
    arcane: {
      label: "Arcane",
      description: "Relic sense, spiritual attunement, omens, and the unseen pulse of a place.",
    },
  },
};

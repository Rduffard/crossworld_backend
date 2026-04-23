module.exports = {
  Character: {
    type: "object",
    required: [
      "name",
      "identity",
      "attributes",
      "skills",
      "resources",
      "abilities",
      "reputation",
      "equipment",
      "progression",
    ],
    properties: {
      id: { type: "string", example: "char_veska_drain" },
      name: { type: "string", example: "Veska Drain" },
      pronouns: { type: "string", example: "she/they" },
      identity: { $ref: "#/schema/Identity" },
      attributes: { $ref: "#/schema/Attributes" },
      skills: { $ref: "#/schema/Skills" },
      abilities: { $ref: "#/schema/Abilities" },
      resources: { $ref: "#/schema/Resources" },
      reputation: { $ref: "#/schema/Reputation" },
      equipment: { $ref: "#/schema/Equipment" },
      progression: { $ref: "#/schema/Progression" },
    },
  },
  Identity: {
    type: "object",
    required: ["background", "tags"],
    properties: {
      background: {
        type: "object",
        required: ["origin", "pastRole", "definingEvent"],
        properties: {
          origin: { type: "string", example: "Yayimi" },
          pastRole: { type: "string", example: "Harbor agitator" },
          definingEvent: {
            type: "string",
            example: "Watched a strike turn into a massacre",
          },
        },
      },
      tags: {
        type: "array",
        items: { $ref: "#/schema/Tag" },
      },
    },
  },
  Attributes: {
    type: "object",
    description: "Broad capabilities that feed skills and resource ceilings.",
    properties: {
      might: {
        type: "number",
        range: "0-5 starting, 0-8 heroic",
        description: "Force, lift, impact tolerance, and bodily threat.",
        example: 3,
      },
      agility: {
        type: "number",
        range: "0-5 starting, 0-8 heroic",
        description: "Aim, footwork, acceleration, and precision under motion.",
        example: 2,
      },
      wit: {
        type: "number",
        range: "0-5 starting, 0-8 heroic",
        description: "Planning, deduction, technical control, and procedural thinking.",
        example: 4,
      },
      spirit: {
        type: "number",
        range: "0-5 starting, 0-8 heroic",
        description: "Presence, occult receptivity, emotional force, and ritual resonance.",
        example: 1,
      },
      resolve: {
        type: "number",
        range: "0-5 starting, 0-8 heroic",
        description: "Composure, tenacity, pain tolerance, and pressure resistance.",
        example: 3,
      },
      instinct: {
        type: "number",
        range: "0-5 starting, 0-8 heroic",
        description: "Reaction, situational sensing, navigation by feel, and gut reads.",
        example: 2,
      },
    },
  },
  Skills: {
    type: "object",
    description: "Verb-based skills grouped by play pillar.",
    properties: {
      combat: { type: "array", items: { $ref: "#/schema/SkillRating" } },
      social: { type: "array", items: { $ref: "#/schema/SkillRating" } },
      exploration: { type: "array", items: { $ref: "#/schema/SkillRating" } },
      utility: { type: "array", items: { $ref: "#/schema/SkillRating" } },
      arcane: { type: "array", items: { $ref: "#/schema/SkillRating" } },
    },
  },
  TraitsTags: {
    type: "array",
    description:
      "Persistent identity flags, scars, blessings, or affiliations that change available options and passive bonuses.",
    items: { $ref: "#/schema/Tag" },
  },
  Abilities: {
    type: "array",
    items: { $ref: "#/schema/Ability" },
  },
  Resources: {
    type: "object",
    required: ["health", "wounds", "stamina", "focus", "corruption"],
    properties: {
      health: { $ref: "#/schema/ResourceTrack" },
      wounds: { $ref: "#/schema/WoundTrack" },
      stamina: { $ref: "#/schema/ResourceTrack" },
      focus: { $ref: "#/schema/ResourceTrack" },
      corruption: { $ref: "#/schema/ResourceTrack" },
    },
  },
  Reputation: {
    type: "object",
    description:
      "Faction standing shifts from -3 to +3 and changes access, pricing, hostility, aid, and dialogue routes.",
    properties: {
      yumaRepublic: { type: "number", range: "-3 to +3", example: -2 },
      lilinEmpire: { type: "number", range: "-3 to +3", example: 1 },
      freeCaptains: { type: "number", range: "-3 to +3", example: 2 },
      rebelMovements: { type: "number", range: "-3 to +3", example: 1 },
      guildConsortium: { type: "number", range: "-3 to +3", example: 0 },
      nobleCourts: { type: "number", range: "-3 to +3", example: -1 },
      underworld: { type: "number", range: "-3 to +3", example: 2 },
      faithOrders: { type: "number", range: "-3 to +3", example: 0 },
      seaPeoples: { type: "number", range: "-3 to +3", example: 1 },
      frontierTribes: { type: "number", range: "-3 to +3", example: 0 },
    },
  },
  Equipment: {
    type: "object",
    required: ["weapons", "armor", "techRelics"],
    properties: {
      weapons: { type: "array", items: { $ref: "#/schema/EquipmentItem" } },
      armor: { type: "array", items: { $ref: "#/schema/EquipmentItem" } },
      techRelics: { type: "array", items: { $ref: "#/schema/EquipmentItem" } },
      cargo: { type: "array", items: { $ref: "#/schema/EquipmentItem" } },
    },
  },
  Progression: {
    type: "object",
    required: ["rank", "skillPoints", "specializationPath", "unlockedNodes"],
    properties: {
      rank: { type: "number", example: 1 },
      skillPoints: { type: "number", example: 4 },
      advancementPoints: { type: "number", example: 1 },
      specializationPath: { type: "string", example: "storm-broker" },
      unlockedNodes: { type: "array", items: { type: "string" } },
    },
  },
  Tag: {
    type: "object",
    required: ["key", "label", "mechanicalImpact"],
    properties: {
      type: {
        type: "string",
        enum: ["tag", "trait", "scar", "license"],
        example: "tag",
      },
      key: { type: "string", example: "engineer" },
      label: { type: "string", example: "Engineer" },
      mechanicalImpact: {
        type: "string",
        example:
          "Unlocks machine-facing dialogue and reduces the first Jury-Rig stamina cost each scene by 1.",
      },
    },
  },
  SkillRating: {
    type: "object",
    required: ["id", "rank"],
    properties: {
      id: { type: "string", example: "jury-rig" },
      name: { type: "string", example: "Jury-Rig" },
      rank: { type: "number", range: "0-5", example: 2 },
      linkedAttributes: { type: "array", items: { type: "string" } },
      specialty: { type: "string", example: "Pressure seals" },
    },
  },
  Ability: {
    type: "object",
    required: ["id", "name", "type", "cost", "scaling", "tags", "effect"],
    properties: {
      id: { type: "string", example: "ability_storm_writ" },
      name: { type: "string", example: "Storm Writ" },
      type: {
        type: "string",
        enum: ["active", "passive", "reaction"],
        example: "reaction",
      },
      cost: {
        type: "object",
        properties: {
          resource: {
            type: "string",
            enum: ["stamina", "focus", "corruption", "health"],
            example: "focus",
          },
          amount: { type: "number", example: 2 },
        },
      },
      scaling: {
        type: "object",
        properties: {
          attribute: { type: "string", example: "spirit" },
          skill: { type: "string", example: "invoke" },
        },
      },
      tags: { type: "array", items: { type: "string" } },
      effect: {
        type: "string",
        example:
          "Compel a marked witness to answer one direct question or suffer visible backlash.",
      },
    },
  },
  ResourceTrack: {
    type: "object",
    required: ["current", "max"],
    properties: {
      current: { type: "number", example: 5 },
      max: { type: "number", example: 5 },
    },
  },
  WoundTrack: {
    type: "object",
    required: ["current", "max"],
    properties: {
      current: { type: "number", example: 1 },
      max: { type: "number", example: 4 },
      active: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", example: "Shrapnel Shoulder" },
            severity: { type: "string", example: "major" },
            statPenalty: { type: "string", example: "agility" },
            description: {
              type: "string",
              example: "Shoulder shredded by deck shrapnel. Movement and climbing stay painful until treated.",
            },
          },
        },
      },
    },
  },
  EquipmentItem: {
    type: "object",
    required: ["id", "name", "type"],
    properties: {
      id: { type: "string", example: "weapon_harpoon_pistol" },
      name: { type: "string", example: "Harpoon Pistol" },
      type: {
        type: "string",
        enum: ["weapon", "armor", "tech", "relic", "cargo"],
        example: "weapon",
      },
      skillLinks: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
      grants: { type: "array", items: { type: "string" } },
    },
  },
};

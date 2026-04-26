const mongoose = require("mongoose");

const attributesSchema = new mongoose.Schema(
  {
    might: { type: Number, min: 0, max: 10, default: 0 },
    agility: { type: Number, min: 0, max: 10, default: 0 },
    wit: { type: Number, min: 0, max: 10, default: 0 },
    spirit: { type: Number, min: 0, max: 10, default: 0 },
    resolve: { type: Number, min: 0, max: 10, default: 0 },
    instinct: { type: Number, min: 0, max: 10, default: 0 },
  },
  { _id: false }
);

const derivedStatsSchema = new mongoose.Schema(
  {
    vitality: { type: Number, min: 0, default: 10 },
    guard: { type: Number, min: 0, default: 10 },
    initiative: { type: Number, min: 0, default: 10 },
    focus: { type: Number, min: 0, default: 10 },
  },
  { _id: false }
);

const socialStatsSchema = new mongoose.Schema(
  {
    grace: { type: Number, min: 0, default: 10 },
    guile: { type: Number, min: 0, default: 10 },
    pressure: { type: Number, min: 0, default: 10 },
  },
  { _id: false }
);

const pairingStatsSchema = new mongoose.Schema(
  {
    skirmish: { type: Number, min: 0, default: 10 },
    leverage: { type: Number, min: 0, default: 10 },
    conviction: { type: Number, min: 0, default: 10 },
    pressure: { type: Number, min: 0, default: 10 },
    pursuit: { type: Number, min: 0, default: 10 },
    precision: { type: Number, min: 0, default: 10 },
    flourish: { type: Number, min: 0, default: 10 },
    balance: { type: Number, min: 0, default: 10 },
    reflex: { type: Number, min: 0, default: 10 },
    guile: { type: Number, min: 0, default: 10 },
    tactics: { type: Number, min: 0, default: 10 },
    sense: { type: Number, min: 0, default: 10 },
    grace: { type: Number, min: 0, default: 10 },
    attunement: { type: Number, min: 0, default: 10 },
    nerve: { type: Number, min: 0, default: 10 },
  },
  { _id: false }
);

const reputationSchema = new mongoose.Schema(
  {
    yumaRepublic: { type: Number, min: -3, max: 3, default: 0 },
    lilinEmpire: { type: Number, min: -3, max: 3, default: 0 },
    freeCaptains: { type: Number, min: -3, max: 3, default: 0 },
    rebelMovements: { type: Number, min: -3, max: 3, default: 0 },
    guildConsortium: { type: Number, min: -3, max: 3, default: 0 },
    nobleCourts: { type: Number, min: -3, max: 3, default: 0 },
    underworld: { type: Number, min: -3, max: 3, default: 0 },
    faithOrders: { type: Number, min: -3, max: 3, default: 0 },
    seaPeoples: { type: Number, min: -3, max: 3, default: 0 },
    frontierTribes: { type: Number, min: -3, max: 3, default: 0 },
  },
  { _id: false }
);

const woundSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    statPenalty: {
      type: String,
      enum: ["might", "agility", "wit", "spirit", "resolve", "instinct", null],
      default: null,
    },
    severity: {
      type: String,
      enum: ["minor", "major", "critical"],
      default: "minor",
    },
  },
  { _id: false }
);

const abilityCostSchema = new mongoose.Schema(
  {
    resource: {
      type: String,
      enum: ["stamina", "focus", "corruption", "health", ""],
      default: "",
    },
    amount: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const abilityScalingSchema = new mongoose.Schema(
  {
    attribute: {
      type: String,
      enum: ["might", "agility", "wit", "spirit", "resolve", "instinct", ""],
      default: "",
    },
    skill: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
  },
  { _id: false }
);

const abilitySchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    type: {
      type: String,
      enum: ["active", "passive", "reaction"],
      default: "active",
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    source: {
      type: String,
      enum: ["calling", "origin", "relic", "custom"],
      default: "custom",
    },
    cost: {
      type: abilityCostSchema,
      default: () => ({}),
    },
    scaling: {
      type: abilityScalingSchema,
      default: () => ({}),
    },
    tags: {
      type: [String],
      default: [],
    },
    effect: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
  },
  { _id: false }
);

const inventoryItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    quantity: {
      type: Number,
      min: 1,
      default: 1,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
  },
  { _id: false }
);

const relicSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    bonded: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const tagSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["tag", "trait", "scar", "license"],
      default: "tag",
    },
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    mechanicalImpact: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
  },
  { _id: false }
);

const backgroundSchema = new mongoose.Schema(
  {
    origin: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    pastRole: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    definingEvent: {
      type: String,
      default: "",
      trim: true,
      maxlength: 240,
    },
  },
  { _id: false }
);

const identitySchema = new mongoose.Schema(
  {
    background: {
      type: backgroundSchema,
      default: () => ({}),
    },
    tags: {
      type: [tagSchema],
      default: [],
    },
  },
  { _id: false }
);

const skillRatingSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    name: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    rank: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    linkedAttributes: {
      type: [String],
      default: [],
    },
    specialty: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },
  },
  { _id: false }
);

const skillsSchema = new mongoose.Schema(
  {
    combat: {
      type: [skillRatingSchema],
      default: [],
    },
    social: {
      type: [skillRatingSchema],
      default: [],
    },
    exploration: {
      type: [skillRatingSchema],
      default: [],
    },
    utility: {
      type: [skillRatingSchema],
      default: [],
    },
    arcane: {
      type: [skillRatingSchema],
      default: [],
    },
  },
  { _id: false }
);

const resourceTrackSchema = new mongoose.Schema(
  {
    current: {
      type: Number,
      min: 0,
      default: 0,
    },
    max: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const woundTrackSchema = new mongoose.Schema(
  {
    current: {
      type: Number,
      min: 0,
      default: 0,
    },
    max: {
      type: Number,
      min: 0,
      default: 3,
    },
    active: {
      type: [woundSchema],
      default: [],
    },
  },
  { _id: false }
);

const resourceBundleSchema = new mongoose.Schema(
  {
    health: {
      type: resourceTrackSchema,
      default: () => ({}),
    },
    wounds: {
      type: woundTrackSchema,
      default: () => ({}),
    },
    stamina: {
      type: resourceTrackSchema,
      default: () => ({}),
    },
    focus: {
      type: resourceTrackSchema,
      default: () => ({}),
    },
    corruption: {
      type: resourceTrackSchema,
      default: () => ({}),
    },
  },
  { _id: false }
);

const equipmentItemSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    type: {
      type: String,
      enum: ["weapon", "armor", "tech", "relic", "cargo"],
      default: "cargo",
    },
    skillLinks: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    grants: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
  },
  { _id: false }
);

const equipmentSchema = new mongoose.Schema(
  {
    weapons: {
      type: [equipmentItemSchema],
      default: [],
    },
    armor: {
      type: [equipmentItemSchema],
      default: [],
    },
    techRelics: {
      type: [equipmentItemSchema],
      default: [],
    },
    cargo: {
      type: [equipmentItemSchema],
      default: [],
    },
  },
  { _id: false }
);

const progressionSchema = new mongoose.Schema(
  {
    rank: {
      type: Number,
      min: 1,
      default: 1,
    },
    skillPoints: {
      type: Number,
      min: 0,
      default: 0,
    },
    advancementPoints: {
      type: Number,
      min: 0,
      default: 0,
    },
    specializationPath: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    unlockedNodes: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const characterSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    pronouns: {
      type: String,
      default: "",
      trim: true,
      maxlength: 40,
    },
    calling: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    origin: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    identity: {
      type: identitySchema,
      default: () => ({}),
    },
    attributes: {
      type: attributesSchema,
      default: () => ({}),
    },
    derivedStats: {
      type: derivedStatsSchema,
      default: () => ({}),
    },
    socialStats: {
      type: socialStatsSchema,
      default: () => ({}),
    },
    pairingStats: {
      type: pairingStatsSchema,
      default: () => ({}),
    },
    reputation: {
      type: reputationSchema,
      default: () => ({}),
    },
    skills: {
      type: skillsSchema,
      default: () => ({}),
    },
    abilities: {
      type: [abilitySchema],
      default: [],
    },
    resources: {
      type: resourceBundleSchema,
      default: () => ({}),
    },
    inventory: {
      type: [inventoryItemSchema],
      default: [],
    },
    relics: {
      type: [relicSchema],
      default: [],
    },
    equipment: {
      type: equipmentSchema,
      default: () => ({}),
    },
    progression: {
      type: progressionSchema,
      default: () => ({}),
    },
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },
    portraitUrl: {
      type: String,
      default: "",
      trim: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ArchipelagoCampaign",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "archived", "retired"],
      default: "active",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

characterSchema.index({ owner: 1, status: 1 });
characterSchema.index({ owner: 1, name: 1 });

module.exports = mongoose.model("ArchipelagoCharacter", characterSchema);

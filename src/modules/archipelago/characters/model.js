const mongoose = require("mongoose");

const attributesSchema = new mongoose.Schema(
  {
    might: { type: Number, min: 0, max: 20, default: 0 },
    agility: { type: Number, min: 0, max: 20, default: 0 },
    wit: { type: Number, min: 0, max: 20, default: 0 },
    spirit: { type: Number, min: 0, max: 20, default: 0 },
    resolve: { type: Number, min: 0, max: 20, default: 0 },
    instinct: { type: Number, min: 0, max: 20, default: 0 },
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
      default: undefined,
    },
    wounds: {
      type: woundTrackSchema,
      default: () => ({}),
    },
    stamina: {
      type: resourceTrackSchema,
      default: undefined,
    },
    focus: {
      type: resourceTrackSchema,
      default: undefined,
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

// Unknown historical progression fields are inert and retained on explicit level edits.
const progressionSchema = new mongoose.Schema(
  {
    rank: {
      type: Number,
      min: 1,
      max: 20,
      default: 1,
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
  { _id: false, strict: false }
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
    reputation: {
      type: reputationSchema,
      default: () => ({}),
    },
    documentRevision: { type: Number, default: undefined },
    advancement: { type: mongoose.Schema.Types.Mixed, default: undefined },
    trainingRulesVersion: { type: Number, default: undefined },
    training: {
      type: [String],
      default: undefined,
      castNonArrays: false,
      validate: { validator(value) {
        if (value === undefined) return true; // Historical documents remain unconverted.
        try { if (!Array.isArray(value) || value.length !== 4 || new Set(value).size !== 4) return false;
        const known = [...require('../system/blueprints/training'), ...require('../system/blueprints/legacyTraining')].map(e=>e.id);
        return value.every(id=>typeof id === 'string' && known.includes(id)); }
        catch { return false; }
      }, message: 'Choose exactly four distinct canonical Training IDs' },
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

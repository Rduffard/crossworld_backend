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

const abilitySchema = new mongoose.Schema(
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
    source: {
      type: String,
      enum: ["calling", "origin", "relic", "custom"],
      default: "custom",
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
    rank: {
      type: Number,
      min: 1,
      default: 1,
    },
    attributes: {
      type: attributesSchema,
      default: () => ({}),
    },
    derivedStats: {
      type: derivedStatsSchema,
      default: () => ({}),
    },
    passives: {
      type: [String],
      default: [],
    },
    wounds: {
      type: [woundSchema],
      default: [],
    },
    abilities: {
      type: [abilitySchema],
      default: [],
    },
    inventory: {
      type: [inventoryItemSchema],
      default: [],
    },
    relics: {
      type: [relicSchema],
      default: [],
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

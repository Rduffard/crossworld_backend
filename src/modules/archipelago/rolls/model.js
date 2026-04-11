const mongoose = require("mongoose");

const rollSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ArchipelagoSession",
      default: null,
      index: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ArchipelagoCampaign",
      default: null,
      index: true,
    },
    characterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ArchipelagoCharacter",
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rollType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    label: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },
    formula: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    diceResults: {
      type: [Number],
      default: [],
    },
    modifier: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
    },
    visibility: {
      type: String,
      enum: ["public", "dm_only", "private"],
      default: "public",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

rollSchema.index({ sessionId: 1, createdAt: -1 });
rollSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("ArchipelagoRoll", rollSchema);

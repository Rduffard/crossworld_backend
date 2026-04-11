const mongoose = require("mongoose");

const achievementDefinitionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    sourceApp: {
      type: String,
      default: "global",
      trim: true,
      lowercase: true,
      maxlength: 40,
    },
    category: {
      type: String,
      default: "general",
      trim: true,
      lowercase: true,
      maxlength: 40,
    },
    points: {
      type: Number,
      min: 0,
      default: 0,
    },
    icon: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
    },
    hidden: {
      type: Boolean,
      default: false,
    },
    repeatable: {
      type: Boolean,
      default: false,
    },
    requirementType: {
      type: String,
      enum: ["event", "count", "streak", "custom"],
      default: "event",
    },
    requirementConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

achievementDefinitionSchema.index({ sourceApp: 1, active: 1 });
achievementDefinitionSchema.index({ category: 1, active: 1 });

module.exports = mongoose.model(
  "AchievementDefinition",
  achievementDefinitionSchema
);

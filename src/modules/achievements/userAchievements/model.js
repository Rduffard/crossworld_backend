const mongoose = require("mongoose");

const userAchievementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    achievementKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    sourceApp: {
      type: String,
      default: "global",
      trim: true,
      lowercase: true,
      maxlength: 40,
    },
    unlocked: {
      type: Boolean,
      default: false,
    },
    unlockedAt: {
      type: Date,
      default: null,
    },
    progress: {
      type: Number,
      min: 0,
      default: 0,
    },
    progressTarget: {
      type: Number,
      min: 1,
      default: 1,
    },
    seen: {
      type: Boolean,
      default: false,
    },
    lastAwardedAt: {
      type: Date,
      default: null,
    },
    sourceContext: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

userAchievementSchema.index({ userId: 1, achievementKey: 1 }, { unique: true });
userAchievementSchema.index({ userId: 1, unlocked: 1 });
userAchievementSchema.index({ userId: 1, sourceApp: 1 });

module.exports = mongoose.model("UserAchievement", userAchievementSchema);

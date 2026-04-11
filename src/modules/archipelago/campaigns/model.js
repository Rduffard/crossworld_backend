const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema(
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
      maxlength: 100,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    settingNotes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },
    inviteCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      minlength: 4,
      maxlength: 12,
    },
    players: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
    characterIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ArchipelagoCharacter",
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ["active", "paused", "completed"],
      default: "active",
    },
    maxPlayers: {
      type: Number,
      min: 1,
      max: 12,
      default: 6,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

campaignSchema.index({ owner: 1, status: 1 });

module.exports = mongoose.model("ArchipelagoCampaign", campaignSchema);

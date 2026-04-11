const mongoose = require("mongoose");

const initiativeEntrySchema = new mongoose.Schema(
  {
    characterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ArchipelagoCharacter",
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    label: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ArchipelagoCampaign",
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    roomCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      minlength: 4,
      maxlength: 12,
    },
    name: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
    },
    sessionNumber: {
      type: Number,
      min: 1,
      default: 1,
    },
    activeCharacterIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ArchipelagoCharacter",
        },
      ],
      default: [],
    },
    connectedUsers: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
    initiative: {
      type: [initiativeEntrySchema],
      default: [],
    },
    rollHistory: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ArchipelagoRoll",
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "closed"],
      default: "open",
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

sessionSchema.index({ createdBy: 1, status: 1 });

module.exports = mongoose.model("ArchipelagoSession", sessionSchema);

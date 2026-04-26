const mongoose = require("mongoose");

const communityThreadSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 140,
    },
    body: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    spaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommunitySpace",
      required: true,
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pinned: {
      type: Boolean,
      default: false,
    },
    locked: {
      type: Boolean,
      default: false,
    },
    replyCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

communityThreadSchema.index({ spaceId: 1, createdAt: -1 });
communityThreadSchema.index({ spaceId: 1, updatedAt: -1 });
communityThreadSchema.index({ updatedAt: -1 });

module.exports = mongoose.model("CommunityThread", communityThreadSchema);

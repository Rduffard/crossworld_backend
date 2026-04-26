const mongoose = require("mongoose");

const communityNotificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    spaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommunitySpace",
      default: null,
      index: true,
    },
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommunityThread",
      default: null,
      index: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

communityNotificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model("CommunityNotification", communityNotificationSchema);

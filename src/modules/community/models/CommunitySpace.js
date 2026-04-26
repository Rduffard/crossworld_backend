const mongoose = require("mongoose");

const communitySpaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    icon: {
      type: String,
      trim: true,
      default: "",
    },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public",
    },
    joinMode: {
      type: String,
      enum: ["open", "request", "invite"],
      default: "request",
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    unreadCounters: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        unreadCount: {
          type: Number,
          default: 0,
          min: 0,
        },
        lastReadAt: {
          type: Date,
          default: null,
        },
      },
    ],
    lastActiveAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

communitySpaceSchema.index({ updatedAt: -1 });

module.exports = mongoose.model("CommunitySpace", communitySpaceSchema);

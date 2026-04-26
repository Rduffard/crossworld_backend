const mongoose = require("mongoose");

const communityMembershipSchema = new mongoose.Schema(
  {
    spaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommunitySpace",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "moderator", "member"],
      default: "member",
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "pending", "banned"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

communityMembershipSchema.index({ spaceId: 1, userId: 1 }, { unique: true });
communityMembershipSchema.index({ spaceId: 1, status: 1, role: 1 });
communityMembershipSchema.index({ userId: 1, status: 1 });
communityMembershipSchema.index({ updatedAt: -1 });

module.exports = mongoose.model("CommunityMembership", communityMembershipSchema);

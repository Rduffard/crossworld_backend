const mongoose = require("mongoose");

const communityCommentSchema = new mongoose.Schema(
  {
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommunityThread",
      required: true,
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

communityCommentSchema.index({ threadId: 1, createdAt: 1 });
communityCommentSchema.index({ updatedAt: -1 });

module.exports = mongoose.model("CommunityComment", communityCommentSchema);

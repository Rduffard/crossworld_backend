const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    bugId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bug",
      required: true,
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 2000,
    },
    attachments: [
      {
        type: String, // Cloudinary URL
        trim: true,
      },
    ],
  },
  { timestamps: true }
);

// Optimized for loading comment threads
commentSchema.index({ bugId: 1, createdAt: -1 });

module.exports = mongoose.model("Comment", commentSchema);

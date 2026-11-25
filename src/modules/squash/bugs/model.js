const mongoose = require("mongoose");

const bugSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 140,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      maxlength: 5000,
      trim: true,
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },

    quality: {
      type: new mongoose.Schema({
        state: { type: String },
        severity: { type: String, enum: ["minor", "moderate", "major", "critical"] },
        revision: { type: Number, min: 1 },
        history: [{ _id: false, actor: mongoose.Schema.Types.ObjectId, from: String, to: String,
          severity: String, priority: String, reason: String, at: Date }],
      }, { _id: false }),
      default: undefined,
    },

    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "squash_project",
      required: true,
    },

    // NOTE: same User ref note as projects/model.js
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("squash_bug", bugSchema);

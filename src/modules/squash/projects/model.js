const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 80,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      maxlength: 1000,
      trim: true,
    },

    // NOTE: "user" vs "User" depends on how your auth User model is registered.
    // If your User model is mongoose.model("user", ...) then keep "user".
    // If it's mongoose.model("User", ...) change ref to "User".
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("squash_project", projectSchema);

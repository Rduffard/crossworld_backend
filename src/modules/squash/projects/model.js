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

    // NEW — optional GitHub repo in format "owner/repo"
    repoFullName: {
      type: String,
      trim: true,
      validate: {
        validator: function (value) {
          // Allow empty / undefined
          if (!value) return true;

          // Basic format validation: owner/repo
          return /^[^/]+\/[^/]+$/.test(value);
        },
        message: "repoFullName must be in format 'owner/repo'",
      },
    },

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

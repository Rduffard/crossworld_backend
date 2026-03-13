const mongoose = require("mongoose");

const playSchema = new mongoose.Schema(
  {
    trackId: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Play", playSchema);

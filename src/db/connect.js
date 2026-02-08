const mongoose = require("mongoose");
const { DB_URI } = require("../config");

module.exports = function connectDB() {
  return mongoose
    .connect(DB_URI)
    .then(() => console.log("Connected to DB"))
    .catch((err) => {
      console.error("Mongo connection error:", err);
      process.exit(1);
    });
};

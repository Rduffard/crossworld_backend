require("dotenv").config();

const {
  PORT = 3001,
  DB_URI = "mongodb://127.0.0.1:27017/crossworld",
  JWT_SECRET = "super-strong-secret",
} = process.env;

module.exports = {
  PORT,
  DB_URI,
  JWT_SECRET,
};

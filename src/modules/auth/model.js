const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");

const UnauthorizedError = require("../../errors/unauthorized-error");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      minlength: 2,
      maxlength: 30,
      default: "Jacques Cousteau",
    },
    avatar: {
      type: String,
      validate: {
        validator: (v) => validator.isURL(v),
        message: "Avatar must be a valid URL",
      },
    },
    email: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: (v) => validator.isEmail(v),
        message: "Email must be a valid email",
      },
    },
    password: {
      type: String,
      required: true,
      select: false, // IMPORTANT: do not return password hash by default
    },
  },
  { versionKey: false }
);

// WTWR-style helper: used by /signin
userSchema.statics.findUserByCredentials = function findUserByCredentials(
  email,
  password
) {
  return this.findOne({ email })
    .select("+password")
    .then((user) => {
      if (!user) {
        throw new UnauthorizedError("Incorrect email or password");
      }

      return bcrypt.compare(password, user.password).then((matched) => {
        if (!matched) {
          throw new UnauthorizedError("Incorrect email or password");
        }
        return user;
      });
    });
};

module.exports = mongoose.model("User", userSchema);

const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");

const UnauthorizedError = require("../../core/errors/unauthorized-error");

const userSettingsSchema = new mongoose.Schema(
  {
    profileDisplayName: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "",
    },
    avatarUrl: {
      type: String,
      default: "",
      validate: {
        validator: (value) => !value || validator.isURL(value),
        message: "avatarUrl must be a valid URL",
      },
    },
    theme: {
      type: String,
      enum: ["default", "system", "light"],
      default: "default",
    },
    accentColor: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "",
    },
    brandSkin: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "default",
    },
    emailNotifications: {
      type: Boolean,
      default: true,
    },
    productUpdates: {
      type: Boolean,
      default: true,
    },
    defaultLandingApp: {
      type: String,
      enum: ["dashboard", "squash", "wtwr", "archipelago"],
      default: "dashboard",
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      minlength: 2,
      maxlength: 30,
      default: "Jacques Cousteau",
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 60,
    },
    avatar: {
      type: String,
      validate: {
        validator: (value) => validator.isURL(value),
        message: "Avatar must be a valid URL",
      },
    },
    email: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: (value) => validator.isEmail(value),
        message: "Email must be a valid email",
      },
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    settings: {
      type: userSettingsSchema,
      default: () => ({}),
    },
  },
  { versionKey: false }
);

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

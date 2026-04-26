const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../users/model");
const { deriveDisplayName, sanitizeUser, sanitizeUserSettings } = require("../users/utils");
const { JWT_SECRET } = require("../../config/env");

const BadRequestError = require("../../core/errors/bad-request-error");
const ConflictError = require("../../core/errors/conflict-error");
const UnauthorizedError = require("../../core/errors/unauthorized-error");

/**
 * POST /auth/signup
 */
const createUser = (req, res, next) => {
  const { name, avatar, email, password } = req.body;
  const normalizedAvatar =
    typeof avatar === "string" && avatar.trim() ? avatar : undefined;
  const displayName = deriveDisplayName({ name, email });

  bcrypt
    .hash(password, 10)
    .then((hash) =>
      User.create({
        name,
        displayName,
        avatar: normalizedAvatar,
        email,
        password: hash,
      })
    )
    .then((user) => res.status(201).send(sanitizeUser(user)))
    .catch((err) => {
      if (err.code === 11000) {
        return next(new ConflictError("Email already exists"));
      }
      if (err.name === "ValidationError") {
        return next(new BadRequestError("Invalid data"));
      }
      return next(err);
    });
};

/**
 * POST /auth/signin
 */
const login = (req, res, next) => {
  const { email, password } = req.body;

  // defensive check (celebrate should already handle this)
  if (!email || !password) {
    return next(new BadRequestError("Invalid data"));
  }

  return User.findUserByCredentials(email, password)
    .then((user) => {
      const token = jwt.sign({ _id: user._id }, JWT_SECRET, {
        expiresIn: "7d",
      });

      res.send({ token });
    })
    .catch((err) => {
      if (err.message === "Incorrect email or password") {
        return next(new UnauthorizedError("Incorrect email or password"));
      }
      return next(err);
    });
};

/**
 * GET /auth/users/me/settings
 */
const getCurrentUserSettings = (req, res, next) => {
  User.findById(req.user._id)
    .orFail()
    .then((user) => res.send(sanitizeUserSettings(user)))
    .catch((err) => {
      if (err.name === "DocumentNotFoundError") {
        return next(new UnauthorizedError("Authorization required"));
      }

      return next(err);
    });
};

/**
 * PATCH /auth/users/me/settings
 */
const updateCurrentUserSettings = (req, res, next) => {
  const nextSettings = Object.fromEntries(
    Object.entries(req.body).filter(([, value]) => value !== undefined)
  );

  User.findById(req.user._id)
    .orFail()
    .then((user) => {
      Object.entries(nextSettings).forEach(([key, value]) => {
        user.set(`settings.${key}`, value);
      });

      if (
        Object.prototype.hasOwnProperty.call(
          nextSettings,
          "profileDisplayName"
        )
      ) {
        user.displayName = deriveDisplayName({
          displayName: nextSettings.profileDisplayName,
          name: user.name,
          email: user.email,
        });
      }

      return user.save();
    })
    .then((user) => res.send(sanitizeUserSettings(user)))
    .catch((err) => {
      if (err.name === "ValidationError") {
        return next(new BadRequestError("Invalid data"));
      }

      if (err.name === "DocumentNotFoundError") {
        return next(new UnauthorizedError("Authorization required"));
      }

      return next(err);
    });
};

/**
 * PATCH /auth/users/me
 */
const updateCurrentAuthUser = (req, res, next) => {
  User.findById(req.user._id)
    .orFail()
    .then((user) => {
      if (req.body.name !== undefined) {
        user.name = req.body.name;
      }

      if (req.body.email !== undefined) {
        user.email = req.body.email;
      }

      if (!user.settings?.profileDisplayName) {
        user.displayName = deriveDisplayName({
          name: user.name,
          email: user.email,
        });
      }

      return user.save();
    })
    .then((user) => res.send(sanitizeUser(user)))
    .catch((err) => {
      if (err.code === 11000) {
        return next(new ConflictError("Email already exists"));
      }

      if (err.name === "ValidationError") {
        return next(new BadRequestError("Invalid data"));
      }

      if (err.name === "DocumentNotFoundError") {
        return next(new UnauthorizedError("Authorization required"));
      }

      return next(err);
    });
};

/**
 * PATCH /auth/users/me/password
 */
const updateCurrentUserPassword = (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  User.findById(req.user._id)
    .select("+password")
    .orFail()
    .then((user) =>
      bcrypt.compare(currentPassword, user.password).then((matched) => {
        if (!matched) {
          throw new UnauthorizedError("Incorrect current password");
        }

        return bcrypt.hash(newPassword, 10).then((hash) => {
          user.password = hash;
          return user.save();
        });
      })
    )
    .then(() => res.send({ message: "Password updated successfully" }))
    .catch((err) => {
      if (err.name === "ValidationError") {
        return next(new BadRequestError("Invalid data"));
      }

      if (err.name === "DocumentNotFoundError") {
        return next(new UnauthorizedError("Authorization required"));
      }

      return next(err);
    });
};

module.exports = {
  createUser,
  login,
  getCurrentUserSettings,
  updateCurrentUserSettings,
  updateCurrentAuthUser,
  updateCurrentUserPassword,
};

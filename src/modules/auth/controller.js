const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../users/model");
const { JWT_SECRET } = require("../../config/env");

const BadRequestError = require("../../core/errors/bad-request-error");
const ConflictError = require("../../core/errors/conflict-error");
const UnauthorizedError = require("../../core/errors/unauthorized-error");

/**
 * POST /auth/signup
 */
const createUser = (req, res, next) => {
  const { name, avatar, email, password } = req.body;
  const normalizedAvatar = typeof avatar === "string" && avatar.trim() ? avatar : undefined;

  bcrypt
    .hash(password, 10)
    .then((hash) =>
      User.create({
        name,
        avatar: normalizedAvatar,
        email,
        password: hash,
      })
    )
    .then((user) =>
      res.status(201).send({
        _id: user._id,
        name: user.name,
        avatar: user.avatar,
        email: user.email,
      })
    )
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

module.exports = {
  createUser,
  login,
};

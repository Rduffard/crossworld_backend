const User = require("./model");
const { sanitizeUser } = require("./utils");

const BadRequestError = require("../../core/errors/bad-request-error");
const NotFoundError = require("../../core/errors/not-found-error");

const getCurrentUser = (req, res, next) => {
  User.findById(req.user._id)
    .orFail()
    .then((user) => res.send(sanitizeUser(user)))
    .catch((err) => {
      if (err.name === "DocumentNotFoundError") {
        return next(new NotFoundError("User not found"));
      }

      return next(err);
    });
};

const updateCurrentUser = (req, res, next) => {
  const { name, avatar } = req.body;

  User.findByIdAndUpdate(
    req.user._id,
    { name, avatar },
    { new: true, runValidators: true }
  )
    .orFail()
    .then((user) => res.send(sanitizeUser(user)))
    .catch((err) => {
      if (err.name === "ValidationError") {
        return next(new BadRequestError("Invalid data"));
      }

      if (err.name === "DocumentNotFoundError") {
        return next(new NotFoundError("User not found"));
      }

      return next(err);
    });
};

module.exports = {
  getCurrentUser,
  updateCurrentUser,
};

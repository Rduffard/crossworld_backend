const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config");
const UnauthorizedError = require("../errors/unauthorized-error");

module.exports = (req, res, next) => {
  const { authorization } = req.headers;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Authorization required"));
  }

  const token = authorization.replace("Bearer ", "");

  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    return next(new UnauthorizedError("Authorization required"));
  }

  return next();
};

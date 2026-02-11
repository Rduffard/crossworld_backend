const router = require("express").Router();

const {
  createUser,
  login,
  getCurrentUser,
  updateCurrentUser,
} = require("./controller");

const auth = require("../../middlewares/auth");

const {
  validateUserBody,
  validateLogin,
  validateUserUpdate,
} = require("../../middlewares/validation");

router.post("/signup", validateUserBody, createUser);
router.post("/signin", validateLogin, login);

// protected user routes
router.get("/users/me", auth, getCurrentUser);
router.patch("/users/me", auth, validateUserUpdate, updateCurrentUser);

module.exports = router;

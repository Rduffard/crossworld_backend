const router = require("express").Router();

const auth = require("../../core/middleware/auth");
const {
  createUser,
  login,
  getCurrentUserSettings,
  updateCurrentUserSettings,
  updateCurrentAuthUser,
  updateCurrentUserPassword,
} = require("./controller");
const {
  validateSignup,
  validateLogin,
  validateUserSettingsUpdate,
  validateCurrentAuthUserUpdate,
  validateCurrentUserPasswordUpdate,
} = require("./validators");

router.post("/signup", validateSignup, createUser);
router.post("/signin", validateLogin, login);
router.patch(
  "/users/me",
  auth,
  validateCurrentAuthUserUpdate,
  updateCurrentAuthUser
);
router.get("/users/me/settings", auth, getCurrentUserSettings);
router.patch(
  "/users/me/settings",
  auth,
  validateUserSettingsUpdate,
  updateCurrentUserSettings
);
router.patch(
  "/users/me/password",
  auth,
  validateCurrentUserPasswordUpdate,
  updateCurrentUserPassword
);

module.exports = router;

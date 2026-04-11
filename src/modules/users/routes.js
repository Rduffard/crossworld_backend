const router = require("express").Router();

const auth = require("../../core/middleware/auth");
const { getCurrentUser, updateCurrentUser } = require("./controller");
const { validateCurrentUserUpdate } = require("./validators");

router.use(auth);

router.get("/me", getCurrentUser);
router.patch("/me", validateCurrentUserUpdate, updateCurrentUser);

module.exports = router;

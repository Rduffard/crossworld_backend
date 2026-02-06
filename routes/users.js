const router = require("express").Router();
const { getCurrentUser, updateUser } = require("../controllers/users");

const { validateUserUpdate } = require("../middlewares/validation");

router.get("/me", getCurrentUser);
router.patch("/me", validateUserUpdate, updateUser);

module.exports = router;

const router = require("express").Router();

const { createUser, login } = require("./controller"); // adjust if your exports differ
const {
  validateUserBody,
  validateLogin,
} = require("../../middlewares/validation");

router.post("/signup", validateUserBody, createUser);
router.post("/signin", validateLogin, login);

module.exports = router;

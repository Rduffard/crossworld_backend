const router = require("express").Router();

const { createUser, login } = require("./controller");
const { validateSignup, validateLogin } = require("./validators");

router.post("/signup", validateSignup, createUser);
router.post("/signin", validateLogin, login);

module.exports = router;

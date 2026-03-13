const router = require("express").Router();
const { createPlay } = require("./controller");

router.post("/", createPlay);

module.exports = router;

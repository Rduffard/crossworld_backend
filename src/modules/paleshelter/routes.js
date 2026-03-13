const router = require("express").Router();
const { createPlay, getPlayCounts } = require("./controller");

router.get("/", getPlayCounts);
router.post("/", createPlay);

module.exports = router;

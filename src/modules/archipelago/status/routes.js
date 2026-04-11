const router = require("express").Router();

const { getStatus } = require("./controller");

router.get("/", getStatus);

module.exports = router;

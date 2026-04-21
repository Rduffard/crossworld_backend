const router = require("express").Router();

const { getBlueprint } = require("./controller");

router.get("/blueprint", getBlueprint);

module.exports = router;

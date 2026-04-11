const router = require("express").Router();

const {
  listDefinitions,
  getDefinitionByKey,
} = require("./controller");
const { validateAchievementKeyParam } = require("./validators");

router.get("/", listDefinitions);
router.get("/:achievementKey", validateAchievementKeyParam, getDefinitionByKey);

module.exports = router;

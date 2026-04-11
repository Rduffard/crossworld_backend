const router = require("express").Router();

const auth = require("../../../core/middleware/auth");
const {
  getMyAchievements,
  getMyAchievementSummary,
} = require("./controller");

router.use(auth);

router.get("/summary", getMyAchievementSummary);
router.get("/", getMyAchievements);

module.exports = router;

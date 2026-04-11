const router = require("express").Router();

const definitionRoutes = require("./definitions/routes");
const userAchievementRoutes = require("./userAchievements/routes");

router.use("/me", userAchievementRoutes);
router.use("/", definitionRoutes);

module.exports = router;

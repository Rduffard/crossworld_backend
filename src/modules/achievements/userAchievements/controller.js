const achievementService = require("../service");

const getMyAchievements = async (req, res, next) => {
  try {
    const achievements = await achievementService.getUserAchievements(req.user._id, {
      sourceApp: req.query.sourceApp,
      unlocked:
        typeof req.query.unlocked === "string"
          ? req.query.unlocked === "true"
          : undefined,
      includeHidden: req.query.includeHidden === "true",
    });

    res.send(achievements);
  } catch (err) {
    next(err);
  }
};

const getMyAchievementSummary = async (req, res, next) => {
  try {
    const summary = await achievementService.getUserAchievementSummary(req.user._id, {
      sourceApp: req.query.sourceApp,
      includeHidden: req.query.includeHidden === "true",
    });

    res.send(summary);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMyAchievements,
  getMyAchievementSummary,
};

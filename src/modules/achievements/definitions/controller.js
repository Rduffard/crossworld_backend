const achievementService = require("../service");

const BadRequestError = require("../../../core/errors/bad-request-error");

const listDefinitions = async (req, res, next) => {
  try {
    const definitions = await achievementService.listAchievementDefinitions({
      sourceApp: req.query.sourceApp,
      category: req.query.category,
      includeHidden: req.query.includeHidden === "true",
    });

    res.send(definitions);
  } catch (err) {
    next(err);
  }
};

const getDefinitionByKey = async (req, res, next) => {
  try {
    const definition = await achievementService.getAchievementDefinition(
      req.params.achievementKey,
      {
        includeHidden: req.query.includeHidden === "true",
      }
    );

    res.send(definition);
  } catch (err) {
    if (err.name === "CastError") {
      return next(new BadRequestError("Invalid achievement key"));
    }

    return next(err);
  }
};

module.exports = {
  listDefinitions,
  getDefinitionByKey,
};

const { celebrate, Joi } = require("celebrate");

const achievementKeySchema = Joi.string()
  .trim()
  .lowercase()
  .pattern(/^[a-z0-9_-]{2,80}$/)
  .required();

module.exports.validateAchievementKeyParam = celebrate({
  params: Joi.object({
    achievementKey: achievementKeySchema,
  }),
});

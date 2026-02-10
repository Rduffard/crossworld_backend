const { celebrate, Joi } = require("celebrate");

const objectId = Joi.string().hex().length(24);

module.exports.validateCreateBug = celebrate({
  body: Joi.object().keys({
    title: Joi.string().min(2).max(140).required(),
    description: Joi.string().max(5000).allow("").optional(),
    status: Joi.string()
      .valid("open", "in_progress", "resolved", "closed")
      .optional(),
    priority: Joi.string()
      .valid("low", "medium", "high", "critical")
      .optional(),
    projectId: objectId.required(),
    assignee: objectId.allow(null).optional(),
  }),
});

module.exports.validateBugQuery = celebrate({
  query: Joi.object().keys({
    projectId: objectId.optional(),
  }),
});

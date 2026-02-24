const { celebrate, Joi } = require("celebrate");

const validateCreateProject = celebrate({
  body: Joi.object().keys({
    name: Joi.string().min(2).max(80).required(),
    description: Joi.string().allow("").max(1000),
    repoFullName: Joi.string()
      .empty("")
      .pattern(/^[^/]+\/[^/]+$/)
      .messages({
        "string.pattern.base": "repoFullName must be in format 'owner/repo'",
      }),
  }),
});

const validateProjectIdParam = celebrate({
  params: Joi.object().keys({
    projectId: Joi.string().hex().length(24).required(),
  }),
});

const validateUpdateProject = celebrate({
  body: Joi.object()
    .keys({
      name: Joi.string().min(2).max(80),
      description: Joi.string().allow("").max(1000),
      repoFullName: Joi.string()
        .empty("")
        .pattern(/^[^/]+\/[^/]+$/)
        .messages({
          "string.pattern.base": "repoFullName must be in format 'owner/repo'",
        }),
    })
    .min(1),
});

module.exports = {
  validateCreateProject,
  validateProjectIdParam,
  validateUpdateProject,
};

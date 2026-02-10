const { celebrate, Joi } = require("celebrate");

const objectId = Joi.string().hex().length(24);

module.exports.validateCreateProject = celebrate({
  body: Joi.object().keys({
    name: Joi.string().min(2).max(80).required(),
    description: Joi.string().max(1000).allow("").optional(),
  }),
});

module.exports.validateProjectIdParam = celebrate({
  params: Joi.object().keys({
    projectId: objectId.required(),
  }),
});

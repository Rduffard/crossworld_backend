const { Joi, celebrate } = require("celebrate");
const validator = require("validator");

const validateURL = (value, helpers) => {
  if (validator.isURL(value)) {
    return value;
  }
  return helpers.error("string.uri");
};

/**
 * 1) Clothing item body when an item is created
 * - name: required string 2–30
 * - imageUrl: required URL
 */
module.exports.validateClothingItemBody = celebrate({
  body: Joi.object().keys({
    name: Joi.string().required().min(2).max(30).messages({
      "string.min": 'The minimum length of the "name" field is 2',
      "string.max": 'The maximum length of the "name" field is 30',
      "string.empty": 'The "name" field must be filled in',
      "any.required": 'The "name" field must be filled in',
    }),

    imageUrl: Joi.string().required().custom(validateURL).messages({
      "string.empty": 'The "imageUrl" field must be filled in',
      "string.uri": 'The "imageUrl" field must be a valid url',
      "any.required": 'The "imageUrl" field must be filled in',
    }),
  }),
});

/**
 * 2) User info body when a user is created (signup)
 * - name: string 2–30 (not marked required in the brief, but included)
 * - avatar: required URL
 * - email: required valid email
 * - password: required string
 */
module.exports.validateUserBody = celebrate({
  body: Joi.object().keys({
    name: Joi.string().min(2).max(30).messages({
      "string.min": 'The minimum length of the "name" field is 2',
      "string.max": 'The maximum length of the "name" field is 30',
    }),

    avatar: Joi.string().required().custom(validateURL).messages({
      "string.empty": 'The "avatar" field must be filled in',
      "string.uri": 'The "avatar" field must be a valid url',
      "any.required": 'The "avatar" field must be filled in',
    }),

    email: Joi.string().required().email().messages({
      "string.empty": 'The "email" field must be filled in',
      "string.email": 'The "email" field must be a valid email',
      "any.required": 'The "email" field must be filled in',
    }),

    password: Joi.string().required().messages({
      "string.empty": 'The "password" field must be filled in',
      "any.required": 'The "password" field must be filled in',
    }),
  }),
});

/**
 * 3) Authentication when a user logs in (signin)
 * - email: required valid email
 * - password: required string
 */
module.exports.validateLogin = celebrate({
  body: Joi.object().keys({
    email: Joi.string().required().email().messages({
      "string.empty": 'The "email" field must be filled in',
      "string.email": 'The "email" field must be a valid email',
      "any.required": 'The "email" field must be filled in',
    }),

    password: Joi.string().required().messages({
      "string.empty": 'The "password" field must be filled in',
      "any.required": 'The "password" field must be filled in',
    }),
  }),
});

/**
 * 4) User and clothing item IDs when they are accessed
 * - IDs must be hex value length 24
 */
module.exports.validateUserId = celebrate({
  params: Joi.object().keys({
    userId: Joi.string().required().hex().length(24).messages({
      "string.hex": 'The "userId" must be a valid hexadecimal value',
      "string.length": 'The "userId" must be 24 characters long',
      "string.empty": 'The "userId" field must be filled in',
      "any.required": 'The "userId" field must be filled in',
    }),
  }),
});

module.exports.validateItemId = celebrate({
  params: Joi.object().keys({
    itemId: Joi.string().required().hex().length(24).messages({
      "string.hex": 'The "itemId" must be a valid hexadecimal value',
      "string.length": 'The "itemId" must be 24 characters long',
      "string.empty": 'The "itemId" field must be filled in',
      "any.required": 'The "itemId" field must be filled in',
    }),
  }),
});

module.exports.validateUserUpdate = celebrate({
  body: Joi.object().keys({
    name: Joi.string().min(2).max(30).messages({
      "string.min": 'The minimum length of the "name" field is 2',
      "string.max": 'The maximum length of the "name" field is 30',
    }),

    avatar: Joi.string().custom(validateURL).messages({
      "string.uri": 'The "avatar" field must be a valid url',
    }),
  }),
});

module.exports.validateURL = validateURL;

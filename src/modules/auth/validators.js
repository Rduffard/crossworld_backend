const { Joi, celebrate } = require("celebrate");
const validator = require("validator");

const validateURL = (value, helpers) => {
  if (validator.isURL(value)) {
    return value;
  }

  return helpers.error("string.uri");
};

module.exports.validateSignup = celebrate({
  body: Joi.object().keys({
    name: Joi.string().min(2).max(30).messages({
      "string.min": 'The minimum length of the "name" field is 2',
      "string.max": 'The maximum length of the "name" field is 30',
    }),

    avatar: Joi.string().custom(validateURL).allow("").optional().messages({
      "string.uri": 'The "avatar" field must be a valid url',
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

module.exports.validateUserSettingsUpdate = celebrate({
  body: Joi.object()
    .keys({
      profileDisplayName: Joi.string().max(60).allow("").messages({
        "string.max":
          'The maximum length of the "profileDisplayName" field is 60',
      }),

      avatarUrl: Joi.string().custom(validateURL).allow("").messages({
        "string.uri": 'The "avatarUrl" field must be a valid url',
      }),

      theme: Joi.string()
        .valid("default", "system", "light")
        .messages({
          "any.only":
            'The "theme" field must be one of: default, system, light',
        }),

      accentColor: Joi.string().max(40).allow("").messages({
        "string.max": 'The maximum length of the "accentColor" field is 40',
      }),

      brandSkin: Joi.string()
        .valid(
          "default",
          "crossworld",
          "archipelago",
          "squash",
          "paleshelter",
          "taxicop",
          "lilan",
          "yuma"
        )
        .messages({
          "any.only":
            'The "brandSkin" field must be one of: default, crossworld, archipelago, squash, paleshelter, taxicop, lilan, yuma',
        }),

      emailNotifications: Joi.boolean(),

      productUpdates: Joi.boolean(),

      defaultLandingApp: Joi.string()
        .valid("dashboard", "squash", "wtwr", "archipelago")
        .messages({
          "any.only":
            'The "defaultLandingApp" field must be one of: dashboard, squash, wtwr, archipelago',
        }),
    })
    .min(1),
});

module.exports.validateCurrentAuthUserUpdate = celebrate({
  body: Joi.object()
    .keys({
      name: Joi.string().min(2).max(30).messages({
        "string.min": 'The minimum length of the "name" field is 2',
        "string.max": 'The maximum length of the "name" field is 30',
      }),

      email: Joi.string().email().messages({
        "string.email": 'The "email" field must be a valid email',
      }),
    })
    .min(1),
});

module.exports.validateCurrentUserPasswordUpdate = celebrate({
  body: Joi.object().keys({
    currentPassword: Joi.string().required().messages({
      "string.empty": 'The "currentPassword" field must be filled in',
      "any.required": 'The "currentPassword" field must be filled in',
    }),

    newPassword: Joi.string().required().messages({
      "string.empty": 'The "newPassword" field must be filled in',
      "any.required": 'The "newPassword" field must be filled in',
    }),

    confirmPassword: Joi.string()
      .required()
      .valid(Joi.ref("newPassword"))
      .messages({
        "any.only":
          'The "confirmPassword" field must match the "newPassword" field',
        "string.empty": 'The "confirmPassword" field must be filled in',
        "any.required": 'The "confirmPassword" field must be filled in',
      }),
  }),
});

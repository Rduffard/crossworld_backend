const { celebrate, Joi } = require("celebrate");

const objectId = Joi.string().hex().length(24);
const visibility = Joi.string().valid("public", "private");
const joinMode = Joi.string().valid("open", "request", "invite");
const paginationNumber = Joi.number().integer().min(1);

module.exports.validateSpaceSlug = celebrate({
  params: Joi.object().keys({
    slug: Joi.string().trim().lowercase().min(2).max(80).required(),
  }),
});

module.exports.validateSpaceId = celebrate({
  params: Joi.object().keys({
    spaceId: objectId.required(),
  }),
});

module.exports.validateSpacesQuery = celebrate({
  query: Joi.object().keys({
    search: Joi.string().trim().max(60).allow("").optional(),
  }),
});

module.exports.validateCreateSpace = celebrate({
  body: Joi.object().keys({
    name: Joi.string().trim().min(2).max(60).required(),
    slug: Joi.string().trim().lowercase().max(80).allow("").optional(),
    description: Joi.string().trim().max(500).allow("").optional(),
    icon: Joi.string().trim().allow("").optional(),
    visibility: visibility.optional(),
    joinMode: joinMode.optional(),
  }),
});

module.exports.validateUpdateSpace = celebrate({
  params: Joi.object().keys({
    spaceId: objectId.required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string().trim().min(2).max(60).optional(),
      slug: Joi.string().trim().lowercase().max(80).allow("").optional(),
      description: Joi.string().trim().max(500).allow("").optional(),
      icon: Joi.string().trim().allow("").optional(),
      visibility: visibility.optional(),
      joinMode: joinMode.optional(),
    })
    .min(1),
});

module.exports.validateSpaceThreads = celebrate({
  params: Joi.object().keys({
    spaceId: objectId.required(),
  }),
  query: Joi.object().keys({
    page: paginationNumber.optional(),
    limit: paginationNumber.max(50).optional(),
    sort: Joi.string().valid("newest", "most_active").optional(),
    search: Joi.string().trim().max(100).allow("").optional(),
  }),
});

module.exports.validateCreateThread = celebrate({
  params: Joi.object().keys({
    spaceId: objectId.required(),
  }),
  body: Joi.object().keys({
    title: Joi.string().trim().min(2).max(140).required(),
    body: Joi.string().trim().max(5000).allow("").optional(),
    pinned: Joi.boolean().optional(),
    locked: Joi.boolean().optional(),
  }),
});

module.exports.validateModerateThread = celebrate({
  params: Joi.object().keys({
    threadId: objectId.required(),
  }),
  body: Joi.object()
    .keys({
      pinned: Joi.boolean().optional(),
      locked: Joi.boolean().optional(),
    })
    .min(1),
});

module.exports.validateDeleteThread = celebrate({
  params: Joi.object().keys({
    threadId: objectId.required(),
  }),
});

module.exports.validateThreadComments = celebrate({
  params: Joi.object().keys({
    threadId: objectId.required(),
  }),
  query: Joi.object().keys({
    page: paginationNumber.optional(),
    limit: paginationNumber.max(100).optional(),
  }),
});

module.exports.validateCreateComment = celebrate({
  params: Joi.object().keys({
    threadId: objectId.required(),
  }),
  body: Joi.object().keys({
    body: Joi.string().trim().min(1).max(3000).required(),
  }),
});

module.exports.validateDeleteComment = celebrate({
  params: Joi.object().keys({
    commentId: objectId.required(),
  }),
});

module.exports.validateMemberAction = celebrate({
  params: Joi.object().keys({
    spaceId: objectId.required(),
  }),
});

module.exports.validateSpaceMemberTarget = celebrate({
  params: Joi.object().keys({
    spaceId: objectId.required(),
    userId: objectId.required(),
  }),
});

const { celebrate, Joi } = require("celebrate");

const objectId = Joi.string().hex().length(24);

const attributeSchema = Joi.number().integer().min(0).max(10);

const woundSchema = Joi.object({
  name: Joi.string().min(1).max(80).required(),
  description: Joi.string().allow("").max(500).default(""),
  statPenalty: Joi.string()
    .valid("might", "agility", "wit", "spirit", "resolve", "instinct")
    .allow(null),
  severity: Joi.string().valid("minor", "major", "critical").default("minor"),
});

const abilitySchema = Joi.object({
  name: Joi.string().min(1).max(80).required(),
  description: Joi.string().allow("").max(500).default(""),
  source: Joi.string().valid("calling", "origin", "relic", "custom").default("custom"),
});

const inventoryItemSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  quantity: Joi.number().integer().min(1).default(1),
  description: Joi.string().allow("").max(500).default(""),
});

const relicSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().allow("").max(500).default(""),
  bonded: Joi.boolean().default(false),
});

const characterBodySchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  pronouns: Joi.string().allow("").max(40).default(""),
  calling: Joi.string().min(2).max(40).required(),
  origin: Joi.string().min(2).max(40).required(),
  rank: Joi.number().integer().min(1).max(20).default(1),
  attributes: Joi.object({
    might: attributeSchema,
    agility: attributeSchema,
    wit: attributeSchema,
    spirit: attributeSchema,
    resolve: attributeSchema,
    instinct: attributeSchema,
  }).default({}),
  passives: Joi.array().items(Joi.string().max(120)).default([]),
  wounds: Joi.array().items(woundSchema).default([]),
  abilities: Joi.array().items(abilitySchema).default([]),
  inventory: Joi.array().items(inventoryItemSchema).default([]),
  relics: Joi.array().items(relicSchema).default([]),
  notes: Joi.string().allow("").max(5000).default(""),
  portraitUrl: Joi.string().allow("").max(500).default(""),
  campaignId: objectId.allow(null).default(null),
  status: Joi.string().valid("active", "archived", "retired").default("active"),
});

module.exports.validateCreateCharacter = celebrate({
  body: characterBodySchema,
});

module.exports.validateUpdateCharacter = celebrate({
  body: characterBodySchema.fork(["name", "calling", "origin"], (schema) =>
    schema.optional()
  ),
});

module.exports.validateCharacterIdParam = celebrate({
  params: Joi.object({
    characterId: objectId.required(),
  }),
});

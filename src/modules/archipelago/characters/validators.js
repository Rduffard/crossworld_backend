const { celebrate, Joi } = require("celebrate");

const objectId = Joi.string().hex().length(24);

const attributeSchema = Joi.number().integer().min(0).max(10);
const reputationSchema = Joi.number().integer().min(-3).max(3);

const derivedStatsSchema = Joi.object({
  vitality: Joi.number().integer().min(0).default(10),
  guard: Joi.number().integer().min(0).default(10),
  initiative: Joi.number().integer().min(0).default(10),
  focus: Joi.number().integer().min(0).default(10),
}).default({});

const socialStatsSchema = Joi.object({
  grace: Joi.number().integer().min(0).default(10),
  guile: Joi.number().integer().min(0).default(10),
  pressure: Joi.number().integer().min(0).default(10),
}).default({});

const pairingStatsSchema = Joi.object({
  skirmish: Joi.number().integer().min(0).default(10),
  leverage: Joi.number().integer().min(0).default(10),
  conviction: Joi.number().integer().min(0).default(10),
  pressure: Joi.number().integer().min(0).default(10),
  pursuit: Joi.number().integer().min(0).default(10),
  precision: Joi.number().integer().min(0).default(10),
  flourish: Joi.number().integer().min(0).default(10),
  balance: Joi.number().integer().min(0).default(10),
  reflex: Joi.number().integer().min(0).default(10),
  guile: Joi.number().integer().min(0).default(10),
  tactics: Joi.number().integer().min(0).default(10),
  sense: Joi.number().integer().min(0).default(10),
  grace: Joi.number().integer().min(0).default(10),
  attunement: Joi.number().integer().min(0).default(10),
  nerve: Joi.number().integer().min(0).default(10),
}).default({});

const reputationMapSchema = Joi.object({
  yumaRepublic: reputationSchema,
  lilinEmpire: reputationSchema,
  freeCaptains: reputationSchema,
  rebelMovements: reputationSchema,
  guildConsortium: reputationSchema,
  nobleCourts: reputationSchema,
  underworld: reputationSchema,
  faithOrders: reputationSchema,
  seaPeoples: reputationSchema,
  frontierTribes: reputationSchema,
}).default({});

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
  derivedStats: derivedStatsSchema,
  socialStats: socialStatsSchema,
  pairingStats: pairingStatsSchema,
  reputation: reputationMapSchema,
  passives: Joi.array().items(Joi.string().max(500)).default([]),
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

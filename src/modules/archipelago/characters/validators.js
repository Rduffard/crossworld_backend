const { trainingIds } = require('../system/training');
const { celebrate, Joi } = require("celebrate");

const objectId = Joi.string().hex().length(24);

const attributeSchema = Joi.number().integer().min(8).max(16);
const reputationSchema = Joi.number().integer().min(-3).max(3);

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

const abilityCostSchema = Joi.object({
  resource: Joi.string().valid("stamina", "focus", "corruption", "health", "").default(""),
  amount: Joi.number().integer().min(0).default(0),
}).default({});

const abilityScalingSchema = Joi.object({
  attribute: Joi.string()
    .valid("might", "agility", "wit", "spirit", "resolve", "instinct", "")
    .default(""),
  skill: Joi.string().allow("").max(80).default(""),
}).default({});

const abilitySchema = Joi.object({
  id: Joi.string().allow("").max(80).default(""),
  name: Joi.string().min(1).max(80).required(),
  type: Joi.string().valid("active", "passive", "reaction").default("active"),
  description: Joi.string().allow("").max(500).default(""),
  source: Joi.string().valid("calling", "origin", "relic", "custom").default("custom"),
  cost: abilityCostSchema,
  scaling: abilityScalingSchema,
  tags: Joi.array().items(Joi.string().max(80)).default([]),
  effect: Joi.string().allow("").max(500).default(""),
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

const tagSchema = Joi.object({
  type: Joi.string().valid("tag", "trait", "scar", "license").default("tag"),
  key: Joi.string().min(1).max(80).required(),
  label: Joi.string().min(1).max(80).required(),
  mechanicalImpact: Joi.string().allow("").max(500).default(""),
});

const backgroundSchema = Joi.object({
  origin: Joi.string().allow("").max(80).default(""),
  pastRole: Joi.string().allow("").max(80).default(""),
  definingEvent: Joi.string().allow("").max(240).default(""),
}).default({});

const identitySchema = Joi.object({
  background: backgroundSchema,
  tags: Joi.array().items(tagSchema).default([]),
}).default({});

const resourceTrackSchema = Joi.object({
  current: Joi.number().integer().min(0).default(0),
  max: Joi.number().integer().min(0).default(0),
}).default({});

const woundTrackSchema = Joi.object({
  current: Joi.number().integer().min(0).default(0),
  max: Joi.number().integer().min(0).default(3),
  active: Joi.array().items(woundSchema).default([]),
}).default({});

const resourcesSchema = Joi.object({
  health: resourceTrackSchema,
  wounds: woundTrackSchema,
  stamina: resourceTrackSchema,
  focus: resourceTrackSchema,
  corruption: resourceTrackSchema,
}).default({});

const equipmentItemSchema = Joi.object({
  id: Joi.string().allow("").max(80).default(""),
  name: Joi.string().min(1).max(100).required(),
  type: Joi.string().valid("weapon", "armor", "tech", "relic", "cargo").default("cargo"),
  skillLinks: Joi.array().items(Joi.string().max(80)).default([]),
  tags: Joi.array().items(Joi.string().max(80)).default([]),
  grants: Joi.array().items(Joi.string().max(80)).default([]),
  description: Joi.string().allow("").max(500).default(""),
});

const equipmentSchema = Joi.object({
  weapons: Joi.array().items(equipmentItemSchema).default([]),
  armor: Joi.array().items(equipmentItemSchema).default([]),
  techRelics: Joi.array().items(equipmentItemSchema).default([]),
  cargo: Joi.array().items(equipmentItemSchema).default([]),
}).default({});

const progressionSchema = Joi.object({
  rank: Joi.number().integer().min(1).max(20).default(1),
  advancementPoints: Joi.number().integer().min(0).default(0),
  specializationPath: Joi.string().allow("").max(80).default(""),
  unlockedNodes: Joi.array().items(Joi.string().max(80)).default([]),
}).default({});

const characterBodySchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  pronouns: Joi.string().allow("").max(40).default(""),
  calling: Joi.string().min(2).max(40).required(),
  origin: Joi.string().min(2).max(40).required(),
  identity: identitySchema,
  attributes: Joi.object({
    might: attributeSchema,
    agility: attributeSchema,
    wit: attributeSchema,
    spirit: attributeSchema,
    resolve: attributeSchema,
    instinct: attributeSchema,
  }).default({}),
  reputation: reputationMapSchema,
  training: Joi.array().items(Joi.string().valid(...trainingIds)).length(4).unique(),
  abilities: Joi.array().items(abilitySchema).default([]),
  resources: resourcesSchema,
  inventory: Joi.array().items(inventoryItemSchema).default([]),
  relics: Joi.array().items(relicSchema).default([]),
  equipment: equipmentSchema,
  progression: progressionSchema,
  notes: Joi.string().allow("").max(5000).default(""),
  portraitUrl: Joi.string().allow("").max(500).default(""),
  campaignId: objectId.allow(null).default(null),
  status: Joi.string().valid("active", "archived", "retired").default("active"),
});

const { validatePointBuyAllocation } = require('../system/pointBuy');
const { origins } = require('../system/blueprints/catalogs');
const allocationSchema = Joi.object(Object.fromEntries(
  ['might', 'agility', 'wit', 'spirit', 'resolve', 'instinct'].map((key) =>
    [key, Joi.number().integer().min(8).max(15).required()])
)).required().custom((value, helpers) => {
  try { validatePointBuyAllocation(value); return value; }
  catch (error) { return helpers.message({ custom: error.message }); }
});
const originSchema = Joi.string().valid(...origins.map((origin) => origin.id));
const creationProgressionSchema = progressionSchema.keys({
  rank: Joi.number().integer().valid(1).default(1),
  specializationPath: Joi.string().valid('').default(''),
  unlockedNodes: Joi.array().max(0).default([]),
});
const createCharacterSchema = characterBodySchema.keys({
  attributes: allocationSchema,
  training: Joi.array().items(Joi.string().valid(...trainingIds)).length(4).unique().required(),
  origin: originSchema.required(),
  checks: Joi.forbidden(),
  derivedStats: Joi.forbidden(),
  socialStats: Joi.forbidden(),
  pairingStats: Joi.forbidden(),
  // Physical/mental tracks always start full and are calculated by the server.
  resources: Joi.object({
    wounds: woundTrackSchema,
    corruption: resourceTrackSchema.keys({ max: Joi.number().integer().min(0).default(6) }),
  }),
  progression: creationProgressionSchema,
});
const updateCharacterSchema = characterBodySchema.fork(
  ['name', 'calling', 'origin'], (schema) => schema.optional()
).keys({
  origin: originSchema,
  progression: progressionSchema.keys({ specializationPath: Joi.forbidden(), unlockedNodes: Joi.forbidden() }),
  checks: Joi.forbidden(),
  derivedStats: Joi.forbidden(),
  socialStats: Joi.forbidden(),
  pairingStats: Joi.forbidden(),
  resources: resourcesSchema.keys({
    health: resourceTrackSchema.keys({ max: Joi.forbidden() }),
    stamina: resourceTrackSchema.keys({ max: Joi.forbidden() }),
    focus: resourceTrackSchema.keys({ max: Joi.forbidden() }),
  }),
});

module.exports.validateCreateCharacter = celebrate({ body: createCharacterSchema }, { convert: false });

module.exports.validateUpdateCharacter = celebrate({
  body: updateCharacterSchema,
}, { noDefaults: true, convert: false });

module.exports.validateCharacterIdParam = celebrate({
  params: Joi.object({
    characterId: objectId.required(),
  }),
});

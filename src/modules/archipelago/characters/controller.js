const Character = require("./model");

const BadRequestError = require("../../../core/errors/bad-request-error");
const ForbiddenError = require("../../../core/errors/forbidden-error");
const NotFoundError = require("../../../core/errors/not-found-error");

const MAX_CHARACTERS_PER_USER = 20;
const ATTRIBUTE_KEYS = ["might", "agility", "wit", "spirit", "resolve", "instinct"];

function toPlainObject(value) {
  if (!value) {
    return {};
  }

  if (typeof value.toObject === "function") {
    return value.toObject();
  }

  return value;
}

function normalizeAttributes(...sources) {
  return ATTRIBUTE_KEYS.reduce((accumulator, key) => {
    const nextValue = sources.find((source) => source?.[key] !== undefined)?.[key];
    accumulator[key] = nextValue ?? 0;
    return accumulator;
  }, {});
}

function calculateDerivedStats(attributes = {}) {
  const safeAttributes = {
    might: attributes.might ?? 0,
    agility: attributes.agility ?? 0,
    wit: attributes.wit ?? 0,
    spirit: attributes.spirit ?? 0,
    resolve: attributes.resolve ?? 0,
    instinct: attributes.instinct ?? 0,
  };

  return {
    vitality: 10 + safeAttributes.might + safeAttributes.resolve,
    guard: 10 + safeAttributes.agility,
    initiative: 10 + safeAttributes.agility + safeAttributes.instinct,
    focus: 10 + safeAttributes.spirit + safeAttributes.resolve,
  };
}

function calculateSocialStats(attributes = {}) {
  const safeAttributes = {
    might: attributes.might ?? 0,
    agility: attributes.agility ?? 0,
    wit: attributes.wit ?? 0,
    spirit: attributes.spirit ?? 0,
    resolve: attributes.resolve ?? 0,
    instinct: attributes.instinct ?? 0,
  };

  return {
    grace: 10 + safeAttributes.spirit + safeAttributes.resolve,
    guile: 10 + safeAttributes.wit + safeAttributes.spirit,
    pressure: 10 + safeAttributes.might + safeAttributes.resolve,
  };
}

function calculatePairingStats(attributes = {}) {
  const safeAttributes = {
    might: attributes.might ?? 0,
    agility: attributes.agility ?? 0,
    wit: attributes.wit ?? 0,
    spirit: attributes.spirit ?? 0,
    resolve: attributes.resolve ?? 0,
    instinct: attributes.instinct ?? 0,
  };

  return {
    skirmish: 10 + safeAttributes.might + safeAttributes.agility,
    leverage: 10 + safeAttributes.might + safeAttributes.wit,
    conviction: 10 + safeAttributes.might + safeAttributes.spirit,
    pressure: 10 + safeAttributes.might + safeAttributes.resolve,
    pursuit: 10 + safeAttributes.might + safeAttributes.instinct,
    precision: 10 + safeAttributes.agility + safeAttributes.wit,
    flourish: 10 + safeAttributes.agility + safeAttributes.spirit,
    balance: 10 + safeAttributes.agility + safeAttributes.resolve,
    reflex: 10 + safeAttributes.agility + safeAttributes.instinct,
    guile: 10 + safeAttributes.wit + safeAttributes.spirit,
    tactics: 10 + safeAttributes.wit + safeAttributes.resolve,
    sense: 10 + safeAttributes.wit + safeAttributes.instinct,
    grace: 10 + safeAttributes.spirit + safeAttributes.resolve,
    attunement: 10 + safeAttributes.spirit + safeAttributes.instinct,
    nerve: 10 + safeAttributes.resolve + safeAttributes.instinct,
  };
}

function createResourceTrack(current, max) {
  return {
    current: Math.max(0, current ?? max ?? 0),
    max: Math.max(0, max ?? 0),
  };
}

function buildResources(attributes = {}, incomingResources = {}, wounds = []) {
  const derivedStats = calculateDerivedStats(attributes);
  const staminaMax = 4 + attributes.might + attributes.agility;
  const focusMax = Math.max(0, derivedStats.focus - 10);
  const woundMax = Math.max(3, 2 + Math.ceil(attributes.resolve / 2));
  const safeIncoming = incomingResources ?? {};
  const activeWounds = safeIncoming.wounds?.active ?? wounds ?? [];

  return {
    health: createResourceTrack(safeIncoming.health?.current, safeIncoming.health?.max ?? derivedStats.vitality),
    wounds: {
      current: safeIncoming.wounds?.current ?? activeWounds.length,
      max: safeIncoming.wounds?.max ?? woundMax,
      active: activeWounds,
    },
    stamina: createResourceTrack(safeIncoming.stamina?.current, safeIncoming.stamina?.max ?? staminaMax),
    focus: createResourceTrack(safeIncoming.focus?.current, safeIncoming.focus?.max ?? focusMax),
    corruption: createResourceTrack(
      safeIncoming.corruption?.current ?? 0,
      safeIncoming.corruption?.max ?? 6
    ),
  };
}

function buildProgression(rank, incomingProgression = {}) {
  return {
    rank,
    skillPoints: incomingProgression.skillPoints ?? 0,
    advancementPoints: incomingProgression.advancementPoints ?? 0,
    specializationPath: incomingProgression.specializationPath ?? "",
    unlockedNodes: incomingProgression.unlockedNodes ?? [],
  };
}

function buildCharacterPayload(body = {}, existingCharacter = null) {
  const existing = existingCharacter ? toPlainObject(existingCharacter) : {};
  const mergedAttributes = normalizeAttributes(body.attributes, existing.attributes);
  const rank = body.progression?.rank ?? existing.progression?.rank ?? 1;
  const canonicalTags = body.identity?.tags ?? existing.identity?.tags ?? [];
  const canonicalWounds = body.resources?.wounds?.active ?? existing.resources?.wounds?.active ?? [];
  const resources = buildResources(
    mergedAttributes,
    {
      ...toPlainObject(existing.resources),
      ...toPlainObject(body.resources),
      wounds: {
        ...toPlainObject(existing.resources?.wounds),
        ...toPlainObject(body.resources?.wounds),
      },
    },
    canonicalWounds
  );

  return {
    ...existing,
    ...body,
    identity: {
      ...toPlainObject(existing.identity),
      ...toPlainObject(body.identity),
      background: {
        ...toPlainObject(existing.identity?.background),
        ...toPlainObject(body.identity?.background),
      },
      tags: canonicalTags,
    },
    attributes: mergedAttributes,
    derivedStats: calculateDerivedStats(mergedAttributes),
    socialStats: calculateSocialStats(mergedAttributes),
    pairingStats: calculatePairingStats(mergedAttributes),
    resources,
    progression: buildProgression(rank, {
      ...toPlainObject(existing.progression),
      ...toPlainObject(body.progression),
    }),
  };
}

const getCharacters = async (req, res, next) => {
  try {
    const characters = await Character.find({ owner: req.user._id })
      .sort({ updatedAt: -1 })
      .lean();

    res.send(characters);
  } catch (err) {
    next(err);
  }
};

const createCharacter = async (req, res, next) => {
  try {
    const characterCount = await Character.countDocuments({ owner: req.user._id });
    const body = req.body ?? {};

    if (characterCount >= MAX_CHARACTERS_PER_USER) {
      throw new ForbiddenError("Character limit reached");
    }

    const payload = {
      ...buildCharacterPayload(body),
      owner: req.user._id,
    };

    const character = await Character.create(payload);
    res.status(201).send(character);
  } catch (err) {
    if (err.name === "ValidationError") {
      const validationMessage =
        Object.values(err.errors ?? {})
          .map((validationError) => validationError.message)
          .filter(Boolean)
          .join(", ") || "Invalid character data";

      return next(new BadRequestError(validationMessage));
    }
    return next(err);
  }
};

const getCharacterById = async (req, res, next) => {
  try {
    const character = await Character.findOne({
      _id: req.params.characterId,
      owner: req.user._id,
    }).lean();

    if (!character) {
      throw new NotFoundError("Character not found");
    }

    res.send(character);
  } catch (err) {
    if (err.name === "CastError") {
      return next(new BadRequestError("Invalid character id"));
    }
    return next(err);
  }
};

const updateCharacter = async (req, res, next) => {
  try {
    const existingCharacter = await Character.findById(req.params.characterId);
    const body = req.body ?? {};

    if (!existingCharacter) {
      throw new NotFoundError("Character not found");
    }

    if (String(existingCharacter.owner) !== String(req.user._id)) {
      throw new ForbiddenError("Forbidden");
    }

    const update = {
      ...buildCharacterPayload(body, existingCharacter),
      owner: existingCharacter.owner,
    };

    const updatedCharacter = await Character.findByIdAndUpdate(
      req.params.characterId,
      update,
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    res.send(updatedCharacter);
  } catch (err) {
    if (err.name === "ValidationError") {
      const validationMessage =
        Object.values(err.errors ?? {})
          .map((validationError) => validationError.message)
          .filter(Boolean)
          .join(", ") || "Invalid character data";

      return next(new BadRequestError(validationMessage));
    }
    if (err.name === "CastError") {
      return next(new BadRequestError("Invalid character id"));
    }
    return next(err);
  }
};

const deleteCharacter = async (req, res, next) => {
  try {
    const character = await Character.findById(req.params.characterId);

    if (!character) {
      throw new NotFoundError("Character not found");
    }

    if (String(character.owner) !== String(req.user._id)) {
      throw new ForbiddenError("Forbidden");
    }

    await Character.findByIdAndDelete(req.params.characterId);

    res.send({ message: "Character deleted" });
  } catch (err) {
    if (err.name === "CastError") {
      return next(new BadRequestError("Invalid character id"));
    }
    return next(err);
  }
};

module.exports = {
  MAX_CHARACTERS_PER_USER,
  getCharacters,
  createCharacter,
  getCharacterById,
  updateCharacter,
  deleteCharacter,
};

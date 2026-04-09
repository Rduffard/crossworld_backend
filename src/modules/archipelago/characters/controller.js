const Character = require("../models/character");

const BadRequestError = require("../../../core/errors/bad-request-error");
const ForbiddenError = require("../../../core/errors/forbidden-error");
const NotFoundError = require("../../../core/errors/not-found-error");

const MAX_CHARACTERS_PER_USER = 20;

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

    if (characterCount >= MAX_CHARACTERS_PER_USER) {
      throw new ForbiddenError("Character limit reached");
    }

    const payload = {
      ...req.body,
      owner: req.user._id,
      derivedStats: calculateDerivedStats(req.body.attributes),
    };

    const character = await Character.create(payload);
    res.status(201).send(character);
  } catch (err) {
    if (err.name === "ValidationError") {
      return next(new BadRequestError("Invalid character data"));
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

    if (!existingCharacter) {
      throw new NotFoundError("Character not found");
    }

    if (String(existingCharacter.owner) !== String(req.user._id)) {
      throw new ForbiddenError("Forbidden");
    }

    const update = {
      ...req.body,
      derivedStats: calculateDerivedStats(req.body.attributes ?? existingCharacter.attributes),
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
      return next(new BadRequestError("Invalid character data"));
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

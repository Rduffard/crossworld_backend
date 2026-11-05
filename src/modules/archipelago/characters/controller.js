const Character = require("./model");
const { applyOriginBonus } = require('../system/originBonus');
const { validatePointBuyAllocation } = require('../system/pointBuy');
const { calculateResourceMaximums } = require('../system/resources');
const { origins } = require('../system/blueprints/catalogs');
const { validateTraining } = require('../system/training');

const BadRequestError = require("../../../core/errors/bad-request-error");
const ForbiddenError = require("../../../core/errors/forbidden-error");
const NotFoundError = require("../../../core/errors/not-found-error");

const MAX_CHARACTERS_PER_USER = 20;

function toPlainObject(value) {
  if (!value) {
    return {};
  }

  if (typeof value.toObject === "function") {
    return value.toObject();
  }

  return value;
}

function validateOrigin(originId) {
  const origin = origins.find((entry) => entry.id === originId);
  if (!origin) throw new BadRequestError('Unknown origin identifier');
  return origin;
}

function validateFinalAttributes(attributes, originId) {
  const origin = validateOrigin(originId);
  const [amount, label] = origin.bonus.split(' ');
  const key = label.toLowerCase();
  const base = { ...attributes, [key]: attributes[key] - Number(amount) };
  try { validatePointBuyAllocation(base); }
  catch (error) { throw new BadRequestError(error.message); }
}

function rejectDerivedInput(body, creating = false) {
  for (const field of ['checks', 'derivedStats', 'socialStats', 'pairingStats', 'skills', 'specialties', 'proficiencyBonus']) {
    if (body[field] !== undefined) throw new BadRequestError(`${field} is server-managed`);
  }
  for (const field of ['corePoints', 'specialtyPicks', 'coreCheckInvestments']) {
    if (body.progression?.[field] !== undefined) throw new BadRequestError(`${field} is retired`);
  }
  if (!creating && (body.progression?.specializationPath !== undefined || body.progression?.unlockedNodes !== undefined)) {
    throw new BadRequestError('Path advancement is disabled pending progression rules');
  }
  for (const track of ['health', 'stamina', 'focus']) {
    if (creating ? body.resources?.[track] !== undefined : body.resources?.[track]?.max !== undefined) {
      throw new BadRequestError(`${track} capacity is server-managed`);
    }
  }
}

function buildResources(attributes, level, narrative = {}) {
  const maxima = calculateResourceMaximums(attributes, level);
  return {
    ...Object.fromEntries(Object.entries(maxima).map(([key, max]) => [key, { current: max, max }])),
    wounds: { current: 0, max: 3, active: [], ...narrative.wounds },
    corruption: { current: 0, max: 6, ...narrative.corruption },
  };
}

function buildProgression(rank, incomingProgression = {}) {
  return {
    rank,
    advancementPoints: incomingProgression.advancementPoints ?? 0,
    specializationPath: incomingProgression.specializationPath ?? "",
    unlockedNodes: incomingProgression.unlockedNodes ?? [],
  };
}

function mergePatch(existing, patch) {
  const merged = { ...toPlainObject(existing) };
  Object.entries(patch).forEach(([key, value]) => {
    merged[key] = value && typeof value === "object" && !Array.isArray(value)
      ? mergePatch(merged[key], value)
      : value;
  });
  return merged;
}

function buildUpdatePayload(body, existingCharacter) {
  const merged = mergePatch(existingCharacter, body);
  rejectDerivedInput(body);
  if (body.training !== undefined) {
    try { merged.training = validateTraining(body.training); }
    catch (error) { throw new BadRequestError(error.message); }
  }
  if (body.origin !== undefined) validateOrigin(merged.origin);
  const recalculate = body.attributes !== undefined || body.origin !== undefined ||
    body.progression?.rank !== undefined;
  if (recalculate) {
    // PATCH carries final scores; never apply the origin bonus to stored scores.
    validateFinalAttributes(merged.attributes, merged.origin);
  }
  if (recalculate) {
    let maxima;
    try { maxima = calculateResourceMaximums(merged.attributes, merged.progression?.rank ?? 1); }
    catch (error) { throw new BadRequestError(error.message); }
    merged.resources = { ...toPlainObject(merged.resources) };
    for (const [track, max] of Object.entries(maxima)) {
      merged.resources[track] = {
        ...merged.resources[track],
        max,
        current: Math.min(merged.resources[track]?.current ?? 0, max),
      };
    }
  }
  // Explicit current edits cannot act as temporary HP, even without a score edit.
  for (const track of ['health', 'stamina', 'focus']) {
    if (body.resources?.[track]?.current !== undefined) {
      if (!Number.isFinite(merged.resources?.[track]?.max)) {
        throw new BadRequestError(`${track} capacity is unavailable on this historical character`);
      }
      merged.resources = { ...toPlainObject(merged.resources),
        [track]: { ...toPlainObject(merged.resources[track]),
          current: Math.min(merged.resources[track].current, merged.resources[track].max) },
      };
    }
  }
  const keys = new Set(Object.keys(body));
  if (recalculate) keys.add('resources');
  return Object.fromEntries([...keys].map((key) => [key, merged[key]]));
}

function buildCharacterPayload(body = {}) {
  rejectDerivedInput(body, true);
  validateOrigin(body.origin);
  if ((body.progression?.rank ?? 1) !== 1 || body.progression?.specializationPath ||
      body.progression?.unlockedNodes?.length) {
    throw new BadRequestError('Creation starts at level 1 with no Path ownership or advancement');
  }
  let attributes, training;
  try { training = validateTraining(body.training); }
  catch (error) { throw new BadRequestError(error.message); }
  try { attributes = applyOriginBonus(body.attributes, body.origin); }
  catch (error) { throw new BadRequestError(error.message); }
  return {
    ...body,
    attributes,
    training,
    resources: buildResources(attributes, 1, body.resources),
    progression: buildProgression(1, body.progression),
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
    const existingCharacter = await Character.findById(req.params.characterId).lean();
    const body = req.body ?? {};

    if (!existingCharacter) {
      throw new NotFoundError("Character not found");
    }

    if (String(existingCharacter.owner) !== String(req.user._id)) {
      throw new ForbiddenError("Forbidden");
    }

    if (Object.keys(body).length === 0) {
      return res.send(existingCharacter);
    }

    const update = {
      ...buildUpdatePayload(body, existingCharacter),
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
    const character = await Character.findById(req.params.characterId).lean();

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

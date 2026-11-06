const router = require("express").Router();

const {
  createCharacter,
  deleteCharacter,
  getCharacterById,
  getCharacters,
  updateCharacter,
} = require("./controller");
const {
  validateCharacterIdParam,
  validateCreateCharacter,
  validateUpdateCharacter,
} = require("./validators");

router.get("/", getCharacters);
const { celebrate, Joi } = require("celebrate");
const plan = celebrate({
  body: Joi.object({
    level: Joi.number().integer().min(1).max(20).required(),
    levelOneSelections: Joi.object().pattern(
      Joi.string(),
      Joi.array().items(Joi.string())
    ),
    decisions: Joi.array()
      .max(20)
      .items(
        Joi.object({
          level: Joi.number().integer().min(2).max(20).required(),
          spends: Joi.array().items(
            Joi.object({
              rewardId: Joi.string().required(),
              kind: Joi.string()
                .valid("attribute", "selection", "path", "calling")
                .required(),
              increases: Joi.object().pattern(
                Joi.string(),
                Joi.number().integer()
              ),
              abilityIds: Joi.array().items(Joi.string()),
              pathId: Joi.string(),
              tier: Joi.number().integer(),
            })
          ),
          exchanges: Joi.array().items(
            Joi.object({
              rewardId: Joi.string().required(),
              kind: Joi.string().valid("calling", "path").required(),
            })
          ),
        })
      ),
  }).unknown(false),
});
const development = (req, res, next) => {
  if (!require("../system/playtest").enabled()) {
    const e = new Error("Development playtesting is disabled");
    e.statusCode = 403;
    return next(e);
  }
  next();
};
function playtest(encounter) {
  return async (req, res, next) => {
    try {
      const c = await require("./model")
        .findOne({ _id: req.params.characterId, owner: req.user._id })
        .lean();
      if (!c) {
        const e = new Error("Character not found");
        e.statusCode = 404;
        throw e;
      }
      const result = require("../system/playtest").build(c, req.body);
      if (encounter) {
        if (!result.complete)
          throw new Error(
            "Complete all required decisions before starting a playtest"
          );
        const snapshot = require("../combat/snapshot").fromCharacter(
          result.character,
          req.user._id
        );
        snapshot.playtest = {
          sourceCharacter: String(c._id),
          level: req.body.level,
        };
        return res
          .status(201)
          .send(await require("../combat/model").create(snapshot));
      }
      res.send(result);
    } catch (e) {
      e.statusCode = e.statusCode ?? 400;
      next(e);
    }
  };
}
router.post(
  "/:characterId/playtest-preview",
  validateCharacterIdParam,
  development,
  plan,
  playtest(false)
);
router.post(
  "/:characterId/playtest-encounter",
  validateCharacterIdParam,
  development,
  plan,
  playtest(true)
);
router.post("/", validateCreateCharacter, createCharacter);
router.get(
  "/:characterId/equipment",
  validateCharacterIdParam,
  require("./controller").getEquipment
);
router.get("/:characterId", validateCharacterIdParam, getCharacterById);
router.patch(
  "/:characterId",
  validateCharacterIdParam,
  validateUpdateCharacter,
  updateCharacter
);
router.delete("/:characterId", validateCharacterIdParam, deleteCharacter);

module.exports = router;

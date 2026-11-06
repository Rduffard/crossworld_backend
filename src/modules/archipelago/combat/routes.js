const router = require("express").Router();
const { celebrate, Joi } = require("celebrate");
const { createService } = require("./service");
const service = createService(
  require("./model"),
  require("../characters/model")
);
const id = celebrate({
  params: Joi.object({ encounterId: Joi.string().hex().length(24).required() }),
});
const run = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
router.post(
  "/test",
  celebrate({ body: Joi.object({}).unknown(false) }),
  run(async (req, res) =>
    res.status(201).send(await service.create(req.user._id))
  )
);
router.post(
  "/from-character",
  celebrate({
    body: Joi.object({
      characterId: Joi.string().hex().length(24).required(),
    }).unknown(false),
  }),
  run(async (req, res) =>
    res
      .status(201)
      .send(await service.fromCharacter(req.user._id, req.body.characterId))
  )
);
router.get(
  "/:encounterId",
  id,
  run(async (req, res) =>
    res.send(await service.load(req.params.encounterId, req.user._id))
  )
);
router.post(
  "/:encounterId/commands",
  id,
  celebrate({
    body: Joi.object({
      id: Joi.string()
        .pattern(/^[a-zA-Z0-9-]{8,80}$/)
        .required(),
      expectedRevision: Joi.number().integer().min(0).required(),
      type: Joi.string()
        .valid("attack", "end-turn", "pause", "resume")
        .required(),
      actor: Joi.string().valid("corsair", "player", "enemy").required(),
      weapon: Joi.when("type", {
        is: "attack",
        then: Joi.string().max(80).required(),
        otherwise: Joi.forbidden(),
      }),
      attribute: Joi.string().valid("might", "agility"),
      target: Joi.when("type", {
        is: "attack",
        then: Joi.string().valid("enemy").required(),
        otherwise: Joi.forbidden(),
      }),
    }).unknown(false),
  }),
  run(async (req, res) =>
    res.send(
      await service.command(req.params.encounterId, req.user._id, req.body)
    )
  )
);
module.exports = router;

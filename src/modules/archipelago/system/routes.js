const router = require("express").Router();

const { getBlueprint } = require("./controller");

router.get("/capabilities", (_req, res) =>
  res.send({ playtestEnabled: require("./playtest").enabled() })
);
router.get("/blueprint", getBlueprint);
const { celebrate, Joi } = require("celebrate");
router.post(
  "/draft-preview",
  celebrate({
    body: Joi.object({
      calling: Joi.string().required(),
      origin: Joi.string().required(),
      attributes: Joi.object()
        .pattern(Joi.string(), Joi.number().integer())
        .required(),
      training: Joi.array().items(Joi.string()).required(),
      abilitySelections: Joi.object().pattern(
        Joi.string(),
        Joi.array().items(Joi.string())
      ),
      startingEquipment: Joi.object().required(),
    }).unknown(false),
  }),
  (req, res, next) => {
    try {
      res.send(require("./draft").preview(req.body));
    } catch (e) {
      e.statusCode = e.statusCode ?? 400;
      next(e);
    }
  }
);

module.exports = router;

const router = require("express").Router();

const auth = require("../../../core/middleware/auth"); // adjust if your auth path differs
const { validateCreateBug, validateBugQuery } = require("./validators");
const { getBugs, createBug } = require("./controller");
const { getQuality, updateQuality, statusByState } = require("./quality");
const { celebrate, Joi } = require("celebrate");

router.get("/", auth, validateBugQuery, getBugs);
router.post("/", auth, validateCreateBug, createBug);

router.get("/:bugId/quality", auth, celebrate({
  params: Joi.object({ bugId: Joi.string().hex().length(24).required() }),
}), getQuality);
router.patch("/:bugId/quality", auth, celebrate({
  params: Joi.object({ bugId: Joi.string().hex().length(24).required() }),
  body: Joi.object({
    state: Joi.string().valid(...Object.keys(statusByState)).required(),
    severity: Joi.string().valid("minor", "moderate", "major", "critical").required(),
    priority: Joi.string().valid("low", "medium", "high", "critical").required(),
    revision: Joi.number().integer().min(0).required(),
    reason: Joi.string().trim().max(2000).allow("").optional(),
  }),
}), updateQuality);

module.exports = router;

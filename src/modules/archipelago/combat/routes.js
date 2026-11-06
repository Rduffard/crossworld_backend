const router = require('express').Router();
const { celebrate, Joi } = require('celebrate');
const { createService } = require('./service');
const service = createService(require('./model'));
const id = celebrate({ params: Joi.object({ encounterId: Joi.string().hex().length(24).required() }) });
const run = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (error) { next(error); }
};
router.post('/test', celebrate({ body: Joi.object({}).unknown(false) }), run(async (req, res) => res.status(201).send(await service.create(req.user._id))));
router.get('/:encounterId', id, run(async (req, res) => res.send(await service.load(req.params.encounterId, req.user._id))));
router.post('/:encounterId/commands', id, celebrate({ body: Joi.object({
  id: Joi.string().pattern(/^[a-zA-Z0-9-]{8,80}$/).required(), expectedRevision: Joi.number().integer().min(0).required(),
  type: Joi.string().valid('attack', 'end-turn', 'pause', 'resume').required(), actor: Joi.string().valid('corsair', 'enemy').required(),
  weapon: Joi.when('type', { is: 'attack', then: Joi.string().valid('cutlass').required(), otherwise: Joi.forbidden() }),
  target: Joi.when('type', { is: 'attack', then: Joi.string().valid('enemy').required(), otherwise: Joi.forbidden() })
}).unknown(false) }), run(async (req, res) => res.send(await service.command(req.params.encounterId, req.user._id, req.body))));
module.exports = router;

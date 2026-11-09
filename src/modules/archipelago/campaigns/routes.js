const router = require('express').Router();
const { celebrate, Joi } = require('celebrate');
const { handlers } = require('./controller');
const Campaign=require('./model');
const campaign = handlers(Campaign, require('../characters/model'));
const sessions=require('../sessions/controller').handlers(Campaign,require('../sessions/model'));
const id = Joi.string().hex().length(24).required();

router.get('/', campaign.list);
router.post('/', campaign.create);
router.post('/join', campaign.join);
router.get('/:campaignId', celebrate({ params: Joi.object({ campaignId: id }) }), campaign.open);
router.put('/:campaignId/characters/:characterId', celebrate({ params: Joi.object({ campaignId: id, characterId: id }) }), campaign.register);
router.get('/:campaignId/sessions',celebrate({params:Joi.object({campaignId:id})}),sessions.list);
router.post('/:campaignId/sessions',celebrate({params:Joi.object({campaignId:id})}),sessions.create);
router.post('/:campaignId/sessions/join',celebrate({params:Joi.object({campaignId:id})}),sessions.join);

module.exports = router;

const historicOrigins = require('../../../system/blueprints/characters/origins');
const { creationAttributes: attributes, backgroundTools: tools, backgrounds } = require('@crossworld/sanguine-engine/progression');
const originPolicy = 'SA-CHAR-1: origin +1, background +2, no nationality restrictions or historical passive penalties.';
const origins = historicOrigins.map(({id,name,summary,lore,bonus}) => ({id,name,summary,lore,attribute:bonus.slice(3).toLowerCase(),language:'language:'+id}));

module.exports = { attributes, tools, origins, backgrounds, originPolicy };

const origins = require('./blueprints/characters/origins');

// Keep persisted IDs stable. Region names identify the grants until the
// setting establishes names and relationships for its languages.
const regionalLanguages = Object.freeze(origins.map(origin => Object.freeze({
  id: `language:${origin.id}`,
  originId: origin.id,
  name: `${origin.name} regional speech`,
})));

module.exports = regionalLanguages;

const meta = require('./blueprints/meta');
const schema = require('./blueprints/schema');
const catalogs = require('./blueprints/catalogs');
const display = require('./blueprints/display');
const training = require('./blueprints/training');
const { sampleCharacter, exampleAbilities } = require('./blueprints/samples');
module.exports = { ...meta, schema, catalogs, display, training, sampleCharacter, exampleAbilities };

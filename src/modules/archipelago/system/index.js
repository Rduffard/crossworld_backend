const meta = require("./blueprints/meta");
const schema = require("./blueprints/schema");
const catalogs = require("./blueprints/catalogs");
const display = require("./blueprints/display");
const training = require("./blueprints/training");
const { sampleCharacter } = require("./blueprints/samples");
const progression = require("./blueprints/progression");
const startingProficiencies = require("./blueprints/startingProficiencies");
const legacyTraining = require("./blueprints/legacyTraining");
module.exports = {
  abilityCatalog: require("./blueprints/abilities"),
  startingEquipment: require("./blueprints/characters/startingEquipment"),
  equipmentTraining: require("./blueprints/characters/equipmentTraining"),
  equipment: require("./blueprints/equipment"),
  progression,
  startingProficiencies,
  legacyTraining,
  ...meta,
  schema,
  catalogs,
  display,
  training,
  sampleCharacter,
};

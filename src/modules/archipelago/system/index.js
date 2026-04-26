const meta = require("./blueprints/meta");
const schema = require("./blueprints/schema");
const expandedSkillList = require("./blueprints/skills");
const catalogs = require("./blueprints/catalogs");
const display = require("./blueprints/display");
const { sampleCharacter, exampleAbilities } = require("./blueprints/samples");

module.exports = {
  ...meta,
  schema,
  catalogs,
  display,
  expandedSkillList,
  sampleCharacter,
  exampleAbilities,
};

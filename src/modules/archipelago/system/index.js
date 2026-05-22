const meta = require("./blueprints/meta");
const schema = require("./blueprints/schema");
const checks = require("./blueprints/checks");
const { getLegacyPairings } = require("./blueprints/checkHelpers");
const expandedSkillList = require("./blueprints/skills");
const catalogs = require("./blueprints/catalogs");
const display = require("./blueprints/display");
const { sampleCharacter, exampleAbilities } = require("./blueprints/samples");

module.exports = {
  ...meta,
  schema,
  checks,
  catalogs: {
    ...catalogs,
    pairings: getLegacyPairings(),
  },
  display,
  expandedSkillList,
  sampleCharacter,
  exampleAbilities,
};

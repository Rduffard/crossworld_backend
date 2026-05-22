const checks = require("./checks");

const checkCategories = Object.keys(checks);
const checkList = Object.entries(checks).flatMap(([category, categoryChecks]) =>
  categoryChecks.map((check) => ({
    ...check,
    category,
  }))
);
const checkKeys = checkList.map((check) => check.key);

function titleCase(value = "") {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getFormulaLabel(check) {
  return check.formulaLabel ?? check.attributes.map(titleCase).join(" + ");
}

function getCheckScore(attributes = {}, check) {
  return 10 + check.attributes.reduce((total, attributeKey) => total + (attributes[attributeKey] ?? 0), 0);
}

function calculateChecks(attributes = {}) {
  return checkList.reduce((scores, check) => {
    scores[check.key] = getCheckScore(attributes, check);
    return scores;
  }, {});
}

function getLegacyDerivedStats(checksByKey = {}) {
  return {
    vitality: checksByKey.vitality ?? 10,
    guard: checksByKey.guard ?? 10,
    initiative: checksByKey.initiative ?? 10,
    focus: checksByKey.focus ?? 10,
  };
}

function getLegacySocialStats(checksByKey = {}) {
  return {
    grace: checksByKey.grace ?? 10,
    guile: checksByKey.guile ?? 10,
    pressure: checksByKey.pressure ?? 10,
  };
}

function getLegacyPairingStats(checksByKey = {}) {
  return checkList.reduce((stats, check) => {
    stats[check.key] = checksByKey[check.key] ?? 10;
    return stats;
  }, {});
}

function getCheckCatalog() {
  return checks;
}

function getLegacyPairings() {
  return checkList.map((check) => ({
    key: check.key,
    name: check.name,
    attributes: check.attributes,
    category: check.category,
    summary: check.summary,
    examples: check.examples,
    formulaLabel: getFormulaLabel(check),
  }));
}

module.exports = {
  calculateChecks,
  checkCategories,
  checkKeys,
  checkList,
  getCheckCatalog,
  getFormulaLabel,
  getLegacyDerivedStats,
  getLegacyPairingStats,
  getLegacyPairings,
  getLegacySocialStats,
};

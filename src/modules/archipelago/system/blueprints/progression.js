module.exports = Object.freeze({
  version: 2,
  levelCap: 20,
  pathLevels: Object.freeze([3, 6, 11, 16]),
  pathTierLevels: Object.freeze([3, 6, 11, 16]),
  maximumExchanges: 2,
  attributeMaximum: 20,
  tables: require("./abilities").tables,
  contentStatus: "supported-subset-with-explicit-reference-only-features",
  legacy: require("./progressionLegacy"),
});

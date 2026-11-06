module.exports = Object.freeze({
  version: 1,
  levelCap: 20,
  callingLevels: Object.freeze([1, 2, 5, 7, 9, 10, 13, 14, 17, 20]),
  pathLevels: Object.freeze([3, 6, 11, 16]),
  attributeLevels: Object.freeze([4, 8, 12, 16, 19]),
  callingBands: Object.freeze([1, 5, 11, 17]),
  pathTierLevels: Object.freeze([3, 6, 11, 16]),
  attributeMaximum: 20,
  maximumExchanges: 2,
  // Historical starter text and three-node Paths are NOT reviewed playable definitions.
  callingAbilities: Object.freeze([]),
  pathAbilities: Object.freeze([]),
  contentStatus: "awaiting-reviewed-abilities-and-four-tier-paths",
});

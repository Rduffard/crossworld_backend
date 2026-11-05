const ATTRIBUTE_KEYS = ['might', 'agility', 'wit', 'spirit', 'resolve', 'instinct'];

/** Pure ability-score calculation. Callers must supply conventional scores,
 * never existing allocated character values. No check mappings or bonuses.
 * Scores must be positive safe integers; no game-specific upper cap is imposed.
 */
function calculateCheckModifier(attributes, attributeKey) {
  if (typeof attributeKey !== 'string' || !ATTRIBUTE_KEYS.includes(attributeKey)) {
    throw new RangeError('Invalid attribute identifier');
  }
  const score = attributes?.[attributeKey];
  if (!Number.isSafeInteger(score) || score < 1) {
    throw new TypeError('Selected ability score must be a positive safe integer');
  }
  return Math.floor((score - 10) / 2);
}

module.exports = { calculateCheckModifier };

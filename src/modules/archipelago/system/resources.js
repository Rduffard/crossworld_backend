const { calculateCheckModifier } = require('./checkModifier');

// Authoritative base maxima only; narrative tracks and other bonuses are independent.
function calculateResourceMaximums(attributes, level = 1) {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new RangeError('Level must be an integer from 1 to 20');
  }
  const modifier = (key) => calculateCheckModifier(attributes, key);
  const capacity = (initial, growth, bonus) =>
    Math.max(1, initial + bonus) + (level - 1) * Math.max(1, growth + bonus);
  return {
    health: capacity(12, 6, modifier('might') + modifier('resolve')),
    stamina: capacity(10, 5, modifier('agility') + modifier('might')),
    focus: capacity(10, 5, modifier('wit') + modifier('spirit')),
  };
}

module.exports = { calculateResourceMaximums };

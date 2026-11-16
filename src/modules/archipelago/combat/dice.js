const { randomInt } = require('node:crypto');
const rules = require('@crossworld/sanguine-engine/dice');
function die(sides) { return randomInt(1, sides + 1); }
function rollDie(sides, roll = die) {
  return rules.rollDie(sides, roll);
}
function d20(options, roll = die) {
  return rules.d20(options, roll);
}
module.exports = { die, rollDie, d20 };

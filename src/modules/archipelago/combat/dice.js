const { randomInt } = require('node:crypto');
function die(sides) { return randomInt(1, sides + 1); }
function rollDie(sides, roll = die) {
  const value = roll(sides);
  if (!Number.isInteger(value) || value < 1 || value > sides) throw new Error('Invalid die result');
  return value;
}
function d20({ advantage = false, disadvantage = false } = {}, roll = die) {
  const dice = [rollDie(20, roll)];
  if (advantage !== disadvantage) dice.push(rollDie(20, roll));
  return { dice, selected: advantage === disadvantage ? dice[0] : advantage ? Math.max(...dice) : Math.min(...dice) };
}
module.exports = { die, rollDie, d20 };

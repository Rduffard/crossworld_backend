function proficiencyBonus(level) {
  if (!Number.isInteger(level) || level < 1 || level > 20) throw new Error('Level must be 1–20');
  return 2 + Math.floor((level - 1) / 4);
}
function trainingCheckModifier(attributes, attribute, level, training = [], trainingId = '') {
  const score = attributes?.[attribute];
  if (!['might', 'agility', 'wit', 'spirit', 'resolve', 'instinct'].includes(attribute) ||
      !Number.isSafeInteger(score) || score < 1) throw new Error('Attribute score unavailable');
  const bonus = proficiencyBonus(level);
  return Math.floor((score - 10) / 2) + (trainingId && training.includes(trainingId) ? bonus : 0);
}
module.exports = { proficiencyBonus, trainingCheckModifier };

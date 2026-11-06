const { calculateCheckModifier } = require('../system/checkModifier');
const { proficiencyBonus } = require('../system/trainingChecks');
const { d20, rollDie } = require('./dice');
const { calculateGuard } = require('./guard');
function resolveAttack(actor, target, weapon, options = {}, roll) {
  const might = calculateCheckModifier(actor.attributes, 'might');
  const agility = calculateCheckModifier(actor.attributes, 'agility');
  const attribute = weapon.properties.includes('finesse') && agility > might ? 'agility' : 'might';
  const attributeModifier = attribute === 'might' ? might : agility;
  const proficiency = actor.weaponTraining.includes(weapon.trainingId) ? proficiencyBonus(actor.level) : 0;
  const attack = d20(options, roll);
  const total = attack.selected + attributeModifier + proficiency;
  const guard = calculateGuard(target.attributes, target.guardInputs);
  const critical = attack.selected === 20;
  const hit = critical || (attack.selected !== 1 && total >= guard);
  const damageDice = hit ? Array.from({ length: weapon.damage.count * (critical ? 2 : 1) }, () => rollDie(weapon.damage.sides, roll)) : [];
  const damage = hit ? Math.max(0, damageDice.reduce((sum, n) => sum + n, 0) + attributeModifier) : 0;
  const after = Math.max(0, target.health.current - damage);
  return { actor: actor.id, target: target.id, weapon: weapon.id, attackDice: attack.dice, selectedD20: attack.selected, attribute, attributeModifier, proficiency, attackTotal: total, targetGuard: guard, result: critical ? 'critical' : hit ? 'hit' : 'miss', damageDice, damageModifier: hit ? attributeModifier : 0, damageType: weapon.damage.type, damageTotal: damage, damageApplied: target.health.current - after, healthBefore: target.health.current, healthAfter: after };
}
module.exports = { resolveAttack };

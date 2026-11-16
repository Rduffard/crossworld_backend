const { d20, rollDie } = require("./dice");
const { calculateGuard } = require('@crossworld/sanguine-engine/equipment/guard');
const { allowedAttributes, attackInputs, attackOutcome, attackDamage } = require('@crossworld/sanguine-engine/combat/attack');
const { strikeRollCount } = require('@crossworld/sanguine-engine/combat/strike');
function resolveAttack(actor, target, weapon, options = {}, roll) {
  const mode = options.mode ?? (weapon.type === "melee" ? "melee" : "ranged");
  if (mode !== "melee" || !weapon.automation.melee)
    throw new Error(
      "Automated ranged, thrown, and mounted attacks are unsupported"
    );
  const { attribute, attributeModifier, proficiency, disadvantage } = attackInputs(actor, weapon, options);
  const attack = d20(
    { advantage: Boolean(options.advantage), disadvantage },
    roll
  );
  const guard = calculateGuard(target.attributes, target.guardInputs);
  const { total, critical, hit } = attackOutcome(attack.selected, attributeModifier, proficiency, guard, actor.criticalThreshold);
  const damageDice = Array.from(
    { length: strikeRollCount(weapon.damage.count, hit, critical) },
    () => rollDie(weapon.damage.sides, roll)
  );
  const { adjustedDamageDice, damage, after } = attackDamage(actor, weapon, damageDice, hit, attributeModifier, target.health.current);
  return {
    actor: actor.id,
    target: target.id,
    weapon: weapon.id,
    definitionVersion: weapon.version,
    attackDice: attack.dice,
    selectedD20: attack.selected,
    attribute,
    attributeModifier,
    proficiency,
    attackTotal: total,
    targetGuard: guard,
    result: critical ? "critical" : hit ? "hit" : "miss",
    damageDice,
    adjustedDamageDice,
    damageModifier: hit ? attributeModifier : 0,
    damageType: weapon.damage.type,
    damageTotal: damage,
    damageApplied: target.health.current - after,
    healthBefore: target.health.current,
    healthAfter: after,
  };
}
module.exports = { resolveAttack, allowedAttributes };

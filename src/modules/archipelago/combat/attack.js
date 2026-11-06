const { calculateCheckModifier } = require("../system/checkModifier");
const { proficiencyBonus } = require("../system/trainingChecks");
const { d20, rollDie } = require("./dice");
const { calculateGuard } = require("./guard");
function allowedAttributes(weapon, _mode = "melee") {
  if (weapon.properties.some((p) => p.id === "finesse"))
    return ["might", "agility"];
  return [weapon.type === "melee" ? "might" : "agility"];
}
function resolveAttack(actor, target, weapon, options = {}, roll) {
  const mode = options.mode ?? (weapon.type === "melee" ? "melee" : "ranged");
  if (mode !== "melee" || !weapon.automation.melee)
    throw new Error(
      "Automated ranged, thrown, and mounted attacks are unsupported"
    );
  const allowed = allowedAttributes(weapon, mode);
  const attribute =
    options.attribute ??
    allowed.reduce((a, b) =>
      calculateCheckModifier(actor.attributes, b) >
      calculateCheckModifier(actor.attributes, a)
        ? b
        : a
    );
  if (!allowed.includes(attribute)) throw new Error("Invalid attack attribute");
  const attributeModifier = calculateCheckModifier(actor.attributes, attribute);
  const proficiency =
    actor.weaponTraining.includes(weapon.id) ||
    actor.weaponTraining.includes(weapon.category)
      ? proficiencyBonus(actor.level)
      : 0;
  const heavy =
    weapon.properties.some((p) => p.id === "heavy") &&
    actor.attributes[weapon.type === "melee" ? "might" : "agility"] < 13;
  const disadvantage = Boolean(
    options.disadvantage || heavy || actor.restrictions?.physicalD20Disadvantage
  );
  const attack = d20(
    { advantage: Boolean(options.advantage), disadvantage },
    roll
  );
  const total = attack.selected + attributeModifier + proficiency;
  const guard = calculateGuard(target.attributes, target.guardInputs);
  const critical = attack.selected === 20,
    hit = critical || (attack.selected !== 1 && total >= guard);
  const damageDice =
    hit && weapon.damage.count
      ? Array.from({ length: weapon.damage.count * (critical ? 2 : 1) }, () =>
          rollDie(weapon.damage.sides, roll)
        )
      : [];
  const adjustedDamageDice =
    actor.greatWeaponFighting &&
    (weapon.heldHands ?? weapon.hands) === 2 &&
    weapon.properties.some((p) => ["two-handed", "versatile"].includes(p.id))
      ? damageDice.map((n) => Math.max(3, n))
      : damageDice;
  const damage = hit
    ? Math.max(
        0,
        adjustedDamageDice.reduce((a, b) => a + b, 0) + attributeModifier
      )
    : 0;
  const after = Math.max(0, target.health.current - damage);
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

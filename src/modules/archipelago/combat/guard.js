const { calculateCheckModifier } = require("../system/checkModifier");
// Armor inputs are structured definitions, never client-supplied defense totals.
function calculateGuard(
  attributes,
  { armor = null, shield = false, bonus = 0, unarmoredBase = null } = {}
) {
  const agility = calculateCheckModifier(attributes, "agility");
  let base = 10 + agility;
  if (unarmoredBase !== null) {
    if (!Number.isSafeInteger(unarmoredBase) || unarmoredBase < 1) throw new Error("Invalid unarmored Guard");
    if (!armor) base = Math.max(base, unarmoredBase);
  }
  if (armor) {
    if (
      !["light", "medium", "heavy"].includes(armor.category) ||
      !Number.isInteger(armor.base) ||
      armor.base < 1
    )
      throw new Error("Invalid armor definition");
    base =
      armor.base +
      (armor.category === "heavy"
        ? 0
        : armor.category === "medium"
        ? Math.min(2, agility)
        : agility);
  }
  if (typeof shield !== "boolean") throw new Error("Invalid shield input");
  if (!Number.isInteger(bonus) || bonus < 0 || bonus > 1)
    throw new Error("Invalid Guard feature bonus");
  return base + (shield ? 2 : 0) + bonus;
}
module.exports = { calculateGuard };

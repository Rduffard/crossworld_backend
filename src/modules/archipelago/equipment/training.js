const profiles = Object.fromEntries(Object.entries(require("../system/rules2024/catalog").callings)
  .map(([id, calling]) => [id, {
    categories: calling.starting.weapons.filter(w => ["simple", "martial"].includes(w)),
    weapons: calling.starting.weapons.filter(w => !["simple", "martial", "martial:finesse-or-light"].includes(w)),
    groups: calling.starting.weapons.includes("martial:finesse-or-light") ? ["martial:finesse-or-light"] : [],
    armor: calling.starting.armor,
  }]));
function resolveTraining(calling, grants = []) {
  const base = profiles[calling];
  if (!base) throw new Error("Unknown Calling");
  const result = structuredClone(base);
  for (const grant of grants) {
    for (const key of ["categories", "weapons", "armor", "groups"])
      result[key] = [...new Set([...result[key], ...(grant[key] ?? [])])];
  }
  return result;
}
function weaponTrained(training, weapon) {
  return (
    (training.groups ?? []).some((group) =>
      (weaponGroups[group] ?? []).includes(weapon.id)
    ) ||
    training.categories.includes(weapon.category) ||
    training.weapons.includes(weapon.id)
  );
}
const weaponGroups = Object.freeze({
  "martial:finesse-or-light": require("../system/blueprints/equipment").items
    .filter(w => w.kind === "weapon" && w.category === "martial" &&
      w.properties.some(p => ["finesse", "light"].includes(p.id))).map(w => w.id),
});
module.exports = { weaponGroups, profiles, resolveTraining, weaponTrained };

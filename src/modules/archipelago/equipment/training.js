const profiles = require("../system/blueprints/characters/equipmentTraining");
function resolveTraining(calling, grants = []) {
  const base = profiles[calling];
  if (!base) throw new Error("Unknown Calling");
  const result = { ...structuredClone(base), groups: [] };
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
const weaponGroups = Object.freeze({});
module.exports = { weaponGroups, profiles, resolveTraining, weaponTrained };

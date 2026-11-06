const { issue, validateLoadout, definition } = require("./index");
const packages = require("../system/blueprints/characters/startingEquipment");
function fail(message) {
  const e = new Error(message);
  e.statusCode = 400;
  throw e;
}
function resolve(calling, selection, { preview = false } = {}) {
  const p = packages[calling];
  if (
    !p ||
    !selection ||
    selection.packageId !== calling ||
    selection.version !== p.version
  )
    fail("Choose a current Calling equipment package");
  if (
    Object.keys(selection).some(
      (k) => !["packageId", "version", "choices", "equipped"].includes(k)
    )
  )
    fail("Invalid package fields");
  const choices = selection.choices;
  if (
    !choices ||
    Object.keys(choices).length !== Object.keys(p.choices).length ||
    Object.keys(choices).some((k) => !p.choices[k])
  )
    fail("Complete all package choices");
  const grants = { ...p.guaranteed };
  for (const [key, options] of Object.entries(p.choices)) {
    if (!Object.hasOwn(options, choices[key])) fail("Invalid package choice");
    Object.assign(grants, options[choices[key]]);
  }
  const refs = {};
  const inventory = Object.entries(grants).map(([key, id]) => {
    definition(id);
    const i = preview
      ? {
          instanceId: "preview:" + key,
          definitionId: id,
          quantity: 1,
          customName: "",
          notes: "",
        }
      : issue({ definitionId: id });
    refs[key] = i.instanceId;
    return i;
  });
  let symbolic = selection.equipped;
  if (!symbolic) {
    symbolic = { ...p.defaults };
    if (symbolic.offHand === "secondary:shield")
      symbolic.offHand = grants.secondary === "shield" ? "secondary" : null;
    if (symbolic.offHand === "shield:if-present")
      symbolic.offHand = grants.shield ? "shield" : null;
  }
  if (
    Object.keys(symbolic).some(
      (k) => !["mainHand", "offHand", "armor", "grip"].includes(k)
    )
  )
    fail("Invalid symbolic loadout");
  const loadout = { grip: symbolic.grip };
  for (const key of ["mainHand", "offHand", "armor"]) {
    if (symbolic[key] !== null && !Object.hasOwn(refs, symbolic[key]))
      fail("Equipped reference is not a starting grant");
    loadout[key] = symbolic[key] === null ? null : refs[symbolic[key]];
  }
  validateLoadout(inventory, loadout);
  return {
    inventory,
    loadout,
    grants,
    startingEquipment: {
      packageId: calling,
      version: p.version,
      choices: { ...choices },
    },
  };
}
module.exports = { resolve };

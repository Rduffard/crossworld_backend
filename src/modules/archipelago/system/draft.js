const { applyOriginBonus } = require("./originBonus");
const { validateTraining } = require("./training");
const advancement = require("./advancement");
const equipment = require("../equipment");
const packages = require("../equipment/startingEquipment");
function preview(body) {
  const attributes = applyOriginBonus(body.attributes, body.origin);
  const training = validateTraining(body.training);
  const ledger = advancement.initialize(
    body.calling,
    attributes,
    body.abilitySelections ?? {},
    training
  );
  const summary = advancement.summarize(ledger, 1, { training });
  const items = packages.resolve(body.calling, body.startingEquipment, {
    preview: true,
  });
  const character = {
    name: "Draft",
    calling: body.calling,
    attributes,
    training,
    progression: { rank: 1 },
    advancement: ledger,
    ...items,
  };
  return {
    progression: summary,
    equipment: equipment.derive(character),
    complete: summary.complete,
  };
}
module.exports = { preview };

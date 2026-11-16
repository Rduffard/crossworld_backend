const { listAbilityOptions: list } = require('@crossworld/sanguine-engine/callings');

function availableKit(character, charges) {
  return character.inventory.find(item => item.definitionId === 'healer-kit' && item.quantity > 0 && item.chargesCurrent >= charges);
}

module.exports = { list, availableKit };

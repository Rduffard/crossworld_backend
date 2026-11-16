const crypto = require('node:crypto');
const { calculateSpellSlotExpenditure, requiresSpellRecallRoll, SpellSlotExpenditureError } =
  require('@crossworld/sanguine-engine/spell-slots');

function spend(state, slotLevel, recallEligible, roll = () => crypto.randomInt(1, 5)) {
  const index = Number.isSafeInteger(slotLevel) ? slotLevel - 1 : -1;
  const input = { slotLevel, available: state.slots[index], created: state.createdSlots[index], recallEligible };
  try {
    const recallRoll = requiresSpellRecallRoll(input) ? roll() : undefined;
    const { available, created, ...result } = calculateSpellSlotExpenditure(input, recallRoll);
    state.slots[index] = available;
    state.createdSlots[index] = created;
    return result;
  } catch (error) {
    if (error instanceof SpellSlotExpenditureError && error.code === 'SPELL_SLOT_UNAVAILABLE') {
      throw Object.assign(new Error(error.message), { statusCode: 422 });
    }
    throw error;
  }
}

module.exports = { spend };

const { SpellSlotReconciliationError, reconcileCombinedSpellSlots, deductSpellSlot, savedSlotBalancesEligible } =
  require('@crossworld/sanguine-engine/spell-slots');

function spendSlot(state, slotLevel) {
  const index = slotLevel - 1;
  const { available, created } = deductSpellSlot({
    slotLevel, available: state.slots[index], created: state.createdSlots[index],
  });
  state.slots[index] = available;
  state.createdSlots[index] = created;
}

function invalidSlots() {
  return Object.assign(new Error('Invalid saved spell slots'), { statusCode: 400 });
}

function validateSpellSlots(allocation, { slots, createdSlots }) {
  if (!savedSlotBalancesEligible(allocation,slots,createdSlots)) throw invalidSlots();
}

function reconcileSlotTotals(previousAllocation, state, nextAllocation, policy) {
  validateSpellSlots(previousAllocation, state);
  try {
    return reconcileCombinedSpellSlots(previousAllocation, state.slots, state.createdSlots, nextAllocation, policy);
  } catch (error) {
    if (error instanceof SpellSlotReconciliationError) throw invalidSlots();
    throw error;
  }
}

module.exports = { reconcileSlotTotals, validateSpellSlots, spendSlot };

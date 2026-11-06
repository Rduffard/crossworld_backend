// Explicit, pure handlers. Definitions cannot contain executable expressions.
const handlers = {
  "great-weapon-fighting"(_definition, state) {
    state.greatWeaponFighting = true;
  },
  expertise(definition, state) {
    if (definition.skillId) state.expertise.add(definition.skillId);
  },
  "extra-attack"(_definition, state, row) {
    state.attacksPerAction = Math.max(
      state.attacksPerAction,
      row.attacksPerAction
    );
  },
  "defense-style"(_definition, state) {
    state.defenseStyle = true;
  },
};
function derive(definitions, row) {
  const state = {
    expertise: new Set(),
    attacksPerAction: 1,
    defenseStyle: false,
    greatWeaponFighting: false,
  };
  for (const definition of definitions) {
    if (!definition.mechanicalHandler) continue;
    const handler = handlers[definition.mechanicalHandler];
    if (!handler) throw new Error("Unknown mechanical handler");
    handler(definition, state, row);
  }
  return {
    expertise: [...state.expertise],
    combatCapabilities: {
      attacksPerAction: state.attacksPerAction,
      defenseStyle: state.defenseStyle,
      greatWeaponFighting: state.greatWeaponFighting,
    },
  };
}
module.exports = { handlers, derive };

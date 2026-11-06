const { applyCommand, createFixture } = require('./state');
function createService(Model, Characters) {
  async function load(id, owner) {
    const state = await Model.findOne({ _id: id, owner }).lean();
    if (!state) { const error = new Error('Encounter not found'); error.statusCode = 404; throw error; }
    return state;
  }
  return {
    create: owner => Model.create(createFixture(owner)),
    async fromCharacter(owner, characterId, practiceProficiency) {
      const character = await Characters.findOne({ _id: characterId, owner }).lean();
      if (!character) { const error = new Error('Character not found'); error.statusCode = 404; throw error; }
      return Model.create(require('./snapshot').fromCharacter(character, owner, practiceProficiency));
    },
    load,
    async command(id, owner, command) {
      const state = await load(id, owner);
      const next = applyCommand(state, command, owner);
      if (next === state) return state;
      const { status, revision, round, activeCombatant, combatants, events } = next;
      const saved = await Model.findOneAndUpdate({ _id: id, owner, revision: state.revision }, { $set: { status, revision, round, activeCombatant, combatants, events } }, { new: true, runValidators: true }).lean();
      if (saved) return saved;
      // A simultaneous retry can observe the winning command without applying it twice.
      const latest = await load(id, owner);
      if (latest.events.some(e => e.commandId === command.id)) return applyCommand(latest, command, owner);
      const error = new Error('Encounter changed; reload before acting'); error.statusCode = 409; throw error;
    }
  };
}
module.exports = { createService };

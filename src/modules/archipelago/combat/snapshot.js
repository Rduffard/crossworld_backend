const { calculateCheckModifier } = require('../system/checkModifier');
const { proficiencyBonus } = require('../system/trainingChecks');
const { calculateGuard } = require('./guard');
const { createFixture } = require('./state');
const callings = require('../system/blueprints/characters/callings');
function fromCharacter(character, owner, practiceProficiency) {
  const invalid = message => { const error = new Error(message); error.statusCode = 400; throw error; };
  if (typeof practiceProficiency !== 'boolean') invalid('Choose whether practice-only cutlass proficiency applies');
  if (!character || String(character.owner) !== String(owner)) invalid('Character unavailable');
  if (typeof character.name !== 'string' || !character.name.trim() || !callings.some(c => c.id === character.calling)) invalid('Character identity is incompatible with practice combat');
  const level = character.progression?.rank;
  let attributes, modifiers;
  try {
    proficiencyBonus(level);
    attributes = Object.fromEntries(['might','agility','wit','spirit','resolve','instinct'].map(key => [key, character.attributes?.[key]]));
    modifiers = Object.fromEntries(Object.keys(attributes).map(key => [key, calculateCheckModifier(attributes,key)]));
  } catch { invalid('Character attributes or level are unavailable for combat; review the character separately'); }
  const health = character.resources?.health;
  if (!health || !Number.isSafeInteger(health.current) || !Number.isSafeInteger(health.max) || health.max < 1 || health.current <= 0 || health.current > health.max) invalid('Practice requires valid saved Health above zero and no greater than maximum; no healing or repair is applied');
  if (character.training !== undefined && (!Array.isArray(character.training) || character.training.some(id => typeof id !== 'string'))) invalid('Character Training is malformed');
  const state = createFixture(owner);
  const combatant = { id:'player', source:{type:'character',id:String(character._id)}, name:character.name, calling:character.calling, level, attributes, modifiers,
    training: structuredClone(character.training ?? []), trainingRulesVersion:character.trainingRulesVersion ?? null,
    health:{current:health.current,max:health.max}, weapon:'cutlass',weaponTraining:practiceProficiency?['cutlass']:[],
    practiceLoadout:{temporary:true,unarmored:true,cutlassProficiency:practiceProficiency}, guardInputs:{},guard:calculateGuard(attributes),actions:1 };
  state.combatants[0]=combatant;
  state.activeCombatant='player';
  state.sourceCharacter=String(character._id);
  state.initialCharacterSnapshot=structuredClone(combatant);
  return state;
}
module.exports={fromCharacter};

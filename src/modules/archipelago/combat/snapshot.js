const { calculateCheckModifier } = require("../system/checkModifier");
const { proficiencyBonus } = require("../system/trainingChecks");
const { calculateGuard } = require("./guard");
const { createFixture } = require("./state");
const rules = require("../system/rules2024");
function fromCharacter(character, owner) {
  const invalid = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  };
  if (!character || String(character.owner) !== String(owner))
    invalid("Character unavailable");
  if (!character.rulesLedger) invalid("Recreate this experimental character with the current creator");
  const progression = rules.replay(character.rulesLedger);
  rules.runtime.validate(progression, character.rulesRuntime);
  const projected = rules.runtime.project(progression, character.rulesRuntime, character);
  character = { ...character, attributes: progression.attributes,
    calling: character.rulesLedger.levels[0].callingId,
    training: progression.training, progression: { rank: progression.totalLevel },
    resources: { health: character.rulesRuntime.health } };
  if (
    typeof character.name !== "string" ||
    !character.name.trim() ||
    !rules.blueprint.callings.some((c) => c.id === character.calling)
  )
    invalid("Character identity is incompatible with practice combat");
  const level = character.progression?.rank;
  let attributes, modifiers;
  try {
    proficiencyBonus(level);
    attributes = Object.fromEntries(
      ["might", "agility", "wit", "spirit", "resolve", "instinct"].map(
        (key) => [key, character.attributes?.[key]]
      )
    );
    modifiers = Object.fromEntries(
      Object.keys(attributes).map((key) => [
        key,
        calculateCheckModifier(attributes, key),
      ])
    );
  } catch {
    invalid(
      "Character attributes or level are unavailable for combat; review the character separately"
    );
  }
  const health = character.resources?.health;
  if (
    !health ||
    !Number.isSafeInteger(health.current) ||
    !Number.isSafeInteger(health.max) ||
    health.max < 1 ||
    health.current <= 0 ||
    health.current > health.max
  )
    invalid(
      "Practice requires valid saved Health above zero and no greater than maximum; no healing or repair is applied"
    );
  if (
    character.training !== undefined &&
    (!Array.isArray(character.training) ||
      character.training.some((id) => typeof id !== "string"))
  )
    invalid("Character Training is malformed");
  if (!progression.decisionsComplete)
    invalid("Complete required advancement decisions before entering combat");
  const resolved = require("../equipment").derive(character);
  const state = createFixture(owner);
  const combatant = {
    id: "player",
    source: { type: "character", id: String(character._id) },
    name: character.name,
    calling: character.calling,
    level,
    attributes,
    modifiers,
    training: structuredClone(character.training ?? []),
    health: { current: health.current, max: health.max },
    weapon: resolved.attacks[0]?.definitionId ?? null,
    weaponTraining: [
      ...resolved.training.categories,
      ...resolved.training.weapons,
      ...resolved.attacks.filter(attack => attack.trained).map(attack => attack.definitionId),
    ],
    equipmentSnapshot: structuredClone(resolved),
    attackOptions: structuredClone(resolved.attacks),
    restrictions: resolved.restrictions,
    guardInputs: resolved.guardInputs,
    guard: calculateGuard(attributes, resolved.guardInputs),
    actions: 1,
    greatWeaponFighting:
      progression.fightingStyles.includes("great-weapon-fighting"),
    criticalThreshold: projected.criticalThreshold,
    attacksPerAction: progression.attacksPerAction,
    attacksRemaining: 0,
    abilitySnapshot: [],
    expertise: progression?.expertise ?? [],
  };
  state.combatants[0] = combatant;
  state.activeCombatant = "player";
  state.sourceCharacter = String(character._id);
  state.initialCharacterSnapshot = structuredClone(combatant);
  return state;
}
module.exports = { fromCharacter };

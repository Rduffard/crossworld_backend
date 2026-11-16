const { spells } = require('../../system/rules');
const { maximumCharacterLevel } = require('@crossworld/sanguine-engine/progression');
const { wishCooldownStateEligible } = require('@crossworld/sanguine-engine/callings');
const { spellPreparationEligible } = require('@crossworld/sanguine-engine/preparations');
const { project } = require('./selections');
const { validateConduitJournal, validateFeatJournal, validateFolioJournal } = require('./runtimeJournals');
const { validateSpellSlots } = require('../../spells/spellSlotState');

function fail(message) {
  const e = new Error(message);
  e.statusCode = 400;
  throw e;
}

function validate(summary, state) {
  return validateProjected(project(summary, state ?? {}),state);
}
function validateProjected(summary,state) {
  const bounded = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
  if (!state || !bounded(state.revision, Number.MAX_SAFE_INTEGER) ||
      state.health?.max !== summary.health.max || !bounded(state.health.current, summary.health.max))
    fail("Invalid saved Health or resource revision");
  for (const [name, maxima] of [["pools", Object.fromEntries(Object.entries(summary.resources).map(([id, p]) => [id, p.max]))],
    ["hitDice", summary.hitDice]]) {
    if (!state[name] || Object.keys(state[name]).length !== Object.keys(maxima).length ||
        Object.entries(maxima).some(([id, max]) => !bounded(state[name][id], max)))
      fail("Invalid saved " + name);
  }
  validateSpellSlots(summary.spellSlots, state);
  if (!state.preparations || Object.keys(state.preparations).length !== Object.keys(summary.spellcasting).length)
    fail("Invalid saved preparations");
  for (const [id, casting] of Object.entries(summary.spellcasting)) validatePreparation(summary, id, state.preparations[id], casting);
  if (!bounded(state.temporaryHealth ?? 0, 10000) || !Array.isArray(state.effects ?? []) || (state.effects ?? []).length > 200)
    fail('Invalid temporary resources');
  validateEffectIds(state.effects);
  require('../../combat/vitality/healthState').validate(state);
  validateConduitJournal(state);
  validateFolioJournal(state, spells);
  if(state.milestones!==undefined&&(!Array.isArray(state.milestones)||state.milestones.length>maximumCharacterLevel-1||new Set(state.milestones.map(m=>m.level)).size!==state.milestones.length||state.milestones.some(m=>!Number.isInteger(m.level)||m.level<2||m.level>maximumCharacterLevel||typeof m.reason!=='string'||!m.reason.trim()||m.reason.length>500||typeof m.authorizedBy!=='string'||typeof m.used!=='boolean')))fail('Invalid saved milestone authorization');
  validateFeatJournal(summary,state);
  if(state.interventionCooldown&&!wishCooldownStateEligible(summary.callingLevels.doctor,state.interventionCooldown))
    fail('Invalid saved Greater Intervention cooldown');
  return true;
}
function validateEffectIds(effects = []) {
  if (!Array.isArray(effects)) fail('Invalid temporary resources');
  const ids = new Set();
  for (const effect of effects) {
    const id = effect?.id;
    if (typeof id !== 'string' || !id.trim() || ids.has(id)) fail('Active effects require unique instance IDs');
    ids.add(id);
  }
}

function isEligiblePreparation(id, spellId, casting) {
  return spellPreparationEligible(id, spells.find(spell => spell.id === spellId), casting);
}

function validatePreparation(summary, id, selected, casting = summary.spellcasting[id]) {
  if (!casting || !Array.isArray(selected) || selected.length !== casting.preparedCount ||
      new Set(selected).size !== selected.length) fail("Invalid preparation count");
  if (selected.some(spellId => !isEligiblePreparation(id, spellId, casting))) fail("Invalid prepared spell");
}

module.exports = { validateEffectIds, validate, validateProjected, validatePreparation, isEligiblePreparation };

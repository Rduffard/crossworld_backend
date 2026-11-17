const { conditions } = require('@crossworld/sanguine-engine/vitality');
const { validExhaustionLevel, isIncapacitated: incapacitated } = require('@crossworld/sanguine-engine/vitality');

function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
const { freshDeathSaves: fresh, healVitality, restoreVitality, HealingError } = require('@crossworld/sanguine-engine/vitality');
function endConcentration(state){state.effects=state.effects.filter(e=>!e.concentration);state.concentrationChecks=[];}
function heal(state, amount, summary) {
  if (summary && state.animalForms?.activeFormId) {
    require('../../characters/runtime/animalHealth').transition(summary, state, { type: 'heal', amount });
    return;
  }
  try {
    Object.assign(state, healVitality(state, amount));
  } catch (error) {
    if (error instanceof HealingError) fail(error.message);
    throw error;
  }
}
function revive(state, amount = 1) {
  Object.assign(state, restoreVitality(state, amount));
}

function validate(state){
  const d=state.deathSaves;
  if(d&&(!Number.isSafeInteger(d.successes)||d.successes<0||d.successes>3||!Number.isSafeInteger(d.failures)||d.failures<0||d.failures>3||typeof d.stable!=='boolean'||typeof d.dead!=='boolean'))fail('Invalid saved death saves');
  if(state.exhaustion!==undefined&&!validExhaustionLevel(state.exhaustion))fail('Invalid Exhaustion level');
  if(state.conditions!==undefined&&(!Array.isArray(state.conditions)||state.conditions.length>100||state.conditions.some(c=>!conditions.includes(c.conditionId)||typeof c.source!=='string'||!c.source.trim()||c.source.length>100)||new Set(state.conditions.map(c=>c.conditionId+'|'+c.source)).size!==state.conditions.length))fail('Invalid saved conditions');
  if(state.concentrationChecks!==undefined&&(!Array.isArray(state.concentrationChecks)||state.concentrationChecks.length>100||state.concentrationChecks.some(c=>typeof c.id!=='string'||!Number.isInteger(c.dc)||c.dc<10||c.dc>30||!Array.isArray(c.effects))))fail('Invalid saved Concentration checks');
  if(state.worldTime!==undefined&&(!Number.isSafeInteger(state.worldTime)||state.worldTime<0))fail('Invalid saved world time');
}

module.exports = { fresh, incapacitated, endConcentration, heal, revive, validate };

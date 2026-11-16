const { project } = require('./selections');
const { masteryReplacementLimit } = require('@crossworld/sanguine-engine/training');
const { restSelectionTerms } = require('@crossworld/sanguine-engine/preparations');

function fail(message) { throw Object.assign(new Error(message), { statusCode: 400 }); }

function replace(summary, state, selections, type) {
  if (!selections || typeof selections !== 'object' || Array.isArray(selections)) fail('Invalid rest selections');
  const current = project(summary, state);
  for (const [id, changes] of Object.entries(selections)) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) fail('Invalid replacements');
    for (const [key, value] of Object.entries(changes)) {
      const {grayNet,error}=restSelectionTerms(id,current.paths[id],key,type);
      if(error)fail(error);
      const old = key === 'spellMastery' ? current.spellcasting[id]?.spellMastery : grayNet ? [current.pathSelections[id]?.[key]] : current.pathSelections[id]?.[key];
      if (!Array.isArray(old) || !Array.isArray(value)) fail('Unavailable replacement');
      const changed = value.filter(v => !old.includes(v)).length;
      if(key==='spellMastery'&&value.some(v=>!old.includes(v)&&!current.spellcasting.shipwright.folio.includes(v)))fail('New Spell Mastery selections require an available folio spell');
      if (changed > masteryReplacementLimit(id,key,old.length)) fail('Replacement limit exceeded');
      state.selections ??= {};
      state.selections[id] = { ...state.selections[id], [key]: value };
    }
  }
  project(summary, state);
}

module.exports = { replace };

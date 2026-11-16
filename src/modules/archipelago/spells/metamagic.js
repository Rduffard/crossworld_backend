const metamagic = require('@crossworld/sanguine-engine/spells/metamagic');

function validate(summary, selected, spell, state, params = {}) {
  if (!Array.isArray(selected) || new Set(selected).size !== selected.length) {
    throw Object.assign(new Error('Select distinct Metamagic options'), { statusCode: 422 });
  }
  const active=state.effects.some(e=>e.featureId==='calling:tidecaller:innate-sorcery:1'&&(e.expiresAt===undefined||e.expiresAt>require('../combat/effects/clock').now(state)));
  try {
    return metamagic.validate({
      known: summary.pathSelections.tidecaller?.metamagic ?? [],
      active,
      level: summary.callingLevels.tidecaller,
      spiritModifier: summary.attributeModifiers.spirit,
    }, selected, spell, params);
  } catch (error) {
    if (error instanceof metamagic.MetamagicRuleError) throw Object.assign(new Error(error.message), { statusCode: 422 });
    throw error;
  }
}

module.exports = { options: metamagic.options, validate, project: metamagic.project };

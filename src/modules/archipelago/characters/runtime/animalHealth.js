const { transitionBeastshifterHealth } = require('@crossworld/sanguine-engine/lineages');
const { fail } = require('../commandEnvelope');

function initialize(summary) {
  const forms = summary.lineage?.animalForms;
  if (!forms) return {};
  return { animalForms: { activeFormId: null, healthByForm: { ...forms.initialHealth } } };
}

function engineState(summary, runtime) {
  if (!runtime.animalForms) return undefined;
  return { ...runtime.animalForms, knownFormIds: summary.lineage.animalForms.knownForms };
}

function save(runtime, state) {
  runtime.animalForms = { activeFormId: state.activeFormId, healthByForm: { ...state.healthByForm } };
}

function transition(summary, runtime, event) {
  const outcome = transitionBeastshifterHealth({
    level: summary.totalLevel, state: engineState(summary, runtime), vitality: runtime, event,
  });
  save(runtime, outcome.state);
  return outcome.vitalityPatch;
}

function validate(summary, runtime) {
  const maxima = summary.lineage?.animalForms?.maximumHealth;
  const saved = runtime.animalForms;
  if (!maxima && !Object.hasOwn(runtime, 'animalForms')) return;
  const health = saved?.healthByForm;
  if (!maxima || !saved || (saved.activeFormId !== null &&
      (!summary.lineage.animalForms.knownForms.includes(saved.activeFormId) ||
       !(health?.[saved.activeFormId] > 0) || runtime.deathSaves?.dead)) ||
      Object.keys(saved).some(key => !['activeFormId', 'healthByForm'].includes(key)) ||
      !health || typeof health !== 'object' || Array.isArray(health) ||
      Object.keys(health).length !== Object.keys(maxima).length ||
      Object.entries(maxima).some(([id, max]) =>
        !Object.hasOwn(health, id) || !Number.isSafeInteger(health[id]) || health[id] < 0 || health[id] > max)) {
    fail('Invalid saved animal form Health', 422, { fieldPath: 'rulesRuntime.animalForms' });
  }
}

function reconcile(before, runtime, after, next) {
  validate(before, runtime);
  if (!next.animalForms || !runtime.animalForms) return;
  const { maximumHealth } = after.lineage.animalForms;
  for (const [id, current] of Object.entries(runtime.animalForms.healthByForm)) {
    if (Object.hasOwn(maximumHealth, id)) {
      next.animalForms.healthByForm[id] = Math.min(current, maximumHealth[id]);
    }
  }
  const id = runtime.animalForms.activeFormId;
  if (after.lineage.animalForms.knownForms.includes(id) && next.animalForms.healthByForm[id] > 0)
    next.animalForms.activeFormId = id;
}

module.exports = { initialize, validate, reconcile, engineState, save, transition };

const {
  advanceBeastshifterForms,
  beastshifterFormChoices,
  deriveBeastshifterForm,
  deriveLineage,
  LineageRuleError,
  validateLineageSelection,
} = require('@crossworld/sanguine-engine/lineages');
const { fail } = require('../commandEnvelope');
const { skills } = require('../../system/catalog');
const { tools: toolIds } = require('./definitions/creation');

const eventFields = ['lineageForm'];

function checkChoices(selection, context, requiredChoices) {
  const result = validateLineageSelection(selection, context);
  const invalid = result.issues.find(issue => issue.code !== 'required');
  if (invalid) {
    fail('Invalid or ineligible Lineage choice', 422, {
      fieldPath: 'creation.lineage.' + invalid.field,
    });
  }
  for (const field of result.pending) {
    const path = field === 'lineage' ? 'creation.lineage' : 'creation.lineage.' + field;
    requiredChoices.push({ id: path, key: path, count: 1 });
  }
  return result.selection;
}

function advanceForms(state, level, choice) {
  if (choice !== undefined && (!choice || typeof choice !== 'object' ||
      Array.isArray(choice) || Object.keys(choice).some(key => !['learnFormId', 'replaceForm'].includes(key)))) {
    fail('Invalid animal form choice', 422, { fieldPath: 'lineageForm' });
  }
  try {
    return advanceBeastshifterForms(state, { ...choice, level });
  } catch (error) {
    if (!(error instanceof LineageRuleError)) throw error;
    fail('Invalid or ineligible animal form choice', 422, {
      fieldPath: 'lineageForm.' + error.field,
    });
  }
}

function replay(selection, requiredChoices) {
  let context, validated, animal, formOptions;
  return {
    initialize({ scores, caster, weapons, armor, trained, tools, selectedFeats, initiate }) {
      context = {
        scores: { ...scores }, caster, weapons: [...weapons], armor: [...armor],
        trained: [...trained], tools: [...tools], chosenFeats: [...selectedFeats],
        initiateLists: initiate?.list ? [initiate.list] : [],
        skillIds: skills.map(skill => skill.id), toolIds,
      };
      validated = checkChoices(selection, context, requiredChoices);
      if (!validated) return null;
      const lineage = deriveLineage(validated, 1, context);
      if (lineage.animalForms) {
        animal = advanceForms(undefined, 1, { learnFormId: lineage.animalForms.initialFormId });
      }
      return lineage;
    },
    advance(level, choice) {
      if (!animal) {
        if (choice !== undefined) fail('Animal form choices require a Beastshifter');
        return;
      }
      const options = beastshifterFormChoices(level, animal.knownFormIds);
      if (options.milestone && (choice === undefined ||
          (choice && typeof choice === 'object' && !Object.hasOwn(choice, 'learnFormId')))) {
        formOptions = { ...options, replaceableFormIds: animal.knownFormIds };
        if (choice !== undefined) fail('Select the new animal form before replacing a form');
        requiredChoices.push({
          id: 'lineage:' + level + ':learn-form', key: 'lineageForm', count: 1,
          options: options.eligibleFormIds,
        });
        return;
      }
      animal = advanceForms(animal, level, choice);
    },
    project(level, attributes) {
      if (!validated) return null;
      const lineage = deriveLineage(validated, level, {
        ...context, attributes, knownForms: formOptions ? undefined : animal?.knownFormIds,
      });
      if (!animal) return lineage;
      return {
        ...lineage,
        animalForms: {
          ...lineage.animalForms,
          knownForms: animal.knownFormIds,
          initialHealth: animal.healthByForm,
          maximumHealth: Object.fromEntries(Object.keys(animal.healthByForm).map(id =>
            [id, deriveBeastshifterForm(id, level).maxHealth])),
          ...(formOptions ? { pendingChoice: formOptions } : {}),
        },
      };
    },
  };
}

module.exports = { eventFields, replay };

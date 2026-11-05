const training = require('./blueprints/training');
const trainingIds = training.map((entry) => entry.id);
function validateTraining(value) {
  if (!Array.isArray(value) || value.length !== 4 || new Set(value).size !== 4 ||
      value.some((id) => typeof id !== 'string' || !trainingIds.includes(id))) {
    throw new Error('Choose exactly four distinct canonical Training IDs');
  }
  return [...value];
}
module.exports = { trainingIds, validateTraining };

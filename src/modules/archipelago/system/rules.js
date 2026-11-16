// SA-CHAR-1 rules combine engine-owned Calling and spell content with the engine-owned feat catalog.
const { paths, features } = require('@crossworld/sanguine-engine/callings');
const { feats } = require('@crossworld/sanguine-engine/feats');
const { spells } = require('@crossworld/sanguine-engine/spells');

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

module.exports = freeze({ features, paths, feats, spells });

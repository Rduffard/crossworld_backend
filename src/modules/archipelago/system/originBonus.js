const { validatePointBuyAllocation } = require('./pointBuy');
const catalog = require('./blueprints/catalogs');

/** Apply only the catalog attribute bonus to a legal pre-origin allocation.
 * No final-score cap, passives, drawbacks, reputation or training effects.
 */
function applyOriginBonus(attributes, originId) {
  validatePointBuyAllocation(attributes);
  const origins = catalog.origins;
  if (!Array.isArray(origins)) throw new TypeError('Origin catalog is unavailable');
  const origin = typeof originId === 'string' && origins.find((entry) => entry.id === originId);
  if (!origin) throw new RangeError('Unknown origin identifier');
  const match = typeof origin.bonus === 'string' && origin.bonus.match(/^([+-]?\d+)\s+(Might|Agility|Wit|Spirit|Resolve|Instinct)$/i);
  if (!match || !Number.isSafeInteger(Number(match[1]))) {
    throw new TypeError('Unsupported origin attribute bonus');
  }
  const key = match[2].toLowerCase();
  return { ...attributes, [key]: attributes[key] + Number(match[1]) };
}

module.exports = { applyOriginBonus };

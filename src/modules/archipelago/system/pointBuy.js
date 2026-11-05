const ATTRIBUTE_KEYS = ['might', 'agility', 'wit', 'spirit', 'resolve', 'instinct'];
const COSTS = Object.freeze({ 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 });
const POINT_BUY_BUDGET = 27;

/** Return a fresh allocation before origin bonuses. */
function createPointBuyAttributes() {
  return Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, 8]));
}

/** Validate shape and scores; calculate cost even when over budget. */
function calculatePointBuyCost(attributes) {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    throw new TypeError('Allocation must be an object with all six attributes');
  }
  if (Reflect.ownKeys(attributes).length !== ATTRIBUTE_KEYS.length ||
      !ATTRIBUTE_KEYS.every((key) => Object.hasOwn(attributes, key))) {
    throw new TypeError('Allocation must contain exactly the six attribute keys');
  }
  return ATTRIBUTE_KEYS.reduce((total, key) => {
    const score = attributes[key];
    if (!Number.isInteger(score)) {
      throw new TypeError('Attribute scores must be integers');
    }
    if (score < 8 || score > 15) {
      throw new RangeError('Attribute scores must be between 8 and 15');
    }
    return total + COSTS[score];
  }, 0);
}

/** Negative remaining points indicate an over-budget allocation. */
function calculateRemainingPointBuyPoints(attributes) {
  return POINT_BUY_BUDGET - calculatePointBuyCost(attributes);
}

/** Return cost/remaining for a legal allocation; throw for invalid input. */
function validatePointBuyAllocation(attributes) {
  const cost = calculatePointBuyCost(attributes);
  if (cost > POINT_BUY_BUDGET) {
    throw new RangeError('Allocation exceeds the 27-point budget');
  }
  return { cost, remaining: POINT_BUY_BUDGET - cost };
}

module.exports = { createPointBuyAttributes, calculatePointBuyCost, calculateRemainingPointBuyPoints, validatePointBuyAllocation };

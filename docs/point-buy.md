# Point-buy allocation contract

Isolated utilities only; no creator, persistence, bonuses or existing character changes.

An allocation contains exactly six own lowercase keys: might, agility, wit, spirit, resolve, instinct. All scores are numeric integers from 8 through 15 before origin bonuses. Extra keys, missing keys, inherited-only attributes, strings and fractions are rejected. No coercion or defaulting is performed for incoming allocations.

Scores/costs: 8/0, 9/1, 10/2, 11/3, 12/4, 13/5, 14/7, 15/9. Budget: 27.

- createPointBuyAttributes() returns a fresh object with all six scores at 8.
- calculatePointBuyCost(attributes) validates shape/ranges and returns total cost, including totals above 27.
- calculateRemainingPointBuyPoints(attributes) returns 27 minus cost; negative values indicate overspending.
- validatePointBuyAllocation(attributes) throws when over budget, otherwise returns { cost, remaining }. Unspent points are legal. Shape/type errors throw TypeError; range/budget errors throw RangeError.

Origin bonuses must remain separate from this calculation. The utilities cannot distinguish a base score from a bonus-adjusted score; callers must pass base scores only.

Integration remains deferred: the live creator still starts at zero with 12 allocation points and a base cap of 4. Backend Joi and Mongoose still allow 0–10, incompatible with new scores above 10. Before connecting these helpers, align creation/editing, hydration, payloads, validation and persistence; decide how to handle existing records explicitly; review origin bonus application and downstream calculations. No migrations, versioning or schema changes are included.

Tests in each repository: node --test tests/pointBuy.test.mjs
Parity from frontend: node --test tests/pointBuy.parity.test.mjs (requires sibling crossworld_backend checkout).

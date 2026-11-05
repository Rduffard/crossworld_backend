# Isolated attribute modifiers

calculateCheckModifier(attributes, attributeKey) returns a number using Math.floor((score - 10) / 2). Keys are exactly might, agility, wit, spirit, resolve, instinct. Invalid keys throw RangeError; missing, nonnumeric, fractional, nonpositive or unsafe scores throw TypeError. No coercion, defaults, training, proficiency or permanent check assignments are included.

These helpers have no production consumers. Existing saved allocations are NOT conventional ability scores and must not be passed to them. No migration or versioning is introduced.

Current representation: frontend starts attributes at zero, allocates 12 points with a base cap of 4, then applies origin bonuses (src/lib/character.js and archipelagoSystemBlueprint.js). Backend normalizes missing attributes to zero; request validators accept integers 0–10 and Mongoose persistence allows numbers 0–10. The schema alone does not enforce integer values. Both sides use the same lowercase keys. Frontend getRollModifier currently formats score minus 10; existing Core Checks sum paired attributes and investments. These functions remain unchanged.

Before creation switches: approve score generation, ranges/defaults and origin bonuses; align frontend allocation/hydration/payloads with backend normalization, Joi validation and Mongoose persistence; approve how a check selects its attribute; migrate consumers and check storage/validation to support signed modifiers. Review resource/derived-stat and prerequisite/progression dependencies separately before changing the meaning of attributes. Decide explicitly how existing characters will be handled without reinterpreting their allocations. None of those decisions or behavior changes are implemented here.

Run local tests from each repository: node --test tests/checkModifier.test.mjs
Run parity from the frontend (sibling crossworld_backend checkout required): node --test tests/checkModifier.parity.test.mjs

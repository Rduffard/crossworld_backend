# Origin attribute bonuses: audit and isolated contract

Canonical source: backend src/modules/archipelago/system/blueprints/catalogs.js. Frontend getSystemOrigins reads blueprint.catalogs.origins, with an empty list if unavailable. There is no separate frontend origin catalog or discrepancy in bonus definitions. Backend character controller currently accepts/normalizes supplied attributes rather than applying catalog bonuses; frontend creator applies them. No definitions changed.

| Origin ID | Name | Path | Attribute bonus |
| --- | --- | --- | --- |
| yuma-core | Yuma | yuma | +1 Wit |
| lilin-core | Lilin | lilin | +1 Spirit |
| yayimi | Yayimi | archipelago | +1 Resolve |
| klechi | Klechi | archipelago | +1 Wit |
| tetlanco | Grand Duchy of Tetlanco | archipelago | +1 Wit |
| harshanum | Harshanum | archipelago | +1 Might |
| khiz | Khiz | archipelago | +1 Resolve |
| dengz-guo | Dengz Guo | archipelago | +1 Wit |
| arannia | Arannia | archipelago | +1 Agility |
| dazibinian | Dazibinian Principality | archipelago | +1 Agility |
| kirkia | Kirkia | archipelago | +1 Instinct |
| silvia | Silvia | archipelago | +1 Spirit |
| sha-ni | Grand Duchy of Sha-Ni | archipelago | +1 Might |
| purapet | Purapet | archipelago | +1 Spirit |
| thult | Thult | archipelago | +1 Instinct |
| rukka | Rukka | archipelago | +1 Might |
| busha | Busha | archipelago | +1 Resolve |
| akshan | Tribes of Akshan | archipelago | +1 Instinct |

All 18 origins grant one fixed +1. No attribute choices, stacking, conditional attribute bonuses or attribute penalties occur in the bonus field. Passives and drawbacks include situational effects and are outside this calculation. Recommended callings are guidance, not attribute prerequisites. Yuma and Lilin paths automatically select yuma-core/lilin-core; Archipelago selection offers its 16 island origins. The isolated helper validates origin IDs, not character path eligibility (no path argument).

Existing frontend parseAttributeBonus accepts a textual single-attribute bonus and silently ignores unsupported text; applyAttributeBonus applies it, and editing hydration subtracts the origin bonus. New isolated helpers reject unsupported catalog bonus syntax explicitly. Existing behavior remains unchanged.

API: backend applyOriginBonus(attributes, originId); frontend applyOriginBonus(attributes, originId, blueprint). Frontend uses the loaded canonical system blueprint; it fails if the catalog is absent. No bonus table is copied. Both reuse validatePointBuyAllocation, requiring exactly six own attribute keys, integer scores 8–15 and cost at most 27. They return a fresh score object with the selected origin bonus applied once. Unknown IDs throw RangeError; missing catalogs/unsupported bonuses throw TypeError. Point-buy errors propagate. Inputs remain unchanged. Always pass base scores, never previously bonus-adjusted scores.

Current final scores are 8–16; no score can exceed 20. No cap at 15 or 20 is applied. One +1 is smaller than many familiar 5e ancestry packages; retaining it is intentional here and changing its balance requires a design decision. Future multi-attribute bonus definitions require explicit parser support rather than silent partial application.

Integration concerns: creator still uses 12-point allocations; Joi/Mongoose still cap attributes at 10. Before integration, align generation, validation, persistence, payloads and hydration, preserve base scores separately from final scores to avoid double application, and decide backend authority for applying/verifying bonuses. No saved data, migrations, live creator, schemas, origin definitions or downstream mechanics changed.

Tests: node --test tests/originBonus.test.mjs in each repository. Frontend origin tests and parity tests require a sibling crossworld_backend checkout to exercise the actual canonical catalog; run parity with node --test tests/originBonus.parity.test.mjs.

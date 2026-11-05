# Training and attribute checks

This is the implemented character system as of 2026-11-04. Earlier Core Check and ranked Specialty documents are historical design material where marked.

## Character creation

Retain Might, Agility, Wit, Spirit, Resolve, and Instinct. Allocate scores using the existing 27-point buy (8–15 before origin), then apply the origin bonus exactly once on the server. The creator displays all 23 canonical Training names and descriptions. Select exactly four distinct options; the fifth is disabled until one is deselected. Review shows the acquired proficiencies. There are no Core Points, Specialty Picks, rank selectors, prerequisites, or Expertise.

The backend catalog `src/modules/archipelago/system/blueprints/training.js` is authoritative. The blueprint exposes `training` as an array of definitions. Character ownership is only `training: ["board", "shoot", "deceive", "navigate"]`. IDs and names preserve all 23 original identities; Deceive is retained and Guile is not a Training identity. No rank effects are included.

## Resolution

The GM chooses any of the six attributes and whether one relevant Training applies. Roll `d20 + Math.floor((score - 10) / 2)`, adding proficiency once if the character owns that Training ID. Training is never tied to a fixed attribute. Proficiency is derived from the saved character level (`progression.rank`): +2 at 1–4, +3 at 5–8, +4 at 9–12, +5 at 13–16, +6 at 17–20. It cannot be supplied as an editable API value. No Expertise, advantage automation, or combat actions are implemented.

Example at level 1: Might 16 and acquired Board gives `d20 + 5`; Agility 14 and Board gives `d20 + 4`. Without relevant Training these become `d20 + 3` and `d20 + 2`.

## Save and PATCH

POST requires exactly four distinct canonical string IDs. Missing Training, three/five options, duplicates, unknown IDs, Guile, and objects containing ranks are rejected. New characters start at level 1 with full server-calculated Health, Stamina, and Focus and no Path ownership. Point buy, origin bonuses, resource formulas, Wounds, and Corruption retain their existing contracts.

PATCH omits defaults. Omitted Training is unchanged; an explicit replacement must also contain exactly four distinct canonical IDs. Recursive merging preserves unrelated nested fields. Resource maxima cannot be submitted. Changing final attributes/origin/level recalculates maxima and clamps current downward without healing or reapplying origin bonuses. Only affected top-level fields are written; unrelated historical fields are not reserialized. Reads and editing lookups use lean documents to avoid fabricating missing tracks through persistence defaults.

Retired Core Check, ranked skill, and currency fields are rejected in requests. Historical persisted values remain inert and unchanged. Missing Training is displayed explicitly and is not inferred from ranked ownership. The user can leave it absent during unrelated edits or explicitly choose four IDs. Missing authoritative resource tracks display Unavailable; an isolated current edit with no saved maximum is rejected. Historical score allocations outside the current point-buy contract can be reopened and receive unrelated changes, but attribute/origin/level edits require a valid current allocation. No historical data is migrated or accessed by this refactor.

## Paths and archived effects

All six original Path definitions and 18 nodes are unchanged in the backend catalogs. Their original `rankRequired`/`cost` data and prerequisites remain visible. Path purchase and selection changes are disabled in creator and PATCH until progression is defined. Existing ownership and unlocked-node records remain visible and preserved. Rank-weighted Specialty affinity recommendations were removed; no Training-to-Path rank conversion exists. Storm Broker's original Captain's Credit text references recovering a shared Specialty Pick; this dependency is preserved in the definition and cannot currently be advanced. No fourth nodes, provisional level gates, or reassigned effects were added.

The complete 92 effects, original names, rank associations, source identities, and descriptions are archived in `crossworld_backend/docs/historical-specialty-effects.md`. This is documentation only. No Training automatically grants these effects.

## Validation and playtest

Run frontend `node --test --test-concurrency=1 tests/*.test.mjs` and `npm.cmd run build`; run backend `node --test tests/*.test.mjs`. Tests use real validators, controller handlers, Mongoose schemas/serialization, mocked database storage, and rendered React components. They do not contact a live database. Per-file Vite test caches prevent concurrent cache collisions; sequential execution is the conservative option.

1. Run both local development services using the existing configuration and sign in.
2. Create a character, choose Calling/origin, and allocate up to 27 points. Select Board, Shoot, Deceive, and Navigate. Confirm the count is 4/4 and a fifth selection is disabled. Deselect one and confirm continuation is blocked until four are selected again.
3. Inspect all six Paths, review the four Training names, and save. Reopen from the roster, then refresh to verify server reload.
4. On the sheet, select Might and Board for a character with Might 16: the modifier is +5 at level 1. Select Agility 14 with Board: +4. Choose None or an unowned Training: +2 with Agility 14.
5. Edit notes only, then replace one Training while preserving four. Reopen and confirm attributes, nested identity, Wounds, Corruption, Path records, and depleted resource currents are unchanged.
6. Inspect a historical sheet with absent resource tracks: Health/Focus are Unavailable and old ranks have not granted Training. No conversion should occur merely by opening or saving an unrelated edit.

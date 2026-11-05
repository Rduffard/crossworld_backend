# Progression foundation v1

The canonical definition is system/blueprints/progression.js on the backend. Levels 1–20 grant Calling selections at 1, 2, 5, 7, 9, 10, 13, 14, 17, 20; Path investments at 3, 6, 11, 16; and attribute milestones at 4, 8, 12, 16, 19. Level 16 has two distinct rewards. Levels 15 and 18 have none. Proficiency remains +2/+3/+4/+5/+6 across four-level bands.

## Server contract

New characters start at level 1. The server initializes advancement version 1, revision 0, immutable origin-adjusted base attributes, an empty spend/exchange ledger, the Calling passive identity, and the Calling saving-throw proficiency pair. The level 1 Calling selection is earned and retained. There is no active ability library yet: historical starter text is not silently converted into playable ability content.

PATCH accepts advancementOperation with expectedRevision and optional level, spends, and exchanges. Clients cannot submit advancement, trainingRulesVersion, documentRevision, balances, base attributes, passive ownership, save proficiencies, or tier ownership. New-system Calling, origin, and direct attribute/progression changes require a future explicit respec. Legacy level changes require a reviewed upgrade. Level increases can retain every earned reward.

Example: {"advancementOperation":{"expectedRevision":0,"level":4,"spends":[{"rewardId":"attribute:4","kind":"attribute","increases":{"might":2}}]}}

An exchange is {"rewardId":"attribute:4","kind":"calling"} or kind path in the exchanges array. An exchanged opportunity can remain unspent. At most two attribute milestones can be exchanged. Exchanges and spends are append-only; reversal requires an explicit respec, for which no endpoint exists yet. A milestone grants +2 to one attribute or +1 to two different attributes, capped at 20. Reward IDs are unique and deterministic. No cross-conversion of standard Calling or Path rewards is permitted.

Spends replay against the server catalog at the recorded spending level. Calling eligibility uses bands 1/5/11/17, matching Calling, unique ownership, and prerequisites. Path ownership requires exact sequential tiers with minimum levels 3/6/11/16. Tier I immediately owns its defined ability; all six Callings may access every Path. Prerequisites may require attributes, Calling ability IDs, or Path tiers. Synthetic test definitions exercise these rules but are never shipped as content. Production catalogs are empty until reviewed definitions exist, so requests to spend Calling/Path rewards fail without consuming them.

PATCH merges only requested fields, preserves opaque legacy progression and sibling data, and uses a server-managed document revision plus updatedAt in a compare-and-set write. Concurrent changes reject the stale write. Existing resource maximum formulas are reused; increases do not heal and decreases clamp current values. Recovery, combat conversions, and resource cost rules are unchanged.

## Skills and proficiency packages

The 20 binary General Skills are Bargain, Command, Deceive, Read, Perform, Threaten, Persuade, Navigate, Track, Endure, Climb, Dive, Stealth, Perception, Investigate, Lore, Finesse, Jury-Rig, Stabilize, and Attune. Exactly four distinct selections are required. Each Calling recommends two package skills and permits substitution, leaving four total selections. Training adds the level-derived proficiency bonus once to an applicable attribute check. It never adds to a saving throw or supplies an extra bonus from an overlapping tool proficiency.

startingProficiencies.js contains all six approved recommendation packages and saving-throw pairs. Weapon, armor, shield, and tool labels are explicitly pending-definition metadata. No item membership, ownership, attack bonus, armor benefit, or equipment rule is inferred from these labels.

## Compatibility

trainingRulesVersion is 1 only for newly created characters or an explicit replacement of all four Training selections. Missing version means legacy. The original 23 definitions are preserved in legacyTraining.js and historical effect text remains untouched. Legacy sheets use their original Training definitions; editors show retired IDs with explicit removal controls. Unchanged legacy selections can still be saved with unrelated edits. New Training validation does not accept retired IDs.

No read, hydration, or unrelated save creates an advancement ledger or converts a legacy Path. New-system editing keeps base attributes, Calling, and origin fixed; use the sheet Advancement controls for levels, milestones, and exchanges. Historical attributes and unrelated edits retain the earlier editing contract, while historical level changes await upgrade design.

## Deferred work

Reviewed Calling active abilities, combat-compatible passive effects, and four-tier Path definitions are required before selection controls can be enabled. A new character is a progression draft with its first active selection unspent, not a completed first-playable ability build. Equipment category membership and effects, combat/resource conversions, and an explicit legacy-upgrade/respec workflow remain separate decisions. No automatic migration, deployment, or production database operation is part of this foundation.

## Manual verification

Create a new character with four General Skills. Reload and confirm versioned Training, passive identity, saves, and one unspent Calling reward. Record level 4, spend its milestone, reload, and confirm attributes and depleted resources persist. Exchange a later milestone and confirm it remains an unspent Calling/Path reward. Attempt a third exchange, duplicate spend, unavailable ability, or skipped Path tier through the API and verify rejection. Open an old record with Board/Shoot/Scout/Sift and saved Path nodes; save notes and verify all legacy values remain. Exercise concurrent saves and verify the stale request is rejected. These manual live-storage checks have not been run by this task; automated controller tests use mocked storage.

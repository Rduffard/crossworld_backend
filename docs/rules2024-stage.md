# Character refactor status — 2026-11-06

The mandatory completion requirement is NOT satisfied. `tabletopReady` remains false in both the blueprint and every derived build. Changes are in the actual frontend and backend repositories. No commit, push, deployment or database operation was performed.

## Intended Path roster

The roster was checked against the existing Path registry, reserved entries in `rules2024/sourceRules.json`, the inherited `originalPaths.js` designs, and project documentation. The old six-Path registry had Drydock Ghost, Storm Broker, Reef Knife, Powder Saint, Leviathan Anchor and Omen Diver. The canonical registry adds the established Calling-specific and reserved designs below. No additional Path name was invented during this integration.

| Calling | Paths | Path feature levels |
| --- | --- | --- |
| Corsair | Reef Knife | 3, 9, 13, 17 |
| Gunslinger | Yuma Deadeye | 3, 7, 10, 15, 18 |
| Navigator | Gray Net; Storm Broker | 3, 7, 11, 15 |
| Tidecaller | Omen Diver | 3, 6, 14, 18 |
| Warden | Leviathan Anchor | 3, 7, 15, 20 |
| Reaver | Bloodwake | 3, 6, 10, 14 |
| Doctor | Sanctuary Hand; Yuma Field Surgeon | 3, 6, 17 |
| Shipwright | Powder Saint; Drydock Ghost; Klechi Breakwater | 3, 6, 10, 14 |

All twelve are selectable at the owning Calling's level three. Their feature grants persist through Calling level twenty. Drydock Ghost, Storm Broker, Yuma Field Surgeon and Klechi Breakwater use original Archipelago rules, not additional SRD subclasses. Path effects intended for GM adjudication are explicitly labeled as readable rules, not executable combat automation. Roster validation rejects unavailable Paths and missing, duplicate or foreign grants.

## Integrated functionality

- Eight Calling timelines and twelve Path timelines, append-only level events, revision-protected advancement, Calling prerequisites, Health, Hit Dice, Training, Expertise, saves, spell capacity and source-timed feature grants.
- Path selections remain in the summary, including Hunter selections, elemental affinity, clinical casting attribute, surgical discipline, fortification and resistance choices. Tool grants and Drydock Ghost tool Expertise are derived from the canonical ledger.
- Starting equipment and starting-gold alternatives for all eight Callings, including both Fighter-derived packages. Descriptive gear and canonical weapons/armor persist. Inventory and loadout mutation uses owner-scoped compare-and-set writes. Sheets show carried equipment, equipped items, Guard, mastery and attack modifiers.
- Reaver and Omen Diver unarmored Guard; Corsair finesse/light martial weapon Training works in equipment and combat snapshots. Derived equipment attributes and Training come from ledger replay, not cached character statistics.
- Separate Signature Spell counters, always-prepared Spell Mastery and Signature Spells, bounded Arcane Recovery, Sorcerous Restoration, sorcery conversions, temporary created slots, rest expiry and preservation of spent resources through advancement.
- Rest-time prepared-spell changes: Doctor/Shipwright full replacement at Long Rest; Navigator/Warden one replacement; Shipwright Memorize Spell at Short Rest from level five. These choices persist separately from historical advancement and cannot forge spell-list membership or slot-level eligibility.
- Initial Common plus two standard languages, Corsair Thieves' Cant and its additional language, and Deft Explorer's additional languages. Language choices reject duplicates.
- Character identity and narrative notes, persistent sheets, attribute/save/skill dice rolls using server-provided modifiers, armor disadvantage, and split Attribute Improvement selection.
- Runtime validation checks saved Health maxima, revisions, Hit Dice, resource capacities, slot capacities and preparations.

## Legacy removal

Removed the obsolete character validators, character schema/progression contracts, version-one and version-two advancement engines, paired/resource calculators, old six-Calling catalogs, Path tiers/currencies, draft/playtest handlers, origin bonus application, old starting-equipment engine and compatibility equipment fallback. The former creator, sheet, creator steps, progression/equipment UI, duplicated mechanical selectors, old SystemContext and obsolete character roll helpers are removed.

Legacy-only tests were retired with their deleted contracts. Current combat/equipment regressions were adapted to canonical ledger fixtures rather than deleted. Canonical persistence tests replace the removed creation/advancement assertions. Authentication compatibility, campaign/session models, maps, nation/lore/reputation content and unrelated applications are preserved. No character records or other database records were deleted. Old experimental records must be recreated; they are not migrated or mechanically repaired.

## Required work still outstanding

These remain completion blockers, not optional polish:

1. A complete validated origin/background creation contract and its intended setting-specific grants; the current creator accepts final GM-approved scores and narrative origin.
2. General/origin feat selection and all associated subchoices/effects beyond the currently supported Attribute Improvement and Epic Boon subset. Do not treat the presence of readable feat rules as implemented character choices.
3. Full folio copying and feature-specific replacement workflows, including the remaining rest-dependent and level-dependent choices.
4. Remaining special feature operations and resource interactions; not every source-described conversion, recharge or conditional effect has a dedicated character operation.
5. Final manual creator/sheet/advancement verification against a development database and browser. Current persistence tests use model doubles plus real Mongoose validation; they are not live MongoDB tests.

Combat targeting/effect automation is still GM-adjudicated. This does not waive missing character-management operations. The application must not be labeled fully complete or tabletop-ready until the blockers above are resolved and validated.

## Validation

Backend command: `node --test --experimental-test-isolation=none tests/*.test.mjs`.
Frontend uses the same test command. Vite-based SSR tests explicitly disable config-file loading and preserve symlinks to avoid a Windows subprocess blocked by this sandbox. The production build uses Vite's programmatic build API with `configFile:false`, the actual React plugin and `resolve.preserveSymlinks:true`; the ordinary CLI config loader hits `spawn EPERM` here.

Final validation: 88 backend tests and 44 frontend tests pass; backend Archipelago/test lint, changed-frontend lint, production build and Git whitespace checks pass. All twelve Paths have individual persistence tests at every level through twenty and frontend level-twenty grant rendering. Independent roster/schedule tests prevent an omitted Path from silently reducing loop-based coverage. Resource tests cover recovery, conversion, immutable failures and preparation limits. Equipment tests cover all starting packages, ownership and concurrent writes.
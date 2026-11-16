# Sanguine Archipelago backend

The engine at `@crossworld/sanguine-engine` 0.68.0 supplies portable mechanics and catalogs. The backend supplies identities, saved state, authorization, clocks and dice, then applies engine decisions and persists the outcome.

| Area | What it owns |
| --- | --- |
| `characters/routes.js`, `controller.js`, `authority.js` | HTTP entry points, character access and campaign authority |
| `characters/commandEnvelope.js` | Envelope validation, canonical digest and command errors |
| `characters/commandTransaction.js` | Authorizes actor and targets, looks up historical receipts, and commits character, target and receipt writes in the same session |
| `characters/commands.js` | Validates fresh state, routes commands against a cloned record, applies shared cleanup, validates the resulting state and returns changes |
| `characters/turnCommands.js`, `effectCommands.js` | Turn and movement journals, Rage extension, effect cancellation and Silent Keel target removal |
| `characters/advanceCharacter.js`, `advancement/`, `persistence.js` | Consumes campaign milestones, replays ledger history, reconciles resources and projects saved characters |
| `characters/runtime/`, `abilities/` | Rest and runtime state transitions, feature triggers, journal updates and rules projections |
| `combat/`, `spells/`, `equipment/` | Encounter, casting and inventory adapters. They resolve saved evidence and apply engine outcomes to host records |
| `system/`, `campaigns/`, `sessions/`, `rolls/`, `status/` | Catalog and reference data, campaign and session records, shared roll endpoints and service status |

The transaction checks authorization before receipt lookup. A matching receipt returns the saved response before fresh-command revision and state checks. Fresh commands enter `commands.apply` and reach persistence only after state validation. Target writes and the primary character write share the receipt transaction.

```text
Authenticated character command route
  → Validate envelope and compute digest
  → Open transaction and authorize actor
  → Matching receipt? Return the saved response
  → Resolve any command-specific target evidence
  → Check fresh revision and state, then run the handler
  → Apply engine outcomes and validate primary and target state
  → Commit target writes, primary write and receipt together
```

## Testing

Run `npm test` for the complete backend suite or `npm run test:mongo` for the isolated MongoDB integration test. See the [MongoDB fixture setup and troubleshooting guide](../tests/support/PHASE2_MONGO.md).

## Where to make changes

- For a Calling feature, define portable terms in the engine. Use `abilities/abilityOptions.js` for the backend option projection and the relevant ability handler for targets, evidence and host writes. `abilityOperations.js` owns the shared activation sequence. `treatmentAbilities.js` owns healing and treatment evidence. `constructedObjectAbilities.js` owns relay, barrier, salvage and Ghost object actions.
- For a new backend command, check its role in `authority.js`, register the dispatch in `commands.js` and put state changes in the matching domain adapter. `constructionCommands.js` handles damage to saved constructed objects and spending salvage credits. Add transaction context only when the handler needs authoritative evidence or cross-character writes.
- For a progression choice, change the engine eligibility terms and the corresponding step in `advancement/ledger.js`. Each saved level is validated and applied in order. It must complete before the next event can be accepted. `ledgerProjection.js` builds the summary only after replay and owns derived views such as ability options, spellcasting, resources and modifiers.

## Pass 2 changes

- Separated the treatment and constructed-object groups from shared ability activation. Kept serialized IDs, resource spending, rolls, handler validation and final state validation in their existing sequence.
- Formatted the ledger and separated summary projection from its ordered level loop. Kept the level loop together because its choice validation and mutations depend on earlier decisions in the same event.
- Extracted constructed-object damage and salvage spending from the central dispatcher. Formatted the six remaining adapters with lines over 500 characters and verified their parsed syntax trees are identical before and after formatting.
- Added characterization for ability validation precedence and pending-level rejection across all eight Callings. Both cases passed before the refactor. The retained roster probe exercises all 32 Paths, and existing tests cover replacements, receipts, targets and resource spending.
- The legacy archives and Mongo transcripts still have historical path references. No active manifest, lockfile, script or test references the exact legacy archive filenames. The four local archive digests match the Phase 3 pass reports. Kept both sets of artifacts in their existing locations to preserve that evidence. The existing log ignore rule covers generated logs. The tracked temporary-output deletions were already present and remain untouched.
- Pass 2 verification logs are in `%TEMP%/sa-pass2-*.log`.
- Pass 2 passed 90 engine, 641 backend and 115 frontend tests with one isolated MongoDB skip. All 22 retained digests and 3,707 rest observations matched. Catalog and HTTP 304, both lints, production build, 438 JavaScript syntax checks and both consumer archive and lockfile checks passed. Engine and backend scans found zero cycles. The frontend still has its existing map editor cycle and build-size warning.

## Pass 1 inventory and progress

- The original command file had 318 lines, including a 91-line compressed transaction and lines up to 492 characters. The dispatch mixed payload checks, runtime revisions, effect cleanup and advancement with delegated operations. Envelope and digest code belongs to both execution paths. Other dense modules include the advancement ledger (616 lines), ability dispatcher (349), spell operations (157) and vitality adapter (119). Runtime and equipment adapters have similar validation and mutation patterns, with domain-specific order and errors.
- The dependency scanner resolves local CommonJS imports at module and function scope. The command transaction takes the apply function from its caller and depends directly on the shared envelope. Turn and effect handlers depend on the envelope, engine and existing host adapters.
- Added and ran a movement characterization test against the original entry point before editing. It checks duplicate-event rejection, unchanged state and receipt count, and replay of the saved response after the turn closes. Existing command tests cover advancement reconciliation, effect ending, authorization and historical replay.
- Split and formatted the envelope, transaction, turn and movement, advancement and effect handlers. Kept the public command exports and the order of the shared lifecycle checks.
- Both consumer manifests and lockfiles require their own `vendor/crossworld-sanguine-engine-0.68.0.tgz`. The engine source, LICENSE and NOTICE, consumer notices, retained probe scripts and fixtures are required source or verification inputs.
- The backend request log is an ignored Winston output with no readers in the three repositories. Removed the local copy. The logger may recreate it. Kept the error log for diagnostic history. The existing `*.log` rule covers both.
- The five ignored `phase2-mongo-*.log` files are generated test transcripts. The Phase 2 checkpoint explicitly names one transcript and the others may hold acceptance or diagnostic history. Kept them.
- The engine root archives for 0.1.0 through 0.4.0 are obsolete as live dependencies. The historical pass reports record their artifact names and digests. The engine checkout has no commit history, so retained these local copies for provenance. Preserved existing tracked temporary-file deletions and all other pre-existing work.
- Verification output is saved in `%TEMP%/sa-hygiene-*.log`.

## Pass 1 verification

- The engine, backend and frontend suites passed 90, 639 and 115 tests. The isolated MongoDB test was skipped. Both lints and the frontend production build passed. Vite reported the existing large-chunk warning.
- The rest regression matched all 3,707 rows and SHA-256 `dfa2694a60cf8732fd9fa36bb8eaecbb71c82150b7c782347d56a24df9b0582d`. The catalog contract and authenticated HTTP 304 checks passed.
- Syntax checks parsed 433 JavaScript files. The engine and backend dependency scans found zero cycles. The frontend scan found the existing map editor cycle.
- Both vendor archives match the Phase 3 SHA-256 and their lockfile SHA-512 integrity. All 488 installed files in each consumer match the archive byte for byte.
- All 13 retained backend probes and the frontend fixed-roll probe ran successfully. All 22 retained SHA-256 digests match the Phase 3 closeout.

The ability entry point still contains Calling-specific handlers alongside the shared activation sequence. The advancement event loop is lengthy because later choices depend on mutations from earlier choices.

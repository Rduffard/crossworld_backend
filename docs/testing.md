# Sanguine Archipelago testing guide

Use Node.js 22.17.1 and install backend dependencies with `npm ci`. Run these commands from `crossworld_backend`.

| Command | Coverage | Measured wall time |
| --- | --- | --- |
| `npm run test:fast` | Selected backend unit and contract files covering point buy, check modifiers, equipment, character identity, rest timing and engine boundaries | 8.68s |
| `npm test` | Every backend test file, including authenticated HTTP, roster persistence, receipt replay and isolated MongoDB | 2m 21.44s |
| `npm run test:full` | Standard backend coverage plus engine and frontend tests, retained regression probes, the rest regression, both lints, frontend production build, source syntax, dependency graphs and engine archive integrity | 12m 09s before relocation, including 3m 20s for the independent rest regression |

The fast and standard tiers run from a standalone backend checkout with its installed dependencies and a local MongoDB executable for the standard tier. The character lifecycle test uses [a versioned backend fixture](../tests/fixtures/character-lifecycle-features-v1.json) that preserves the 246 documented Calling and Path feature IDs, owners, and unlock levels as independent expectations for ledger replay.

For the exhaustive tier, keep `sanguine-engine` and `archipelago` as sibling checkouts and run `npm ci` in `archipelago`. Run `npm test` in the engine or frontend checkout for that app alone. The exhaustive tier already runs each suite once.

## Shared coverage across repositories

| Behavior | Test location |
| --- | --- |
| Deterministic rules, catalogs and progression | `sanguine-engine/tests/*.test.cjs` |
| Browser-facing projections, package adapters and sheet interactions | `archipelago/tests/*.test.mjs` |
| Historical baselines | Backend `tests/fixtures` and `tests/support`, plus frontend `tests/support/phase3-roll-probe.mjs` |

Use a unit test for deterministic inputs and outcomes. Use a command integration test when validation, state changes or receipts are part of the behavior. Use HTTP or MongoDB coverage for behavior that depends on routing, authorization, database transactions or process restart. Keep adapter tests for the package exports and browser integration they exercise.

Build backend characters with `tests/helpers/phase2.mjs` when a scenario needs a valid Calling and Path. The builder caches solved advancement inputs and supplies fresh runtime state and inventory for each call. Use `tests/helpers/http.mjs` for ephemeral listeners and teardown. For frontend component tests, follow the component bundling and command patterns in `archipelago/tests/phase2.test.mjs`. The memory UI harness in `archipelago/tests/support` supports manual browser acceptance. Keep mutable character state and database records local to each scenario.

## Backend test directories

| Directory under `tests/` | Coverage |
| --- | --- |
| `abilities/` | Calling actions, passives, feats and Path features |
| `advancement/` | Calling progression, ledger replay, replacements, rebuilds and milestone authority |
| `campaigns/` | Campaign membership, registration and session hosting |
| `characters/` | Character identity, attribute modifiers and point buy |
| `combat/` | Attack records and damage riders |
| `equipment/` | Catalogs, loadout, inventory, pricing, magic items and tools |
| `http/` | Character commands, catalog and ETag, combat routes, and shared router contracts |
| `integration/` | Cross-domain character scenarios, engine contracts and isolated MongoDB transactions |
| `persistence/` | Character storage, transaction receipts, audit, persisted runtime and command errors |
| `resources/` | Vitality, rest timing, Hit Dice and pool reconciliation |
| `spells/` | Casting and components, healing, spell slots, preparations, Metamagic and folios |
| `system/` | Catalog initialization across backend module boundaries |
| `helpers/` | Shared character, campaign, fixture and HTTP setup |
| `fixtures/` | Historical baselines and the verification digests |
| `support/` | MongoDB setup, process restart and retained regression runners and baselines |

The [rename index](test-inventory.md#backend-test-file-rename-index) records all 75 old-to-new paths. The main inventory records their original coverage, fixtures and entry points. All 75 test files moved with their existing cases. Historical names remain on shared helpers such as `phase2.mjs` and `rules2024.mjs`, on Phase 3 baseline helpers and JSON fixtures, and on the MongoDB restart probe, fixture guide and regression probes. Their existing paths preserve cross-repository imports and the provenance of saved evidence.

After relocation, the fast tier passed 73 cases and the standard tier passed all 642 cases across 75 files, including automatic MongoDB startup and teardown.

The standard and exhaustive tiers discover backend `*.test.mjs` files recursively. The fast tier selects 17 files by path relative to `tests/`. The runner starts the three historically longest files first when selected, runs HTTP and MongoDB files individually after the unit workers exit, and mirrors domain paths in its per-file log directory.

## Focused runs

```powershell
npm test -- tests/http/character-catalog-and-commands.test.mjs
npm test -- tests/persistence/characters-and-receipts.test.mjs tests/persistence/command-transactions.test.mjs
npm run test:mongo
node tests/support/rest-regression.mjs
```

From the engine or frontend checkout, run `node --experimental-test-isolation=none --test <test-file>` for a focused file. Run the fast tier during local iteration, the standard tier after changes to backend behavior or fixtures, and the exhaustive tier before closing cross-repository changes. Preserve the inputs, order, serialization and expected outputs for the probes listed in `tests/fixtures/verification-digests.json` and the separate rest baseline.

The HTTP tests bind to ephemeral loopback ports. A shared helper measures startup, closes the listener and closes any remaining HTTP connections during teardown. File-level process isolation keeps module mocks local to their test. Two workers run deterministic files, with the longest measured files starting first. HTTP and MongoDB files run individually after the workers finish. Exhaustive stages run sequentially after the backend suite exits.

The [MongoDB fixture guide](../tests/support/PHASE2_MONGO.md) covers executable discovery, loopback and process ownership verification, replica-set startup, fresh-process HTTP reload and teardown. Routine runs discover the local executable without environment configuration. MongoDB setup failures fail the test. Each MongoDB run creates one temporary replica set and shuts down that instance before returning.

The prior interrupted session overlapped backend runs with the rest matrix, build and other suites. Its backend log windows were 18m 47s to 26m 15s, with HTTP timeouts moving between files. The earlier backend baseline logged 10m 05s. A five-file benchmark passed at the original HTTP threshold with both one worker (24.9s) and two (17.2s). The completed standard run showed about 0.1s of runner overhead per file. Most of the remaining backend time is spent exercising persistence and command behavior. The test fixture builders reuse solved level choices and preserve fresh replay state, models and inventory IDs.
## Troubleshooting timings and failures

The runner prints the log directory under `%TEMP%`, each test file's elapsed time, the overhead relative to Node's TAP duration, HTTP and MongoDB fixture timings, and total passing, failing, skipped and timed-out tests. Inspect the named log for the full TAP output and failed test names. A large gap between elapsed and TAP duration points to process startup or exit overhead. Large TAP durations with short listener times point to work inside the tests.

The HTTP test threshold is 12 seconds per test. MongoDB owns a separate 120-second test deadline, including its process restart, and a 150-second outer watchdog. The deterministic files have a 120-second per-test threshold and a 180-second file watchdog. Full verification uses per-stage watchdogs, with up to seven minutes for each historical probe. A watchdog failure prints the stage and its log path. On Windows the runner tries to stop the test process tree, then stops the direct child if the host denies tree cleanup. If tree cleanup is denied during a forced MongoDB timeout, inspect the fixture log and check for a leftover fixture process before removing its temporary directory. The normal cleanup hook waits for MongoDB to exit and removes its data directory.

Use the focused commands to diagnose a slow or failing file. Let the current run finish before starting another suite, build or historical probe when comparing performance. To reproduce the full regression, run `npm run test:full`. It compares all 22 retained hashes against the [verification baseline](../tests/fixtures/verification-digests.json). The standard HTTP test covers the canonical ETag and HTTP 304, while the retained roster probe covers all eight Callings and 32 Paths through level 20. The independent rest runner validates its committed 3,707-observation baseline. [Rest regression notes](../tests/support/rest-regression.md) document the original historical matrix and the reproducible replacement.


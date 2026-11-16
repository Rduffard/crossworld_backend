# Phase 3 test-suite cleanup

The [inventory](test-inventory.md) covers 75 backend, 16 engine and 11 frontend test files before cleanup, along with their fixtures and support files. The [testing guide](testing.md) describes where to add coverage and how to run each tier.

## Changes

- Removed nine duplicate frontend cases across `tests/pointBuy.test.mjs` and `tests/checkModifier.test.mjs`. Their backend counterparts still check fresh defaults, the exact budget, overspending, malformed allocations, varied modifier scores, invalid identifiers and scores, and frozen inputs.
- Retained frontend checks that the adapters expose the engine functions. The point-buy adapter test now names all four required exports explicitly. The adapters still exercise all legal point-buy scores across all attributes and modifier scores from 1 through 30.
- Reformatted 25 backend test files, the shared character builder, the frontend sheet scenarios and the manual browser harness. The parsed JavaScript of all 28 reformatted files matched before and after. The focused backend run passed the same 249 cases before and after.
- Kept the domain-specific test layout and fixture behavior. The character builder already reuses solved advancement inputs while creating fresh runtime and inventory state. The audit found no verified obsolete fixture or runner to remove. It retained the legacy manual browser harness for its documented Phase 2 workflow.
- Preserved the retained digest inputs and the independent rest regression. Production code, package manifests and the test runner were outside the change.

## Verification

| Run | Before | After |
| --- | --- | --- |
| Focused backend | 249 passed in 41.18s | 249 passed in 40.69s |
| Fast | 73 passed in 12.4s | 73 passed in 8.32s |
| Standard | 642 passed in 3m 22s to 3m 48s | 642 passed in 2m 21.38s |

# Sanguine Archipelago rest regression baseline

From the backend checkout containing the Phase 3 implementation and its vendored
engine 0.68.0, install dependencies with `npm ci` and run:

```text
node tests/support/rest-regression.mjs
```

The runner uses Node 22, the existing `tests/helpers/phase2.mjs` ledger builder,
the installed engine, and the backend's character command handlers. It requires
no database, network, or wall-clock input. The current expected count and SHA-256
are in [rest-regression.expected.json](rest-regression.expected.json). A normal
run checks both values and every gameplay assertion. `--print-baseline` prints
the result of those same gameplay assertions without comparing the committed
count and digest, for reviewing an intentional contract change.

The generated cases use all eight Callings at levels 1, 3, 5, 10 and 20, the
ledger builder's default Path, and four initial resource profiles. The 23
timelines cover Short and Long Rest completions around the minimum duration,
the first completed hour around a millisecond boundary, canceling and resuming
interrupted rests, and the effect of successive interruptions on the next
segment. Focused scenarios cover feature and replacement behavior that depends
on a specific Calling or Path. All clocks, rest and operation IDs, and
GM-recorded healing rolls are fixed.

Expected results follow the documented Sanguine Calling features and persistent
command contracts. The runner calculates expected Health, Hit Dice, exhaustion,
pool balances and effect expiry from fixture inputs and the published character
maxima and recovery policies. Explicit cases independently check Second Wind,
Arcane Recovery, Sorcerous Restoration, Divine Intervention after Wish, Gray
Net replacement, and Hit Dice reconciliation. It compares engine timing and
pool decisions with those expectations and the backend's applied state. The
clock tests include the exact expiration instant for timed effects and temporary
Health. Long Rest clears concentration and created slots, preserves live
non-concentration effects, and restores ordinary slots and Hit Dice.

Rejected commands must leave the source character unchanged. The focused cases
also exercise minimum spacing between Long Rests, invalid options, rest and
operation identity, duplicate completion, and stale revisions. The receipt test
uses the real command handler with a transactional store fixture that injects a
failure after staging the character update and receipt. It asserts rollback of
both records, then retries and replays the original response after revision
advancement. The command handler retains its existing distinction between
malformed recovery choices (400), rest state/timing rejections (422), and receipt
or revision conflicts (409).

The active SA-CHAR-1 rules have no dedicated Stamina or Focus balance to recover.
The fixture exercises the supported feature pools, including Second Wind and
Sorcery Points. Spellcasting foci are components or equipment.

Each observation is one generated timeline or focused scenario with its inputs
and asserted expected outcomes. To compute the digest, the runner serializes
the records in source iteration order as compact JSON with recursively sorted
object keys and unchanged array order. Every record, including the last, is
followed by one LF byte. The hash covers the resulting UTF-8 stream. Generated
inventory UUIDs and host receipt timestamps are excluded from that stream.

The previous 2,640-observation digest
`7bc3d24375fde80a0dc7e18ac11c54285567f9a772cb9e490a27d1f35a3fa24b`
is **HISTORICAL — EXACT RERUN UNAVAILABLE**. The archived digest represents
separate evidence. The replacement has its own fixtures and expected outcomes.

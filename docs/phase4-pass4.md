# Phase 4, Pass 4 · Active Lineage commands

Ledger v4 active abilities use the existing character command envelope, transaction, and receipt lookup. The backend vendors Engine 0.69.2 for the existing rest-timing function's optional Long Rest duration. Ordinary Long Rests retain the eight-hour default.

| Command | Payload |
| --- | --- |
| `ability.activate` | `{optionId, parameters, turnId?}`. Supply the matching owner turn ID when a turn is tracked. |
| `lineage:beastshifters:transform` | `{formId, legalPlacement: true}`. The host confirms legal space and terrain. |
| `lineage:beastshifters:revert` | `{confirmed: true}`. |
| `lineage:beastshifters:primal-recovery` | `{hitDie, formId?}`. Name the depleted known form when humanoid. |
| `lineage:changelings:shapechange` | `{operation: "transform", size, description, voice?, appearanceEligible: true}` or `{operation: "revert"}`. |
| `lineage:stoneborn:stone-listening` | Empty parameters. |
| `lineage.force-revert` | `{confirmed: true}`. The campaign GM or solo host confirms an authoritative termination. |
| `attack.record` | Use the existing recorded outcome fields with `naturalAttackId` and `distance` in feet. |
| `spell.cast` | `{spellId, source, mode, ...}` for unlocked Lineage grants. Set `mode` to `cantrip`, `free`, or `slot`. Include `slotLevel` for slot casting. |
| `rest.start` | `mode: "waking-reverie"` is a Fey-Touched Long Rest. Glasslight can schedule `options.lineageCantrip: {source, spellId}` on a Long Rest. |
| `rest.complete` | A Human who already holds Inspiration can send `inspirationRecipientId` for a registered party member with no Inspiration. |

Beastshifter form Health persists through reversion and reload. Damage applies mitigation and Temporary Health once, then uses the engine to damage the form and carry excess into humanoid Health. Compatible healing targets the current body. Rest recovery preserves animal Health. Primal Recovery uses a server roll and persists its result with the spend. An active form overlays physical scores, Guard, size, movement, and senses. Merged gear stays on the saved character and its attack and magic benefits are suppressed. Natural rolls use the existing attack journal and store their rolls in the command receipt. Concentration saves use effective Resolve.

Changeling appearance is a bounded runtime delta. The owned character view retains true identity. Current encounter routes serve owner-only practice snapshots. A shared encounter projection and its identity redaction require a shared encounter data model. Stone Listening returns timed sensing terms. Contact, moving targets and shared stone surface require host adjudication, as do placement and terrain after forced reversion. The runtime relies on the host for shared geometry and collision state.

Tracked turn costs reuse the owner turn record. Other systems still have individual action journals, including item and spell casts. A shared action budget across those systems remains open. Frontend controls are scheduled for Pass 5.

## Verification

The fast tier passed all 73 tests. The standard tier passed every file outside the MongoDB fixture. The new Inspiration fixture initially affected the campaign list expected by a later scenario. After isolating its identities and moving it ahead of the restart snapshot, all three isolated MongoDB tests passed. The focused Lineage and Doctor treatment files passed 27 tests together. The 27 focused engine tests passed. The backend and engine dependency graphs have zero cycles. The backend Engine 0.69.2 archive matches its lockfile integrity.

# Character stabilization reference

## Ownership and life cycle

| Operation | Contract |
| --- | --- |
| Start a character above level 1 | Creation accepts consecutive advancement events in `additionalLevels`. The backend replays them with first-level choices before issuing inventory or saving the character. The level cap is 20. |
| Reverse advancement | An owner can preview and apply a lower personal level. The retained ledger prefix determines progression. Runtime reconciliation caps Health and preserves applicable expenditure. The proposal fingerprint protects against applying a stale preview. |
| Duplicate a build | The new personal record preserves identity and ledger choices. It receives fresh resources and a newly issued starting package. |
| Admit a campaign character | Admission captures source identity and revision in a new document. A campaign can require a starting level and GM review. The applicant can explicitly adopt a lower campaign starting level. Each campaign owns its own copy and resources. |
| Decide admission | The campaign GM approves or rejects an exact pending copy with a recorded reason. The state transition checks the saved revision. A rejected applicant can submit again. |
| Target another character | Commands that change a native target look up the target within the actor's campaign or among the same owner's personal characters. Pending and rejected copies are ineligible. |

Saved rules identifiers, ledger versions 3 and 4, and historical receipts remain readable. The catalog hash changes when names and Path descriptions change. Newly created package users receive a default weapon grip, and Doctors start with a free hand for somatic spells.

## Rules and open decisions

- Sanguine assigns one point through Origin and two through Background. Three eligible Background attributes define the set from which players allocate +2 or +1/+1. The base point-buy allocation is recorded independently.
- The sheet projects occupied space and carrying capacity from effective creature size, including active animal forms. Reef Colossus applies a separate carrying and grappling size. Small and Medium share a 5-foot space and the same carrying limits while remaining distinct ranks for size eligibility. Grid positioning and complete encounter adjudication remain encounter work.
- The catalog maps each Origin to its existing regional language ID and describes the grant as regional speech. These labels allow references to the region while preserving saved ledger IDs. Distinctions between languages and dialects remain a setting decision.
- The four SRD Origin feats already have catalog entries. Any additional Sanguine Origin feats need authored benefits and complete implementation, including repeatability and nested choices.
- Campaign admission and rebuild proposals support GM decisions with recorded reasons. Item transfers check source and recipient revisions and save both inventories and the receipt in one transaction. Complete transfers preserve item IDs. An eligible partial stack receives a new ID. Fully transferred equipment arrives carried and unattuned after explicit confirmation when required.
- The personal rebuild editor supports Lineage replacement and lets version 3 characters adopt a Lineage. When earlier decisions change, a preview replays retained decisions and reopens choices that are no longer valid. Campaign rebuilds preserve the campaign's Lineage.

## Verification and migration

The backend regression cases for starting progression, rebuilds, Background bonuses, campaign membership, and authenticated character routes are suitable reference cases for a C# port. The exhaustive replay probes remain the mechanics reference. The isolated MongoDB suite checks persistence through a process restart. Keep client presentation and account or GM authority outside the portable rules implementation.

SRD source: https://www.dndbeyond.com/srd

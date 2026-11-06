# Progression, abilities, equipment and development playtests

## Delivered boundary

This is an integrated supported-subset implementation, not a complete executable conversion of six SRD classes. All six Callings have deterministic twenty-level tables, server-replayed choices, automatic historical signatures, starting packages, creation controls, sheet progression and development playtest snapshots. Reference-only source features are NOT playtested mechanics. Spell preparation, mastery selection, Metamagic selection, language selection, most source-feature effects and other feats remain unimplemented. A build marked complete has completed the supported required decisions; it is not a fully specified SRD spellcaster or mastery build. API responses carry buildStatus: supported-subset and unresolvedSystems.

## Sources and mappings

Official source: https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.pdf. See abilities/NOTICE.md for CC BY 4.0 attribution. Table pacing: Corsair = Rogue (Fighter influence), Gunslinger = Fighter (Ranger), Navigator = Ranger (Bard), Tidecaller = Sorcerer (Warlock), Warden = Paladin (Fighter), Reaver = Barbarian (Fighter). Secondary classes are not stacked into a second progression. Source table subclass rows are marked replaced-by-universal-path-model; they do not issue extra Path opportunities.

Designer decision: use primary-class attribute/feat schedules. Universal Path opportunities remain at 3/6/11/16. Existing version-one exchange history is replayed, never automatically migrated. Attribute Improvement is the only available feat alternative; Epic Boons and other feats are not implemented. New exchanges remain limited to two; exchanged Calling/Path opportunities may remain unspent because reviewed content is unavailable.

## Canonical ownership

The registry has 142 reachable canonical definitions, including the twelve historical signatures/actives. Historical passives retain IDs such as corsair:passive and are automatic at level one. Historical actives retain their former synthesized IDs as explicit constants, have no assigned acquisition level, and are not granted. Historical text comes from the existing Calling source, avoiding duplicate editable descriptions. New SRD-inspired source features have source provenance, minimum level, acquisition, timing, implementation status and missing dependencies. Most source features are reference-only summaries awaiting mechanical conversion; source names are traceability labels, not claims of identical Archipelago behavior.

Character ability decisions live only in advancement.spends. Definitions are not copied into persistent characters. The old arbitrary abilities array, custom authoring controls/state/parsers, starter synthesis and name-based ability PATCH matching are removed. Ordinary character notes, traits, Wounds, resources, Training and inventory remain. Definitions are copied only into independent encounter snapshots.

One advancement entry point dispatches by ledger version. Version two uses Calling tables; version one replays the existing archival rules. No second owned-ability field exists. Experimental version-one characters must be recreated to use development build replay; no automatic upgrade or migration occurs.

## Executable subset

- Expertise: selection from already trained General Skills; doubled Training Bonus exactly once on skill checks. Saves and weapon attacks do not gain Expertise. Corsair chooses two at 1 and two more at 6; Navigator chooses one through Deft Explorer at 2 and two more at 9.
- Defense Fighting Style: +1 Guard while armored. Armor Training consequences still apply.
- Great Weapon Fighting: damage dice showing 1 or 2 become 3 for a qualifying weapon held in two hands. Raw and adjusted dice are logged separately.
- Extra Attack: Gunslinger has 2 attacks at 5, 3 at 11, 4 at 20; Navigator, Warden and Reaver have 2 at 5. These spend one Action; unused attack allowance expires when ending the turn. Repeated commands remain idempotent.
- Attributes: +2 to one or +1 to two, capped at 20, on each primary-class opportunity. Existing custom Health/Stamina/Focus maxima are recalculated without healing persistent characters.

These handlers do not execute Sea Legs, Rushing Cut, Deadeye, Marked Shot, Read the Tides, Shift the Flow, Surge, Tidal Burst, Hold the Line, Intercept, Bloodrush or Savage Strike. Spellcasting, Second Wind, Sneak Attack, Rage, auras, reactions, recovery and other source features are explicitly reference-only. Resource counters, scaling and descriptions for those systems still need conversion, not merely UI work.

## Acquisition and creation

New order: Roots, Calling, Attributes, Training, Abilities, Loadout, Details, Review. Abilities shows automatic level-one grants, supported required choices, all twenty levels, and collapsible discovery of all universal Paths. No mandatory level-one Path choice exists. Calling changes clear package and ability choices.

POST /archipelago/characters adds abilitySelections keyed by stable choice-group ID and startingEquipment: {packageId,version,choices,equipped?}. The equipped object uses symbolic grant references plus grip; creation resolves those to server UUIDs. No arbitrary item instances, effects, costs or Training flags are accepted. Character creation persists once. Editing forbids creation selections and cannot reissue packages. Editing Training cannot invalidate an acquired Expertise choice.

POST /archipelago/system/draft-preview accepts calling, origin, base attributes, training, abilitySelections and startingEquipment. It validates the same resolvers and returns progression/equipment previews without database writes. Preview inventory references are explicit preview:grant tokens, not persistent IDs. Stale frontend responses are discarded. Reset-to-default loadout is available after an invalid combination.

## Starting packages

### corsair

Guaranteed: cutlass, leather-armor. Choices: secondary = shield (shield) or dagger (dagger). Defaults: {"mainHand":"primary","offHand":"secondary:shield","armor":"armor","grip":"one"}.

### gunslinger

Guaranteed: dagger, leather-armor. Choices: firearm = pistol (pistol) or musket (musket). Defaults: {"mainHand":"primary","offHand":null,"armor":"armor","grip":"one"}.

### navigator

Guaranteed: dagger, leather-armor. Choices: weapon = spear (spear) or quarterstaff (quarterstaff). Defaults: {"mainHand":"primary","offHand":null,"armor":"armor","grip":"one"}.

### tidecaller

Guaranteed: dagger. Choices: weapon = quarterstaff (quarterstaff) or dagger (dagger). Defaults: {"mainHand":"primary","offHand":null,"armor":null,"grip":"one"}.

### warden

Guaranteed: dagger. Choices: weapon = longsword-shield (longsword + shield) or warhammer-shield (warhammer + shield) or greatsword (greatsword); armor = chain-mail (chain-mail) or chain-shirt (chain-shirt). Defaults: {"mainHand":"primary","offHand":"shield:if-present","armor":"armor","grip":"one"}.

### reaver

Guaranteed: dagger, leather-armor. Choices: weapon = handaxe (handaxe) or spear (spear) or greatclub (greatclub). Defaults: {"mainHand":"primary","offHand":null,"armor":"armor","grip":"one"}.

Symbolic secondary:shield / shield:if-present default tokens are resolved before slot validation. Players can rearrange owned grants. Two-hand conflicts, inventory references, armor slots and shield Training use the existing equipment validators. Gunslinger receives explicit pistol and musket Training, not Martial category Training. Firearms remain non-executable; no ammunition or ranged mechanics were fabricated. Acquisition after creation still uses the existing equipmentOperation, now exposed primarily on the sheet.

## Development playtests

GET /archipelago/system/capabilities reports whether development playtesting is enabled. The server requires both NODE_ENV != production and ARCHIPELAGO_PLAYTEST_ENABLED=true; authentication and source-character ownership remain required. No environment file was changed by this task.

POST /archipelago/characters/:id/playtest-preview and /playtest-encounter accept {level,levelOneSelections?,decisions:[{level,spends,exchanges?}]}. They load the owned source character and replay each level through the real version-two advancement entry point. They never accept client-authored statistics. Initial choices default to the source character's valid level-one choices; later required decisions must be completed explicitly. Current resources are preserved/clamped against derived temporary maxima, not healed automatically.

Preview writes nothing. Encounter creation revalidates the plan and requires all supported required decisions complete. It saves a new encounter-local snapshot without writing the character, source ledger, inventory, resources or prior encounters. Unsupported Path opportunities may remain unspent. UI plan state is temporary in-memory application state; no canonical playtest character or sessionStorage persistence is created.

A normal character may record a higher level with pending supported choices, but cannot enter a new encounter until those decisions are complete. Reference-only systems remain disclosed separately.

## Paths

All six remain universal; no Calling gate was added. Multiple-Path representation and sequential tier gates remain. Historical three-node descriptions are visible in the reused preview component. No fourth-tier effects were invented. Since reviewed tier content is absent, Path investments are not spendable and remain optional/unspent.

## Twenty-level tables

Rows list newly automatic grants (owned from that level onward), conditional selected grants and source-only updates. Automatic reference-only grants are acquired information, not executable effects. Selected abilities are owned only after a valid decision. Training Bonus and attack allowance are mechanically resolved; source resource/scaling updates remain reference-only unless listed in Executable subset.

### corsair (Rogue)

| Level | Training Bonus | Automatic grants: status                                                                                                                           | Supported decisions                         | Path     | Attacks/Action | Source updates                                               |
| ----- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------- | -------------- | ------------------------------------------------------------ |
| 1     | +2             | Sea Legs [reference-only]; Expertise [implemented]; Sneak Attack [reference-only]; Thieves’ Cant [reference-only]; Weapon Mastery [reference-only] | choice:corsair:expertise:1 choose 2         | —        | 1              | —                                                            |
| 2     | +2             | Cunning Action [reference-only]                                                                                                                    | —                                           | —        | 1              | —                                                            |
| 3     | +2             | Steady Aim [reference-only]                                                                                                                        | —                                           | Optional | 1              | Primary-class subclass row: replaced-by-universal-path-model |
| 4     | +2             | —                                                                                                                                                  | Attribute Improvement / other feats pending | —        | 1              | —                                                            |
| 5     | +3             | Cunning Strike [reference-only]; Uncanny Dodge [reference-only]                                                                                    | —                                           | —        | 1              | —                                                            |
| 6     | +3             | —                                                                                                                                                  | choice:corsair:expertise:6 choose 2         | Optional | 1              | Expertise: source-scaling-update                             |
| 7     | +3             | Evasion [reference-only]; Reliable Talent [reference-only]                                                                                         | —                                           | —        | 1              | —                                                            |
| 8     | +3             | —                                                                                                                                                  | Attribute Improvement / other feats pending | —        | 1              | —                                                            |
| 9     | +4             | —                                                                                                                                                  | —                                           | —        | 1              | Primary-class subclass row: replaced-by-universal-path-model |
| 10    | +4             | —                                                                                                                                                  | Attribute Improvement / other feats pending | —        | 1              | —                                                            |
| 11    | +4             | Improved Cunning Strike [reference-only]                                                                                                           | —                                           | Optional | 1              | —                                                            |
| 12    | +4             | —                                                                                                                                                  | Attribute Improvement / other feats pending | —        | 1              | —                                                            |
| 13    | +5             | —                                                                                                                                                  | —                                           | —        | 1              | Primary-class subclass row: replaced-by-universal-path-model |
| 14    | +5             | Devious Strikes [reference-only]                                                                                                                   | —                                           | —        | 1              | —                                                            |
| 15    | +5             | Slippery Mind [reference-only]                                                                                                                     | —                                           | —        | 1              | —                                                            |
| 16    | +5             | —                                                                                                                                                  | Attribute Improvement / other feats pending | Optional | 1              | —                                                            |
| 17    | +6             | —                                                                                                                                                  | —                                           | —        | 1              | Primary-class subclass row: replaced-by-universal-path-model |
| 18    | +6             | Elusive [reference-only]                                                                                                                           | —                                           | —        | 1              | —                                                            |
| 19    | +6             | —                                                                                                                                                  | Attribute Improvement / other feats pending | —        | 1              | —                                                            |
| 20    | +6             | Stroke of Luck [reference-only]                                                                                                                    | —                                           | —        | 1              | —                                                            |

### gunslinger (Fighter)

| Level | Training Bonus | Automatic grants: status                                                                                                 | Supported decisions                         | Path     | Attacks/Action | Source updates                                                          |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | -------- | -------------- | ----------------------------------------------------------------------- |
| 1     | +2             | Deadeye [reference-only]; Fighting Style [reference-only]; Second Wind [reference-only]; Weapon Mastery [reference-only] | choice:gunslinger:style:1 choose 1          | —        | 1              | —                                                                       |
| 2     | +2             | Action Surge [reference-only]; Tactical Mind [reference-only]                                                            | —                                           | —        | 1              | —                                                                       |
| 3     | +2             | —                                                                                                                        | —                                           | Optional | 1              | Primary-class subclass row: replaced-by-universal-path-model            |
| 4     | +2             | —                                                                                                                        | Attribute Improvement / other feats pending | —        | 1              | —                                                                       |
| 5     | +3             | Extra Attack [implemented]; Tactical Shift [reference-only]                                                              | —                                           | —        | 2              | —                                                                       |
| 6     | +3             | —                                                                                                                        | Attribute Improvement / other feats pending | Optional | 2              | —                                                                       |
| 7     | +3             | —                                                                                                                        | —                                           | —        | 2              | Primary-class subclass row: replaced-by-universal-path-model            |
| 8     | +3             | —                                                                                                                        | Attribute Improvement / other feats pending | —        | 2              | —                                                                       |
| 9     | +4             | Indomitable [reference-only]; Tactical Master [reference-only]                                                           | —                                           | —        | 2              | —                                                                       |
| 10    | +4             | —                                                                                                                        | —                                           | —        | 2              | Primary-class subclass row: replaced-by-universal-path-model            |
| 11    | +4             | Two Extra Attacks [implemented]                                                                                          | —                                           | Optional | 3              | —                                                                       |
| 12    | +4             | —                                                                                                                        | Attribute Improvement / other feats pending | —        | 3              | —                                                                       |
| 13    | +5             | Studied Attacks [reference-only]                                                                                         | —                                           | —        | 3              | Indomitable: source-scaling-update                                      |
| 14    | +5             | —                                                                                                                        | Attribute Improvement / other feats pending | —        | 3              | —                                                                       |
| 15    | +5             | —                                                                                                                        | —                                           | —        | 3              | Primary-class subclass row: replaced-by-universal-path-model            |
| 16    | +5             | —                                                                                                                        | Attribute Improvement / other feats pending | Optional | 3              | —                                                                       |
| 17    | +6             | —                                                                                                                        | —                                           | —        | 3              | Action Surge: source-scaling-update; Indomitable: source-scaling-update |
| 18    | +6             | —                                                                                                                        | —                                           | —        | 3              | Primary-class subclass row: replaced-by-universal-path-model            |
| 19    | +6             | —                                                                                                                        | Attribute Improvement / other feats pending | —        | 3              | —                                                                       |
| 20    | +6             | Three Extra Attacks [implemented]                                                                                        | —                                           | —        | 4              | —                                                                       |

### navigator (Ranger)

| Level | Training Bonus | Automatic grants: status                                                                                                        | Supported decisions                                                      | Path     | Attacks/Action | Source updates                                               |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------- | -------------- | ------------------------------------------------------------ |
| 1     | +2             | Read the Tides [reference-only]; Spellcasting [reference-only]; Favored Enemy [reference-only]; Weapon Mastery [reference-only] | —                                                                        | —        | 1              | —                                                            |
| 2     | +2             | Deft Explorer [reference-only]; Fighting Style [reference-only]                                                                 | choice:navigator:expertise:2 choose 1; choice:navigator:style:2 choose 1 | —        | 1              | —                                                            |
| 3     | +2             | —                                                                                                                               | —                                                                        | Optional | 1              | Primary-class subclass row: replaced-by-universal-path-model |
| 4     | +2             | —                                                                                                                               | Attribute Improvement / other feats pending                              | —        | 1              | —                                                            |
| 5     | +3             | Extra Attack [implemented]                                                                                                      | —                                                                        | —        | 2              | —                                                            |
| 6     | +3             | Roving [reference-only]                                                                                                         | —                                                                        | Optional | 2              | —                                                            |
| 7     | +3             | —                                                                                                                               | —                                                                        | —        | 2              | Primary-class subclass row: replaced-by-universal-path-model |
| 8     | +3             | —                                                                                                                               | Attribute Improvement / other feats pending                              | —        | 2              | —                                                            |
| 9     | +4             | Expertise [implemented]                                                                                                         | choice:navigator:expertise:9 choose 2                                    | —        | 2              | —                                                            |
| 10    | +4             | Tireless [reference-only]                                                                                                       | —                                                                        | —        | 2              | —                                                            |
| 11    | +4             | —                                                                                                                               | —                                                                        | Optional | 2              | Primary-class subclass row: replaced-by-universal-path-model |
| 12    | +4             | —                                                                                                                               | Attribute Improvement / other feats pending                              | —        | 2              | —                                                            |
| 13    | +5             | Relentless Hunter [reference-only]                                                                                              | —                                                                        | —        | 2              | —                                                            |
| 14    | +5             | Nature’s Veil [reference-only]                                                                                                  | —                                                                        | —        | 2              | —                                                            |
| 15    | +5             | —                                                                                                                               | —                                                                        | —        | 2              | Primary-class subclass row: replaced-by-universal-path-model |
| 16    | +5             | —                                                                                                                               | Attribute Improvement / other feats pending                              | Optional | 2              | —                                                            |
| 17    | +6             | Precise Hunter [reference-only]                                                                                                 | —                                                                        | —        | 2              | —                                                            |
| 18    | +6             | Feral Senses [reference-only]                                                                                                   | —                                                                        | —        | 2              | —                                                            |
| 19    | +6             | —                                                                                                                               | Attribute Improvement / other feats pending                              | —        | 2              | —                                                            |
| 20    | +6             | Foe Slayer [reference-only]                                                                                                     | —                                                                        | —        | 2              | —                                                            |

### tidecaller (Sorcerer)

| Level | Training Bonus | Automatic grants: status                                                               | Supported decisions                         | Path     | Attacks/Action | Source updates                                               |
| ----- | -------------- | -------------------------------------------------------------------------------------- | ------------------------------------------- | -------- | -------------- | ------------------------------------------------------------ |
| 1     | +2             | Surge [reference-only]; Spellcasting [reference-only]; Innate Sorcery [reference-only] | —                                           | —        | 1              | —                                                            |
| 2     | +2             | Font of Magic [reference-only]; Metamagic [reference-only]                             | —                                           | —        | 1              | —                                                            |
| 3     | +2             | —                                                                                      | —                                           | Optional | 1              | Primary-class subclass row: replaced-by-universal-path-model |
| 4     | +2             | —                                                                                      | Attribute Improvement / other feats pending | —        | 1              | —                                                            |
| 5     | +3             | Sorcerous Restoration [reference-only]                                                 | —                                           | —        | 1              | —                                                            |
| 6     | +3             | —                                                                                      | —                                           | Optional | 1              | Primary-class subclass row: replaced-by-universal-path-model |
| 7     | +3             | Sorcery Incarnate [reference-only]                                                     | —                                           | —        | 1              | —                                                            |
| 8     | +3             | —                                                                                      | Attribute Improvement / other feats pending | —        | 1              | —                                                            |
| 9     | +4             | —                                                                                      | —                                           | —        | 1              | —                                                            |
| 10    | +4             | —                                                                                      | —                                           | —        | 1              | Metamagic: source-scaling-update                             |
| 11    | +4             | —                                                                                      | —                                           | Optional | 1              | —                                                            |
| 12    | +4             | —                                                                                      | Attribute Improvement / other feats pending | —        | 1              | —                                                            |
| 13    | +5             | —                                                                                      | —                                           | —        | 1              | —                                                            |
| 14    | +5             | —                                                                                      | —                                           | —        | 1              | Primary-class subclass row: replaced-by-universal-path-model |
| 15    | +5             | —                                                                                      | —                                           | —        | 1              | —                                                            |
| 16    | +5             | —                                                                                      | Attribute Improvement / other feats pending | Optional | 1              | —                                                            |
| 17    | +6             | —                                                                                      | —                                           | —        | 1              | Metamagic: source-scaling-update                             |
| 18    | +6             | —                                                                                      | —                                           | —        | 1              | Primary-class subclass row: replaced-by-universal-path-model |
| 19    | +6             | —                                                                                      | Attribute Improvement / other feats pending | —        | 1              | —                                                            |
| 20    | +6             | Arcane Apotheosis [reference-only]                                                     | —                                           | —        | 1              | —                                                            |

### warden (Paladin)

| Level | Training Bonus | Automatic grants: status                                                                                                      | Supported decisions                         | Path     | Attacks/Action | Source updates                                               |
| ----- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------- | -------------- | ------------------------------------------------------------ |
| 1     | +2             | Hold the Line [reference-only]; Lay On Hands [reference-only]; Spellcasting [reference-only]; Weapon Mastery [reference-only] | —                                           | —        | 1              | —                                                            |
| 2     | +2             | Fighting Style [reference-only]; Paladin’s Smite [reference-only]                                                             | choice:warden:style:2 choose 1              | —        | 1              | —                                                            |
| 3     | +2             | Channel Divinity [reference-only]                                                                                             | —                                           | Optional | 1              | Primary-class subclass row: replaced-by-universal-path-model |
| 4     | +2             | —                                                                                                                             | Attribute Improvement / other feats pending | —        | 1              | —                                                            |
| 5     | +3             | Extra Attack [implemented]; Faithful Steed [reference-only]                                                                   | —                                           | —        | 2              | —                                                            |
| 6     | +3             | Aura of Protection [reference-only]                                                                                           | —                                           | Optional | 2              | —                                                            |
| 7     | +3             | —                                                                                                                             | —                                           | —        | 2              | Primary-class subclass row: replaced-by-universal-path-model |
| 8     | +3             | —                                                                                                                             | Attribute Improvement / other feats pending | —        | 2              | —                                                            |
| 9     | +4             | Abjure Foes [reference-only]                                                                                                  | —                                           | —        | 2              | —                                                            |
| 10    | +4             | Aura of Courage [reference-only]                                                                                              | —                                           | —        | 2              | —                                                            |
| 11    | +4             | Radiant Strikes [reference-only]                                                                                              | —                                           | Optional | 2              | —                                                            |
| 12    | +4             | —                                                                                                                             | Attribute Improvement / other feats pending | —        | 2              | —                                                            |
| 13    | +5             | —                                                                                                                             | —                                           | —        | 2              | —                                                            |
| 14    | +5             | Restoring Touch [reference-only]                                                                                              | —                                           | —        | 2              | —                                                            |
| 15    | +5             | —                                                                                                                             | —                                           | —        | 2              | Primary-class subclass row: replaced-by-universal-path-model |
| 16    | +5             | —                                                                                                                             | Attribute Improvement / other feats pending | Optional | 2              | —                                                            |
| 17    | +6             | —                                                                                                                             | —                                           | —        | 2              | —                                                            |
| 18    | +6             | Aura Expansion [reference-only]                                                                                               | —                                           | —        | 2              | —                                                            |
| 19    | +6             | —                                                                                                                             | Attribute Improvement / other feats pending | —        | 2              | —                                                            |
| 20    | +6             | —                                                                                                                             | —                                           | —        | 2              | Primary-class subclass row: replaced-by-universal-path-model |

### reaver (Barbarian)

| Level | Training Bonus | Automatic grants: status                                                                                               | Supported decisions                         | Path     | Attacks/Action | Source updates                                               |
| ----- | -------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------- | -------------- | ------------------------------------------------------------ |
| 1     | +2             | Bloodrush [reference-only]; Rage [reference-only]; Unarmored Defense [reference-only]; Weapon Mastery [reference-only] | —                                           | —        | 1              | —                                                            |
| 2     | +2             | Danger Sense [reference-only]; Reckless Attack [reference-only]                                                        | —                                           | —        | 1              | —                                                            |
| 3     | +2             | Primal Knowledge [reference-only]                                                                                      | —                                           | Optional | 1              | Primary-class subclass row: replaced-by-universal-path-model |
| 4     | +2             | —                                                                                                                      | Attribute Improvement / other feats pending | —        | 1              | —                                                            |
| 5     | +3             | Extra Attack [implemented]; Fast Movement [reference-only]                                                             | —                                           | —        | 2              | —                                                            |
| 6     | +3             | —                                                                                                                      | —                                           | Optional | 2              | Primary-class subclass row: replaced-by-universal-path-model |
| 7     | +3             | Feral Instinct [reference-only]; Instinctive Pounce [reference-only]                                                   | —                                           | —        | 2              | —                                                            |
| 8     | +3             | —                                                                                                                      | Attribute Improvement / other feats pending | —        | 2              | —                                                            |
| 9     | +4             | Brutal Strike [reference-only]                                                                                         | —                                           | —        | 2              | —                                                            |
| 10    | +4             | —                                                                                                                      | —                                           | —        | 2              | Primary-class subclass row: replaced-by-universal-path-model |
| 11    | +4             | Relentless Rage [reference-only]                                                                                       | —                                           | Optional | 2              | —                                                            |
| 12    | +4             | —                                                                                                                      | Attribute Improvement / other feats pending | —        | 2              | —                                                            |
| 13    | +5             | Improved Brutal Strike [reference-only]                                                                                | —                                           | —        | 2              | —                                                            |
| 14    | +5             | —                                                                                                                      | —                                           | —        | 2              | Primary-class subclass row: replaced-by-universal-path-model |
| 15    | +5             | Persistent Rage [reference-only]                                                                                       | —                                           | —        | 2              | —                                                            |
| 16    | +5             | —                                                                                                                      | Attribute Improvement / other feats pending | Optional | 2              | —                                                            |
| 17    | +6             | —                                                                                                                      | —                                           | —        | 2              | Improved Brutal Strike: source-scaling-update                |
| 18    | +6             | Indomitable Might [reference-only]                                                                                     | —                                           | —        | 2              | —                                                            |
| 19    | +6             | —                                                                                                                      | Attribute Improvement / other feats pending | —        | 2              | —                                                            |
| 20    | +6             | Primal Champion [reference-only]                                                                                       | —                                           | —        | 2              | —                                                            |

## Feature-level status and missing dependencies

Every listed definition is defined. Automatic definitions are acquired at/above their grant level; selected definitions require an eligible ledger spend; historical actives with acquisition=unassigned are never acquired. Mechanically implemented and executable-in-combat are separate below. Expertise executes in checks, not as a combat action. Defense/GWF/Extra Attack execute as passive combat modifiers.

| ID                                     | Source                            | Minimum    | Acquisition | Implemented    | Combat mechanic | Missing dependencies                                                                              |
| -------------------------------------- | --------------------------------- | ---------- | ----------- | -------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| corsair:passive                        | corsair: Sea Legs                 | 1          | automatic   | reference-only | No              | 2024 conversion of historical combat text                                                         |
| ability-corsair-rushing-cut            | corsair: Rushing Cut              | Unassigned | unassigned  | reference-only | No              | Reviewed acquisition level; Movement, timing, conditions or resources appropriate to this feature |
| gunslinger:passive                     | gunslinger: Deadeye               | 1          | automatic   | reference-only | No              | 2024 conversion of historical combat text                                                         |
| ability-gunslinger-marked-shot         | gunslinger: Marked Shot           | Unassigned | unassigned  | reference-only | No              | Reviewed acquisition level; Movement, timing, conditions or resources appropriate to this feature |
| navigator:passive                      | navigator: Read the Tides         | 1          | automatic   | reference-only | No              | 2024 conversion of historical combat text                                                         |
| ability-navigator-shift-the-flow       | navigator: Shift the Flow         | Unassigned | unassigned  | reference-only | No              | Reviewed acquisition level; Movement, timing, conditions or resources appropriate to this feature |
| tidecaller:passive                     | tidecaller: Surge                 | 1          | automatic   | reference-only | No              | 2024 conversion of historical combat text                                                         |
| ability-tidecaller-tidal-burst         | tidecaller: Tidal Burst           | Unassigned | unassigned  | reference-only | No              | Reviewed acquisition level; Movement, timing, conditions or resources appropriate to this feature |
| warden:passive                         | warden: Hold the Line             | 1          | automatic   | reference-only | No              | 2024 conversion of historical combat text                                                         |
| ability-warden-intercept               | warden: Intercept                 | Unassigned | unassigned  | reference-only | No              | Reviewed acquisition level; Movement, timing, conditions or resources appropriate to this feature |
| reaver:passive                         | reaver: Bloodrush                 | 1          | automatic   | reference-only | No              | 2024 conversion of historical combat text                                                         |
| ability-reaver-savage-strike           | reaver: Savage Strike             | Unassigned | unassigned  | reference-only | No              | Reviewed acquisition level; Movement, timing, conditions or resources appropriate to this feature |
| corsair:expertise                      | Rogue: Expertise                  | 1          | automatic   | implemented    | No              | —                                                                                                 |
| corsair:sneak-attack                   | Rogue: Sneak Attack               | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| corsair:thieves-cant                   | Rogue: Thieves’ Cant              | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| corsair:weapon-mastery                 | Rogue: Weapon Mastery             | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| corsair:cunning-action                 | Rogue: Cunning Action             | 2          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| corsair:steady-aim                     | Rogue: Steady Aim                 | 3          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| corsair:cunning-strike                 | Rogue: Cunning Strike             | 5          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| corsair:uncanny-dodge                  | Rogue: Uncanny Dodge              | 5          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| corsair:evasion                        | Rogue: Evasion                    | 7          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| corsair:reliable-talent                | Rogue: Reliable Talent            | 7          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| corsair:improved-cunning-strike        | Rogue: Improved Cunning Strike    | 11         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| corsair:devious-strikes                | Rogue: Devious Strikes            | 14         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| corsair:slippery-mind                  | Rogue: Slippery Mind              | 15         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| corsair:elusive                        | Rogue: Elusive                    | 18         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| corsair:stroke-of-luck                 | Rogue: Stroke of Luck             | 20         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| corsair:expertise-bargain              | corsair: Bargain Expertise        | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-command              | corsair: Command Expertise        | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-deceive              | corsair: Deceive Expertise        | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-read                 | corsair: Read Expertise           | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-perform              | corsair: Perform Expertise        | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-threaten             | corsair: Threaten Expertise       | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-persuade             | corsair: Persuade Expertise       | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-navigate             | corsair: Navigate Expertise       | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-track                | corsair: Track Expertise          | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-endure               | corsair: Endure Expertise         | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-climb                | corsair: Climb Expertise          | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-dive                 | corsair: Dive Expertise           | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-stealth              | corsair: Stealth Expertise        | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-perception           | corsair: Perception Expertise     | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-investigate          | corsair: Investigate Expertise    | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-lore                 | corsair: Lore Expertise           | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-finesse              | corsair: Finesse Expertise        | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-jury-rig             | corsair: Jury-Rig Expertise       | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-stabilize            | corsair: Stabilize Expertise      | 1          | selected    | implemented    | No              | —                                                                                                 |
| corsair:expertise-attune               | corsair: Attune Expertise         | 1          | selected    | implemented    | No              | —                                                                                                 |
| gunslinger:fighting-style              | Fighter: Fighting Style           | 1          | automatic   | reference-only | No              | Other styles require additional combat handling                                                   |
| gunslinger:second-wind                 | Fighter: Second Wind              | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| gunslinger:weapon-mastery              | Fighter: Weapon Mastery           | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| gunslinger:action-surge                | Fighter: Action Surge             | 2          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| gunslinger:tactical-mind               | Fighter: Tactical Mind            | 2          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| gunslinger:extra-attack                | Fighter: Extra Attack             | 5          | automatic   | implemented    | Yes, passive    | —                                                                                                 |
| gunslinger:tactical-shift              | Fighter: Tactical Shift           | 5          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| gunslinger:indomitable                 | Fighter: Indomitable              | 9          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| gunslinger:tactical-master             | Fighter: Tactical Master          | 9          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| gunslinger:two-extra-attacks           | Fighter: Two Extra Attacks        | 11         | automatic   | implemented    | Yes, passive    | —                                                                                                 |
| gunslinger:studied-attacks             | Fighter: Studied Attacks          | 13         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| gunslinger:three-extra-attacks         | Fighter: Three Extra Attacks      | 20         | automatic   | implemented    | Yes, passive    | —                                                                                                 |
| gunslinger:style-defense               | gunslinger: Defense               | 1          | selected    | implemented    | Yes, passive    | —                                                                                                 |
| gunslinger:style-archery               | gunslinger: Archery               | 1          | selected    | reference-only | No              | Ranged, extra-attack or damage-rule implementation                                                |
| gunslinger:style-great-weapon-fighting | gunslinger: Great Weapon Fighting | 1          | selected    | implemented    | Yes, passive    | —                                                                                                 |
| gunslinger:style-two-weapon-fighting   | gunslinger: Two-Weapon Fighting   | 1          | selected    | reference-only | No              | Ranged, extra-attack or damage-rule implementation                                                |
| navigator:spellcasting                 | Ranger: Spellcasting              | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| navigator:favored-enemy                | Ranger: Favored Enemy             | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| navigator:weapon-mastery               | Ranger: Weapon Mastery            | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| navigator:deft-explorer                | Ranger: Deft Explorer             | 2          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| navigator:fighting-style               | Ranger: Fighting Style            | 2          | automatic   | reference-only | No              | Other styles require additional combat handling                                                   |
| navigator:extra-attack                 | Ranger: Extra Attack              | 5          | automatic   | implemented    | Yes, passive    | —                                                                                                 |
| navigator:roving                       | Ranger: Roving                    | 6          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| navigator:expertise                    | Ranger: Expertise                 | 9          | automatic   | implemented    | No              | —                                                                                                 |
| navigator:tireless                     | Ranger: Tireless                  | 10         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| navigator:relentless-hunter            | Ranger: Relentless Hunter         | 13         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| navigator:nature-s-veil                | Ranger: Nature’s Veil             | 14         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| navigator:precise-hunter               | Ranger: Precise Hunter            | 17         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| navigator:feral-senses                 | Ranger: Feral Senses              | 18         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| navigator:foe-slayer                   | Ranger: Foe Slayer                | 20         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| navigator:expertise-bargain            | navigator: Bargain Expertise      | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-command            | navigator: Command Expertise      | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-deceive            | navigator: Deceive Expertise      | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-read               | navigator: Read Expertise         | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-perform            | navigator: Perform Expertise      | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-threaten           | navigator: Threaten Expertise     | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-persuade           | navigator: Persuade Expertise     | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-navigate           | navigator: Navigate Expertise     | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-track              | navigator: Track Expertise        | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-endure             | navigator: Endure Expertise       | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-climb              | navigator: Climb Expertise        | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-dive               | navigator: Dive Expertise         | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-stealth            | navigator: Stealth Expertise      | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-perception         | navigator: Perception Expertise   | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-investigate        | navigator: Investigate Expertise  | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-lore               | navigator: Lore Expertise         | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-finesse            | navigator: Finesse Expertise      | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-jury-rig           | navigator: Jury-Rig Expertise     | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-stabilize          | navigator: Stabilize Expertise    | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:expertise-attune             | navigator: Attune Expertise       | 1          | selected    | implemented    | No              | —                                                                                                 |
| navigator:style-defense                | navigator: Defense                | 1          | selected    | implemented    | Yes, passive    | —                                                                                                 |
| navigator:style-archery                | navigator: Archery                | 1          | selected    | reference-only | No              | Ranged, extra-attack or damage-rule implementation                                                |
| navigator:style-great-weapon-fighting  | navigator: Great Weapon Fighting  | 1          | selected    | implemented    | Yes, passive    | —                                                                                                 |
| navigator:style-two-weapon-fighting    | navigator: Two-Weapon Fighting    | 1          | selected    | reference-only | No              | Ranged, extra-attack or damage-rule implementation                                                |
| tidecaller:spellcasting                | Sorcerer: Spellcasting            | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| tidecaller:innate-sorcery              | Sorcerer: Innate Sorcery          | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| tidecaller:font-of-magic               | Sorcerer: Font of Magic           | 2          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| tidecaller:metamagic                   | Sorcerer: Metamagic               | 2          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| tidecaller:sorcerous-restoration       | Sorcerer: Sorcerous Restoration   | 5          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| tidecaller:sorcery-incarnate           | Sorcerer: Sorcery Incarnate       | 7          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| tidecaller:arcane-apotheosis           | Sorcerer: Arcane Apotheosis       | 20         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| warden:lay-on-hands                    | Paladin: Lay On Hands             | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| warden:spellcasting                    | Paladin: Spellcasting             | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| warden:weapon-mastery                  | Paladin: Weapon Mastery           | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| warden:fighting-style                  | Paladin: Fighting Style           | 2          | automatic   | reference-only | No              | Other styles require additional combat handling                                                   |
| warden:paladin-s-smite                 | Paladin: Paladin’s Smite          | 2          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| warden:channel-divinity                | Paladin: Channel Divinity         | 3          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| warden:extra-attack                    | Paladin: Extra Attack             | 5          | automatic   | implemented    | Yes, passive    | —                                                                                                 |
| warden:faithful-steed                  | Paladin: Faithful Steed           | 5          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| warden:aura-of-protection              | Paladin: Aura of Protection       | 6          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| warden:abjure-foes                     | Paladin: Abjure Foes              | 9          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| warden:aura-of-courage                 | Paladin: Aura of Courage          | 10         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| warden:radiant-strikes                 | Paladin: Radiant Strikes          | 11         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| warden:restoring-touch                 | Paladin: Restoring Touch          | 14         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| warden:aura-expansion                  | Paladin: Aura Expansion           | 18         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| warden:style-defense                   | warden: Defense                   | 1          | selected    | implemented    | Yes, passive    | —                                                                                                 |
| warden:style-archery                   | warden: Archery                   | 1          | selected    | reference-only | No              | Ranged, extra-attack or damage-rule implementation                                                |
| warden:style-great-weapon-fighting     | warden: Great Weapon Fighting     | 1          | selected    | implemented    | Yes, passive    | —                                                                                                 |
| warden:style-two-weapon-fighting       | warden: Two-Weapon Fighting       | 1          | selected    | reference-only | No              | Ranged, extra-attack or damage-rule implementation                                                |
| reaver:rage                            | Barbarian: Rage                   | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| reaver:unarmored-defense               | Barbarian: Unarmored Defense      | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| reaver:weapon-mastery                  | Barbarian: Weapon Mastery         | 1          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| reaver:danger-sense                    | Barbarian: Danger Sense           | 2          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| reaver:reckless-attack                 | Barbarian: Reckless Attack        | 2          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| reaver:primal-knowledge                | Barbarian: Primal Knowledge       | 3          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| reaver:extra-attack                    | Barbarian: Extra Attack           | 5          | automatic   | implemented    | Yes, passive    | —                                                                                                 |
| reaver:fast-movement                   | Barbarian: Fast Movement          | 5          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| reaver:feral-instinct                  | Barbarian: Feral Instinct         | 7          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| reaver:instinctive-pounce              | Barbarian: Instinctive Pounce     | 7          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| reaver:brutal-strike                   | Barbarian: Brutal Strike          | 9          | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| reaver:relentless-rage                 | Barbarian: Relentless Rage        | 11         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| reaver:improved-brutal-strike          | Barbarian: Improved Brutal Strike | 13         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| reaver:persistent-rage                 | Barbarian: Persistent Rage        | 15         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| reaver:indomitable-might               | Barbarian: Indomitable Might      | 18         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |
| reaver:primal-champion                 | Barbarian: Primal Champion        | 20         | automatic   | reference-only | No              | Reviewed attribute/resource/timing conversion and executable handler                              |

## Known limits and next continuation

1. Specify and validate the missing spell-preparation, mastery, Metamagic and language choice contracts. They are not silently auto-selected. Until then, these characters are supported-subset builds, not complete class simulations.
2. Convert source feature descriptions/scaling/resources into approved Archipelago rules and implement handlers incrementally. Most class-feature names currently serve source-reference discovery.
3. Add reviewed feats/Epic Boons; Attribute Improvement is currently the sole executable alternative. No fabricated Epic Boon was added.
4. Review the twelve original signatures/actives for grid-based mechanics, resources and timing.
5. Author four-tier universal Path definitions before enabling investments.
6. Implement ranged/ammunition, reaction, movement and recovery systems separately. No full spell engine, mastery engine or rest engine was built.
7. Add optional local playtest plan persistence and stronger real-browser workflow tests. Current UI tests render components; they are not browser click-through tests.

No database writes, resets, migrations, deployment or secret changes were executed. Database/controller/HTTP tests use mocked persistence. Live MongoDB restart and visual browser checks remain manual.

## Manual smoke test

1. Start local frontend/backend with the normal authenticated development workflow. For playtest routes, explicitly configure a non-production backend with ARCHIPELAGO_PLAYTEST_ENABLED=true and restart it. The flag alone cannot enable production.
2. Create a new Corsair, choose four General Skills, select two eligible Expertise skills, choose Shield or Dagger, review the equipment preview and save. Confirm no custom ability controls and no standalone Paths step.
3. Create a Gunslinger with Defense or Great Weapon Fighting, select Pistol/Musket, and verify the firearm is carried, trained and not automated. Other Callings should have no forced level-one ability choice.
4. Inspect full progression and reference-only badges on the sheet. Change equipment there; creation packages must not be reissued.
5. Open Development playtest, select the new character, target 5/11/20, complete each supported required decision, inspect unspent Paths and all explicit limitations. Changing target level recomputes; Discard clears temporary decisions.
6. Start a temporary encounter. On a Gunslinger at 5/11/20, verify 2/3/4 attacks consume one Action, the next attack is rejected, and End turn discards any remainder. Verify GWF raw/adjusted dice or Defense Guard as selected.
7. Reload the encounter URL; ensure command IDs/revisions prevent duplicate damage. Reload the saved character and confirm it is unchanged by playtesting.
8. Confirm disabled/production playtest calls reject with 403 and other owners cannot use the source character.

## Exact file manifest

Files below were created or modified. Obsolete custom ability logic was removed in place; no records were deleted. Legacy progression modules are versioned history replay, not another character-owned ability system.

- archipelago/src/components/creator/AbilitiesStep/AbilitiesStep.jsx
- archipelago/src/components/creator/LoadoutStep/LoadoutStep.jsx
- archipelago/src/components/creator/ReviewStep/ReviewStep.jsx
- archipelago/src/components/layout/AppNavbar.jsx
- archipelago/src/components/progression/ProgressionView.jsx
- archipelago/src/lib/roll.js
- archipelago/src/pages/CharacterCreator/logic/config/creatorConfig.js
- archipelago/src/pages/CharacterCreator/logic/controller/useCreatorController.js
- archipelago/src/pages/CharacterCreator/logic/guidance/creatorGuidance.js
- archipelago/src/pages/CharacterCreator/logic/hydration/hydrateState.js
- archipelago/src/pages/CharacterCreator/logic/mutations/createMutations.js
- archipelago/src/pages/CharacterCreator/logic/payload/buildPatch.js
- archipelago/src/pages/CharacterCreator/logic/payload/buildPayload.js
- archipelago/src/pages/CharacterCreator/logic/state/creatorState.js
- archipelago/src/pages/CharacterCreator/logic/transforms/creatorTransforms.js
- archipelago/src/pages/CharacterCreator/sections/loadout/LoadoutSection.jsx
- archipelago/src/pages/CharacterCreator/sections/step-content/stepRegistry.js
- archipelago/src/pages/CharacterSheet/CharacterAdvancement.jsx
- archipelago/src/pages/CharacterSheet/CharacterAdvancementLegacy.jsx
- archipelago/src/pages/CharacterSheet/CharacterChecks.jsx
- archipelago/src/pages/CharacterSheet/characterSheetHelpers.js
- archipelago/src/pages/CharacterSheet/CharacterSheetLoadout/CharacterSheetLoadout.jsx
- archipelago/src/pages/CombatTest/CombatTestPage.jsx
- archipelago/src/pages/Playtest/PlaytestPage.jsx
- archipelago/src/routes/AppRoutes.jsx
- archipelago/tests/advancement.test.mjs
- archipelago/tests/creatorIntegration.test.mjs
- archipelago/tests/equipment.test.mjs
- archipelago/tests/interactiveSheet.test.mjs
- archipelago/tests/progressionV2.test.mjs
- crossworld_backend/src/modules/archipelago/characters/controller.js
- crossworld_backend/src/modules/archipelago/characters/model.js
- crossworld_backend/src/modules/archipelago/characters/routes.js
- crossworld_backend/src/modules/archipelago/characters/validators.js
- crossworld_backend/src/modules/archipelago/combat/attack.js
- crossworld_backend/src/modules/archipelago/combat/guard.js
- crossworld_backend/src/modules/archipelago/combat/snapshot.js
- crossworld_backend/src/modules/archipelago/combat/state.js
- crossworld_backend/src/modules/archipelago/equipment/index.js
- crossworld_backend/src/modules/archipelago/equipment/startingEquipment.js
- crossworld_backend/src/modules/archipelago/system/advancement.js
- crossworld_backend/src/modules/archipelago/system/advancementLegacy.js
- crossworld_backend/src/modules/archipelago/system/blueprints/abilities/historical.js
- crossworld_backend/src/modules/archipelago/system/blueprints/abilities/index.js
- crossworld_backend/src/modules/archipelago/system/blueprints/abilities/NOTICE.md
- crossworld_backend/src/modules/archipelago/system/blueprints/characters/equipmentTraining.js
- crossworld_backend/src/modules/archipelago/system/blueprints/characters/progressionSources.js
- crossworld_backend/src/modules/archipelago/system/blueprints/characters/startingEquipment.js
- crossworld_backend/src/modules/archipelago/system/blueprints/progression.js
- crossworld_backend/src/modules/archipelago/system/blueprints/progressionLegacy.js
- crossworld_backend/src/modules/archipelago/system/blueprints/samples.js
- crossworld_backend/src/modules/archipelago/system/blueprints/schema.js
- crossworld_backend/src/modules/archipelago/system/draft.js
- crossworld_backend/src/modules/archipelago/system/featureHandlers.js
- crossworld_backend/src/modules/archipelago/system/index.js
- crossworld_backend/src/modules/archipelago/system/playtest.js
- crossworld_backend/src/modules/archipelago/system/routes.js
- crossworld_backend/src/modules/archipelago/system/trainingChecks.js
- crossworld_backend/tests/advancement.test.mjs
- crossworld_backend/tests/characterCombat.test.mjs
- crossworld_backend/tests/characterCreation.test.mjs
- crossworld_backend/tests/equipmentIntegration.test.mjs
- crossworld_backend/tests/progressionV2.test.mjs

## Final validation results

- Backend: 99 tests passed, zero failed. Includes all six Callings at every level 1–20, package alternatives, prerequisite/catalog validation, mocked persistence, development HTTP authorization and source independence.
- Frontend: 74 tests passed, zero failed. Includes the eight-step navigation, automatic/required/reference-only presentation, all twenty progression rows, Path discovery and Expertise checks.
- Backend full lint passed. Frontend source lint and new-test lint passed. Frontend production build passed. Diff whitespace checks passed.
- Existing Vite tests emit WebSocket port-in-use warnings; test assertions passed.
- No live database/server-restart or browser click-through validation is claimed.

The report itself is also newly created: crossworld_backend/docs/progression-v2-implementation.md.

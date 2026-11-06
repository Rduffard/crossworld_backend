# Equipment foundation

Canonical rules: SRD 5.2, printed pages 89–93. See system/blueprints/equipment/NOTICE.md for attribution. 38 standard table weapons (including the SRD Pistol and Musket), original cutlass, 12 armor definitions and shield. No additional firearm groups or firearms were invented.

## Character contract

One inventory array: {instanceId, definitionId, quantity, customName, notes}. Canonical weapons/armor/shields have quantity 1. Separate copies have distinct server UUIDs. Descriptive items use definitionId:null and a required customName; they may stack and have no combat mechanics.

loadout: {mainHand,offHand,armor,grip:'one'|'two'}. Slots are owned instance IDs or null. Required two-handed weapons reserve both hands; grip:'two' selects versatile damage for a main-hand versatile weapon. Shields occupy one hand. Only one shield and one armor suit are permitted.

POST /archipelago/characters issues one cutlass and equips it in mainHand through equipment.startingEquipment(). This is a temporary development starting-item rule, not a permanent Calling equipment package. Creation cannot supply inventory or loadout.

GET /archipelago/characters/:characterId/equipment returns inventory, loadout, resolved slots, effective Training, Guard inputs/result, attack options, restrictions and documentRevision. Uses existing authentication and owner lookup.

PATCH /archipelago/characters/:characterId accepts equipmentOperation:

    {expectedRevision:0,add:[{definitionId:'dagger',customName:'',notes:''}]}
    {expectedRevision:1,loadout:{mainHand:'owned-instance-id',offHand:null,armor:null,grip:'one'}}
    {expectedRevision:2,edit:[{instanceId:'owned-instance-id',customName:'Named blade',notes:'A gift'}]}
    {expectedRevision:3,remove:['unequipped-instance-id']}

Operations may be combined; final inventory/loadout is validated atomically. No client-issued instance IDs, mechanical values, or Training flags. Descriptive additions/edits also accept positive integer quantity. Definition IDs cannot be changed by edit. Development inventory additions are authorized for a character's owner; no purchase, trade or GM economy exists. Normal PATCH fields retain existing semantics and compare-and-set protection.

Creation/editing retain custom non-Calling abilities. Obsolete equipment arrays, relic arrays, name-based equipment identity matching and gear text parsers have been replaced. General Skill Training, saves and progression are unchanged.

## Training

Provisional profiles: Corsair Simple + cutlass; Light + shield. Gunslinger/Navigator/Reaver Simple; Light. Tidecaller Simple; no armor. Warden Simple + Martial; Light/Medium/Heavy + shield. Runtime unions deduplicate trusted grants; weapon-group extension is present with no invented memberships. Equipment ownership never grants Training. Mastery is metadata only.

## Combat

POST /archipelago/encounters/from-character accepts only {characterId}. No practiceProficiency field. Validated resolved definitions (including version), instances, loadout, Training, Guard and attacks are copied into encounter-local snapshots. A weapon command references attack option/instance ID and may choose attribute:'might'|'agility' if allowed. Fixture route remains separate. Standard attack is universal, not a Calling reward.

Standard fixed-in-range melee attacks execute. Finesse explicitly permits either attribute. Heavy thresholds impose disadvantage. Two-handed occupancy and versatile grip are enforced. Untrained weapons omit Training Bonus; untrained armor imposes physical D20 disadvantage and blocks future spellcasting; untrained shields provide no Guard. Armor Stealth disadvantage is applied to sheet rolls. Might speed penalties and don/doff timing are metadata pending movement/time systems.

Ranged/thrown/mounted attacks are rejected with unsupported status. Range, ammunition depletion, Loading, Light extra attacks, Weapon Mastery, movement and opportunity attacks are not automated. The Light property does not prevent an ordinary single melee attack. No generic effect scripting or synchronization exists.

## Experimental data

No database changes or deletions were executed. Existing descriptive equipment cannot be safely inferred into canonical items. Recreate the experimental character through the creator, manually re-entering desired identity/attributes/General Skills/notes, then add approved canonical items in Equipment. Review/export the old record before any optional deletion. No full database reset is necessary. Existing pre-equipment encounters should be replaced with newly initialized encounters; no automatic encounter migration is provided.

## Manual workflow

Create a Corsair, save, open Edit → Equipment, verify cutlass in main hand. Unequip, save immediately, then re-equip; add a shield/light armor and equip. View the sheet Guard and Training. Open Combat test, choose this character and start; select Might or Agility and attack. Reload the encounter URL and verify the saved event/revision. Use Tidecaller to verify an owned cutlass is untrained. No combat result writes to the character.

Automated storage/controller tests mock MongoDB. Live MongoDB restart and browser click-through are not claimed.

## Changed files

The following files were created or modified for this equipment implementation. No repository files were deleted; obsolete structures and parsing functions were removed in place.

- archipelago/src/components/creator/LoadoutStep/LoadoutStep.jsx
- archipelago/src/components/creator/LoadoutStep/loadoutStepHelpers.js
- archipelago/src/components/creator/ReviewStep/reviewHelpers.js
- archipelago/src/components/creator/ReviewStep/ReviewStep.jsx
- archipelago/src/components/equipment/EquipmentPanel.jsx
- archipelago/src/lib/roll.js
- archipelago/src/pages/CharacterCreator/logic/controller/useCreatorController.js
- archipelago/src/pages/CharacterCreator/logic/hydration/hydrateState.js
- archipelago/src/pages/CharacterCreator/logic/payload/buildPatch.js
- archipelago/src/pages/CharacterCreator/logic/payload/buildPayload.js
- archipelago/src/pages/CharacterCreator/logic/state/creatorState.js
- archipelago/src/pages/CharacterCreator/logic/transforms/creatorTransforms.js
- archipelago/src/pages/CharacterCreator/sections/loadout/LoadoutSection.jsx
- archipelago/src/pages/CharacterSheet/CharacterAdvancement.jsx
- archipelago/src/pages/CharacterSheet/characterSheetHelpers.js
- archipelago/src/pages/CharacterSheet/CharacterSheetLoadout/CharacterSheetLoadout.jsx
- archipelago/src/pages/CombatTest/CombatTestPage.jsx
- archipelago/tests/advancement.test.mjs
- archipelago/tests/characterCombat.test.mjs
- archipelago/tests/combat.test.mjs
- archipelago/tests/equipment.test.mjs
- crossworld_backend/docs/equipment-foundation.md
- crossworld_backend/src/modules/archipelago/characters/controller.js
- crossworld_backend/src/modules/archipelago/characters/model.js
- crossworld_backend/src/modules/archipelago/characters/routes.js
- crossworld_backend/src/modules/archipelago/characters/validators.js
- crossworld_backend/src/modules/archipelago/combat/attack.js
- crossworld_backend/src/modules/archipelago/combat/routes.js
- crossworld_backend/src/modules/archipelago/combat/service.js
- crossworld_backend/src/modules/archipelago/combat/snapshot.js
- crossworld_backend/src/modules/archipelago/combat/state.js
- crossworld_backend/src/modules/archipelago/combat/weapons.js
- crossworld_backend/src/modules/archipelago/equipment/index.js
- crossworld_backend/src/modules/archipelago/equipment/training.js
- crossworld_backend/src/modules/archipelago/system/blueprints/characters/equipmentTraining.js
- crossworld_backend/src/modules/archipelago/system/blueprints/equipment/armor.js
- crossworld_backend/src/modules/archipelago/system/blueprints/equipment/index.js
- crossworld_backend/src/modules/archipelago/system/blueprints/equipment/NOTICE.md
- crossworld_backend/src/modules/archipelago/system/blueprints/equipment/shields.js
- crossworld_backend/src/modules/archipelago/system/blueprints/equipment/weapons.js
- crossworld_backend/src/modules/archipelago/system/blueprints/samples.js
- crossworld_backend/src/modules/archipelago/system/blueprints/schema.js
- crossworld_backend/src/modules/archipelago/system/blueprints/startingProficiencies.js
- crossworld_backend/src/modules/archipelago/system/index.js
- crossworld_backend/tests/advancement.test.mjs
- crossworld_backend/tests/characterCombat.test.mjs
- crossworld_backend/tests/equipment.test.mjs
- crossworld_backend/tests/equipmentIntegration.test.mjs

- crossworld_backend/tests/equipmentProperties.test.mjs

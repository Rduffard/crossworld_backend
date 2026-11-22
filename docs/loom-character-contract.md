# Loom character contract fixtures

Use [loom-character-contract-v1.json](../tests/fixtures/loom-character-contract-v1.json) as a language-independent reference for the website's current character rules. Each scenario has explicit inputs and expected outputs. Fixture format version `1` targets `SA-CHAR-1`.

| Scenario | Starting state and operations |
| --- | --- |
| Creation | Create a level-one Fishmen Gunslinger with the provided point-buy allocation, Origin, Background, and starting kit. Compare the ledger version, attributes and modifiers, Lineage traits, and equipped catalog IDs. |
| Advancement | Apply the level-two and level-three choices to the created character. Creating directly at level three with the same choices yields the same mechanical projection. |
| Beastshifter Form | Learn Dock Rat, activate the transformation, then apply enough damage to deplete the form's separate Health and overflow into humanoid Health. |
| Reversal | From the advanced character, preview and commit a rebuild using the ledger prefix ending at the requested level. |
| Rebuild | From a separate advanced character, apply the fixture damage, then preview and commit the replacement Lineage. Keep the Calling decisions and equipment. |
| Resource recovery | Apply Short Rest recovery to the supplied pool balances and definitions. |
| Equipment state | From the created character, buy a catalog pack of bullets, split off the requested number of units, then merge the split stack back into the original. |
| Campaign ownership | Register the level-one source snapshot with the supplied revision and current Health. Verify GM admission and milestone authority, provenance, and independence from a later source rename. |

Assertions use the named projections in each expected object. The JavaScript tests resolve generated item, proposal, and campaign IDs at runtime. Campaign ownership and approval are service behavior. The remaining scenarios exercise deterministic mechanics through the engine or character application.

Run the reference checks from the backend directory.

```sh
npm test -- integration/loom-character-contract.test.mjs campaigns/membership-and-sessions.test.mjs
```

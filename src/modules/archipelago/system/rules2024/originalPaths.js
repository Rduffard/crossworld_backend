// Original Archipelago subclass designs. These are not additional SRD subclasses.
// Timing follows the owning Calling; effects are resolved by the GM at the table.
const source = { document: "Sanguine Archipelago", version: "2026-11-07" };
const designs = {
  "drydock-ghost": {
    choices: { 3: { key: "ghostTrade", options: ["covert-repair", "sabotage"] } },
    features: [
      [3, "Ghost Patch", "Gain Training with thieves' tools and carpenter's tools. Choose covert repair or sabotage. Once per turn when making a tool check for that trade, add your Wit modifier (minimum +1). Spend one Ghost Work use as an Action while touching a nonmagical object to repair 2d8 + your Shipwright level damage, or conceal your tampering. Discovering concealed tampering requires an Investigate check against your spell save DC. This does not repair creatures or magic items."],
      [6, "Paid in Scrap", "After ten minutes salvaging a wreck, recover mundane parts worth up to 10 GP times your Shipwright level, once per Long Rest. Parts can only fund repairs or crafting and cannot be sold. Ghost Patch repairs 3d8 + your Shipwright level. Gain Expertise with the tools granted by this Path."],
      [10, "Silent Keel", "Spend one Ghost Work use as an Action to shroud a vehicle or up to six willing creatures within 30 feet for ten minutes, requiring Concentration. Affected creatures gain advantage on Stealth checks and leave no mundane tracks. The effect ends for a creature when it attacks or casts a spell. Ghost Patch repairs 4d8 + your Shipwright level."],
      [14, "Unseen Passage", "As a Bonus Action, spend two Ghost Work uses to gain a climbing and swimming speed equal to your speed and pass through nonmagical structures for one minute. Treat structures as Difficult Terrain; ending your turn inside one deals 1d10 Force damage and moves you to the nearest empty space. You cannot carry other creatures through structures. Ghost Patch repairs 5d8 + your Shipwright level."],
    ],
  },
  "storm-broker": {
    choices: { 3: { key: "stormDiscipline", options: ["weather", "signals"] } },
    features: [
      [3, "Barometer Instinct", "Choose weather or signals. Gain Training with navigator's tools. You have advantage on Instinct checks to predict natural weather or Wit checks to interpret signals, according to your choice. As a Bonus Action spend one Squall use to create a 10-foot-radius zone within 60 feet until the start of your next turn. Choose fog (heavily obscured), crosswind (ranged weapon attacks through it have disadvantage), or surge (Difficult Terrain). This is magical and does not stack with another Squall."],
      [7, "Borrowed Squall", "Your Squall radius becomes 15 feet. When creating one, choose up to your Instinct modifier (minimum one) creatures you can see; those creatures ignore its effects. Gain Resistance to Lightning or Thunder damage, selected when you gain this feature."],
      [11, "Captain's Credit", "Once on each of your turns when an ally you can see within 60 feet succeeds on an attack or saving throw while in your Squall, grant that ally temporary Health equal to your Training Bonus + your Instinct modifier (minimum one). Squalls last until the end of your next turn. No retired Focus or specialty currency is restored."],
      [15, "Eye of the Bargain", "Your Squall radius becomes 20 feet. As a Reaction when a creature you can see within 60 feet takes Lightning or Thunder damage, spend one Squall use to grant it Resistance to that instance of damage. Once per Long Rest, when initiative is rolled and you have no Squall uses, recover one use."],
    ],
  },
  "field-surgeon": {
    choices: { 3: { key: "surgicalDiscipline", options: ["trauma", "toxicology"] } },
    features: [
      [3, "Clinical Doctrine", "Choose trauma or toxicology. Gain Training with healer's kits and herbalism kits, and Expertise in Stabilize if already Trained, otherwise Training in Stabilize. Your Doctor spells and features can use Wit instead of Instinct; this choice is fixed when this Path is gained. This changes the casting attribute, not the magical rules or components of spells. As an Action spend one Triage use and one healer's kit use to restore 2d8 + your Doctor level Health to a creature within reach. A creature can receive this healing once per Short or Long Rest."],
      [6, "Battlefield Procedure", "Triage healing becomes 3d8 + your Doctor level. Trauma: when applying Triage, also end the target's Prone condition without spending movement. Toxicology: instead of healing, a Triage use can end the Poisoned condition and grant advantage against poison for one minute. Neither option removes Exhaustion or restores missing limbs. Record each target's Triage rest restriction at the table."],
      [17, "Impossible Operation", "Triage healing becomes 6d8 + your Doctor level. Once per Long Rest, as an Action expend one Channel Divinity use and five healer's kit uses to restore a creature that died within the last minute to 1 Health. Its body must be present and substantially intact; death by old age and removed vital organs cannot be reversed. You must remain within reach for the Action. This is an original magical intervention, not ordinary surgery."],
    ],
  },
  "breakwater": {
    choices: { 3: { key: "fortification", options: ["bulwark", "shelter"] } },
    features: [
      [3, "Breakwater Doctrine", "Choose bulwark or shelter. Gain Training with mason's tools and carpenter's tools. As an Action spend one Bastion use to place a magical barrier in unoccupied space within 30 feet: up to 10 feet wide, 5 feet high, and 1 foot thick. It lasts one minute, has Guard 15 and Health equal to five times your Shipwright level, is immune to Poison and Psychic damage, and provides half cover. You may have only one such barrier; creating another dismisses the first. Bulwark adds your Wit modifier (minimum one) to its Guard; shelter grants creatures of your choice within 5 feet temporary Health equal to your Training Bonus when it appears."],
      [6, "Reinforced Anchorage", "Barrier Health becomes seven times your Shipwright level. You have advantage on tool checks to reinforce structures. As a Reaction when a creature within 5 feet of your barrier takes damage, spend one Bastion use to reduce that damage by 2d8 + your Wit modifier (minimum one total reduction)."],
      [10, "Harbor Geometry", "Your barrier can be up to 20 feet wide and 10 feet high, with one right-angle bend. It provides three-quarters cover. When you create it, choose up to your Training Bonus creatures; those creatures can pass through it as Difficult Terrain. It cannot appear through creatures or objects and does not trap a creature in an occupied space."],
      [14, "Hold Against the Sea", "Barrier Health becomes ten times your Shipwright level. Once per Long Rest, create a barrier without spending a Bastion use; that barrier lasts one hour. Damage reduction from Reinforced Anchorage becomes 4d8 + your Wit modifier. Your barrier is resistant to all damage except Force and damage from siege weapons."],
    ],
  },
};
function install(rules) {
  for (const [id, design] of Object.entries(designs)) {
    const path = rules.paths.find(p => p.id === id);
    if (!path) throw Error("Missing intended Path " + id);
    path.status = "available";
    path.source = source;
    path.description = design.features[0][2];
    path.featureLevels = [...new Set(design.features.map(([level]) => level))];
    path.grants = [];
    path.choices = design.choices;
    for (const [callingLevel, name, description] of design.features) {
      const featureId = `path:${id}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${callingLevel}`;
      path.grants.push(featureId);
      const resourceRules = callingLevel === 3
        ? " Path uses start at two, increase by one at Calling levels 7, 11, 15, and 19, and recover one on a Short Rest or all on a Long Rest. Separately listed once-per-Long-Rest features recover on a Long Rest."
        : "";
      rules.features.push({ id: featureId, ownerId: id, ownerType: "path", callingLevel,
        sourceName: name, name, description: description + resourceRules, source, rulesStatus: "tabletop-rules",
        automationStatus: "not-automated", missingSourceLines: [] });
    }
  }
  return rules;
}
module.exports = { install, designs };

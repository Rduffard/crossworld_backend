const { callings, timelines, prepared, fullSlots, halfSlots, slug } = require('@crossworld/sanguine-engine/callings');
const regionalLanguages = require('./regionalLanguages');
// Mechanical identities are independent of setting presentation. SRD 5.2.1, CC BY 4.0.
const sourceUrl =
  "https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf";
const abilities = {
  strength: "might",
  dexterity: "agility",
  constitution: "resolve",
  intelligence: "wit",
  wisdom: "instinct",
  charisma: "spirit",
};
const skills = [
  ["acrobatics", "Acrobatics", "agility"],
  ["animal-handling", "Animal Handling", "instinct"],
  ["arcana", "Attune", "wit"],
  ["athletics", "Athletics", "might"],
  ["deception", "Deceive", "spirit"],
  ["history", "History", "wit"],
  ["insight", "Read", "instinct"],
  ["intimidation", "Threaten", "spirit"],
  ["investigation", "Investigate", "wit"],
  ["medicine", "Stabilize", "instinct"],
  ["nature", "Nature", "wit"],
  ["perception", "Perception", "instinct"],
  ["performance", "Perform", "spirit"],
  ["persuasion", "Persuade", "spirit"],
  ["religion", "Ritual Lore", "wit"],
  ["sleight-of-hand", "Finesse", "agility"],
  ["stealth", "Stealth", "agility"],
  ["survival", "Track", "instinct"],
].map(([id, name, attribute]) => ({ id, name, attribute, sourceId: id }));
const standardLanguages = ['common-sign-language', 'draconic', 'dwarvish', 'elvish', 'giant', 'gnomish', 'goblin', 'halfling', 'orc',
  ...regionalLanguages.map(language => language.id)];
const languages = [...standardLanguages, 'abyssal', 'celestial', 'deep-speech', 'infernal', 'primordial', 'sylvan', 'undercommon'];
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
module.exports = freeze({
  sourceUrl,
  abilities,
  skills,
  standardLanguages,
  languages,
  callings,
  timelines,
  prepared,
  fullSlots,
  halfSlots,
  slug,
});

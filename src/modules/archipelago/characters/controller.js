const Character = require("./model");
const { decorate } = require("./persistence");
const getCharacters = async (req, res, next) => {
  try {
    const characters = await Character.find({ owner: req.user._id, rulesLedger: { $exists: true }, 'campaignAdmission.state': { $nin: ['pending', 'rejected'] } })
      .sort({ updatedAt: -1 }).lean();
    res.send(characters.map(c=>{
      if(c.rulesVersion!=='SA-CHAR-1'||!c.rulesLedger?.creation||!Number.isSafeInteger(c.goldCp))return {_id:c._id,name:c.name,origin:c.origin,status:c.status,requiresRecreation:true};
      return decorate(c);
    }));
  } catch (error) { next(error); }
};
const deleteCharacter = async (req, res, next) => {
  try {
    const result = await Character.findOneAndDelete({ _id: req.params.characterId, owner: req.user._id, campaignId: null });
    if (!result) throw Object.assign(new Error("Character not found"), { statusCode: 404 });
    res.send({ message: "Character deleted" });
  } catch (error) { next(error); }
};
const duplicateCharacter = async (req, res, next) => {
  try {
    const owner = req.user._id;
    const original = await Character.findOne({
      _id: req.params.characterId, owner, campaignId: null, rulesVersion: 'SA-CHAR-1',
    }).lean();
    if (!original) throw Object.assign(new Error('Personal character not found'), { statusCode: 404 });
    if (await Character.countDocuments({ owner }) >= 20)
      throw Object.assign(new Error('Character limit reached'), { statusCode: 403 });

    const rules = require('../system/characterSystem');
    const rulesLedger = structuredClone(original.rulesLedger);
    const summary = rules.replay(rulesLedger);
    const copy = await Character.create({
      owner,
      name: original.name.slice(0, 73).trimEnd() + ' (copy)',
      origin: summary.originId,
      schemaVersion: original.schemaVersion,
      rulesVersion: original.rulesVersion,
      pronouns: original.pronouns,
      appearance: original.appearance,
      portraitUrl: original.portraitUrl,
      notes: original.notes,
      calling: rulesLedger.levels[0].callingId,
      attributes: summary.attributes,
      rulesLedger,
      rulesRuntime: rules.runtime.initialize(summary),
      documentRevision: 0,
      ...require('./creationEquipment').build(rulesLedger, [], false, true),
    });
    res.status(201).send(decorate(copy));
  } catch (error) { next(error); }
};
module.exports = { getCharacters, deleteCharacter, duplicateCharacter };

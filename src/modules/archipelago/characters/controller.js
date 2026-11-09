const Character = require("./model");
const { decorate } = require("./rules2024");
const getCharacters = async (req, res, next) => {
  try {
    const characters = await Character.find({ owner: req.user._id, rulesLedger: { $exists: true } })
      .sort({ updatedAt: -1 }).lean();
    res.send(characters.map(c=>{
      if(c.rulesVersion!=='SA-CHAR-1'||!c.rulesLedger?.creation||!Number.isSafeInteger(c.goldCp))return {_id:c._id,name:c.name,origin:c.origin,status:c.status,requiresRecreation:true};
      return decorate(c);
    }));
  } catch (error) { next(error); }
};
const deleteCharacter = async (req, res, next) => {
  try {
    const result = await Character.findOneAndDelete({ _id: req.params.characterId, owner: req.user._id });
    if (!result) throw Object.assign(new Error("Character not found"), { statusCode: 404 });
    res.send({ message: "Character deleted" });
  } catch (error) { next(error); }
};
module.exports = { getCharacters, deleteCharacter };

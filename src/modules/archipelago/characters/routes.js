const router = require("express").Router();

const {
  createCharacter,
  deleteCharacter,
  getCharacterById,
  getCharacters,
  updateCharacter,
} = require("./controller");
const {
  validateCharacterIdParam,
  validateCreateCharacter,
  validateUpdateCharacter,
} = require("../validators");

router.get("/", getCharacters);
router.post("/", validateCreateCharacter, createCharacter);
router.get("/:characterId", validateCharacterIdParam, getCharacterById);
router.patch(
  "/:characterId",
  validateCharacterIdParam,
  validateUpdateCharacter,
  updateCharacter
);
router.delete("/:characterId", validateCharacterIdParam, deleteCharacter);

module.exports = router;

const router = require("express").Router();

const {
  createItem,
  deleteItem,
  likeItem,
  dislikeItem,
} = require("../controllers/clothingitems");

const {
  validateClothingItemBody,
  validateItemId,
} = require("../middlewares/validation");

// Create item (validates body)
router.post("/", validateClothingItemBody, createItem);

// Like/dislike (validates :itemId)
router.put("/:itemId/likes", validateItemId, likeItem);
router.delete("/:itemId/likes", validateItemId, dislikeItem);

// Delete item (validates :itemId)
router.delete("/:itemId", validateItemId, deleteItem);

module.exports = router;

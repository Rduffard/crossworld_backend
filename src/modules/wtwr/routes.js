const router = require("express").Router();

const auth = require("../../middlewares/auth");
const {
  validateClothingItemBody,
  validateItemId,
} = require("../../middlewares/validation");

const {
  createItem,
  getItems,
  deleteItem,
  likeItem,
  dislikeItem,
} = require("./controller");

// protect all WTWR routes
router.use(auth);

// items
router.get("/items", getItems);
router.post("/items", validateClothingItemBody, createItem);
router.delete("/items/:itemId", validateItemId, deleteItem);

// likes
router.put("/items/:itemId/likes", validateItemId, likeItem);
router.delete("/items/:itemId/likes", validateItemId, dislikeItem);

module.exports = router;

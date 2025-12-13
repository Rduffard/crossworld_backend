const router = require("express").Router();

const {
  createItem,
  getItems,
  updateItem,
  deleteItem,
  likeItem,
  dislikeItem,
} = require("../controllers/clothingitems");

router.post("/", createItem);
router.get("/", getItems);
router.put("/:itemId", updateItem);
router.put("/:itemId/likes", likeItem);
router.delete("/:itemId", deleteItem);
router.delete("/:itemId/likes", dislikeItem);

module.exports = router;

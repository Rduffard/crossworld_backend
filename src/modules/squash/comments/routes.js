const router = require("express").Router();

const { getComments, createComment, deleteComment } = require("./controller");

const auth = require("../../../middlewares/auth");

// Require auth for all comment actions
router.get("/", auth, getComments);
router.post("/", auth, createComment);
router.delete("/:commentId", auth, deleteComment);

module.exports = router;

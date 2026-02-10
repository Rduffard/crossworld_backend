const router = require("express").Router();

const auth = require("../../../middlewares/auth"); // adjust if your auth path differs
const { validateCreateBug, validateBugQuery } = require("./validators");
const { getBugs, createBug } = require("./controller");

router.get("/", auth, validateBugQuery, getBugs);
router.post("/", auth, validateCreateBug, createBug);

module.exports = router;

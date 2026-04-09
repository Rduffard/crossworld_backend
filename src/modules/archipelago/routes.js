const router = require("express").Router();

const auth = require("../../core/middleware/auth");
const { getStatus } = require("./controller");
const characterRoutes = require("./characters/routes");

router.use(auth);

router.get("/", getStatus);
router.use("/characters", characterRoutes);

module.exports = router;

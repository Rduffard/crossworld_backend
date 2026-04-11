const router = require("express").Router();

const auth = require("../../core/middleware/auth");
const statusRoutes = require("./status/routes");
const characterRoutes = require("./characters/routes");

router.use(auth);

router.use("/", statusRoutes);
router.use("/characters", characterRoutes);

module.exports = router;

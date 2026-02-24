const router = require("express").Router();

const bugRoutes = require("./bugs/routes");
const projectRoutes = require("./projects/routes");
const commentRoutes = require("./comments/routes");

router.use("/bugs", bugRoutes);
router.use("/projects", projectRoutes);
router.use("/comments", commentRoutes);

module.exports = router;

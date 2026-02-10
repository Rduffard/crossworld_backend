// src/modules/squash/routes.js
const router = require("express").Router();

const projectRoutes = require("./projects/routes");
const bugRoutes = require("./bugs/routes");

// Resource routers
router.use("/projects", projectRoutes);
router.use("/bugs", bugRoutes);

module.exports = router;

const router = require("express").Router();

const auth = require("../../../middlewares/auth"); // adjust if your auth path differs
const {
  validateCreateProject,
  validateProjectIdParam,
} = require("./validators");
const { getProjects, createProject, getProjectById } = require("./controller");

router.get("/", auth, getProjects);
router.post("/", auth, validateCreateProject, createProject);

// Optional but handy
router.get("/:projectId", auth, validateProjectIdParam, getProjectById);

module.exports = router;

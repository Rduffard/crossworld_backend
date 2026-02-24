const router = require("express").Router();

const auth = require("../../../middlewares/auth");
const {
  validateCreateProject,
  validateProjectIdParam,
  validateUpdateProject, // ✅
} = require("./validators");

const {
  getProjects,
  createProject,
  getProjectById,
  updateProject, // ✅
} = require("./controller");

router.get("/", auth, getProjects);
router.post("/", auth, validateCreateProject, createProject);

router.get("/:projectId", auth, validateProjectIdParam, getProjectById);

// NEW
router.patch(
  "/:projectId",
  auth,
  validateProjectIdParam,
  validateUpdateProject,
  updateProject
);

module.exports = router;

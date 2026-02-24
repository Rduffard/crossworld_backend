const Project = require("./model");

const BadRequestError = require("../../../errors/bad-request-error");
const NotFoundError = require("../../../errors/not-found-error");

const getProjects = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const projects = await Project.find({
      $or: [{ owner: userId }, { members: userId }],
    })
      .sort({ updatedAt: -1 })
      .lean();

    res.send(projects);
  } catch (err) {
    next(err);
  }
};

const createProject = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { name, description = "", repoFullName } = req.body; // ✅ add

    if (!name) throw new BadRequestError("Project name is required");

    const project = await Project.create({
      name,
      description,
      repoFullName, // ✅ add
      owner: userId,
      members: [userId], // owner is automatically a member
    });

    res.status(201).send(project);
  } catch (err) {
    next(err);
  }
};

// (Optional but useful immediately)
const getProjectById = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { projectId } = req.params;

    const project = await Project.findOne({
      _id: projectId,
      $or: [{ owner: userId }, { members: userId }],
    });

    if (!project) throw new NotFoundError("Project not found");

    res.send(project);
  } catch (err) {
    next(err);
  }
};

// NEW: PATCH /squash/projects/:projectId
const updateProject = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { projectId } = req.params;
    const { name, description, repoFullName } = req.body;

    const update = {};
    if (typeof name === "string") update.name = name;
    if (typeof description === "string") update.description = description;

    // allow clearing: repoFullName: ""
    if (typeof repoFullName === "string") {
      update.repoFullName = repoFullName.trim()
        ? repoFullName.trim()
        : undefined;
    }

    // owner-only edit (simple + safe)
    const project = await Project.findOne({ _id: projectId, owner: userId });
    if (!project) throw new NotFoundError("Project not found");

    const updated = await Project.findByIdAndUpdate(projectId, update, {
      new: true,
      runValidators: true,
    }).lean();

    res.send(updated);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getProjects,
  createProject,
  getProjectById,
  updateProject,
};

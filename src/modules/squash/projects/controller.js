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
    const { name, description = "" } = req.body;

    if (!name) throw new BadRequestError("Project name is required");

    const project = await Project.create({
      name,
      description,
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

module.exports = {
  getProjects,
  createProject,
  getProjectById,
};

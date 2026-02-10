const Bug = require("./model");
const Project = require("../projects/model");

const ForbiddenError = require("../../../errors/forbidden-error");
const NotFoundError = require("../../../errors/not-found-error");

const userHasProjectAccess = async (userId, projectId) => {
  const exists = await Project.exists({
    _id: projectId,
    $or: [{ owner: userId }, { members: userId }],
  });
  return Boolean(exists);
};

const getBugs = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { projectId } = req.query;

    // If projectId provided, return bugs for that project (with access check)
    if (projectId) {
      const ok = await userHasProjectAccess(userId, projectId);
      if (!ok) throw new ForbiddenError("No access to that project");

      const bugs = await Bug.find({ projectId }).sort({ updatedAt: -1 }).lean();
      return res.send(bugs);
    }

    // Otherwise: return bugs for all projects the user can see
    const projects = await Project.find({
      $or: [{ owner: userId }, { members: userId }],
    })
      .select("_id")
      .lean();

    const projectIds = projects.map((p) => p._id);

    const bugs = await Bug.find({ projectId: { $in: projectIds } })
      .sort({ updatedAt: -1 })
      .lean();

    res.send(bugs);
  } catch (err) {
    next(err);
  }
};

const createBug = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      title,
      description = "",
      status,
      priority,
      projectId,
      assignee = null,
    } = req.body;

    const ok = await userHasProjectAccess(userId, projectId);
    if (!ok) throw new ForbiddenError("No access to that project");

    const bug = await Bug.create({
      title,
      description,
      status,
      priority,
      projectId,
      reporter: userId,
      assignee,
    });

    res.status(201).send(bug);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getBugs,
  createBug,
};

const Bug = require("./model");
const Project = require("../projects/model");

const statusByState = {
  triage: "open", accepted: "open", assigned: "open", correction: "in_progress", retest: "in_progress",
  verified: "resolved", closed: "closed", reopened: "open", deferred: "open", rejected: "closed",
};
const stateByStatus = { open: "triage", in_progress: "correction", resolved: "verified", closed: "closed" };
const transitions = {
  triage: ["accepted", "deferred", "rejected"], accepted: ["assigned", "deferred"],
  assigned: ["correction", "deferred"], correction: ["retest", "deferred"],
  retest: ["verified", "reopened"], verified: ["closed", "reopened"], closed: ["reopened"],
  reopened: ["triage", "assigned", "correction"], deferred: ["triage"], rejected: ["triage"],
};
const needsReason = new Set(["verified", "reopened", "deferred", "rejected"]);

function qualityProblem(previous, next, reason) {
  if (previous !== next && !transitions[previous]?.includes(next)) return "That quality transition is unavailable.";
  if (previous !== next && needsReason.has(next) && !reason) return "Record the evidence or reason for this decision.";
  return null;
}

async function authorizedBug(bugId, account) {
  const bug = await Bug.findById(bugId).lean();
  return bug && await Project.exists({ _id: bug.projectId, owner: account }) ? bug : null;
}

function qualityView(bug) {
  const state = bug.quality?.state || stateByStatus[bug.status];
  return { state, status: bug.status, priority: bug.priority, severity: bug.quality?.severity || null,
    revision: bug.quality?.revision || 0, history: bug.quality?.history || [], allowed: transitions[state] || [] };
}

async function getQuality(req, res, next) {
  try {
    const bug = await authorizedBug(req.params.bugId, req.user._id);
    return bug ? res.json(qualityView(bug)) : res.status(404).json({ message: "Defect unavailable to this project owner." });
  } catch (error) {
    return next(error);
  }
}

async function updateQuality(req, res, next) {
  try {
    const account = req.user._id;
    const bug = await authorizedBug(req.params.bugId, account);
    if (!bug) {
      return res.status(404).json({ message: "Defect unavailable to this project owner." });
    }
    const { state, severity, priority, revision, reason = "" } = req.body;
    const previous = bug.quality?.state || stateByStatus[bug.status];
    const problem = qualityProblem(previous, state, reason);
    if (problem) return res.status(400).json({ message: problem });
    if ((bug.quality?.revision || 0) !== revision) return res.status(409).json({ message: "Defect changed. Refresh and retry." });
    if (revision >= 200) return res.status(409).json({ message: "The defect has reached its quality history limit." });
    const updated = await Bug.findOneAndUpdate({
      _id: bug._id, projectId: bug.projectId, "quality.revision": revision || { $exists: false },
    }, {
      $set: { status: statusByState[state], priority, "quality.state": state, "quality.severity": severity },
      $inc: { "quality.revision": 1 },
      $push: { "quality.history": { actor: account, from: previous, to: state, severity, priority, reason, at: new Date() } },
    }, { new: true, runValidators: true }).lean();
    return updated ? res.json(qualityView(updated)) : res.status(409).json({ message: "Defect changed. Refresh and retry." });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getQuality, updateQuality, qualityProblem, statusByState };

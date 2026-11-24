const express = require("express");
const { randomUUID } = require("node:crypto");

const states = ["active", "paused", "archived"];
const workspaces = ["development", "workshop"];
const text = (value, max) => typeof value === "string" && value.isWellFormed() && value.length <= max
  ? value.trim() : null;

function createProjects({ records, owner }) {
  const router = express.Router();
  router.get("/", async (_req, res) => {
    const projects = await records().find({ ownerId: owner() }, {
      projection: { name: 1, description: 1, workspace: 1, status: 1 },
    }).sort({ name: 1, _id: 1 }).toArray();
    return res.json(projects);
  });
  router.get("/:id", async (req, res) => {
    const project = await records().findOne({ _id: req.params.id, ownerId: owner() }, { projection: { ownerId: 0, studioActionReceipts: 0 } });
    return project ? res.json(project) : res.status(404).json({ message: "Project not found." });
  });

  async function save(req, res) {
    const { workspace, status = "active", revision, repositories = [] } = req.body || {};
    const name = text(req.body?.name, 100);
    const description = text(req.body?.description, 1500);
    const instructions = text(req.body?.instructions ?? "", 6000);
    if (!name || !description || instructions === null || !workspaces.includes(workspace) || !states.includes(status) ||
        !Array.isArray(repositories) || repositories.length > 12 || !repositories.every((item) => text(item, 200)) ||
        (req.params.id && (!Number.isSafeInteger(revision) || revision < 0))) {
      return res.status(400).json({ message: "Provide a name, description, workspace and valid project settings." });
    }
    const ownerId = owner();
    const now = new Date();
    const details = { name, description, instructions, workspace, status, updatedAt: now, repositories: repositories.map((item) => item.trim()) };
    if (req.params.id) {
      const saved = await records().updateOne({ _id: req.params.id, ownerId, revision }, {
        $set: details, $inc: { revision: 1 },
      });
      return saved.matchedCount ? res.sendStatus(204) : res.status(409).json({ message: "The project changed. Reload before saving." });
    }
    const _id = randomUUID();
    await records().insertOne({ _id, ownerId, ...details, revision: 0, createdAt: now });
    return res.status(201).json({ _id });
  }

  router.post("/", save);
  router.put("/:id", save);
  return router;
}

module.exports = { createProjects };

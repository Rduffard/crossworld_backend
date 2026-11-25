const express = require("express");

function createOwnerPreferences({ records, owner }) {
  const router = express.Router();
  function view(record) {
    return { directDevelopmentProfile: record?.directDevelopmentProfile ?? null, revision: record?.revision ?? 0 };
  }
  router.get("/", async (_req, res) => res.json(view(await records().findOne({ _id: owner() }))));
  router.patch("/", async (req, res) => {
    const { directDevelopmentProfile, revision } = req.body || {};
    if (!["read-only", "scoped", "full-access"].includes(directDevelopmentProfile) || !Number.isSafeInteger(revision) || revision < 0) {
      return res.status(400).json({ message: "Provide a direct-development permission and current revision." });
    }
    const _id = owner();
    const change = { $set: { directDevelopmentProfile, updatedAt: new Date() }, $inc: { revision: 1 } };
    try {
      const updated = await records().findOneAndUpdate({ _id, revision: revision || { $exists: false } },
        change, { upsert: revision === 0, returnDocument: "after" });
      if (updated) return res.json(view(updated));
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    return res.status(409).json({ message: "Owner preferences changed. Refresh before editing." });
  });
  return router;
}

module.exports = { createOwnerPreferences };

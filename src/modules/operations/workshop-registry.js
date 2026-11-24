const express = require("express");
const { createHash } = require("node:crypto");

const statuses = ["research_candidate", "acquired", "inspected", "experimentally_tested", "validated", "rejected"];
const labels = {
  creator: 160, format: 80, license: 300, purpose: 700, reason: 700,
  commercial_use: 100, modification: 100, redistribution: 100, ml_training: 100,
};
const bounded = (value, max) => typeof value === "string" && value.isWellFormed() && value.length <= max
  ? value.trim() : "";

function relativeRef(value) {
  const candidate = bounded(value, 500).replaceAll("\\", "/");
  const valid = candidate.split("/").every((part) => !!part && ![".", ".."].includes(part) && !/[<>:"|?*\x00-\x1f]/.test(part) && !/[. ]$/.test(part));
  return valid ? candidate : "";
}

function sourceUrl(value) {
  const candidate = bounded(value, 600);
  if (!/^https?:\/\//i.test(candidate)) return "";
  let url;
  try { url = new URL(candidate); } catch { return ""; }
  if (url.username || url.password) return "";
  url.search = "";
  url.hash = "";
  return url.href;
}

function normalizeRegistry(payload) {
  if (payload?.schema_version !== 1 || !Array.isArray(payload.resources) || payload.resources.length > 200) return null;
  const ids = new Set();
  const resources = [];
  for (const input of payload.resources) {
    const id = bounded(input?.id, 120);
    if (!/^[a-z\d][a-z\d_.-]*$/i.test(id) || ids.has(id) || !statuses.includes(input?.status)) return null;
    ids.add(id);
    const { status } = input;
    const metadata = Object.fromEntries(Object.entries(labels).map(([key, limit]) => [key, bounded(input[key], limit)]));
    resources.push({
      id, status, ...metadata,
      originalUrl: sourceUrl(input.original_url),
      downloadUrl: sourceUrl(input.download_url),
      localPath: relativeRef(input.local_path),
      licenseEvidence: sourceUrl(input.license_evidence) || relativeRef(input.license_evidence),
      integrityManifest: relativeRef(input.integrity_manifest),
      reviewPath: relativeRef(input.review_path),
      metrics: relativeRef(input.metrics),
      sha256: typeof input.sha256 === "string" && /^[a-f\d]{64}$/i.test(input.sha256) ? input.sha256.toLowerCase() : "",
    });
  }
  return resources.sort((left, right) => left.id.localeCompare(right.id));
}

function createWorkshopRegistry({ records, owner }) {
  const router = express.Router();
  router.get("/", async (req, res) => {
    const search = req.query.q;
    const status = req.query.status;
    if ((search !== undefined && (typeof search !== "string" || search.length > 120)) ||
        (status !== undefined && !statuses.includes(status))) {
      return res.status(400).json({ message: "Invalid workshop registry filter." });
    }
    const snapshot = await records().findOne({ _id: owner() });
    const query = (search || "").trim().toLowerCase();
    const resources = snapshot?.resources || [];
    const entries = resources.filter((entry) => (!status || entry.status === status) &&
      (!query || [entry.id, entry.creator, entry.format, entry.license, entry.purpose, entry.localPath]
        .some((field) => field.toLowerCase().includes(query))));
    return res.json({ importedAt: snapshot?.importedAt || null, total: resources.length, entries });
  });

  router.post("/", async (req, res) => {
    const resources = normalizeRegistry(req.body);
    if (!resources) return res.status(400).json({ message: "Select the Workshop schema version 1 resource registry with unique resource IDs." });
    const _id = owner();
    const digest = createHash("sha256").update(JSON.stringify(resources)).digest("hex");
    const previous = await records().findOne({ _id }, { projection: { digest: 1, importedAt: 1 } });
    if (previous?.digest === digest) return res.json({ total: resources.length, importedAt: previous.importedAt });
    const importedAt = new Date();
    await records().updateOne({ _id }, { $set: { resources, digest, importedAt } }, { upsert: true });
    return res.json({ total: resources.length, importedAt });
  });

  return router;
}

module.exports = { createWorkshopRegistry, normalizeRegistry };

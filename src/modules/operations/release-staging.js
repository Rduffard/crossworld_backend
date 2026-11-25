const express = require("express");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { digest, gitCommit, parsePackage } = require("./managed-release-format");

const uuid = value => typeof value === "string" && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(value);
const fail = (res, status, message) => res.status(status).json({ message });
const lifetime = 2 * 60 * 60 * 1000;

function packagedCandidate() {
  const candidate = path.join(__dirname, "verified-worker-candidate.json");
  try { return JSON.parse(readFileSync(candidate, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function createReleaseStaging({ hosts, requests, owner, workerEnabled, candidate = packagedCandidate }) {
  const browser = express.Router();
  const worker = express.Router();
  const pkg = candidate();
  const release = parsePackage(pkg);
  let index;
  const ensureIndex = () => index ||= requests().createIndex({ ownerId: 1, hostId: 1 }, {
    unique: true, partialFilterExpression: { pending: true },
  }).catch(error => { index = undefined; throw error; });
  const expire = scope => requests().updateMany({ ...scope, pending: true, expiresAt: { $lte: new Date() } }, {
    $set: { status: "expired", finishedAt: new Date() }, $unset: { pending: "", package: "" },
  });
  async function view(scope) {
    await expire(scope);
    return requests().find(scope, { projection: { ownerId: 0, package: 0, pending: 0 } })
      .sort({ createdAt: -1 }).limit(25).toArray();
  }
  browser.get("/", async (_req, res) => res.json(await view({ ownerId: owner() })));
  browser.get("/candidate", (_req, res) => res.json(release ? {
    commit: release.commit, digest: release.digest, relayVersion: release.relayVersion, files: release.files.size,
    evidence: "Backend CI verified this commit before packaging its worker runtime.",
  } : null));

  browser.post("/", async (req, res) => {
    const { id, hostId, reviewedDigest, commit } = req.body || {};
    if (!uuid(id) || !uuid(hostId) || !digest(reviewedDigest) || !gitCommit(commit)) {
      return fail(res, 400, "Choose a device and provide the reviewed package's exact manifest digest.");
    }
    if (!workerEnabled) return fail(res, 423, "Remote execution is disabled.");
    const scope = { ownerId: owner(), hostId };
    const key = { _id: id, ...scope, digest: reviewedDigest, commit };
    await expire(scope);
    if (await requests().findOne(key, { projection: { _id: 1 } })) return res.json({ id });
    if (!release || release.digest !== reviewedDigest || release.commit !== commit) {
      return fail(res, 409, "The verified candidate changed. Reload and review its exact commit and digest.");
    }
    const host = await hosts().findOne({ _id: hostId, ownerId: scope.ownerId, revokedAt: null },
      { projection: { supervisorControl: 1 } });
    if (host?.supervisorControl?.remoteStaging !== true || +host.supervisorControl.observedAt <= Date.now() - 20_000) {
      return fail(res, 409, "The independent supervisor must be online and support remote staging.");
    }
    await ensureIndex();
    const createdAt = new Date();
    try {
      await requests().insertOne({ ...key, relayVersion: release.relayVersion, status: "authorized", pending: true,
        createdAt, expiresAt: new Date(+createdAt + lifetime), stageAuthorizedBy: "owner",
        package: { version: 1, digest: release.digest, commit: release.commit, manifest: pkg.manifest,
          members: pkg.members.map(({ file, content }) => ({ file, content })) },
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      return await requests().findOne(key, { projection: { _id: 1 } })
        ? res.json({ id }) : fail(res, 409, "Another request is already staging or this identifier is in use.");
    }
    return res.status(201).json({ id });
  });

  worker.post("/poll", async (req, res) => {
    if (!workerEnabled) return res.json(null);
    const { _id: hostId, ownerId } = req.operationsHost;
    const scope = { ownerId, hostId };
    await expire(scope);
    const request = await requests().findOne({ ...scope, status: "authorized", expiresAt: { $gt: new Date() } },
      { projection: { _id: 1, package: 1, expiresAt: 1 } });
    return res.json(request || null);
  });

  worker.post("/:id/receipt", async (req, res) => {
    const { status, digest: reviewedDigest } = req.body || {};
    if (!uuid(req.params.id) || !digest(reviewedDigest) || !["staged", "failed"].includes(status)) {
      return fail(res, 400, "Invalid staging receipt.");
    }
    const { _id: hostId, ownerId } = req.operationsHost;
    const key = { _id: req.params.id, ownerId, hostId, digest: reviewedDigest };
    const result = await requests().updateOne({ ...key, status: "authorized", expiresAt: { $gt: new Date() } }, {
      $set: { status, finishedAt: new Date() }, $unset: { pending: "", package: "" },
    });
    if (!result.matchedCount && !await requests().findOne({ ...key, status }, { projection: { _id: 1 } })) {
      return fail(res, 409, "The staging request expired or the receipt does not match.");
    }
    return res.json({ accepted: true });
  });

  return { browser, worker };
}

module.exports = { createReleaseStaging };

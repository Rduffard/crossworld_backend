const { createHash, randomUUID } = require("node:crypto");
const { catalog, toolIntent, toolRuleKey } = require("./mcp-policy");

const defaults = Object.freeze({
  read: "allow", history: "allow", ci: "allow", localBranch: "allow", localCommit: "allow",
  push: "ask", pullRequest: "ask", merge: "ask", deploy: "ask", workflowChange: "ask",
  applyStaged: "ask", updateWorker: "ask",
});
const immutableBlocks = [
  "npmPublish", "packagePublish", "release", "releaseTag", "visibility", "secrets",
  "permissions", "deleteRepository", "bypassProtection",
];
const external = new Set(["push", "pullRequest", "merge", "deploy", "workflowChange"]);
const mustAsk = new Set([...external, "applyStaged", "updateWorker"]);
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const bounded = (value, max) => typeof value === "string" && value.length <= max;
const sha = (value) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const branch = (value) => typeof value === "string" && /^[a-zA-Z0-9_/-][a-zA-Z0-9_./-]{0,199}$/.test(value) &&
  value.split("/").every((part) => part && !part.startsWith(".") && !part.endsWith(".") && !part.endsWith(".lock")) &&
  !value.includes("..") && !value.startsWith("-") && !value.startsWith("refs/");

function validateIntent(value) {
  if (!value || !bounded(value.operation, 40) || typeof value.repository !== "string" ||
      !/^[\w.-]+\/[\w.-]+$/.test(value.repository) || !bounded(value.repository, 160) ||
      !branch(value.branch) || !sha(value.headSha) ||
      (value.baseSha !== null && !sha(value.baseSha)) || !bounded(value.changes, 8000) ||
      !bounded(value.tests, 4000)) return null;
  const target = value.target ?? null;
  if (value.operation === "merge" ? !Number.isSafeInteger(target) || target < 1 :
    value.operation === "deploy" ? !bounded(target, 100) || !/^[\w.-]+\.ya?ml$/.test(target) :
    value.operation === "pullRequest" ? !branch(target) :
    value.operation === "updateWorker" ? !bounded(target, 43) || !/^worker-[a-f\d-]{36}$/.test(target) :
    target !== null) return null;
  const diff = value.diff ?? "";
  if (!bounded(diff, 24000) || (["applyStaged", "updateWorker"].includes(value.operation) && !diff)) return null;
  return {
    operation: value.operation, repository: value.repository.toLowerCase(), branch: value.branch,
    headSha: value.headSha, baseSha: value.baseSha, target, changes: value.changes, tests: value.tests, diff,
  };
}

function effectivePolicy(operation, configured) {
  if (!Object.hasOwn(defaults, operation)) return "block";
  const mode = configured?.[operation] || defaults[operation];
  return mustAsk.has(operation) && mode === "allow" ? "ask" : mode;
}

function createGovernance({ requests, policies, repositories, adapter, toolAdapter }) {
  const policy = (ownerId) => policies().findOne({ _id: ownerId });
  const resolveMode = (intent, config) => intent.operation === "mcpTool"
    ? config?.toolModes?.[`${intent.role}:${intent.workspace}:${intent.tool}`] || "block"
    : repositories().includes(intent.repository) ? effectivePolicy(intent.operation, config?.modes) : "block";
  return {
    available: !!adapter,
    toolsAvailable: !!toolAdapter,
    async config(ownerId) {
      const saved = await policy(ownerId);
      return { revision: saved?.revision || 0, modes: { ...defaults, ...saved?.modes },
        immutableBlocks, toolModes: saved?.toolModes || {}, catalog };
    },
    async configure(ownerId, revision, modes, toolModes) {
      if (!Number.isSafeInteger(revision) || revision < 0 || !modes || typeof modes !== "object" || Array.isArray(modes) ||
          Object.entries(modes).some(([op, mode]) => !Object.hasOwn(defaults, op) ||
            !["allow", "ask", "block"].includes(mode) || (mustAsk.has(op) && mode === "allow")) ||
          (toolModes !== undefined && (!toolModes || typeof toolModes !== "object" || Array.isArray(toolModes) ||
            Object.keys(toolModes).length > 100 || Object.entries(toolModes).some(([key, mode]) =>
              !toolRuleKey(key) || !["allow", "ask", "block"].includes(mode))))) return 400;
      const changes = { modes, ...(toolModes !== undefined ? { toolModes } : {}) };
      try {
        const result = await policies().updateOne({ _id: ownerId, revision }, {
          $set: changes, $inc: { revision: 1 },
          $push: { audit: { type: "policy.changed", actor: ownerId, at: new Date(), revision: revision + 1, ...changes } },
        }, { upsert: revision === 0 });
        return result.matchedCount || result.upsertedCount ? 204 : 409;
      } catch (error) {
        if (error.code === 11000) return 409;
        throw error;
      }
    },
    async propose(job, host, candidate) {
      const intent = candidate?.operation === "mcpTool" ? toolIntent(candidate, job) : validateIntent(candidate);
      if (!intent) return null;
      const configured = await policy(job.ownerId);
      const mode = resolveMode(intent, configured);
      const blocked = mode === "block";
      const createdAt = new Date();
      const record = {
        _id: randomUUID(), ownerId: job.ownerId, jobId: job._id, sessionId: job.sessionId,
        worker: { id: host._id, label: host.label }, intent, fingerprint: digest(intent), mode,
        policyRevision: configured?.revision || 0,
        consequences: intent.operation === "mcpTool" ? "Runs one named tool against the isolated workspace."
          : external.has(intent.operation)
          ? "This operation can run GitHub Actions. Execution requires independently verified publication and deployment safeguards."
          : intent.operation === "applyStaged" ? "Updates a local integration branch. No push or deployment."
            : intent.operation === "updateWorker" ? "Drains and restarts the isolated execution worker."
              : "Repository inspection or a local development operation.",
        state: blocked ? "blocked" : mode === "ask" ? "pending" : "authorized",
        createdAt, expiresAt: new Date(+createdAt + 15 * 60_000),
        audit: [{ type: "request.created", actor: host._id, at: createdAt, mode }],
      };
      await requests().insertOne(record);
      return record;
    },
    async list(ownerId) {
      const now = new Date();
      await requests().updateMany({ ownerId, state: { $in: ["pending", "authorized", "approved"] }, expiresAt: { $lte: now } }, {
        $set: { state: "expired" }, $push: { audit: { type: "request.expired", at: now } },
      });
      const pending = await requests().find({ ownerId, state: "pending" }).sort({ createdAt: 1 }).toArray();
      const recent = await requests().find({ ownerId, state: { $ne: "pending" } }).sort({ createdAt: -1 }).limit(50).toArray();
      return [...pending, ...recent];
    },
    async decide(ownerId, jobId, id, choice, fingerprint) {
      const now = new Date();
      const state = choice === "approve" ? "approved" : "denied";
      if (choice === "approve") {
        const record = await requests().findOne({ _id: id, ownerId, jobId });
        if (!(record?.intent.operation === "mcpTool" ? toolAdapter : adapter)) return false;
      }
      const changed = await requests().updateOne({
        _id: id, ownerId, jobId, state: "pending", fingerprint, expiresAt: { $gt: now },
      }, { $set: { state }, $push: { audit: { type: `request.${state}`, actor: ownerId, at: now } } });
      return !!changed.matchedCount;
    },
    async execute(ownerId, id) {
      const record = await requests().findOne({ _id: id, ownerId });
      const service = record?.intent.operation === "mcpTool" ? toolAdapter : adapter;
      if (!service) return "disabled";
      if (!record || !["approved", "authorized"].includes(record.state) || record.expiresAt <= new Date()) return "unavailable";
      const configured = await policy(ownerId);
      const currentMode = resolveMode(record.intent, configured);
      if (currentMode === "block" ||
          (currentMode === "ask" && record.state !== "approved") ||
          (configured?.revision || 0) !== record.policyRevision) {
        await requests().updateOne({ _id: id, ownerId, state: record.state }, {
          $set: { state: "blocked" },
          $push: { audit: { type: "execution.blocked", reason: "policy-changed", at: new Date() } },
        });
        return "policy-changed";
      }
      const claimed = await requests().updateOne({
        _id: id, ownerId, state: record.state, fingerprint: record.fingerprint, expiresAt: { $gt: new Date() },
      }, { $set: { state: "executing" }, $push: { audit: { type: "execution.claimed", at: new Date() } } });
      if (!claimed.matchedCount) return "unavailable";
      let outcome = "uncertain";
      try {
        const proof = await service.inspect(record.intent);
        if (digest(record.intent) !== record.fingerprint || proof.headSha !== record.intent.headSha ||
            proof.baseSha !== record.intent.baseSha ||
            ((mustAsk.has(record.intent.operation) || record.intent.operation === "mcpTool") && proof.safe !== true)) {
          outcome = "blocked";
        } else if ((await policy(ownerId))?.revision !== configured?.revision || record.expiresAt <= new Date()) {
          outcome = "blocked";
        } else {
          // A live adapter must enforce these preconditions atomically at the mutation boundary.
          await service.perform(record.intent, { fingerprint: record.fingerprint, proof });
          outcome = "completed";
        }
      } catch {
        // A failed network attempt can have changed remote state. Never retry automatically.
      } finally {
        await requests().updateOne({ _id: id, ownerId, state: "executing" }, {
          $set: { state: outcome }, $push: { audit: { type: `execution.${outcome}`, at: new Date() } },
        });
      }
      return outcome;
    },
  };
}

module.exports = { createGovernance };

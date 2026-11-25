const { createHash } = require("node:crypto");

const directory = "tools/operations-worker/";
const operations = "src/modules/operations/";
const runtimeFiles = new Set([
  "codex.mjs", "control.mjs", "media-storage.mjs", "profiles.mjs", "resources.mjs", "windows.mjs", "worker.mjs",
  "check-permissions.mjs", "supervisor.mjs",
].map(name => directory + name).concat(
  ["diagnostics", "media-artifacts", "prompt-limits", "usage"].map(name => operations + name + ".js"),
));
const maxBytes = 256 * 1024;
const optionalRuntimeFiles = new Set([operations + "assignment-scopes.js"]);
const entrypoint = directory + "worker.mjs";
const gitCommit = value => typeof value === "string" && /^[a-f\d]{40}$/.test(value);
const digest = value => typeof value === "string" && /^[a-f\d]{64}$/.test(value);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

function decode(value) {
  if (typeof value !== "string" || !value.length || value.length > 4 * Math.ceil(maxBytes / 3)) return null;
  const bytes = Buffer.from(value, "base64");
  return bytes.toString("base64") === value ? bytes : null;
}

function parsePackage(pkg) {
  if (!pkg || pkg.version !== 1 || !gitCommit(pkg.commit) || !digest(pkg.digest) || !Array.isArray(pkg.members) ||
      pkg.members.length < runtimeFiles.size || pkg.members.length > runtimeFiles.size + optionalRuntimeFiles.size) return null;
  const manifest = decode(pkg.manifest);
  if (!manifest || manifest.length > 65536 || hash(manifest) !== pkg.digest) return null;
  let entries;
  try { entries = JSON.parse(manifest); } catch { return null; }
  if (!Array.isArray(entries) || entries.length !== pkg.members.length) return null;
  const files = new Map();
  let total = manifest.length;
  for (const [index, entry] of entries.entries()) {
    const member = pkg.members[index];
    if ((!runtimeFiles.has(entry?.file) && !optionalRuntimeFiles.has(entry?.file)) ||
        files.has(entry.file) || !digest(entry.sha256) || member?.file !== entry.file) return null;
    const data = decode(member.content);
    if (!data || (total += data.length) > maxBytes || hash(data) !== entry.sha256) return null;
    files.set(member.file, data);
  }
  if ([...runtimeFiles].some(file => !files.has(file))) return null;
  return { manifest, files, relayVersion: hash(files.get(entrypoint)).slice(0, 12), commit: pkg.commit, digest: pkg.digest };
}

module.exports = { parsePackage, runtimeFiles, optionalRuntimeFiles, gitCommit, digest, hash };

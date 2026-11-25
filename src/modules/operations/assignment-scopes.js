const { createHash } = require("node:crypto");
const { win32 } = require("node:path");

const idPattern = /^[a-z][a-z\d-]{0,31}$/;
const validId = id => typeof id === "string" && idPattern.test(id);

function pathKey(root) {
  if (typeof root !== "string" || root.length > 240 || !/^[a-z]:\\[^\\]/i.test(root) ||
      root !== win32.normalize(root) || /[<>:"/|?*~]/.test(root.slice(2)) ||
      [...root].some(character => character.charCodeAt(0) < 32)) return null;
  const parts = root.slice(3).split("\\");
  if (parts.some(part => !part || part.startsWith(".") || /[. ]$/.test(part) ||
      /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) return null;
  return root.toLowerCase();
}

function rootsOverlap(first, second) {
  return first.some(a => second.some(b => a === b || a.startsWith(b + "\\") || b.startsWith(a + "\\")));
}

function assignmentScope(id, input) {
  if (!validId(id) || !Array.isArray(input) || !input.length || input.length > 8) return null;
  const roots = input.map(pathKey);
  if (roots.some(root => !root) || roots.some((root, index) => rootsOverlap([root], roots.slice(0, index)))) return null;
  roots.sort();
  const revision = createHash("sha256").update(JSON.stringify([id, roots])).digest("hex");
  return { id, roots, revision };
}

function scopeCatalog(input) {
  if (!Array.isArray(input) || input.length > 12) return null;
  const entries = new Map();
  for (const value of input) {
    const scope = assignmentScope(value?.id, value?.roots);
    if (!scope || scope.revision !== value.revision || entries.has(scope.id)) return null;
    entries.set(scope.id, scope);
  }
  return entries;
}

function matchingScope(job, scopes) {
  const scope = scopes.get(job?.assignmentScopeId);
  return scope?.revision === job?.assignmentScopeRevision ? scope : undefined;
}

function resourceQueueReason(limits, observation, now = Date.now()) {
  if (!limits || (!limits.maxCpuPercent && !limits.minAvailableRamMiB)) return null;
  if (!observation || observation.observedAt < now - 120000 || observation.observedAt > now + 30000 ||
      (limits.maxCpuPercent && !Number.isFinite(observation.cpu)) ||
      (limits.minAvailableRamMiB && !Number.isFinite(observation.memory?.free))) return "Waiting for fresh host resource measurements";
  if (limits.maxCpuPercent && observation.cpu > limits.maxCpuPercent) return "Waiting for CPU utilization to fall";
  if (limits.minAvailableRamMiB && observation.memory.free < limits.minAvailableRamMiB * 1024 ** 2) return "Waiting for available memory";
  return null;
}

module.exports = { assignmentScope, matchingScope, pathKey, resourceQueueReason, rootsOverlap, scopeCatalog, validId };

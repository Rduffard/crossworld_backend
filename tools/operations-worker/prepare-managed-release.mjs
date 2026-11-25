import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { releaseStore } from "./managed-supervisor.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const directory = "tools/operations-worker/";
const operations = "src/modules/operations/";
const runtimeFiles = new Set([
  "codex.mjs", "control.mjs", "media-storage.mjs", "profiles.mjs", "resources.mjs", "windows.mjs", "worker.mjs",
  "check-permissions.mjs", "supervisor.mjs",
].map(name => directory + name).concat(
  ["diagnostics", "media-artifacts", "prompt-limits", "usage"].map(name => operations + name + ".js"),
));

export function prepareManagedRelease({ repository, commit, output }) {
  if (typeof commit !== "string" || !/^[a-f\d]{40}$/.test(commit)) throw new Error("Provide the full reviewed Git commit SHA.");
  if (!path.isAbsolute(repository) || !path.isAbsolute(output)) throw new Error("Provide absolute repository and staging paths.");
  const root = realpathSync(output);
  const repo = realpathSync(repository);
  const relative = path.relative(repo, root);
  if (relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep))) {
    throw new Error("Stage releases outside the source repository.");
  }
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { maxBuffer: 1100000, windowsHide: true });
  if (git("rev-parse", "--verify", commit + "^{commit}").toString().trim() !== commit) {
    throw new Error("The requested identity is not a commit.");
  }
  const listing = git("ls-tree", "-r", "-z", commit, "--", directory, operations).toString().split("\0").filter(Boolean);
  const files = new Map();
  for (const row of listing) {
    const [metadata, file] = row.split("\t", 2);
    if (!runtimeFiles.has(file)) continue;
    const [mode, type, oid] = metadata.split(" ");
    if (!["100644", "100755"].includes(mode) || type !== "blob") throw new Error("Unsafe release member: " + file);
    const bytes = git("cat-file", "blob", oid);
    if (bytes.length > 1048576) throw new Error("Release member too large: " + file);
    files.set(file, bytes);
  }
  const missing = [...runtimeFiles].filter(file => !files.has(file));
  if (missing.length) throw new Error("Missing runtime files: " + missing.join(", "));
  const manifest = Buffer.from(JSON.stringify([...files.keys()].sort().map(file => ({ file, sha256: hash(files.get(file)) }))));
  const digest = hash(manifest);
  const target = path.join(root, digest);
  const inventory = releaseStore(root);
  const staged = path.join(root, ".showtime-stage-" + randomUUID());
  if (!existsSync(target)) {
    mkdirSync(staged, { mode: 0o700 });
    try {
      const pending = path.join(staged, digest);
      for (const [file, bytes] of files) {
        const destination = path.join(pending, file);
        mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
        writeFileSync(destination, bytes, { flag: "wx", mode: 0o600, flush: true });
      }
      writeFileSync(path.join(pending, "runtime-manifest.json"), manifest, { flag: "wx", mode: 0o600, flush: true });
      releaseStore(staged).open(digest);
      try { renameSync(pending, target); }
      catch (error) { if (!existsSync(target)) throw error; }
    } finally {
      rmSync(staged, { force: true, recursive: true });
    }
  }
  const verified = inventory.open(digest);
  return { commit, digest, relayVersion: verified.version, verified: true, files: files.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [repository, commit, output, ...extra] = process.argv.slice(2);
    if (!repository || !commit || !output || extra.length) {
      throw new Error("Usage: node prepare-managed-release.mjs <absolute-repository> <full-commit> <absolute-existing-staging-directory>");
    }
    console.log(JSON.stringify(prepareManagedRelease({ repository, commit, output }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

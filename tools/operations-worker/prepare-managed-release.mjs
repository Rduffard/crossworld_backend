import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { releaseStore } from "./managed-supervisor.mjs";
import releaseFormat from "../../src/modules/operations/managed-release-format.js";

const directory = "tools/operations-worker/";
const operations = "src/modules/operations/";
const { gitCommit, hash, runtimeFiles } = releaseFormat;

export function prepareManagedRelease({ repository, commit, output }) {
  if (!gitCommit(commit)) throw new Error("Provide the full reviewed Git commit SHA.");
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
  const names = [...files.keys()].sort();
  const manifest = Buffer.from(JSON.stringify(names.map(file => ({ file, sha256: hash(files.get(file)) }))));
  const digest = hash(manifest);
  const pkg = { version: 1, commit, digest, manifest: manifest.toString("base64"),
    members: names.map(file => ({ file, content: files.get(file).toString("base64") })) };
  const verified = releaseStore(root).stage(pkg);
  const bundle = path.join(root, commit + "-" + digest + ".worker.json");
  const wire = JSON.stringify(pkg);
  try { writeFileSync(bundle, wire, { flag: "wx", mode: 0o600, flush: true }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    const file = lstatSync(bundle);
    if (!file.isFile() || file.nlink !== 1 || file.size !== Buffer.byteLength(wire) || readFileSync(bundle, "utf8") !== wire) throw error;
  }
  return { commit, digest, relayVersion: verified.version, verified: true, files: files.size, bundle };
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

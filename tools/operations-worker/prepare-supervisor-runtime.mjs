import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";

const tools = "tools/operations-worker/";
const source = "src/modules/operations/";
const required = [
  ...["managed-supervisor", "worker", "windows", "codex", "control", "media-storage", "profiles", "resources"]
    .map(name => tools + name + ".mjs"),
  ...["diagnostics", "media-artifacts", "prompt-limits", "usage"].map(name => source + name + ".js"),
];
const optional = ["managed-release-format", "assignment-scopes"].map(name => source + name + ".js");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const [repository, commit, destination] = process.argv.slice(2);
if (!repository || !destination || !/^[a-f\d]{40}$/.test(commit || "") ||
    !path.isAbsolute(repository) || !path.isAbsolute(destination)) {
  throw new Error("Provide an absolute Git checkout, exact commit and absolute candidate directory.");
}
const repo = realpathSync(repository);
const base = realpathSync(destination);
const related = (from, to) => {
  const relative = path.relative(from, to);
  return !relative || (!path.isAbsolute(relative) && !relative.split(path.sep).includes(".."));
};
if (related(repo, base) || related(base, repo)) throw new Error("Candidate directory must be separate from the checkout.");
const run = (...args) => execFileSync("git", ["-C", repo, ...args], { maxBuffer: 1100000, windowsHide: true });
if (run("rev-parse", "--verify", commit + "^{commit}").toString().trim() !== commit) throw new Error("Expected the exact candidate commit.");
const tree = run("ls-tree", "-rz", commit, "--", ...required, ...optional).toString().split("\0").filter(Boolean);
const contents = new Map();
for (const row of tree) {
  const [entry, file] = row.split("\t", 2);
  const [mode, type, oid] = entry.split(" ");
  if (!["100644", "100755"].includes(mode) || type !== "blob") throw new Error("Unsafe supervisor file " + file);
  contents.set(file, run("cat-file", "blob", oid));
}
if (required.some(file => !contents.has(file))) throw new Error("Supervisor runtime is incomplete.");
const files = [...contents].sort(([a], [b]) => a.localeCompare(b)).map(([file, bytes]) => ({ file, sha256: digest(bytes) }));
const manifest = JSON.stringify({ commit, files });
const identity = digest(manifest);
const directory = path.join(base, identity);
if (!existsSync(directory)) {
  mkdirSync(directory);
  for (const [file, bytes] of contents) {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes, { flag: "wx" });
  }
  writeFileSync(path.join(directory, "supervisor-manifest.json"), manifest, { flag: "wx" });
}
if (realpathSync(directory) !== directory) throw new Error("Redirected supervisor candidate.");
for (const [file, expected] of [["supervisor-manifest.json", identity], ...files.map(({ file, sha256 }) => [file, sha256])]) {
  const target = path.join(directory, file);
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.nlink !== 1 || realpathSync(target) !== target || digest(readFileSync(target)) !== expected) {
    throw new Error("Supervisor candidate differs from the reviewed manifest.");
  }
}
console.log(JSON.stringify({ commit, identity, directory, files: files.length }));

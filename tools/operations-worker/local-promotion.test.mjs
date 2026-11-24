import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import promotionModule from "../../src/modules/operations/local-promotion.js";
import supervisorModule from "../../src/modules/operations/worker-supervisor.js";

const { createLocalPromotion } = promotionModule;
const { createWorkerSupervisor } = supervisorModule;
const gitExe = process.argv[2];
assert.ok(gitExe && path.isAbsolute(gitExe), "Pass the absolute path to Git.");
const temp = fs.realpathSync(os.tmpdir());
const root = fs.mkdtempSync(path.join(temp, "cw-promotion-test-"));
const folder = (name) => {
  const result = path.join(root, name);
  fs.mkdirSync(result);
  return result;
};
const git = (cwd, ...args) => execFileSync(gitExe, [
  "-C", cwd, "-c", "user.name=Operations Test", "-c", "user.email=test@example.invalid",
  "-c", "core.hooksPath=" + hooks, ...args,
], { env: {
  SystemRoot: process.env.SystemRoot, GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
}, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const hooks = folder("hooks");
const repository = folder("original");
const staging = folder("staging");
const inbox = folder("inbox");
const supervisorRoot = folder("supervisor");
const originalName = `worker-${randomUUID()}`;
fs.mkdirSync(path.join(supervisorRoot, originalName));
const pointer = path.join(supervisorRoot, "active-worker.json");
fs.writeFileSync(pointer, JSON.stringify({ version: originalName }));
const calls = [];
let failOnce = false;
const supervisor = createWorkerSupervisor({
  directory: supervisorRoot,
  service: {
    async probe() { calls.push("probe"); },
    async drainAndStop() { calls.push("drain"); },
    async stop() { calls.push("stop"); },
    async startAndWait(location) {
      calls.push(path.basename(location) === originalName ? "recover" : "start");
      if (failOnce) {
        failOnce = false;
        throw new Error("Simulated health failure");
      }
    },
  },
});

try {
  git(repository, "init", "-b", "main");
  fs.writeFileSync(path.join(repository, "README.md"), "Original");
  git(repository, "add", ".");
  git(repository, "commit", "-m", "Disposable base");
  const baseSha = git(repository, "rev-parse", "HEAD");
  git(repository, "branch", "operations/integration");
  git(staging, "clone", "--quiet", repository, ".");
  git(staging, "switch", "-c", "operations/review");
  const module = "src/modules/operations/example.js";
  fs.mkdirSync(path.dirname(path.join(staging, module)), { recursive: true });
  fs.writeFileSync(path.join(staging, module), "module.exports = 42;\n");
  git(staging, "add", ".");
  git(staging, "commit", "-m", "Candidate");
  const headSha = git(staging, "rev-parse", "HEAD");
  git(staging, "bundle", "create", path.join(inbox, `${headSha}.bundle`), "operations/review", "^" + baseSha);
  const adapter = createLocalPromotion({
    gitExe, inbox, emptyHooks: hooks, supervisor,
    repositories: new Map([["example/disposable", { path: repository, kind: "backend" }]]),
  });
  const intent = { operation: "applyStaged", repository: "example/disposable", branch: "operations/integration",
    baseSha, headSha, changes: module, diff: git(staging, "diff", "--no-renames", baseSha, headSha) };
  assert.equal(adapter.inspect({ ...intent, changes: "incorrect summary" }).safe, false);
  assert.equal(adapter.inspect(intent).safe, true);
  await adapter.perform(intent);
  assert.equal(git(repository, "rev-parse", "operations/integration"), headSha);
  assert.equal(git(repository, "rev-parse", "main"), baseSha);
  assert.equal(fs.existsSync(path.join(repository, module)), false);
  await assert.rejects(adapter.perform(intent), /changed/);
  fs.mkdirSync(path.join(staging, "Art"));
  fs.writeFileSync(path.join(staging, "Art", "production.txt"), "Protected");
  git(staging, "add", ".");
  git(staging, "commit", "-m", "Outside scope");
  const artSha = git(staging, "rev-parse", "HEAD");
  git(staging, "bundle", "create", path.join(inbox, `${artSha}.bundle`), "operations/review", "^" + headSha);
  assert.equal(adapter.inspect({ ...intent, baseSha: headSha, headSha: artSha, changes: "Art/production.txt" }).safe, false);
  git(staging, "switch", "--detach", headSha);
  git(staging, "switch", "-C", "operations/review");
  const entrypoint = "tools/operations-worker/worker.mjs";
  fs.mkdirSync(path.dirname(path.join(staging, entrypoint)), { recursive: true });
  fs.writeFileSync(path.join(staging, entrypoint), "// disposable release\n");
  git(staging, "add", ".");
  git(staging, "commit", "-m", "Reviewed worker version");
  const workerSha = git(staging, "rev-parse", "HEAD");
  git(staging, "bundle", "create", path.join(inbox, `${workerSha}.bundle`), "operations/review", "^" + headSha);
  const update = { ...intent, operation: "updateWorker", target: originalName, baseSha: headSha, headSha: workerSha,
    changes: entrypoint, diff: git(staging, "diff", "--no-renames", headSha, workerSha) };
  failOnce = true;
  await assert.rejects(adapter.perform(update), /Simulated health failure/);
  assert.equal(JSON.parse(fs.readFileSync(pointer)).version, originalName);
  assert.deepEqual(calls, ["probe", "drain", "start", "stop", "recover"]);
  await adapter.perform(update);
  assert.notEqual(JSON.parse(fs.readFileSync(pointer)).version, originalName);
  assert.deepEqual(calls.slice(-3), ["probe", "drain", "start"]);
  await assert.rejects(adapter.perform(update), /active worker version has changed/);
  assert.equal(fs.existsSync(path.join(supervisorRoot, "worker-restart.json")), false);
  fs.writeFileSync(path.join(supervisorRoot, "worker-restart.json"), JSON.stringify({ previous: originalName }));
  await createWorkerSupervisor({ directory: supervisorRoot, service: {
    async stop() { calls.push("recovery-stop"); },
    async startAndWait() { calls.push("recovery-start"); },
  } }).recover();
  assert.equal(JSON.parse(fs.readFileSync(pointer)).version, originalName);
  console.log("Disposable Git promotion, art protection, and worker restart/recovery PASS");
} finally {
  if (path.dirname(fs.realpathSync(root)) !== temp || !path.basename(root).startsWith("cw-promotion-test-")) {
    console.error("Invalid disposable fixture cleanup path.");
    process.exitCode = 1;
  } else {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

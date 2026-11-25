const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { workerReleaseFile, workerDependencies } = require("./worker-supervisor");

const integrationRef = "refs/heads/operations/integration";
const bundleRef = "refs/heads/operations/review";
const repositoryScopes = {
  backend: /^src\/modules\/operations\/[\w/-]+\.js$/,
  frontend: /^src\/Pages\/Operations\/[\w/-]+\.(?:jsx|css)$/,
};
const workerScope = /^tools\/operations-worker\/[\w -]+\.(?:mjs|cmd|md)$/;
const sha = /^[a-f0-9]{40}$/;

function createLocalPromotion({ gitExe, repositories, inbox, emptyHooks, supervisor }) {
  if (![gitExe, inbox, emptyHooks].every(path.isAbsolute)) throw new Error("Trusted absolute paths are required.");
  if (fs.realpathSync(inbox) !== inbox || fs.realpathSync(emptyHooks) !== emptyHooks ||
      fs.readdirSync(emptyHooks).length !== 0) throw new Error("Invalid trusted promotion directories.");
  const gitBytes = (cwd, ...args) => execFileSync(gitExe, [
    "-C", cwd, "-c", `core.hooksPath=${emptyHooks}`, "-c", "core.fsmonitor=false",
    "-c", "protocol.allow=never", "-c", "protocol.file.allow=always",
    "-c", "gc.auto=0", ...args,
  ], {
    timeout: 20000, maxBuffer: 1024 * 1024, windowsHide: true,
    env: {
      SystemRoot: process.env.SystemRoot, GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_TERMINAL_PROMPT: "0",
      GIT_NO_REPLACE_OBJECTS: "1",
    },
  });
  const git = (cwd, ...args) => gitBytes(cwd, ...args).toString("utf8").trim();

  function inspect(intent) {
    const repo = repositories.get(intent.repository);
    const workerUpdate = intent.operation === "updateWorker";
    const scope = workerUpdate && repo?.kind === "backend" ? workerScope : repositoryScopes[repo?.kind];
    if (!repo || !scope || !["applyStaged", "updateWorker"].includes(intent.operation) ||
        (workerUpdate && (!supervisor || repo.kind !== "backend")) || intent.branch !== "operations/integration" ||
        !sha.test(intent.headSha) || !sha.test(intent.baseSha)) return { safe: false };
    const cwd = fs.realpathSync(repo.path);
    const bundle = path.join(inbox, `${intent.headSha}.bundle`);
    const info = fs.lstatSync(bundle);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 20 * 1024 * 1024 ||
        fs.realpathSync(bundle) !== bundle) return { safe: false };
    const baseSha = git(cwd, "rev-parse", "--verify", integrationRef);
    if (baseSha !== intent.baseSha || git(cwd, "bundle", "list-heads", bundle, bundleRef) !== `${intent.headSha} ${bundleRef}`) {
      return { safe: false };
    }
    git(cwd, "fetch", "--no-tags", "--no-write-fetch-head", "--no-auto-maintenance", bundle, bundleRef);
    if (git(cwd, "rev-parse", "--verify", `${intent.headSha}^`) !== baseSha ||
        git(cwd, "rev-list", "--parents", "-n", "1", intent.headSha).split(" ").length !== 2) return { safe: false };
    const reviewed = git(cwd, "diff-tree", "--no-commit-id", "--no-renames", "-r", "--raw", "-z", baseSha, intent.headSha)
      .split("\0").filter(Boolean);
    if (!reviewed.length || reviewed.length % 2 !== 0 || reviewed.some((field, index) => index % 2
      ? !scope.test(field)
      : !/^:(000000|100644) (000000|100644) [a-f0-9]{40} [a-f0-9]{40} [AMD]$/.test(field))) return { safe: false };
    const changes = reviewed.filter((_, index) => index % 2).sort().join("\n");
    const diff = git(cwd, "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--no-renames", baseSha, intent.headSha);
    return { safe: changes === intent.changes && !!diff && diff === intent.diff, headSha: intent.headSha, baseSha, cwd };
  }

  return {
    inspect,
    async perform(intent) {
      const proof = inspect(intent);
      if (!proof.safe) throw new Error("The reviewed staging content changed or exceeded its allowed scope.");
      if (intent.operation === "updateWorker") {
        const entries = git(proof.cwd, "ls-tree", "-r", "-z", intent.headSha, "--", "tools/operations-worker", ...workerDependencies)
          .split("\0").filter(Boolean);
        const files = entries.map((entry) => {
          const match = /^100644 blob [a-f0-9]{40}\t(.+)$/.exec(entry);
          if (!match || !workerReleaseFile(match[1])) throw new Error("Unsafe worker release tree.");
          return match[1];
        });
        await supervisor.activate(intent, {
          files,
          readFile: (file) => {
            if (!workerReleaseFile(file)) throw new Error("File is outside the worker release scope.");
            return gitBytes(proof.cwd, "show", `${intent.headSha}:${file}`);
          },
        });
        return;
      }
      const checkedOut = git(proof.cwd, "worktree", "list", "--porcelain").split(/\r?\n/);
      if (checkedOut.includes(`branch ${integrationRef}`)) throw new Error("Integration branch must be unused by working trees.");
      // Git checks the old object ID and updates only this local ref.
      git(proof.cwd, "update-ref", integrationRef, intent.headSha, proof.baseSha);
    },
  };
}

module.exports = { createLocalPromotion };

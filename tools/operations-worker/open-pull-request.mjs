import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { developmentRepositories } from "./profiles.mjs";

export function repositoryFromOrigin(origin) {
  return /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?$/i
    .exec(origin.trim())?.[1];
}

export async function openPullRequest(repository, input, { credential, request = fetch }) {
  const { head, base, title, body = "" } = input;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || "") ||
      ![head, base].every((branch) => typeof branch === "string" && /^[\w][\w./-]{0,199}$/.test(branch) &&
        !branch.includes("..") && !branch.startsWith("refs/")) ||
      typeof title !== "string" || !title.trim() || title.length > 256 || typeof body !== "string" || body.length > 40000) {
    throw new Error("Provide a GitHub repository, source branch, base branch, and pull request title.");
  }
  const token = credential(repository);
  if (!token) throw new Error("Git Credential Manager has no accessible GitHub credential for this repository.");
  let response;
  try {
    response = await request(`https://api.github.com/repos/${repository}/pulls`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
        "content-type": "application/json", "User-Agent": "Crossworld-Operations" },
      body: JSON.stringify({ head, base, title, body }),
    });
  } catch {
    throw new Error("GitHub did not confirm the request. Check for an existing pull request before retrying.");
  }
  if (!response.ok) throw new Error(`GitHub rejected pull request creation (HTTP ${response.status}).`);
  const { number } = await response.json();
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("GitHub did not return a pull request number.");
  return `https://github.com/${repository}/pull/${number}`;
}

async function main() {
  const [directory, head, base, title, body] = process.argv.slice(2);
  if (!directory || !path.isAbsolute(directory)) throw new Error("Provide the absolute path of an authorized development repository.");
  const resolved = realpathSync(directory);
  if (!developmentRepositories.some((repo) => repo.toLowerCase() === resolved.toLowerCase())) {
    throw new Error("Repository is outside the Operations development allowlist.");
  }
  const git = (args, input) => spawnSync("git", ["-C", resolved, ...args], {
    input, encoding: "utf8", timeout: 10000, windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never", GIT_TRACE: "0", GIT_CURL_VERBOSE: "0" },
  });
  const origin = git(["remote", "get-url", "origin"]);
  if (origin.status !== 0) throw new Error("Could not resolve the repository origin.");
  const repository = repositoryFromOrigin(origin.stdout);
  const credential = (target) => {
    const result = git(["credential", "fill"], `protocol=https\nhost=github.com\npath=${target}.git\n\n`);
    return result.status === 0 ? /^password=([^\r\n]+)$/m.exec(result.stdout)?.[1] : undefined;
  };
  console.log(await openPullRequest(repository, { head, base, title, body }, { credential }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

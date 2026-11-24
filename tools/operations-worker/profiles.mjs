import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, readdirSync, realpathSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const workspacePaths = {
  development: "C:\\Users\\Romain\\projects\\Crossworld Creative",
  workshop: "D:\\Loom Art Workshop",
};
export const developmentRepositories = ["crossworld_backend", "crossworld_creative", "archipelago", "sanguine-engine"]
  .map((directory) => path.win32.join(workspacePaths.development, directory));
export const protectedDirectories = [
  ...Object.values(workspacePaths),
  path.win32.join(workspacePaths.development, "Art"),
  path.win32.join(workspacePaths.development, "Loom", "Assets"),
  path.win32.join(workspacePaths.development, "crossworld_backend"),
  path.win32.join(workspacePaths.development, "crossworld_creative"),
  path.win32.join(workspacePaths.workshop, "11_Validated_Examples"),
  tmpdir(),
];
export const productionArt = ["Art", "Loom/Assets"].map((directory) => path.win32.join(workspacePaths.development, directory));

export const approvalPolicy = { granular: {
  sandbox_approval: false, rules: false, skill_approval: false,
  request_permissions: true, mcp_elicitations: false,
} };

export function sandboxFor(root, writableRoots = [root]) {
  return root ? {
    type: "workspaceWrite", writableRoots, networkAccess: false,
    excludeTmpdirEnvVar: true, excludeSlashTmp: true,
  } : { type: "readOnly", networkAccess: false };
}

export function verifyDirectory(directory) {
  const resolved = realpathSync(directory);
  if (resolved.toLowerCase() !== directory.toLowerCase() || !statSync(resolved).isDirectory()) {
    throw new Error("Operations directory is missing or redirected.");
  }
  return resolved;
}

export function verifyEditTree(directory) {
  const root = verifyDirectory(directory);
  const pending = [root];
  while (pending.length) {
    for (const entry of readdirSync(pending.pop(), { withFileTypes: true })) {
      const member = path.join(entry.parentPath, entry.name);
      const stat = lstatSync(member);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()) ||
          (stat.isFile() && stat.nlink !== 1) ||
          /^\.(?:git|env|codex|agents|aws)(?:\.|$)/i.test(entry.name) ||
          realpathSync(member).toLowerCase() !== member.toLowerCase()) {
        throw new Error("The Operations staging tree contains a link or protected configuration.");
      }
      if (stat.isDirectory()) pending.push(member);
    }
  }
  return root;
}

export function scopedGrant(request, root) {
  const fs = request?.fileSystem;
  if (!root || request.network || !fs || fs.globScanMaxDepth != null ||
      (fs.entries || []).some((entry) => entry.path?.type !== "path" || !["read", "write"].includes(entry.access))) return null;
  const grants = [...(fs.read || []), ...(fs.write || []), ...(fs.entries || []).map((entry) => entry.path.path)];
  if (!grants.length || grants.some((value) => {
    if (typeof value !== "string" || !path.isAbsolute(value)) return true;
    try {
      const relative = path.relative(root, realpathSync(value));
      return !relative || relative === ".." || relative.startsWith(".." + path.sep) ||
        path.isAbsolute(relative) || relative.split(path.sep).some((part) => part.startsWith("."));
    } catch { return true; }
  })) return null;
  return { fileSystem: {
    read: fs.read || null, write: fs.write || null,
    ...(fs.entries?.length ? { entries: fs.entries } : {}),
  } };
}

export async function verifySandbox(server, cwd, sandboxPolicy, protectedDirectories, roots) {
  const writable = Array.isArray(roots) ? roots : roots ? [roots] : [];
  const checked = [...new Set([...writable, ...protectedDirectories])];
  for (const directory of checked) {
    verifyDirectory(directory);
    const file = path.join(directory, "cw-sandbox-" + randomUUID() + ".tmp");
    const script = `
      const fs = require("node:fs");
      try {
        fs.writeFileSync(process.argv[1], "created", { flag: "wx" });
        fs.appendFileSync(process.argv[1], "edited");
        console.log("CW_WRITE_OK");
      } catch (error) {
        if (!["EACCES", "EPERM"].includes(error.code)) throw error;
        console.log("CW_WRITE_DENIED");
      }
    `;
    try {
      const { stdout, stderr, exitCode } = await server.request("command/exec", {
        command: [process.execPath, "-e", script, file],
        cwd, sandboxPolicy, timeoutMs: 12000,
      });
      const allowed = writable.includes(directory);
      if (exitCode !== 0 || stdout.trim() !== (allowed ? "CW_WRITE_OK" : "CW_WRITE_DENIED") ||
          existsSync(file) !== allowed) {
        throw new Error(`Windows filesystem enforcement check failed at ${directory} (${allowed ? "expected write" : "expected denial"}, exit ${exitCode}, ${stdout.trim()} ${stderr.trim()}).`);
      }
    } finally {
      if (existsSync(file)) unlinkSync(file);
    }
  }
}

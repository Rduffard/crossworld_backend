import { mkdtempSync, rmdirSync } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import { AppServer, discoverCodex } from "./codex.mjs";
import { protectedDirectories, sandboxFor, verifyEditTree, verifySandbox, workspacePaths } from "./profiles.mjs";

const { development, workshop } = workspacePaths;
const { exe } = discoverCodex();

for (const [label, parent, editable] of [
  ["read-only", development, false],
  ["development", development, true],
  ["workshop", path.join(workshop, "10_Active_Experiments"), true],
]) {
  const root = editable ? mkdtempSync(path.join(parent, "cw-permission-test-")) : undefined;
  const cwd = root || parent;
  const server = new AppServer(exe, cwd);
  try {
    if (root) verifyEditTree(root);
    await server.initialize();
    await verifySandbox(server, cwd, sandboxFor(root), protectedDirectories, root);
    console.log(`${label}: Windows sandbox PASS`);
  } finally {
    const closed = server.child.exitCode === null && server.child.signalCode === null && once(server.child, "close");
    server.close();
    if (closed) await closed;
    if (root) rmdirSync(root);
  }
}

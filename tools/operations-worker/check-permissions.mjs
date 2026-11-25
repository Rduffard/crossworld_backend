import { mkdtempSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import { AppServer, discoverCodex } from "./codex.mjs";
import { protectedDirectories, sandboxFor, verifyEditTree, verifySandbox, workspacePaths } from "./profiles.mjs";

const { development, workshop } = workspacePaths;
const { exe } = discoverCodex();

const crossDrive = process.argv.includes("--cross-drive");
if (crossDrive) {
  const roots = [];
  let outside;
  let server;
  try {
    roots.push(mkdtempSync(path.join(development, "cw-permission-test-")));
    roots.push(mkdtempSync(path.join(workshop, "10_Active_Experiments", "cw-permission-test-")));
    outside = mkdtempSync(path.join(development, "cw-read-probe-"));
    const fixtures = [...roots, outside].map(root => path.join(root, "read-marker.txt"));
    for (const fixture of fixtures) writeFileSync(fixture, "FLEETMASTER_READ_PROBE", { flag: "wx" });
    server = new AppServer(exe, roots[0]);
    await server.initialize();
    for (const cwd of roots) {
      const sandboxPolicy = sandboxFor(cwd, roots);
      await verifySandbox(server, cwd, sandboxPolicy, [...protectedDirectories, outside], roots);
      const result = await server.request("command/exec", {
        command: [process.execPath, "-e", `
          const fs = require("node:fs");
          console.log(process.argv.slice(1).map(file => {
            try { return fs.readFileSync(file, "utf8") === "FLEETMASTER_READ_PROBE" ? "read" : "wrong"; }
            catch { return "denied"; }
          }).join(","));
        `, ...fixtures], cwd, sandboxPolicy, timeoutMs: 12000,
      });
      if (result.exitCode !== 0 || !/^read,read,(read|denied)$/.test(result.stdout.trim())) {
        throw new Error("The disposable cross-drive read probe did not return both authorized markers.");
      }
      console.log("Reads from both drives verified. Outside-root fixture read: " + result.stdout.trim().split(",").at(-1));
    }
    console.log("Cross-drive writable roots and protected paths PASS from both drives.");
  } finally {
    if (server) {
      const closed = server.child.exitCode === null && server.child.signalCode === null && once(server.child, "close");
      server.close();
      if (closed) await closed;
    }
    for (const root of [...roots, ...(outside ? [outside] : [])]) {
      rmSync(path.join(root, "read-marker.txt"), { force: true });
      rmdirSync(root);
    }
  }
  process.exitCode = 0;
}

for (const [label, parent, editable] of crossDrive ? [] : [
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

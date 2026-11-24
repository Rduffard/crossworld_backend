import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const setup = [
  "$ErrorActionPreference = 'Stop'",
  "$dir = Join-Path $env:LOCALAPPDATA 'Crossworld Operations'",
  "$secret = Read-Host 'Paste the device credential from Manage devices' -AsSecureString",
  "if ([System.Net.NetworkCredential]::new('', $secret).Password -cnotmatch '^[a-f0-9-]{36}[.][a-f0-9]{64}$') { Write-Error 'The credential format is incorrect.' }",
  "New-Item -ItemType Directory -Path $dir -Force | Out-Null",
  "$secret | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $dir 'device.dpapi') -Encoding Ascii",
].join("; ");

export function acquireWorkerLock(endpoint) {
  const key = createHash("sha256").update(homedir().toLowerCase()).digest("hex").slice(0, 24);
  const server = createServer((socket) => socket.destroy());
  return new Promise((resolve, reject) => {
    server.once("error", (error) => reject(error.code === "EADDRINUSE"
      ? new Error("Crossworld Operations is already running. Use its existing window.", { cause: error })
      : error));
    server.listen(endpoint || `\\\\.\\pipe\\crossworld-operations-${key}`, () => {
      resolve(() => new Promise((finish) => server.close(finish)));
    });
  });
}

export function loadCredential({ onboard, register }) {
  const powershell = path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const file = path.join(process.env.LOCALAPPDATA, "Crossworld Operations", "device.dpapi");
  if (register || (onboard && !existsSync(file))) {
    if (!process.stdin.isTTY) throw new Error("Open the Windows launcher interactively to register this device.");
    console.log("Register this PC under Manage devices at https://www.crossworldcreative.com/operations.");
    const result = spawnSync(powershell, ["-NoProfile", "-Command", setup], { stdio: "inherit" });
    if (result.status !== 0) throw new Error("Device setup did not complete. Check the credential and try again.");
    console.log("Device credential saved with Windows DPAPI.");
  }
  const read = [
    "$ErrorActionPreference = 'Stop'",
    "$file = Join-Path $env:LOCALAPPDATA 'Crossworld Operations/device.dpapi'",
    "$secret = Get-Content -LiteralPath $file | ConvertTo-SecureString",
    "[System.Net.NetworkCredential]::new('', $secret).Password",
  ].join("; ");
  try {
    const token = execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", read], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true, timeout: 5000,
    }).trim();
    if (/^[a-f\d-]{36}\.[a-f\d]{64}$/.test(token)) return token;
  } catch {
    // DPAPI decryption requires the same Windows user who saved the credential.
  }
  throw new Error("Could not read this Windows user's device credential. Open Register Crossworld Operations.cmd.");
}

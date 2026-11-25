import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { constants, createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, open, readdir, realpath, rename, rmdir, statfs, unlink } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import artifactRules from "../../src/modules/operations/media-artifacts.js";

const CHUNK = 192 * 1024;
const MAX_SIZE = 100 * 1024 * 1024;
const TTL = 24 * 60 * 60 * 1000;
const idPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/;
const isId = (value) => typeof value === "string" && idPattern.test(value);
const sum = (bytes) => createHash("sha256").update(bytes).digest("hex");
const equivalent = (left, right) => process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
const missing = (error) => error.code === "ENOENT";
const imageExtension = new Map([["image/png", ".png"], ["image/jpeg", ".jpg"], ["image/webp", ".webp"]]);
const videoContainer = new Map([["video/mp4", "mov"], ["video/quicktime", "mov"], ["video/webm", "matroska"]]);
const run = promisify(execFile);
const { GLB_MIME, artifactMime, artifactMaxBytes, validArtifactImport } = artifactRules;

export async function validGlb(handle, size) {
  const header = Buffer.alloc(20);
  if ((await handle.read(header, 0, 20, 0)).bytesRead !== 20 || header.toString("ascii", 0, 4) !== "glTF" ||
      header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== size ||
      header.toString("ascii", 16, 20) !== "JSON") return false;
  const jsonSize = header.readUInt32LE(12);
  if (jsonSize < 4 || jsonSize % 4 !== 0 || jsonSize > 4 * 1024 * 1024 || 20 + jsonSize > size) return false;
  const json = Buffer.alloc(jsonSize);
  if ((await handle.read(json, 0, jsonSize, 20)).bytesRead !== jsonSize) return false;
  let document;
  try { document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json)); }
  catch { return false; }
  if (document?.asset?.version !== "2.0") return false;
  const binOffset = 20 + jsonSize;
  if (binOffset === size) return true;
  const bin = Buffer.alloc(8);
  return (await handle.read(bin, 0, 8, binOffset)).bytesRead === 8 &&
    bin.toString("ascii", 4, 8) === "BIN\0" && bin.readUInt32LE(0) % 4 === 0 &&
    binOffset + 8 + bin.readUInt32LE(0) === size;
}

function safeEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(systemroot|windir|temp|tmp)$/i.test(key)));
}

async function verifyWindowsAcl(directories) {
  if (process.platform !== "win32") return;
  const script = `
    $ErrorActionPreference = 'Stop'
    $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $allowed = @($current, 'S-1-5-18')
    $targetType = [System.Security.Principal.SecurityIdentifier]
    foreach ($directory in ($env:CW_MEDIA_ACL_PATHS | ConvertFrom-Json)) {
      $acl = Get-Acl -LiteralPath $directory
      if ($acl.GetOwner($targetType).Value -notin $allowed) { exit 1 }
      $rules = $acl.GetAccessRules($true, $true, $targetType)
      if (@($rules | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -notin $allowed }).Count) { exit 1 }
    }
  `;
  try {
    const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    await run(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
      { timeout: 5000, windowsHide: true, maxBuffer: 8192, env: { ...safeEnv(), CW_MEDIA_ACL_PATHS: JSON.stringify(directories) } });
  } catch { throw new Error("Media storage ACL must be restricted to the Windows worker account and SYSTEM."); }
}

async function windowsDacl(target) {
  const script = `$ErrorActionPreference = 'Stop'
    (Get-Acl -LiteralPath $env:CW_MEDIA_ACL_PATH).GetSecurityDescriptorSddlForm(
      [System.Security.AccessControl.AccessControlSections]'Owner,Access')`;
  const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const { stdout } = await run(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
    Buffer.from(script, "utf16le").toString("base64")], { timeout: 5000, windowsHide: true, maxBuffer: 8192,
    env: { ...safeEnv(), CW_MEDIA_ACL_PATH: target } });
  if (!stdout.trim()) throw new Error("Unable to attest the job output folder ACL.");
  return stdout.trim();
}

export async function findFfmpeg(preferred, excluded = []) {
  const name = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidates = preferred ? [preferred] : (process.env.PATH || "").split(path.delimiter)
    .filter((entry) => path.isAbsolute(entry)).map((entry) => path.join(entry, name));
  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate)) continue;
    try {
      const file = await realpath(candidate);
      if (excluded.some((root) => {
        const relative = path.relative(root, file);
        return !relative || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
      })) continue;
      const { stdout } = await run(file, ["-version"], { timeout: 1500, windowsHide: true, maxBuffer: 32_768, env: safeEnv() });
      if (stdout.startsWith("ffmpeg version ")) return file;
    } catch { /* FFmpeg is optional. */ }
  }
  return null;
}

async function fileHash(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function directory(target, create) {
  const root = path.parse(target).root;
  if (!root || target === root || /^\\\\/.test(target)) throw new Error("Media requires a dedicated local directory.");
  let current = root;
  for (const component of path.relative(root, target).split(path.sep)) {
    current = path.join(current, component);
    try { await lstat(current); }
    catch (error) {
      if (!missing(error) || !create) throw error;
      await mkdir(current);
    }
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink() || !equivalent(current, await realpath(current))) {
      throw new Error("Media storage includes a redirected directory.");
    }
  }
}

async function regular(file) {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || !equivalent(file, await realpath(file))) {
      throw new Error("Media file is redirected.");
    }
    return info;
  } catch (error) {
    if (!missing(error)) throw error;
    return null;
  }
}

export function detectMime(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) &&
      bytes.toString("ascii", 12, 16) === "IHDR") return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) return "image/jpeg";
  const box = bytes.toString("ascii", 4, 8);
  if (box === "ftyp") {
    const brand = bytes.toString("ascii", 8, 12);
    if (brand === "qt  ") return "video/quicktime";
    if (["isom", "iso2", "mp41", "mp42", "avc1", "dash", "M4V "].includes(brand)) return "video/mp4";
  }
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.subarray(0, 4).equals(Buffer.from("1a45dfa3", "hex")) &&
      bytes.indexOf(Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d])) > 0) return "video/webm";
  return null;
}

export async function localMediaStorage(root, {
  quota = 10 * 1024 ** 3, freeReserve = 256 * 1024 ** 2, workspaceRoots = [], ffmpeg, requirePrivateAcl = false,
} = {}) {
  if (!path.isAbsolute(root) || !Number.isSafeInteger(quota) || quota < CHUNK ||
      !Number.isSafeInteger(freeReserve) || freeReserve < 0) throw new Error("Invalid media storage settings.");
  const resolved = path.resolve(root);
  function contains(parent, child) {
    const relative = path.relative(parent, child);
    return !relative || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
  }
  if (workspaceRoots.some((workspace) => contains(workspace, resolved) || contains(resolved, workspace))) {
    throw new Error("Media storage must be separate from Operations workspaces.");
  }
  const attachments = path.join(resolved, "Attachments");
  const temporary = path.join(resolved, "Temporary");
  const outbox = path.join(resolved, "Outbox");
  await directory(attachments, true);
  await directory(temporary, true);
  await directory(outbox, true);
  let nextCleanup = 0;
  let pending = Promise.resolve();
  let accountedBytes = 0;
  let refreshBytesAt = 0;
  let usage;
  const activeStages = new Set();

  async function scan(base, clean) {
    let size = 0;
    for (const entry of await readdir(base)) {
      if (!idPattern.test(entry)) continue;
      const file = path.join(base, entry);
      const info = await regular(file);
      if (!info) continue;
      if (clean && info.mtimeMs < Date.now() - TTL) await unlink(file);
      else size += info.size;
    }
    return size;
  }

  async function cleanupInterrupted() {
    if (requirePrivateAcl) await verifyWindowsAcl([resolved, attachments, temporary, outbox]);
    await directory(temporary, false);
    await scan(temporary, true);
    for (const name of await readdir(temporary)) {
      if (!/^turn-[\da-z]{6}$/i.test(name)) continue;
      const target = path.join(temporary, name);
      const info = await lstat(target);
      if (activeStages.has(target) || info.mtimeMs >= Date.now() - TTL || !info.isDirectory() || info.isSymbolicLink()) continue;
      await directory(target, false);
      for (const entry of await readdir(target)) {
        if (!/^[1-4]\.(?:png|jpg|webp)$/.test(entry)) continue;
        const file = path.join(target, entry);
        if (await regular(file)) await unlink(file);
      }
      await rmdir(target).catch((error) => { if (error.code !== "ENOTEMPTY") throw error; });
    }
    nextCleanup = Date.now() + 60 * 60 * 1000;
    refreshBytesAt = 0;
  }

  await cleanupInterrupted();

  async function readUsage(force = false) {
    if (force || Date.now() >= refreshBytesAt) {
      const [stored, staging] = await Promise.all([scan(attachments), scan(temporary)]);
      accountedBytes = stored + staging;
      refreshBytesAt = Date.now() + 60_000;
    }
    const disk = await statfs(temporary);
    const freeBytes = disk.bavail * disk.bsize;
    usage = { usedBytes: accountedBytes, quotaBytes: quota, freeBytes, observedAt: Date.now() };
    return freeBytes;
  }

  await readUsage(true);
  async function enforceQuota(added) {
    const freeBytes = await readUsage();
    if (accountedBytes + added > quota || freeBytes - added < freeReserve) {
      throw Object.assign(new Error("Media storage is full."), { code: "MEDIA_FULL" });
    }
  }

  async function invoke(command) {
    if (!isId(command?.id)) throw new Error("Invalid media identifier.");
    await directory(attachments, false);
    await directory(temporary, false);
    if (Date.now() >= nextCleanup) await cleanupInterrupted();
    const file = path.join(attachments, command.id);
    const partial = path.join(temporary, command.id);
    const { kind, offset, length, size } = command;
    if (kind === "discard") {
      const existing = await regular(partial);
      if (existing) {
        await unlink(partial);
        accountedBytes -= existing.size;
      }
      return { ok: true };
    }
    if (!Number.isSafeInteger(size) || size < 12 || size > MAX_SIZE) throw new Error("Invalid media size.");
    if (kind === "write") {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size || offset % CHUNK ||
          typeof command.bytes !== "string" || command.bytes.length > CHUNK * 4 / 3) throw new Error("Invalid media chunk.");
      const bytes = Buffer.from(command.bytes, "base64");
      if (bytes.length !== Math.min(CHUNK, size - offset) || sum(bytes) !== command.sha256) throw new Error("Media checksum mismatch.");
      const existing = await regular(partial);
      const written = existing?.size || 0;
      if (written < offset || written > offset + bytes.length || await regular(file)) throw new Error("Media offset conflict.");
      if (written > offset) {
        const previous = await open(partial, "r");
        try {
          const prefix = Buffer.alloc(written - offset);
          const { bytesRead } = await previous.read(prefix, 0, prefix.length, offset);
          if (bytesRead !== prefix.length || !prefix.equals(bytes.subarray(0, prefix.length))) throw new Error("Media replay conflict.");
        } finally { await previous.close(); }
      }
      if (written === offset + bytes.length) return { offset: written };
      const added = offset + bytes.length - written;
      await enforceQuota(added);
      const handle = await open(partial, existing ? "r+" : "wx", 0o600);
      try {
        let position = written - offset;
        while (position < bytes.length) {
          const { bytesWritten } = await handle.write(bytes, position, bytes.length - position, offset + position);
          if (!bytesWritten) throw new Error("Media write stalled.");
          position += bytesWritten;
        }
        await handle.sync();
      } finally { await handle.close(); }
      accountedBytes += added;
      return { offset: offset + bytes.length };
    }
    if (kind === "finalize") {
      const alreadyFinal = !!await regular(file);
      const source = alreadyFinal ? file : partial;
      if ((await regular(source))?.size !== size) throw new Error("Incomplete media.");
      const handle = await open(source, "r");
      const header = Buffer.alloc(Math.min(size, 4096));
      try { await handle.read(header, 0, header.length, 0); }
      finally { await handle.close(); }
      const mime = detectMime(header);
      if (!mime) throw new Error("Unsupported media format.");
      const sha256 = await fileHash(source);
      if (!alreadyFinal) await rename(partial, file);
      return { mime, sha256 };
    }
    if (kind === "read") {
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 1 ||
          length > CHUNK || offset + length > size || (await regular(file))?.size !== size) throw new Error("Media bytes unavailable.");
      const handle = await open(file, "r");
      try {
        const bytes = Buffer.alloc(length);
        const { bytesRead } = await handle.read(bytes, 0, length, offset);
        if (bytesRead !== length) throw new Error("Media read incomplete.");
        return { bytes: bytes.toString("base64"), sha256: sum(bytes) };
      } finally { await handle.close(); }
    }
    if (kind === "frame") {
      const { derivedId, mime, atMs, sha256 } = command;
      const container = videoContainer.get(mime);
      if (!ffmpeg || !container || !isId(derivedId) || derivedId === command.id ||
          !Number.isSafeInteger(atMs) || atMs < 0 || atMs > 3_600_000 || !/^[\da-f]{64}$/.test(sha256)) {
        throw new Error("Invalid video frame request.");
      }
      if ((await regular(file))?.size !== size || await fileHash(file) !== sha256) throw new Error("Video data unavailable.");
      const output = path.join(attachments, derivedId);
      const existing = await regular(output);
      if (existing) return { mime: "image/jpeg", size: existing.size, sha256: await fileHash(output) };
      const { stdout: image } = await run(ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-max_alloc", "67108864",
        "-filter_threads", "1", "-threads", "1", "-protocol_whitelist", "file,pipe",
        "-ss", (atMs / 1000).toFixed(3), "-f", container,
        ...(container === "mov" ? ["-enable_drefs", "0"] : []),
        "-i", file, "-map", "0:v:0", "-an", "-sn", "-dn", "-frames:v", "1",
        "-vf", "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease",
        "-c:v", "mjpeg", "-q:v", "3", "-threads", "1", "-f", "image2pipe", "pipe:1",
      ], { encoding: "buffer", timeout: 8000, maxBuffer: 3 * 1024 ** 2, windowsHide: true, env: safeEnv() });
      if (image.length < 12 || detectMime(image) !== "image/jpeg") throw new Error("No video frame available at this offset.");
      await enforceQuota(image.length);
      const staging = path.join(temporary, derivedId);
      const stale = await regular(staging);
      if (stale) {
        await unlink(staging);
        accountedBytes -= stale.size;
      }
      const handle = await open(staging, "wx", 0o600);
      try { await handle.writeFile(image); await handle.sync(); }
      finally { await handle.close(); }
      await rename(staging, output);
      accountedBytes += image.length;
      return { mime: "image/jpeg", size: image.length, sha256: sum(image) };
    }
    throw new Error("Unknown media operation.");
  }

  const jobDacls = new Map();
  async function openOutbox(jobId) {
    if (!isId(jobId)) throw new Error("Invalid artifact job.");
    const jobRoot = path.join(outbox, jobId);
    await directory(jobRoot, true);
    if (requirePrivateAcl) await verifyWindowsAcl([outbox, jobRoot]);
    return {
      directory: jobRoot,
      async attestSandboxAcl() {
        if (requirePrivateAcl && process.platform === "win32") {
          await directory(jobRoot, false);
          await verifyWindowsAcl([outbox, attachments, temporary]);
          jobDacls.set(jobId, await windowsDacl(jobRoot));
        }
      },
      async removeIfEmpty() {
        jobDacls.delete(jobId);
        await directory(jobRoot, false);
        await rmdir(jobRoot).catch((error) => {
          if (!["ENOTEMPTY", "ENOENT"].includes(error.code)) throw error;
        });
      },
    };
  }

  async function publish(jobId, name, notify, signal, imported) {
    const mime = artifactMime(name);
    if (!isId(jobId) || !mime) throw new Error("Invalid artifact name.");
    signal.throwIfAborted();
    const jobRoot = path.join(outbox, jobId);
    if (!imported) await directory(jobRoot, false);
    await directory(temporary, false);
    await directory(attachments, false);
    if (requirePrivateAcl) {
      await verifyWindowsAcl([outbox, attachments, temporary]);
      if (!imported) {
        const attested = jobDacls.get(jobId);
        if (!attested) await verifyWindowsAcl([jobRoot]);
        else if (await windowsDacl(jobRoot) !== attested) throw new Error("Job output folder ACL changed after sandbox verification.");
      }
    }
    const source = imported ? path.join(imported.root, imported.file.source) : path.join(jobRoot, name);
    if (imported) await directory(path.dirname(source), false);
    const info = await regular(source);
    if (!info || info.size < 12 || info.size > artifactMaxBytes(mime)) throw new Error("Artifact is unavailable or exceeds the size limit.");
    const sourceHandle = await open(source, "r");
    let staging;
    try {
      const opened = await sourceHandle.stat();
      if (opened.ino !== info.ino || opened.dev !== info.dev || opened.size !== info.size || opened.nlink !== 1) {
        throw new Error("Artifact source changed.");
      }
      const header = Buffer.alloc(Math.min(info.size, 4096));
      await sourceHandle.read(header, 0, header.length, 0);
      if (!(mime === GLB_MIME ? await validGlb(sourceHandle, info.size) : detectMime(header) === mime)) {
        throw new Error("Artifact type does not match its filename.");
      }
      const streamOptions = { start: 0, end: info.size - 1, autoClose: false, signal };
      const hash = createHash("sha256");
      for await (const bytes of sourceHandle.createReadStream(streamOptions)) hash.update(bytes);
      const sha256 = hash.digest("hex");
      if (imported && (imported.file.sha256 !== sha256 || imported.file.size !== info.size)) {
        throw new Error("Source bytes do not match the authorized size and hash.");
      }
      const metadata = { name, mime, size: info.size, sha256 };
      const allocation = await notify("reserve", metadata);
      if (!isId(allocation?.id)) throw new Error("Artifact reservation was declined.");
      const final = path.join(attachments, allocation.id);
      const existing = await regular(final);
      if (existing) {
        if (existing.size !== info.size || await fileHash(final) !== sha256) throw new Error("Stored artifact integrity check failed.");
      } else {
        await enforceQuota(info.size);
        staging = path.join(temporary, randomUUID());
        const output = await open(staging, "wx", 0o600);
        try {
          for await (const bytes of sourceHandle.createReadStream(streamOptions)) await output.writeFile(bytes);
          await output.sync();
        } finally { await output.close(); }
        if ((await regular(staging))?.size !== info.size || await fileHash(staging) !== sha256) {
          throw new Error("Artifact bytes changed during publication.");
        }
        const check = await open(staging, "r");
        try {
          await check.read(header, 0, header.length, 0);
          if (!(mime === GLB_MIME ? await validGlb(check, info.size) : detectMime(header) === mime)) {
            throw new Error("Stored artifact type changed.");
          }
        } finally { await check.close(); }
        signal.throwIfAborted();
        await rename(staging, final);
        staging = undefined;
        accountedBytes += info.size;
      }
      signal.throwIfAborted();
      const result = await notify("finish", metadata);
      if (result?.id !== allocation.id || result.state !== "ready") throw new Error("Artifact publication did not finish.");
      return { id: result.id, name: result.name };
    } finally {
      await sourceHandle.close();
      if (staging && await regular(staging)) await unlink(staging);
    }
  }

  return {
    protectedPaths: [resolved, attachments, temporary, outbox],
    importArtifact(jobId, root, file, notify, signal) {
      if (!validArtifactImport([file])) throw new Error("Invalid Workshop artifact import.");
      return publish(jobId, file.name, notify, signal, { root, file });
    },
    videoFrames: !!ffmpeg,
    latestUsage() {
      if (Date.now() - (usage?.observedAt || 0) >= 120_000) {
        // Reconcile external changes on a bounded cadence and independently of model turns.
        pending = pending.then(async () => {
          if (Date.now() >= nextCleanup) await cleanupInterrupted();
          await readUsage(true);
        }).catch(() => { usage = undefined; });
      }
      if (!usage) return;
      return { ...usage, usedBytes: Math.max(0, accountedBytes) };
    },
    execute(command) {
      const result = pending.then(() => invoke(command));
      pending = result.catch(() => { refreshBytesAt = 0; });
      return result;
    },
    openOutbox,
    publishArtifact(jobId, name, notify, signal) {
      const result = pending.then(() => publish(jobId, name, notify, signal));
      pending = result.catch(() => { refreshBytesAt = 0; });
      return result;
    },
    async stageImages(entries) {
      if (entries.length > 4) throw new Error("Too many image inputs.");
      await directory(temporary, false);
      await directory(attachments, false);
      const jobDirectory = await mkdtemp(path.join(temporary, "turn-"));
      activeStages.add(jobDirectory);
      const files = [];
      const cleanup = async () => {
        try {
          await directory(jobDirectory, false);
          for (const file of files) {
            if (await regular(file)) await unlink(file);
          }
          await rmdir(jobDirectory);
        } finally { activeStages.delete(jobDirectory); }
      };
      try {
        let stagedSize = 0;
        for (const { id, mime, size, sha256 } of entries) {
          const extension = imageExtension.get(mime);
          if (!isId(id) || !extension || !Number.isSafeInteger(size) || size < 12 ||
              size > 12 * 1024 * 1024 || !/^[\da-f]{64}$/.test(sha256)) throw new Error("Invalid image input.");
          const source = path.join(attachments, id);
          const target = path.join(jobDirectory, `${files.length + 1}${extension}`);
          if ((await regular(source))?.size !== size) throw new Error("Image input is unavailable.");
          const disk = await statfs(temporary);
          stagedSize += size;
          if (stagedSize > quota || disk.bavail * disk.bsize - size < freeReserve) throw new Error("Media storage is full.");
          files.push(target);
          await copyFile(source, target, constants.COPYFILE_EXCL);
          if (await fileHash(target) !== sha256) throw new Error("Image input integrity check failed.");
        }
        return { files, cleanup };
      } catch (error) {
        await cleanup().catch(() => {});
        throw error;
      }
    },
  };
}

export async function pollMedia({ send, signal, instance, storage, draining = () => false }) {
  let completed = {};
  while (!signal.aborted) {
    let delay = 50;
    try {
      const drain = draining();
      if (drain && !completed.replyId) return;
      const command = await send("/media/exchange", { instance, ...completed, ...(drain ? { draining: true } : {}) });
      completed = {};
      if (command && isId(command.requestId)) {
        const reply = await storage.execute(command).catch((error) => ({ state: error.code === "MEDIA_FULL" ? "full" : "unavailable" }));
        completed = { replyId: command.requestId, reply };
        delay = 0;
      }
    } catch { delay = 2000; }
    if (delay) await sleep(delay, undefined, { signal }).catch(() => {});
  }
}

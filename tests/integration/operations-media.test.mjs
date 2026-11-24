import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, mkdtemp, readFile, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { localMediaStorage, detectMime } from "../../tools/operations-worker/media-storage.mjs";
import media from "../../src/modules/operations/media.js";

const { CHUNK, parseRange } = media;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fixture = await mkdtemp(path.join(tmpdir(), "cw-private-media-"));
const storage = await localMediaStorage(fixture, { quota: CHUNK, freeReserve: 0 });
const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/V6sAAAAASUVORK5CYII=";
const pixel = Buffer.from(base64, "base64");
const id = randomUUID();
const write = { kind: "write", id, offset: 0, size: pixel.length, bytes: base64, sha256: hash(pixel) };
const temporary = path.join(fixture, "Temporary");
const badId = randomUUID();
const jobId = randomUUID();
const artifactId = randomUUID();

test.after(async () => {
  for (const folder of ["Attachments", "Temporary", "Outbox"]) {
    for (const name of [id, badId, artifactId]) await unlink(path.join(fixture, folder, name)).catch(() => {});
    if (folder === "Outbox") {
      for (const name of ["preview.png", "bad.mp4", "linked.png"]) await unlink(path.join(fixture, folder, jobId, name)).catch(() => {});
      await rmdir(path.join(fixture, folder, jobId)).catch(() => {});
    }
    await rmdir(path.join(fixture, folder)).catch(() => {});
  }
  await rmdir(path.join(fixture, "redirected")).catch(() => {});
  await rmdir(fixture).catch(() => {});
});

test("publishes only a safe, matching file from the opted-in job's outbox", async () => {
  const outbox = await storage.openOutbox(jobId);
  const signal = new AbortController().signal;
  const prepared = [];
  const notify = async (phase, metadata) => {
    prepared.push([phase, metadata]);
    return { id: artifactId, name: metadata.name, state: phase === "finish" ? "ready" : "publishing" };
  };
  await assert.rejects(storage.openOutbox("../escape"), /Invalid/);
  await assert.rejects(storage.publishArtifact(jobId, "..\\preview.png", notify, signal), /name/);
  await assert.rejects(storage.publishArtifact(jobId, "CON.png", notify, signal), /name/);
  await writeFile(path.join(outbox.directory, "bad.mp4"), pixel);
  await assert.rejects(storage.publishArtifact(jobId, "bad.mp4", notify, signal), /type/);
  const original = path.join(outbox.directory, "preview.png");
  await writeFile(original, pixel);
  const linked = path.join(outbox.directory, "linked.png");
  await link(original, linked);
  await assert.rejects(storage.publishArtifact(jobId, "linked.png", notify, signal), /redirected/);
  await unlink(linked);
  assert.equal(prepared.length, 0);
  assert.deepEqual(await storage.publishArtifact(jobId, "preview.png", notify, signal), { id: artifactId, name: "preview.png" });
  const expected = { name: "preview.png", mime: "image/png", size: pixel.length, sha256: hash(pixel) };
  assert.deepEqual(prepared, [["reserve", expected], ["finish", expected]]);
  await outbox.removeIfEmpty();
  assert.deepEqual(await readFile(original), pixel);
  assert.deepEqual(await readFile(path.join(fixture, "Attachments", artifactId)), pixel);
});

test("validates media and byte ranges", () => {
  assert.equal(detectMime(pixel), "image/png");
  assert.equal(detectMime(Buffer.from("<svg>test</svg>")), null);
  assert.deepEqual(parseRange("bytes=3-8", 5), { start: 3, end: 4 });
  assert.deepEqual(parseRange("bytes=-2", 5), { start: 3, end: 4 });
  assert.equal(parseRange("bytes=1-2,3-4", 5), null);
  assert.equal(parseRange("bytes=5-", 5), null);
});

test("bounds writes and replays and stages only verified ready images", async () => {
  await assert.rejects(storage.execute({ ...write, id: "..\\outside" }), /identifier/);
  await assert.rejects(storage.execute({ ...write, sha256: "0".repeat(64) }), /checksum/);
  assert.deepEqual(await storage.execute(write), { offset: pixel.length });
  assert.deepEqual(await storage.execute(write), { offset: pixel.length });
  const changed = Buffer.from(pixel).fill(0, 20);
  await assert.rejects(storage.execute({ ...write, bytes: changed.toString("base64"), sha256: hash(changed) }), /replay/);
  const tooMuch = Buffer.alloc(CHUNK);
  await assert.rejects(storage.execute({ ...write, id: randomUUID(), size: CHUNK, bytes: tooMuch.toString("base64"),
    sha256: hash(tooMuch) }), /storage is full/);
  const bad = { ...write, id: badId };
  changed[0] = 1;
  bad.bytes = changed.toString("base64");
  bad.sha256 = hash(changed);
  await storage.execute(bad);
  await assert.rejects(storage.execute({ ...bad, kind: "finalize" }), /Unsupported/);
  await storage.execute({ kind: "discard", id: bad.id });
  const ready = await storage.execute({ kind: "finalize", id, size: pixel.length });
  assert.deepEqual(ready, { mime: "image/png", sha256: hash(pixel) });
  assert.deepEqual(await storage.execute({ kind: "finalize", id, size: pixel.length }), ready);
  const bytes = pixel.subarray(2, 5);
  assert.deepEqual(await storage.execute({ kind: "read", id, size: pixel.length, offset: 2, length: 3 }),
    { bytes: bytes.toString("base64"), sha256: hash(bytes) });
  await assert.rejects(storage.stageImages([{ ...ready, id, size: pixel.length, sha256: "0".repeat(64) }]), /integrity/);
  const staged = await storage.stageImages([{ ...ready, id, size: pixel.length }]);
  assert.equal(staged.files.length, 1);
  assert.equal(path.extname(staged.files[0]), ".png");
  await staged.cleanup();
  await assert.rejects(lstat(staged.files[0]), { code: "ENOENT" });
  const destination = path.join(fixture, "redirected");
  await mkdir(destination);
  const joined = path.join(temporary, "link");
  await symlink(destination, joined, "junction");
  await assert.rejects(localMediaStorage(path.join(joined, "outside")), /redirected/);
  await rmdir(joined);
  await assert.rejects(localMediaStorage(path.join(fixture, "inside"), { workspaceRoots: [fixture] }), /separate/);
});

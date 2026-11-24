import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { findFfmpeg, localMediaStorage, pollMedia } from "./media-storage.mjs";
import { backendClient, verifyMediaOutbox } from "./worker.mjs";
import { AppServer, discoverCodex, runTurn } from "./codex.mjs";
import { workspacePaths } from "./profiles.mjs";
import media from "../../src/modules/operations/media.js";

const { CHUNK } = media;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function verifyOutput({ api, send, db, device, instance, storage, pixel, outputJobs, files, fetchMedia }) {
  const name = "test-card.png";
  const metadata = { name, size: pixel.length, mime: "image/png", sha256: hash(pixel) };
  const submit = (body) => api("/jobs", { method: "POST", body });
  const request = { id: randomUUID(), hostId: device.id, workspace: "workshop", model: "gpt-6.2-sol",
    profile: "workshop", effort: "low",
    prompt: "A disposable PNG was prepared specifically for this turn and is already in the assigned artifact directory. Return it now by calling operations_publish_artifact with the exact argument {\"filename\":\"test-card.png\"}. Use the tool directly. Do not call the shell or open files.",
    outputMedia: true };
  const notify = (id, phase, content = metadata) => send(`/media/jobs/${id}/artifacts`, { instance, phase, ...content });
  await assert.rejects(notify(randomUUID(), "reserve"), { status: 403 });
  assert.equal((await submit({ ...request, profile: "read-only" }))[0], 400);
  assert.equal((await submit(request))[0], 201);
  assert.equal((await submit(request))[0], 200);
  assert.equal((await submit({ ...request, outputMedia: false }))[0], 409);
  const job = await send("/claim", { instance });
  assert.equal(job._id, request.id);
  assert.equal(job.outputMedia, true);
  await assert.rejects(notify(job._id, "reserve", { ...metadata, name: "../test-card.png" }), { status: 400 });
  await assert.rejects(notify(job._id, "reserve", { ...metadata, mime: "video/mp4" }), { status: 400 });
  await assert.rejects(notify(job._id, "finish"), { status: 409 });
  const outbox = await storage.openOutbox(job._id);
  outputJobs.push(job._id);
  await writeFile(path.join(outbox.directory, name), pixel);
  const signal = AbortSignal.timeout(45000);
  let published;
  const publication = async (filename) => {
    published = await storage.publishArtifact(job._id, filename, (phase, content) => notify(job._id, phase, content), signal);
    return published;
  };
  if (process.argv.includes("--media-output-live")) {
    const codex = discoverCodex();
    assert.equal(await verifyMediaOutbox(codex.exe, storage, [workspacePaths.workshop]), true);
    const cwd = workspacePaths.workshop;
    const lease = setInterval(() => {
      void send(`/jobs/${job._id}/sync`, { instance, offset: 0, events: [] }).catch(() => {});
    }, 4000);
    let finalResponse = "";
    try {
      const result = await runTurn(new AppServer(codex.exe, cwd), job, cwd, (view, _label, text) => {
        if (view === "response") finalResponse += text;
      }, signal, undefined, {
        root: cwd, roots: [cwd, outbox.directory], artifactDir: outbox.directory, publishArtifact: publication,
        protectedDirectories: storage.protectedPaths,
      });
      assert.equal(result.status, "completed", result.error);
    } finally { clearInterval(lease); }
    assert.ok(published, "Live Codex must use the actual typed publication tool. Fixture response: " + finalResponse.slice(0, 500));
    console.log("Live Codex artifact tool, exact native sandbox output folder, and private relay publication PASS");
  } else await publication(name);
  files.push(published.id);
  const [, detail] = await api(`/jobs/${request.id}?compact=true`);
  assert.deepEqual(detail.mediaOutputs, [{ ...published, mime: "image/png", size: pixel.length }]);
  const read = await fetchMedia(`/${published.id}/content`);
  assert.equal(read.status, 200);
  assert.deepEqual(Buffer.from(await read.arrayBuffer()), pixel);
  assert.deepEqual(await readFile(path.join(outbox.directory, name)), pixel);
  await assert.rejects(notify(job._id, "reserve", { ...metadata, sha256: "0".repeat(64) }), { status: 409 });
  await db.collection("operations_jobs").updateOne({ _id: job._id }, { $set: { leaseUntil: new Date(0) } });
  await assert.rejects(notify(job._id, "reserve"), { status: 403 });
  console.log("Worker artifacts opt-in, lease, replay and path validation, scoped publication, owner preview and original preservation PASS");
}

export async function verifyMedia({ api, base, bearer, db, other }) {
  const [status, device] = await api("/hosts", { method: "POST", body: { label: "Private media fixture" } });
  assert.equal(status, 201);
  const instance = randomUUID();
  const signal = new AbortController();
  const root = await mkdtemp(path.join(tmpdir(), "cw-relay-media-"));
  const testVision = process.argv.includes("--media-vision-live");
  const testFrames = testVision || process.argv.includes("--media-video-live");
  const ffmpeg = testFrames ? await findFfmpeg(process.env.OPERATIONS_FFMPEG_EXE) : undefined;
  if (testFrames) assert.ok(ffmpeg, "FFmpeg must be installed for --media-video-live");
  const storage = await localMediaStorage(root, { quota: CHUNK * 3, freeReserve: 0, ffmpeg });
  const send = backendClient(base, device.token);
  const heartbeat = () => send("/heartbeat", { instance, efforts: ["low"], profiles: ["read-only", "workshop"], media: true,
    mediaVideoFrames: storage.videoFrames, mediaOutput: true, mediaUsage: storage.latestUsage() });
  const pending = pollMedia({ send, signal: signal.signal, instance, storage });
  const files = [];
  const outputJobs = [];
  const clipPath = path.join(root, "fixture.mp4");
  const json = (route, method, body) => api(`/media${route}`, { method, body });
  const fetchMedia = (route, options = {}) => fetch(`${base}/operations/media${route}`, {
    ...options, headers: { Authorization: `Bearer ${bearer}`, ...options.headers },
  });
  const upload = (id, offset, bytes) => fetchMedia(`/${id}/chunks/${offset}`, {
    method: "PUT", body: bytes, headers: { "Content-Type": "application/octet-stream" },
  });
  const prefix = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/V6sAAAAASUVORK5CYII=", "base64");
  // Opaque bytes exercise transport across a chunk boundary. Live format ingestion is verified separately.
  const bytes = Buffer.concat([prefix, Buffer.alloc(CHUNK, 42)]);
  let heartbeatTimer;
  try {
    await heartbeat();
    heartbeatTimer = setInterval(() => { void heartbeat().catch(() => {}); }, 4000);
    assert.equal((await api("/media", { user: null }))[0], 401);
    assert.equal((await api("/media", { user: other }))[0], 403);
    assert.equal((await json("", "GET"))[1].hosts[0].online, true);
    const reserve = (name, size, hostId = device.id) => json("", "POST", { hostId, name, size });
    assert.equal((await reserve("../hidden", bytes.length))[0], 400);
    assert.equal((await reserve("bad" + String.fromCharCode(0xd800), bytes.length))[0], 400);
    assert.equal((await reserve("preview.png", bytes.length, [device.id]))[0], 400);
    const [created, record] = await reserve("preview.png", bytes.length);
    assert.equal(created, 201);
    const id = record._id;
    files.push(id);
    assert.equal((await fetchMedia(`/${id}/content`)).status, 409);
    assert.equal((await upload(id, CHUNK, bytes.subarray(CHUNK))).status, 409);
    assert.equal((await upload(id, 0, bytes.subarray(0, CHUNK))).status, 200);
    assert.equal((await json(`/${id}`, "GET"))[1].offset, CHUNK);
    assert.equal((await json(`/${id}/finalize`, "POST", {}))[0], 409);
    assert.equal((await upload(id, CHUNK, bytes.subarray(CHUNK))).status, 200);
    const [finalized, ready] = await json(`/${id}/finalize`, "POST", {});
    assert.equal(finalized, 200);
    assert.equal(ready.sha256, hash(bytes));
    assert.equal(ready.mime, "image/png");

    const full = await fetchMedia(`/${id}/content`);
    assert.equal(full.status, 200);
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
    const range = await fetchMedia(`/${id}/content`, { headers: { Range: `bytes=${CHUNK - 3}-${CHUNK + 5}` } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get("Content-Range"), `bytes ${CHUNK - 3}-${CHUNK + 5}/${bytes.length}`);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(CHUNK - 3, CHUNK + 6));
    assert.equal((await fetchMedia(`/${id}/content`, { headers: { Range: "bytes=0-1,3-5" } })).status, 416);
    assert.equal((await fetch(`${base}/operations/media/${id}/content`)).status, 401);
    assert.equal((await api(`/media/${id}`, { user: other }))[0], 403);

    const [, cancelled] = await reserve("cancel.png", prefix.length);
    files.push(cancelled._id);
    assert.equal((await upload(cancelled._id, 0, prefix)).status, 200);
    assert.equal((await json(`/${cancelled._id}`, "DELETE"))[0], 204);
    assert.equal((await json(`/${cancelled._id}`, "GET"))[0], 404);
    assert.equal((await json(`/${id}`, "DELETE"))[0], 409);

    const submit = (ids, prompt = "Report the image contents.", parentId) => api("/jobs", { method: "POST", body: {
      id: randomUUID(), hostId: device.id, workspace: "development", model: "gpt-6.2-sol", effort: "low",
      prompt, attachmentIds: ids, parentId,
    } });
    assert.equal((await submit([randomUUID()]))[0], 409);
    assert.equal((await submit([id, id]))[0], 409);
    const [jobStatus, accepted] = await submit([id]);
    assert.equal(jobStatus, 201);
    const claimed = await send("/claim", { instance });
    assert.equal(claimed._id, accepted._id);
    assert.deepEqual(claimed.mediaInputs, [{ id, mime: ready.mime, size: bytes.length, sha256: ready.sha256 }]);
    assert.equal((await api(`/jobs/${accepted._id}?compact=true`))[1].mediaInputs[0].id, id);
    await send(`/jobs/${claimed._id}/sync`, { instance, offset: 0, events: [],
      result: { status: "completed", threadId: randomUUID(), error: "" } });
    await verifyOutput({ api, send, db, device, instance, storage, pixel: prefix, outputJobs, files, fetchMedia });
    await heartbeat();

    if (process.argv.includes("--media-image-live")) {
      const imagePath = path.resolve("..", "docs", "nexus-validation", "visual-checklist-fixture.png");
      const screenshot = await readFile(imagePath);
      const [status, fixture] = await reserve("visual-checklist-fixture.png", screenshot.length);
      assert.equal(status, 201);
      files.push(fixture._id);
      for (let offset = 0; offset < screenshot.length; offset += CHUNK) {
        assert.equal((await upload(fixture._id, offset, screenshot.subarray(offset, offset + CHUNK))).status, 200);
      }
      const [, saved] = await json("/" + fixture._id + "/finalize", "POST", {});
      assert.equal(saved.mime, "image/png");
      const preview = await fetchMedia("/" + fixture._id + "/content");
      assert.deepEqual(Buffer.from(await preview.arrayBuffer()), screenshot);

      const cwd = process.cwd();
      const exe = discoverCodex().exe;
      async function observe(job, imagePaths = []) {
        let answer = "";
        const result = await runTurn(new AppServer(exe, cwd), job, cwd, (view, _label, value) => {
          if (view === "response") answer += value;
        }, AbortSignal.timeout(120_000), undefined, { imagePaths, strictReadOnly: true });
        assert.equal(result.status, "completed", result.error);
        const events = answer.match(/[\s\S]{1,3000}/gu).map(text => ({ view: "response", label: "Final response", text }));
        await send("/jobs/" + job._id + "/sync", { instance, offset: 0, events, result });
        return { answer, threadId: result.threadId };
      }
      const [queued, receipt] = await submit([fixture._id],
        "Read the attached screenshot. Repeat its main heading, checklist title, completion count, and all items. Do not call tools.");
      assert.equal(queued, 201);
      const job = await send("/claim", { instance });
      assert.equal(job._id, receipt._id);
      const staged = await storage.stageImages(job.mediaInputs);
      try {
        const first = await observe(job, staged.files);
        for (const phrase of [/Operations visual smoke test/i, /Harbor readiness checklist/i, /2 (?:of|out of) 3/i, /beacon log/i, /north gate/i, /amber marker report/i]) {
          assert.match(first.answer, phrase);
        }
        const [continuation, next] = await submit([], "What was the pending checklist item? Answer from our conversation.", job._id);
        assert.equal(continuation, 201);
        const followUp = await send("/claim", { instance });
        assert.equal(followUp._id, next._id);
        const second = await observe(followUp);
        assert.equal(second.threadId, first.threadId);
        assert.match(second.answer, /amber marker report/i);
      } finally { await staged.cleanup(); }
      const [registered] = await api("/references", { method: "POST", body: {
        id: randomUUID(), mediaId: fixture._id, name: "Visual checklist fixture", category: "technical",
        source: "Nexus disposable screenshot", description: "Checklist for image-ingestion verification", license: "Studio fixture",
        tags: ["nexus"],
      } });
      assert.equal(registered, 201);
      console.log("Private PNG upload, preview, real checklist reading, resumed reply, and reference registration PASS");
    }

    if (ffmpeg) {
      await promisify(execFile)(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi",
        "-i", "color=c=blue:s=320x240:r=8,drawbox=x=220:y=10:w=80:h=55:color=yellow:t=fill",
        "-t", "1", "-c:v", "mpeg4", "-threads", "1", clipPath],
      { timeout: 5000, windowsHide: true });
      const clip = await readFile(clipPath);
      const [, video] = await reserve("fixture.mp4", clip.length);
      files.push(video._id);
      assert.equal((await upload(video._id, 0, clip)).status, 200);
      assert.equal((await json(`/${video._id}/finalize`, "POST", {}))[1].mime, "video/mp4");
      const [created, frame] = await json(`/${video._id}/frames`, "POST", { atMs: 375 });
      assert.equal(created, 201);
      files.push(frame._id);
      assert.deepEqual(frame.derivedFrom, { id: video._id, requestedOffsetMs: 375 });
      assert.equal(frame.mime, "image/jpeg");
      const jpeg = await fetchMedia(`/${frame._id}/content`);
      assert.equal(jpeg.status, 200);
      assert.equal(hash(Buffer.from(await jpeg.arrayBuffer())), frame.sha256);
      const [, replay] = await json(`/${video._id}/frames`, "POST", { atMs: 375 });
      assert.equal(replay._id, frame._id);
      const [frameJobStatus, frameJob] = await submit([frame._id],
        "Describe the attached visual alone in one sentence. State the background, shape, color and position. Do not call tools.");
      assert.equal(frameJobStatus, 201);
      console.log("Local FFmpeg controlled MP4 frame extraction, derived JPEG integrity and image assignment PASS");
      if (testVision) {
        await send(`/jobs/${claimed._id}/sync`, {
          instance, offset: 0, events: [], result: { status: "completed", error: "" },
        });
        await send("/heartbeat", { instance, efforts: ["low"], media: true, mediaVideoFrames: true });
        const vision = await send("/claim", { instance });
        assert.equal(vision._id, frameJob._id);
        const staged = await storage.stageImages(vision.mediaInputs);
        try {
          const cwd = process.cwd();
          let answer = "";
          let commands = 0;
          const result = await runTurn(new AppServer(discoverCodex().exe, cwd), vision, cwd, (view, label, value) => {
            if (view === "response") answer += value;
            if (label === "Command started") commands++;
          }, AbortSignal.timeout(45000), undefined, { imagePaths: staged.files });
          assert.equal(result.status, "completed", result.error);
          assert.equal(commands, 0);
          assert.match(answer, /blue/i);
          assert.match(answer, /yellow/i);
          assert.match(answer, /rectangle/i);
          await send("/heartbeat", { instance, efforts: ["low"], media: true, mediaVideoFrames: true });
          await send(`/jobs/${vision._id}/sync`, {
            instance, offset: 0, events: [{ view: "response", label: "Final response", text: answer }],
            result: { status: "completed", error: "", threadId: result.threadId },
          });
          const [, detail] = await api(`/jobs/${vision._id}`);
          assert.equal(detail.events[0].text, answer);
          console.log("Private video upload → extracted frame → scoped staging → real Codex visual response → persisted conversation PASS");
        } finally {
          await staged.cleanup();
        }
      }
    }

    await unlink(path.join(root, "Attachments", id));
    assert.equal((await fetchMedia(`/${id}/content`)).status, 503);
    clearInterval(heartbeatTimer);
    await db.collection("operations_hosts").updateOne({ _id: device.id }, { $set: { lastSeen: new Date(0) } });
    assert.equal((await json("", "GET"))[1].hosts[0].online, false);
    assert.equal((await fetchMedia(`/${id}/content`)).status, 503);
    console.log("Private media authorization, chunk resume, cancellation, range retrieval, scoped image manifests, missing file and offline device PASS");
  } finally {
    clearInterval(heartbeatTimer);
    signal.abort();
    await pending;
    await api(`/hosts/${device.id}`, { method: "DELETE" });
    // This helper runs only inside the random integration database.
    await db.collection("operations_hosts").deleteOne({ _id: device.id });
    await db.collection("operations_jobs").deleteMany({ hostId: device.id });
    await db.collection("operations_media").deleteMany({ hostId: device.id });
    await unlink(clipPath).catch(() => {});
    for (const jid of outputJobs) {
      const outbox = path.join(root, "Outbox", jid);
      await unlink(path.join(outbox, "test-card.png")).catch(() => {});
      await rmdir(outbox).catch(() => {});
    }
    for (const directory of ["Attachments", "Temporary", "Outbox"]) {
      for (const id of files) await unlink(path.join(root, directory, id)).catch(() => {});
      await rmdir(path.join(root, directory)).catch(() => {});
    }
    await rmdir(root).catch(() => {});
  }
}

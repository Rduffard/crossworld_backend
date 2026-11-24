import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import path from "node:path";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, rmdirSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { AppServer, discoverCodex, runTurn } from "./codex.mjs";
import { backendClient, runWorker } from "./worker.mjs";
import { acquireWorkerLock } from "./windows.mjs";
import { protectedDirectories, workspacePaths as workspaces } from "./profiles.mjs";

const fullAccessLive = process.argv.includes("--full-access-live");
const live = process.argv.includes("--live") && !fullAccessLive;
const liveWorkshop = live || process.argv.includes("--workshop-live");
const liveCancellation = process.argv.includes("--cancel-live");
const liveInteractive = process.argv.includes("--interactive-live");
const directGit = process.argv.includes("--direct-git-live");
const owner = "1".repeat(24);
const other = "2".repeat(24);
const jwtSecret = randomUUID() + randomUUID();
process.env.JWT_SECRET = jwtSecret;
process.env.OPERATIONS_OWNER_ID = owner;
const { createRouter } = await import("../../src/modules/operations/routes.js");
if (process.platform === "win32") {
  const endpoint = `\\\\.\\pipe\\crossworld-operations-test-${randomUUID()}`;
  const release = await acquireWorkerLock(endpoint);
  try {
    await assert.rejects(acquireWorkerLock(endpoint), /already running/);
  } finally {
    await release();
  }
  const reopened = await acquireWorkerLock(endpoint);
  await reopened();
  console.log("Worker single-instance lock PASS");
}
const database = `crossworld_operations_test_${randomUUID().replaceAll("-", "")}`;
const db = await mongoose.createConnection("mongodb://127.0.0.1:27017", {
  dbName: database, serverSelectionTimeoutMS: 4000,
}).asPromise();
const app = express();
app.use("/operations", createRouter({
  db: () => db.db,
  reportError: console.error,
}));
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const controller = new AbortController();
let worker;
let staging;
let gitFixture;
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd,
  "-c", "user.name=Operations Test", "-c", "user.email=ops@example.invalid", ...args,
], { encoding: "utf8", env: {
  PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "NUL",
} }).trim();

async function api(route, { user = owner, method = "GET", body } = {}) {
  const headers = { "content-type": "application/json" };
  if (user) headers.authorization = `Bearer ${jwt.sign({ _id: user }, jwtSecret)}`;
  const reply = await fetch(`${base}/operations${route}`, { method, headers, body: JSON.stringify(body) });
  const result = await reply.text();
  return [reply.status, result && JSON.parse(result.startsWith("{") || result.startsWith("[") ? result : "null")];
}

async function until(predicate, max = 15_000) {
  const end = Date.now() + max;
  while (Date.now() < end) {
    const result = await predicate();
    if (result) return result;
    await sleep(150);
  }
  throw new Error("Diagnostic timed out.");
}

try {
  delete process.env.OPERATIONS_OWNER_ID;
  assert.equal((await api("/hosts"))[0], 404);
  process.env.OPERATIONS_OWNER_ID = owner;
  assert.equal((await api("/hosts", { user: other }))[0], 403);
  assert.equal((await api("/jobs", { user: null }))[0], 401);
  assert.equal((await fetch(`${base}/operations/worker/claim`, { method: "POST" })).status, 401);
  const [registered, device] = await api("/hosts", { method: "POST", body: { label: "Diagnostic Windows host" } });
  assert.equal(registered, 201);
  const host = await db.db.collection("operations_hosts").findOne({ _id: device.id });
  assert.equal(host.digest.length, 64);
  assert.ok(!JSON.stringify(host).includes(device.token));
  assert.ok(!JSON.stringify(await api("/hosts")).includes(host.digest));
  process.env.OPERATIONS_LOOPBACK_TEST = "1";
  const send = backendClient(base, device.token);
  let offline = false;
  let launchCount = 0;
  let lostClaim = false;
  let lostSync = false;
  let real;
  if (liveWorkshop || liveCancellation || liveInteractive || directGit || fullAccessLive) real = discoverCodex();
  if (liveInteractive) {
    staging = mkdtempSync(path.join(workspaces.development, "cw-interactive-test-"));
    mkdirSync(path.join(staging, "scratch"));
  }
  if (directGit) {
    gitFixture = mkdtempSync(path.join(workspaces.development, "cw-direct-git-test-"));
    git(gitFixture, "init", "-b", "main");
    git(gitFixture, "config", "user.name", "Operations Test");
    git(gitFixture, "config", "user.email", "ops@example.invalid");
    writeFileSync(path.join(gitFixture, "probe.txt"), "original\n");
    git(gitFixture, "add", "probe.txt");
    git(gitFixture, "commit", "-m", "Disposable base");
  }
  worker = runWorker({
    signal: controller.signal, efforts: ["low"], token: device.token,
    profiles: ["read-only", "development", "workshop", ...(fullAccessLive ? ["full-access"] : [])],
    send: async (endpoint, body) => {
      if (offline) throw new Error("Simulated connection loss");
      const result = await send(endpoint, body);
      if (!lostClaim && endpoint === "/claim" && result) {
        lostClaim = true;
        throw new Error("Lost claim response");
      }
      if (!lostSync && endpoint.endsWith("/sync") && body.events.length) {
        lostSync = true;
        throw new Error("Lost sync acknowledgement");
      }
      return result;
    },
    execute: async (job, record, signal, control) => {
      launchCount++;
      if (fullAccessLive && job.profile === "full-access") {
        return runTurn(new AppServer(real.exe, workspaces[job.workspace]), job, workspaces[job.workspace], record, signal, control, {
          fullAccess: true, localMcp: true,
        });
      }
      if (job.prompt.startsWith("direct-git-probe")) {
        return runTurn(new AppServer(real.exe, gitFixture), job, gitFixture, record, signal, control, {
          root: gitFixture, gitRoots: [gitFixture], supervised: true, protectedDirectories, localMcp: true,
        });
      }
      if (job.prompt.startsWith("extended-transcript-probe:")) {
        assert.equal(job.prompt, "extended-transcript-probe:" + "🧪".repeat(52_000));
        for (let index = 0; index < 415; index++) record("execution", "Mock command output", String(index));
        record("activity", "Agent message", "Activity after verbose execution");
        record("response", "Final response", "x".repeat(2999) + "🧪 searchable-transcript-marker");
        return { status: "completed", threadId: randomUUID() };
      }
      if (job.prompt === "expired-approval-probe") {
        control.ready(randomUUID(), randomUUID(), async () => "accepted");
        await control.approve({
          operation: "Mock expiring permission request", paths: "", reason: "", canApprove: true,
        });
        return { status: signal.aborted ? "cancelled" : "failed" };
      }
      if (job.prompt.startsWith("interactive-probe") || (liveInteractive && job.profile === "development" && job.codexThreadId)) {
        if (liveInteractive) {
          return runTurn(new AppServer(real.exe, staging), job, staging, record, signal, control, {
            root: staging, protectedDirectories,
          });
        }
        const threadId = job.codexThreadId || randomUUID();
        control.ready(threadId, randomUUID(), async (_id, input) => {
          record("execution", "Mock steered", input);
          return "accepted";
        });
        for (const operation of ["Mock denial", "Mock permission grant"]) {
          const result = await control.approve({
            operation, paths: "disposable workspace", reason: "Exercise owner decisions", canApprove: true,
          });
          record("execution", operation, result);
        }
        return { status: "completed", threadId };
      }
      const cancelProbe = job.prompt.startsWith("cancel-probe");
      const liveJob = cancelProbe ? liveCancellation : job.workspace === "workshop" ? liveWorkshop : live;
      if (!liveJob) {
        record("execution", "Mock command output", `observed output ${device.token}`);
        try { await sleep(job.prompt === "cancel-probe" ? 20_000 : 1700, undefined, { signal }); }
        catch { return { status: "cancelled" }; }
        record("response", "Final response", job.codexThreadId ? "continued" : "mock response");
        return { status: "completed", threadId: job.codexThreadId || randomUUID() };
      }
      const cwd = workspaces[job.workspace];
      return runTurn(new AppServer(real.exe, cwd), job, cwd, record, signal);
    },
  });
  worker.catch(() => {});
  const advertised = await until(async () => {
    const [host] = (await api("/hosts"))[1];
    return host?.online && host;
  });
  assert.deepEqual(advertised.profiles, ["read-only", "development", "workshop", ...(fullAccessLive ? ["full-access"] : [])]);
  assert.equal((await api("/jobs", { method: "POST", body: {
    id: randomUUID(), hostId: device.id, workspace: "development", model: "gpt-6.2-sol",
    effort: "low", prompt: "Reject Full Access on a host without it", profile: "full-access",
  }, user: other }))[0], 403);
  if (!fullAccessLive) assert.equal((await api("/jobs", { method: "POST", body: {
    id: randomUUID(), hostId: device.id, workspace: "development", model: "gpt-6.2-sol",
    effort: "low", prompt: "Reject Full Access on a host without it", profile: "full-access",
  } }))[0], 409);
  assert.equal((await api("/jobs", { method: "POST", body: {
    id: randomUUID(), hostId: device.id, workspace: "workshop", model: "gpt-6.2-sol",
    effort: "low", prompt: "Reject the wrong workspace profile", profile: "development",
  } }))[0], 400);

  async function submit(prompt, workspace = "development", parentId, options) {
    const id = randomUUID();
    const body = { id, hostId: device.id, workspace, model: "gpt-6.2-sol", effort: "low", prompt, parentId, ...options };
    assert.equal((await api("/jobs", { method: "POST", body }))[0], 201);
    assert.equal((await api("/jobs", { method: "POST", body }))[0], 200);
    return id;
  }
  const detail = async (id) => (await api(`/jobs/${id}`))[1];
  const settle = (id) => until(async () => {
    const job = await detail(id);
    return ["completed", "failed", "cancelled", "interrupted"].includes(job.status) && job;
  }, liveWorkshop || liveInteractive || directGit || fullAccessLive ? 105_000 : 15_000);
  if (fullAccessLive) {
    const prompt = `Perform four harmless checks using actual shell commands: use Git to print its version, check that both ${workspaces.development} and ${workspaces.workshop} exist without listing or reading their contents, and use Node or PowerShell to make a GET request to ${base}/operations/hosts without an authorization header and print the HTTP status (401 expected). Do not write files, contact other endpoints, read credentials, modify Git, or request approval. Print CW-FULL-ACCESS-OK only if the checks pass.`;
    const id = await submit(prompt, "workshop", undefined, { profile: "full-access" });
    const executed = await settle(id);
    assert.equal(executed.status, "completed", executed.error);
    assert.equal(executed.profile, "full-access");
    assert.equal(executed.approvalHistory?.length || 0, 0);
    const output = executed.events.filter(({ label }) => /^(Command output|Output)/.test(label)).map(({ text }) => text).join("\n");
    assert.match(output, /git version/i);
    assert.match(output, /\b401\b/);
    assert.ok(executed.events.some(({ view, text }) => view === "response" && text.includes("CW-FULL-ACCESS-OK")));
    const resume = {
      id: randomUUID(), hostId: device.id, workspace: "workshop", model: "gpt-6.2-sol", effort: "low",
      parentId: id, prompt: "Reply with only CW-FULL-ACCESS-RESUMED. Do not run tools.",
    };
    assert.equal((await api("/jobs", { method: "POST", body: { ...resume, profile: "read-only" } }))[0], 409);
    assert.equal((await api("/jobs", { method: "POST", body: { ...resume, profile: "full-access", workspace: "development" } }))[0], 409);
    const continued = await settle(await submit(resume.prompt, "workshop", id, { profile: "full-access" }));
    assert.equal(continued.status, "completed", continued.error);
    assert.equal(continued.codexThreadId, executed.codexThreadId);
    assert.equal(continued.sessionId, executed.sessionId);
    assert.ok(continued.events.some(({ view, text }) => view === "response" && text.includes("CW-FULL-ACCESS-RESUMED")));
    console.log("Live Full Access app-server turn, native Git launch, both workspace checks and loopback network PASS");
    console.log("Live Full Access continuation and profile/workspace binding PASS");
  }
  const first = await submit(live ?
    "Run a read-only shell command that confirms your current Windows location and prints CW-BRIDGE-OK. Do not open files or write anything. Then reply with the exact marker CW-BRIDGE-OK." : "test");
  if (!live) {
    const progress = await until(async () => {
      const job = await detail(first);
      return job.status === "running" && job.events.some(({ view }) => view === "execution") && job;
    });
    assert.ok(!JSON.stringify(progress).includes(device.token));
  }
  const initial = await settle(first);
  assert.equal(initial.profile, "read-only");
  assert.equal(initial.status, "completed", initial.error);
  assert.ok(initial.events.some(({ view }) => view === "response"));
  assert.equal(initial.events.filter(({ label }) => label === "Job assigned").length, 1);
  assert.equal(launchCount, fullAccessLive ? 3 : 1);
  if (live) {
    assert.ok(initial.events.some(({ label, text }) => label.startsWith("Command output") && text.includes("CW-BRIDGE-OK")));
    assert.ok(initial.events.some(({ view, text }) => view === "response" && text.includes("CW-BRIDGE-OK")));
  }

  offline = true;
  await sleep(1300);
  offline = false;
  const follow = await settle(await submit(live ? "What exact marker did you just report? Reply with only the marker. Do not run tools." :
    "follow-up", "development", first));
  assert.equal(follow.status, "completed", follow.error);
  assert.equal(follow.codexThreadId, initial.codexThreadId);
  assert.equal(follow.sessionId, first);
  assert.ok(follow.events.some(({ view, text }) => view === "response" && text.includes(live ? "CW-BRIDGE-OK" : "continued")));

  if (liveWorkshop) {
    const workshop = await settle(await submit("Use a read-only shell command to print the actual current location and confirm whether the relative file 00_Workshop_Config/paths.json exists. Print TRUE if present. If Windows PowerShell fails to start, use cmd.exe with its cd and if exist built-ins. Do not read or modify any files.", "workshop"));
    assert.equal(workshop.status, "completed", workshop.error);
    const output = workshop.events.filter(({ label }) => /^(Command output|Output) · /.test(label))
      .map(({ text }) => text).join("\n");
    assert.match(output, /D:[\\/]Loom Art Workshop/i);
    assert.match(output, /\btrue\b/i);
    console.log("Workshop shell confirmed its D: working directory and config file.");
  }

  const cancellation = await submit(liveCancellation
    ? 'cancel-probe: Run this read-only shell command and wait for it to finish: node -e "setTimeout(() => {}, 20000)". Use cmd.exe if PowerShell cannot start. Do not read or write files. Then reply done.'
    : "cancel-probe", "workshop");
  await until(async () => {
    const job = await detail(cancellation);
    return job.status === "running" && (!liveCancellation ||
      job.events.some(({ label }) => label.startsWith("Command inProgress")));
  }, liveCancellation ? 40_000 : 15_000);
  await api(`/jobs/${cancellation}/cancel`, { method: "POST" });
  const cancelled = await settle(cancellation);
  assert.equal(cancelled.status, "cancelled", cancelled.error);
  if (liveCancellation) assert.ok(cancelled.events.some(({ label }) => label === "Turn interrupted"));
  if (directGit) {
    const jobId = await submit(`direct-git-probe: This repository is disposable. First use request_permissions to ask for write access to ${path.join(gitFixture, ".git")} and network access. Once granted, edit probe.txt so it contains CW-DIRECT-GIT, then run git add -- probe.txt and git commit -m CW-DIRECT-GIT locally. If the sandbox still denies Git metadata writes, request command approval for the exact Git command. Do not contact any remote. Do not touch other paths.`, "development", undefined, { profile: "development" });
    const decisions = new Set();
    let grantedMetadata = false;
    const complete = await until(async () => {
      const detail = await api(`/jobs/${jobId}`).then((result) => result[1]);
      if (detail.approval?.state === "pending" && !decisions.has(detail.approval.id)) {
        assert.equal(detail.approval.canApprove, true);
        if (detail.approval.operation === "Request additional permissions") {
          assert.match(detail.approval.paths, /\.git/);
          assert.match(detail.approval.paths, /"enabled":true/);
          grantedMetadata = true;
        } else {
          assert.match(detail.approval.operation, /\bgit\b[\s\S]*\b(add|commit)\b/);
          assert.doesNotMatch(detail.approval.operation, /push|publish|remote|https?:/i);
        }
        assert.equal((await api(`/jobs/${jobId}/approval`, {
          method: "POST", body: { id: detail.approval.id, choice: "approve" },
        }))[0], 204);
        decisions.add(detail.approval.id);
      }
      return ["completed", "failed", "interrupted", "cancelled"].includes(detail.status) && detail;
    }, 90_000);
    assert.equal(complete.status, "completed", complete.error);
    assert.ok(grantedMetadata, "Expected Codex to request and receive the metadata grant.");
    assert.equal(git(gitFixture, "log", "-1", "--format=%s"), "CW-DIRECT-GIT");
    assert.match(readFileSync(path.join(gitFixture, "probe.txt"), "utf8"), /CW-DIRECT-GIT/);
    assert.equal(git(gitFixture, "remote"), "");
    assert.ok(complete.events.some(({ label, text }) => label === "Approval sent to Codex" &&
      text === "item/permissions/requestApproval"));
    console.log(`Live Codex Git metadata grant and local commit PASS · ${decisions.size} owner approvals`);
  }
  if (!liveWorkshop && !liveCancellation && !directGit) {
    const objectiveRequest = {
      title: "Validate disposable deliverable", instruction: "Collect independently reviewed evidence.",
      criteria: ["Output includes the expected marker", "Output includes a validation report"],
    };
    assert.equal((await api("/objectives", { method: "POST", body: objectiveRequest, user: other }))[0], 403);
    const [createdObjective, objective] = await api("/objectives", { method: "POST", body: objectiveRequest });
    assert.equal(createdObjective, 201);
    const objectivePath = `/objectives/${objective._id}`;
    const fetchObjective = async () => (await api(objectivePath))[1];
    const [marker, report] = (await fetchObjective()).criteria;
    const review = (criterion, decision, evidence, revision, user = owner) =>
      api(`${objectivePath}/criteria/${criterion.id}/review`, { method: "POST", body: { decision, evidence, revision }, user });
    assert.equal((await review(marker, "accepted", "Expected marker observed.", 0, other))[0], 403);
    assert.equal((await review(marker, "accepted", "Expected marker observed.", 0))[0], 204);
    assert.equal((await review(report, "accepted", "Stale revision.", 0))[0], 409);
    assert.equal((await review(report, "rejected", "No validation report supplied.", 1))[0], 204);
    assert.equal((await fetchObjective()).status, "active");
    assert.equal((await review(report, "accepted", "", 2))[0], 400);
    assert.equal((await review(report, "accepted", "Corrected deliverable includes the report.", 2))[0], 204);
    const completedObjective = await fetchObjective();
    assert.equal(completedObjective.status, "completed");
    assert.deepEqual(completedObjective.reviewHistory.map((entry) => entry.decision), ["accepted", "rejected", "accepted"]);
    console.log("Objective authorization, revision checks, evidence and completion gate PASS");

    const scheduledAt = Date.now() + 2600;
    const scheduled = {
      id: randomUUID(), hostId: device.id, workspace: "development", model: "gpt-6.2-sol",
      effort: "low", prompt: "scheduled probe", scheduledAt,
    };
    assert.equal((await api("/jobs", { method: "POST", body: scheduled }))[0], 400);
    assert.equal((await api("/schedule", { method: "POST", body: scheduled, user: other }))[0], 403);
    assert.equal((await api("/schedule", { method: "POST", body: scheduled }))[0], 201);
    assert.equal((await detail(scheduled.id)).status, "scheduled");
    assert.equal((await api("/schedule"))[1][0]._id, scheduled.id);
    const discarded = { ...scheduled, id: randomUUID(), scheduledAt: Date.now() + 60_000 };
    assert.equal((await api("/schedule", { method: "POST", body: discarded }))[0], 201);
    assert.equal((await api(`/schedule/${discarded.id}`, { method: "PATCH", body: { scheduledAt: Date.now() + 30_000 } }))[0], 204);
    assert.equal((await api(`/schedule/${discarded.id}`, { method: "DELETE" }))[0], 204);
    assert.equal((await detail(discarded.id)).status, "cancelled");
    await sleep(1100);
    assert.equal((await detail(scheduled.id)).status, "scheduled");
    offline = true;
    const hosts = db.db.collection("operations_hosts");
    await hosts.updateOne({ _id: device.id }, { $set: { lastSeen: new Date(Date.now() - 20_000) } });
    const late = { ...scheduled, id: randomUUID(), scheduledAt: Date.now() + 60_000 };
    assert.equal((await api("/schedule", { method: "POST", body: late }))[0], 201);
    await api(`/jobs/${late.id}/cancel`, { method: "POST" });
    await sleep(Math.max(0, scheduledAt - Date.now() + 200));
    assert.equal((await detail(scheduled.id)).status, "scheduled");
    const priorLaunches = launchCount;
    assert.equal((await api("/dispatch", { method: "PATCH", body: { paused: true }, user: other }))[0], 403);
    assert.equal((await api("/dispatch", { method: "PATCH", body: { paused: true } }))[0], 204);
    offline = false;
    await until(async () => (await api("/hosts"))[1][0]?.online);
    await sleep(1100);
    assert.equal((await api("/dispatch"))[1].paused, true);
    assert.equal((await detail(scheduled.id)).status, "scheduled");
    assert.equal(launchCount, priorLaunches);
    assert.equal((await api("/dispatch", { method: "PATCH", body: { paused: false } }))[0], 204);
    const executed = await settle(scheduled.id);
    assert.equal(executed.status, "completed", executed.error);
    assert.equal((await api(`/schedule/${scheduled.id}`, { method: "DELETE" }))[0], 409);
    assert.ok(Date.parse(executed.startedAt) >= scheduledAt);
    assert.equal(launchCount, priorLaunches + 1);
    assert.equal((await api("/schedule", { method: "POST", body: scheduled }))[0], 200);
    assert.deepEqual((await api("/schedule"))[1], []);
    assert.equal((await api("/headquarters", { user: other }))[0], 403);
    const [headquartersStatus, headquarters] = await api("/headquarters");
    assert.equal(headquartersStatus, 200);
    assert.equal(headquarters.hosts.online, 1);
    assert.ok(headquarters.jobs.completed >= 1);
    assert.ok(headquarters.recent.some((entry) => entry._id === scheduled.id && entry.status === "completed"));
    console.log("Durable schedule, offline catch-up, dispatch pause, rescheduling, cancellation, and replay PASS");

    const transcriptId = await submit("extended-transcript-probe:" + "🧪".repeat(52_000));
    const transcript = await settle(transcriptId);
    const pages = [];
    while (pages.length < transcript.eventCount) {
      const [status, page] = await api(`/jobs/${transcriptId}?offset=${pages.length}&compact=true`);
      assert.equal(status, 200);
      assert.ok(page.events.length > 0 && page.events.length <= 40);
      assert.equal(page.prompt, undefined);
      pages.push(...page.events);
    }
    assert.deepEqual(pages.filter(({ view }) => view === "execution").map(({ text }) => Number(text)),
      Array.from({ length: 415 }, (_, index) => index));
    assert.ok(pages.some(({ text }) => text === "Activity after verbose execution"));
    assert.equal(pages.filter(({ view }) => view === "response").map(({ text }) => text).join(""),
      "x".repeat(2999) + "🧪 searchable-transcript-marker");
    assert.ok((await api("/jobs?search=searchable-transcript-marker&compact=true"))[1]
      .some((job) => job._id === transcriptId));
    console.log("Extended prompt and paginated transcript with late activity PASS");
    const interactive = await submit(liveInteractive
      ? `interactive-probe: Immediately use request_permissions to request single-turn filesystem write access to the existing directory ${path.join(staging, "scratch")}. Request no other permissions. Only if approved, first create scratch/check.txt containing CW-EDIT-ONE, then in a separate edit append CW-EDIT-TWO on its own line. Leave that file in place for the local test. End with the marker CW-INTERACTIVE.`
      : "interactive-probe", "development", undefined, { profile: "development" });
    const pending = await until(async () => {
      const job = await detail(interactive);
      assert.ok(!["completed", "failed", "interrupted"].includes(job.status), job.error || "Turn ended before requesting approval.");
      return job.activeTurn && job.approval?.state === "pending" && job;
    }, liveInteractive ? 75_000 : 15_000);
    const queued = await submit(liveInteractive ? "What marker did you just report? Reply with the marker. Do not use tools." :
      "queued continuation", "development", interactive, { profile: "development", queue: true });
    assert.equal((await detail(queued)).status, "waiting");
    const steerBody = {
      id: randomUUID(), turnId: pending.activeTurn.turnId,
      input: "Continue the requested task, but end your final response with CW-STEERED instead of CW-INTERACTIVE.",
    };
    const steerRoute = `/jobs/${interactive}/steer`;
    assert.equal((await api(steerRoute, { user: other, method: "POST", body: steerBody }))[0], 403);
    assert.equal((await api(steerRoute, { method: "POST", body: steerBody }))[0], 204);
    assert.equal((await api(steerRoute, { method: "POST", body: steerBody }))[0], 204);
    await until(async () => (await detail(interactive)).instruction?.state === "accepted");
    const choice = liveInteractive ? "approve" : "deny";
    const approvalRoute = `/jobs/${interactive}/approval`;
    const decide = (id, choice, user = owner) => api(approvalRoute, { user, method: "POST", body: { id, choice } });
    assert.equal((await decide(pending.approval.id, choice, other))[0], 403);
    assert.equal((await decide(pending.approval.id, choice))[0], 204);
    assert.equal((await decide(pending.approval.id, choice))[0], 204);
    assert.equal((await decide(pending.approval.id, choice === "approve" ? "deny" : "approve"))[0], 409);
    if (!liveInteractive) {
      const second = await until(async () => {
        const { approval } = await detail(interactive);
        return approval?.id !== pending.approval.id && approval?.state === "pending" && approval;
      });
      assert.equal((await decide(second.id, "approve"))[0], 204);
    }
    const finished = await settle(interactive);
    assert.equal(finished.status, "completed", finished.error);
    assert.equal(finished.approval.state, "approved");
    if (liveInteractive) {
      assert.match(readFileSync(path.join(staging, "scratch", "check.txt"), "utf8"), /CW-EDIT-ONE\r?\nCW-EDIT-TWO/);
      assert.ok(finished.events.some(({ view, text }) => view === "response" && text.includes("CW-STEERED")));
    }
    const successor = await settle(queued);
    assert.equal(successor.status, "completed", successor.error);
    assert.equal(successor.codexThreadId, finished.codexThreadId);
    assert.equal(successor.sessionId, interactive);
    if (liveInteractive) assert.ok(successor.events.some(({ view, text }) => view === "response" && text.includes("CW-STEERED")));
    assert.equal((await api(`/sessions/${interactive}`, {
      method: "PATCH", body: { title: "Interactive validation", archived: true },
    }))[0], 204);
    assert.deepEqual((await api("/jobs?archived=true&search=Interactive%20validation"))[1].map((job) => job._id), [queued, interactive]);
    assert.ok(!(await api("/jobs?archived=false"))[1].some((job) => job.sessionId === interactive));
    if (!liveInteractive) {
      const expiring = await submit("expired-approval-probe");
      const approval = await until(async () => {
        const job = await detail(expiring);
        return job.approval?.state === "pending" && job.approval;
      });
      const blocked = await submit("discarded continuation", "development", expiring, { queue: true });
      const approvalRequest = { method: "POST", body: { id: approval.id, choice: "approve" } };
      offline = true;
      await sleep(1300);
      await db.db.collection("operations_jobs").updateOne({ _id: expiring }, {
        $set: { "approval.expiresAt": Date.now() - 1 },
      });
      assert.equal((await detail(expiring)).approval.state, "expired");
      assert.equal((await api(`/jobs/${expiring}/approval`, approvalRequest))[0], 409);
      await db.db.collection("operations_hosts").updateOne({ _id: device.id }, {
        $set: { lastSeen: new Date(Date.now() - 16_000) },
      });
      assert.equal((await api(`/jobs/${expiring}/approval`, approvalRequest))[1].message, "The assigned worker is disconnected.");
      assert.equal((await api(`/jobs/${expiring}/cancel`, { method: "POST" }))[0], 204);
      offline = false;
      assert.equal((await settle(expiring)).status, "cancelled");
      assert.equal((await settle(blocked)).status, "interrupted");
    }
    console.log(`${liveInteractive ? "Live Codex" : "Mock"} approval, steering, queued continuation, and session management PASS`);
  }
  assert.equal((await api(`/hosts/${device.id}`, { method: "DELETE" }))[0], 204);
  await assert.rejects(send("/claim", {}), { status: 403 });
  console.log(`${live ? "Live Codex" : "Mock worker"} integration PASS · ${liveCancellation ? "Live" : "Mock"} cancellation PASS`);
} finally {
  controller.abort();
  await worker?.catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  await db.dropDatabase();
  await db.close();
  if (staging) {
    const file = path.join(staging, "scratch", "check.txt");
    if (existsSync(file)) unlinkSync(file);
    rmdirSync(path.join(staging, "scratch"));
    rmdirSync(staging);
  }
  if (gitFixture) {
    const resolved = realpathSync(gitFixture);
    if (path.dirname(resolved) !== realpathSync(workspaces.development) ||
        !path.basename(resolved).startsWith("cw-direct-git-test-")) {
      console.error("Invalid fixture cleanup path.");
      process.exitCode = 1;
    } else {
      rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
}

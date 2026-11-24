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
import { verifyMedia } from "./media-integration.mjs";

const fullAccessLive = process.argv.includes("--full-access-live");
const live = process.argv.includes("--live") && !fullAccessLive;
const liveWorkshop = live || process.argv.includes("--workshop-live");
const liveCancellation = process.argv.includes("--cancel-live");
const liveInteractive = process.argv.includes("--interactive-live");
const liveObjectiveRuns = process.argv.includes("--objective-runs-live");
const directGit = process.argv.includes("--direct-git-live");
const owner = "1".repeat(24);
const other = "2".repeat(24);
const jwtSecret = randomUUID() + randomUUID();
process.env.JWT_SECRET = jwtSecret;
process.env.OPERATIONS_OWNER_ID = owner;
process.env.OPERATIONS_LOOPBACK_TEST = "1";
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
const mongoPort = Number(process.env.OPERATIONS_TEST_MONGO_PORT ?? 27017);
if (!Number.isSafeInteger(mongoPort) || mongoPort < 1 || mongoPort > 65535) throw new Error("Invalid loopback MongoDB fixture port.");
const db = await mongoose.createConnection(`mongodb://127.0.0.1:${mongoPort}`, {
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
let objectiveFixture;
const liveRunIds = new Set();
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
  const financeEntry = {
    id: randomUUID(), name: "Fixture expense", kind: "expense", amount: 1250,
    currency: "USD", category: "Cloud", date: "2026-11-07",
  };
  const saveFinance = (body, user) => api("/finance", { method: "POST", body, user });
  assert.equal((await saveFinance(financeEntry, other))[0], 403);
  assert.equal((await saveFinance(financeEntry))[0], 201);
  assert.equal((await saveFinance(financeEntry))[0], 200);
  assert.equal((await saveFinance({ ...financeEntry, amount: 2500 }))[0], 409);
  assert.equal((await saveFinance({ ...financeEntry, id: randomUUID(), date: "2026-02-31" }))[0], 400);
  assert.equal((await saveFinance({ ...financeEntry, id: randomUUID(), kind: "monthly", amount: 200 }))[0], 201);
  assert.equal((await saveFinance({ ...financeEntry, id: randomUUID(), kind: "budget", amount: 4000 }))[0], 201);
  assert.equal((await saveFinance({ ...financeEntry, id: randomUUID(), currency: "EUR", amount: 190 }))[0], 201);
  const [financeStatus, ledger] = await api("/finance?month=2026-11");
  assert.equal(financeStatus, 200);
  assert.deepEqual(ledger.totals.USD, { expenses: 1250, annualCommitments: 2400, budget: 4000 });
  assert.deepEqual(ledger.totals.EUR, { expenses: 190, annualCommitments: null, budget: null });
  assert.equal(ledger.renewals[0].date, "2026-11-07");
  assert.equal(ledger.billing.status, "unavailable");
  console.log("Finance owner boundary, replay, validation, and currency-specific totals PASS");

  const referenceAssetId = randomUUID();
  const referencePayload = {
    id: randomUUID(), mediaId: referenceAssetId, category: "visual", projectId: "",
    name: "Studio [fixture]", source: "Controlled fixture", tags: ["garment"],
  };
  const saveReference = (body, user) => api("/references", { method: "POST", body, user });
  await db.db.collection("operations_media").insertOne({
    _id: referenceAssetId, ownerId: other, state: "ready", mime: "image/png", size: 500,
  });
  assert.equal((await saveReference(referencePayload, other))[0], 403);
  assert.equal((await saveReference(referencePayload))[0], 404);
  await db.db.collection("operations_media").updateOne({ _id: referenceAssetId }, {
    $set: { ownerId: owner, hostId: randomUUID(), sha256: "a".repeat(64) },
  });
  assert.equal((await saveReference(referencePayload))[0], 201);
  assert.equal((await saveReference(referencePayload))[0], 200);
  assert.equal((await saveReference({ ...referencePayload, name: "Different" }))[0], 409);
  const [, referenceList] = await api("/references?q=%5Bfixture%5D");
  assert.equal(referenceList.entries.length, 1);
  const reference = referenceList.entries[0];
  assert.equal(reference.status, "provisional");
  assert.equal(reference.asset._id, referenceAssetId);
  const updateReference = (revision, status) => api(`/references/${encodeURIComponent(reference._id)}/status`, {
    method: "PUT", body: { revision, status },
  });
  assert.equal((await updateReference(0, "approved"))[0], 204);
  assert.equal((await updateReference(0, "superseded"))[0], 409);
  assert.equal((await updateReference(1, "superseded"))[0], 204);
  const [, approvedReferences] = await api("/references?status=approved");
  assert.equal(approvedReferences.entries.length, 0);
  console.log("References owner scope, source metadata, literal search, replay, approval, and stale revision PASS");

  delete process.env.OPERATIONS_OWNER_ID;
  assert.equal((await api("/hosts"))[0], 404);
  process.env.OPERATIONS_OWNER_ID = owner;
  assert.equal((await api("/hosts", { user: other }))[0], 403);
  assert.equal((await api("/jobs", { user: null }))[0], 401);
  assert.equal((await fetch(`${base}/operations/worker/claim`, { method: "POST" })).status, 401);

  // Exercise reconciliation in a different owner scope so existing scenarios keep their fixtures.
  const foundationOwner = "3".repeat(24);
  const projects = db.db.collection("operations_projects");
  const existingProject = randomUUID();
  const foreignProject = randomUUID();
  await projects.insertMany([
    { _id: existingProject, ownerId: foundationOwner, workspace: "workshop", name: "Sanguine Archipelago", status: "active", revision: 4 },
    { _id: foreignProject, ownerId: "4".repeat(24), workspace: "development", name: "Sanguine Archipelago", status: "active" },
  ]);
  process.env.OPERATIONS_OWNER_ID = foundationOwner;
  try {
    const query = (path, options) => api(`/organization${path}`, { user: foundationOwner, ...options });
    assert.equal((await query("", { user: null }))[0], 401);
    assert.equal((await query("", { user: owner }))[0], 403);
    const [status, preview] = await query("");
    assert.equal(status, 200);
    assert.deepEqual(preview.counts, { departments: 0, employees: 0, projects: 1, objectives: 0 });
    assert.equal(preview.plan.find(({ key }) => key === "project-sanguine").id, existingProject);
    assert.equal(preview.plan.some(({ id }) => id === foreignProject), false);
    assert.equal((await query("/initialize", { user: owner, method: "POST", body: { planId: preview.planId } }))[0], 403);
    assert.equal(await projects.countDocuments({ ownerId: foundationOwner }), 1);
    const initialize = (planId) => query("/initialize", { method: "POST", body: { planId } });
    await projects.updateOne({ _id: existingProject }, { $set: { status: "paused" } });
    assert.equal((await initialize(preview.planId))[0], 409);
    assert.equal((await query(""))[1].plan.find(({ key }) => key === "project-sanguine").state, "conflict");
    await projects.updateOne({ _id: existingProject }, { $set: { status: "active" } });
    const writes = await Promise.all([initialize(preview.planId), initialize(preview.planId)]);
    assert.ok(writes.some(([result]) => result === 200));
    assert.ok(writes.every(([result]) => [200, 409].includes(result)));
    assert.equal(new Set(writes.flatMap(([, result]) => result.created || [])).size, preview.plan.length - 1);
    const [, reconciled] = await query("");
    assert.deepEqual(reconciled.counts, { departments: 1, employees: 2, projects: 4, objectives: 3 });
    assert.equal(reconciled.plan.every(({ state }) => state === "retain"), true);
    assert.deepEqual((await initialize(reconciled.planId))[1].created, []);
    assert.equal((await projects.findOne({ _id: existingProject })).revision, 4);
    const [, directory] = await api("/workforce", { user: foundationOwner });
    const director = directory.employees.find(({ role }) => role === "art-director");
    const barnaby = directory.employees.find(({ role }) => role === "first-mate");
    assert.equal(director.supervisorId, barnaby._id);
    assert.equal(directory.roles.find(({ name }) => name === "Art Director")._id, director.roleId);
    assert.deepEqual(directory.projectAssignments.map(({ projectName }) => projectName).sort(),
      ["Crossworld Operations", "Loom", "Sanguine Archipelago"]);
    const design = directory.projectAssignments.find(({ projectName }) => projectName === "Crossworld Operations");
    const artProduction = directory.projectAssignments.filter((assignment) => assignment !== design);
    assert.equal(design.status, "assigned");
    assert.equal(design.employeeId, director._id);
    const [, designObjective] = await api(`/objectives/${design.objectiveId}`, { user: foundationOwner });
    assert.equal(designObjective.projectId, design.projectId);
    assert.equal(designObjective.status, "active");
    const { id: reviewHost, token: reviewToken } = (await api("/hosts", {
      user: foundationOwner, method: "POST", body: { label: "Operations review relay" },
    }))[1];
    const reviewSend = backendClient(base, reviewToken);
    const reviewInstance = randomUUID();
    await reviewSend("/heartbeat", { instance: reviewInstance, efforts: ["low"], profiles: ["read-only"] });
    const source = randomUUID();
    const jobs = db.db.collection("operations_jobs");
    await jobs.insertOne({
      _id: source, ownerId: foundationOwner, hostId: reviewHost, activeHost: reviewHost,
      instance: reviewInstance, status: "running", leaseUntil: new Date(Date.now() + 45000),
      workerRole: "direct", studioTools: true, studioActor: { id: barnaby._id }, model: "fixture", effort: "low",
    });
    const reviewPath = "/jobs/" + source + "/delegate-operations-review";
    const request = { instance: reviewInstance, callId: "review_fixture", employee: director.name };
    await assert.rejects(reviewSend(reviewPath, { ...request, employee: barnaby.name }), { status: 409 });
    const receipts = await Promise.all([reviewSend(reviewPath, request), reviewSend(reviewPath, request)]);
    assert.deepEqual(receipts[0], receipts[1]);
    const [receipt] = receipts;
    assert.equal(receipt.state, "queued");
    assert.equal(receipt.objectiveId, designObjective._id);
    await assert.rejects(reviewSend(reviewPath, { ...request, callId: "another_review" }), { status: 409 });
    assert.equal((await reviewSend("/claim", { instance: reviewInstance }))._id, source);
    await jobs.updateOne({ _id: source }, { $set: { status: "completed" }, $unset: { activeHost: "" } });
    const claimedReview = await reviewSend("/claim", { instance: reviewInstance });
    assert.equal(claimedReview._id, receipt.assignmentId);
    assert.equal(claimedReview.profile, "read-only");
    assert.equal(claimedReview.workerRole, "assignment");
    assert.equal(claimedReview.codexThreadId, null);
    assert.equal(claimedReview.studioActions, undefined);
    const [, reviews] = await api("/objectives/" + designObjective._id + "/assignments", { user: foundationOwner });
    assert.equal(reviews[0].delegatedBy.sourceTurnId, source);
    assert.equal(reviews[0].assigneeName, director.name);
    await jobs.updateOne({ _id: claimedReview._id }, { $set: { status: "completed" }, $unset: { activeHost: "" } });
    console.log("First Mate Operations review authorization, concurrent replay, queue, independent claim and attribution PASS");
    const [, objective] = await api(`/objectives/${artProduction[0].objectiveId}`, { user: foundationOwner });
    assert.equal(objective.status, "paused");
    assert.ok(artProduction.every(({ status }) => status === "paused"));
    assert.equal(objective.criteria.every(({ review }) => review === null), true);
    assert.equal(objective.projectId, existingProject);
    assert.ok(objective.provenance.sources.length);
    const activation = { method: "POST", body: { id: objective._id, revision: objective.revision } };
    assert.equal((await query("/clothing/activate", { ...activation, user: owner }))[0], 403);
    assert.equal((await query("/clothing/activate", { ...activation, body: { ...activation.body, revision: 99 } }))[0], 409);
    assert.equal((await query("/clothing/activate", activation))[0], 204);
    assert.equal((await query("/clothing/activate", activation))[0], 409);
    const [, activated] = await api("/workforce", { user: foundationOwner });
    assert.ok(activated.projectAssignments.every(({ status }) => status === "assigned"));
    console.log("Studio foundation authorization, conflict preview, idempotent writes and Art Director assignments PASS");

    const creative = (path, method, body, user = foundationOwner) => api("/creative"+path, { user, method, body });
    const loom = directory.projectAssignments.find(({ projectName }) => projectName === "Loom");
    const referenceId = foundationOwner + ":" + randomUUID();
    const otherReferenceId = foundationOwner + ":" + randomUUID();
    const mediaId = randomUUID();
    await db.db.collection("operations_references").insertMany([
      { _id: referenceId, ownerId: foundationOwner, name: "Candidate fixture", category: "candidate",
        status: "provisional", projectId: existingProject, mediaId },
      { _id: otherReferenceId, ownerId: foundationOwner, name: "Other project", category: "candidate",
        status: "provisional", projectId: loom.projectId, mediaId: randomUUID() },
    ]);
    const input = { id: randomUUID(), projectId: existingProject, kind: "brief", title: "Isolated garment test",
      content: "Record independent evidence before requesting acceptance.", source: "Isolated test provenance",
      referenceIds: [referenceId], objectiveId: objective._id };
    assert.equal((await creative("", "POST", input, owner))[0], 403);
    assert.equal((await creative("", "POST", { ...input, referenceIds: [otherReferenceId] }))[0], 404);
    assert.equal((await creative("", "POST", { ...input, objectiveId: randomUUID() }))[0], 404);
    const [briefStatus, brief] = await creative("", "POST", input);
    assert.equal(briefStatus, 201);
    assert.equal((await creative("", "POST", input))[0], 200);
    assert.equal((await creative("", "POST", { ...input, title: "Changed replay" }))[0], 409);
    const briefPath = "/" + encodeURIComponent(brief._id);
    const review = (stage, revision, reviewTurnId) => creative(briefPath, "PUT", {
      stage, revision, reviewTurnId, content: input.content, source: "Isolated review input",
    });
    assert.equal((await review("accepted", 0))[0], 409);
    assert.equal((await review("active", 0))[1].stage, "active");
    assert.equal((await review("technical-review", 0))[0], 409);
    assert.equal((await review("technical-review", 1))[1].stage, "technical-review");
    assert.equal((await review("revision", 2))[1].stage, "revision");
    assert.equal((await review("active", 3))[1].stage, "active");
    assert.equal((await review("technical-review", 4))[1].stage, "technical-review");
    assert.equal((await review("artistic-review", 5))[1].stage, "artistic-review");
    assert.equal((await review("independent-review", 6))[1].stage, "independent-review");
    assert.equal((await review("recommended", 7))[0], 400);
    const reviewTurnId = randomUUID();
    await db.db.collection("operations_jobs").insertOne({
      _id: reviewTurnId, ownerId: foundationOwner, status: "completed", workerRole: "qa", projectId: existingProject,
      objectiveId: randomUUID(), eventCount: 1, events: [{ view: "response", text: "QA_VERDICT: FAIL" }],
    });
    assert.equal((await review("recommended", 7, reviewTurnId))[0], 404);
    await db.db.collection("operations_jobs").updateOne({ _id: reviewTurnId }, { $set: { objectiveId: objective._id } });
    assert.equal((await review("recommended", 7, reviewTurnId))[0], 409);
    await db.db.collection("operations_jobs").updateOne({ _id: reviewTurnId }, {
      $set: { events: [{ view: "response", text: "QA_VERDICT: PASS" }] },
    });
    assert.equal((await review("recommended", 7, reviewTurnId))[1].stage, "recommended");
    assert.equal((await review("accepted", 8))[1].stage, "accepted");
    const directionInput = { ...input, objectiveId: undefined, id: randomUUID(), kind: "direction", title: "Draft color constraints" };
    const [directionStatus, direction] = await creative("", "POST", directionInput);
    assert.equal(directionStatus, 201);
    const directionPath = "/" + encodeURIComponent(direction._id);
    assert.equal((await creative(directionPath, "PUT", {
      stage: "proposed", revision: 0, content: input.content, source: input.source,
    }))[0], 200);
    assert.equal((await creative(directionPath, "PUT", {
      stage: "approved", revision: 1, content: input.content, source: "Isolated approval",
    }))[0], 200);
    const [, studio] = await creative("");
    assert.equal(studio.find(({ _id }) => _id === direction._id).stage, "approved");
    assert.equal(studio.find(({ _id }) => _id === direction._id).history, undefined);
    const [, accepted] = await creative(briefPath);
    assert.equal(accepted.history.length, 10);
    assert.ok(accepted.history.every(({ referenceIds }) => referenceIds[0] === referenceId));
    assert.equal(accepted.linkedReferences[0].mediaId, mediaId);
    console.log("Creative brief, reference linkage, versioned direction, revision conflicts, correction, QA link and separate owner acceptance PASS");
  } finally {
    process.env.OPERATIONS_OWNER_ID = owner;
  }

  const [registered, device] = await api("/hosts", { method: "POST", body: { label: "Diagnostic Windows host" } });
  assert.equal(registered, 201);
  const host = await db.db.collection("operations_hosts").findOne({ _id: device.id });
  assert.equal(host.digest.length, 64);
  assert.ok(!JSON.stringify(host).includes(device.token));
  assert.ok(!JSON.stringify(await api("/hosts")).includes(host.digest));

  await verifyMedia({ api, base, bearer: jwt.sign({ _id: owner }, jwtSecret), db: db.db, other });
  const send = backendClient(base, device.token);
  let offline = false;
  let launchCount = 0;
  let usageObservation = {
    primary: { usedPercent: 23, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 1800 },
    observedAt: Date.now(),
  };
  let lostClaim = false;
  let lostSync = false;
  let real;
  if (liveWorkshop || liveCancellation || liveInteractive || directGit || fullAccessLive || liveObjectiveRuns) real = discoverCodex();
  if (liveObjectiveRuns) {
    objectiveFixture = mkdtempSync(path.join(workspaces.development, "cw-objective-run-test-"));
    writeFileSync(path.join(objectiveFixture, "candidate.txt"), "LEVIATHAN-PRESENT\n");
  }
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
    getUsage: () => ({ ...usageObservation, ignoredMetadata: "not exposed" }),
    boundedCorrections: true,
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
      if (liveRunIds.has(job._id)) {
        const editScope = job.profile === "development" ? { root: objectiveFixture, roots: [objectiveFixture] } : {};
        return runTurn(new AppServer(real.exe, objectiveFixture), job, objectiveFixture, record, signal, control, editScope);
      }
      if (job.prompt.startsWith("Perform an independent QA review")) {
        const marker = job.prompt.includes("Retest after correction") ? "PASS" : "FAIL";
        record("response", "Final response", "mock response" + "x".repeat(2_978) + "\nQA_VERDICT: " + marker);
        return { status: "completed", threadId: randomUUID() };
      }
      if (job.prompt.startsWith("Review the independent QA findings")) {
        const marker = job.prompt.includes("QA_VERDICT: FAIL") ? "YES" : "NO";
        record("response", "Final response", "mock response\nCORRECTION_REQUIRED: " + marker);
        return { status: "completed", threadId: randomUUID() };
      }
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
      if (job.prompt.startsWith("Ordinary assignment test")) {
        const [brief, context] = job.prompt.split("\n\nOwner-provided assignment context (JSON): ");
        assert.equal(brief, "Ordinary assignment test");
        assert.equal(JSON.parse(context).project, "Disposable project");
        assert.equal(JSON.parse(context).employee, "Disposable reviewer");
        record("response", "Final response", "Assignment context observed.");
        return { status: "completed", threadId: randomUUID() };
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
  const settle = (id, timeout) => until(async () => {
    const job = await detail(id);
    return ["completed", "failed", "cancelled", "interrupted"].includes(job.status) && job;
  }, timeout ?? (liveWorkshop || liveInteractive || directGit || fullAccessLive || liveObjectiveRuns ? 180_000 : 15_000));
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
    const departmentBody = { name: "Verification", responsibilities: "Collect independent evidence." };
    const departmentRequest = (user) => api("/workforce/departments", { method: "POST", body: departmentBody, user });
    assert.equal((await departmentRequest(other))[0], 403);
    const [departmentStatus, department] = await departmentRequest(owner);
    assert.equal(departmentStatus, 201);
    const profile = {
      name: "Disposable reviewer", role: "qa", departmentId: department._id, workspace: "development",
      status: "available", responsibilities: departmentBody.responsibilities, instructions: "Inspect the evidence.",
    };
    const hire = (body, user) => api("/workforce/employees", { method: "POST", body, user });
    assert.equal((await hire({ ...profile, departmentId: randomUUID() }))[0], 400);
    assert.equal((await hire({ ...profile, role: "air" }))[0], 400);
    assert.equal((await hire(profile, other))[0], 403);
    const [hireStatus, employee] = await hire(profile);
    assert.equal(hireStatus, 201);
    const update = (revision) => api("/workforce/employees/" + employee._id, {
      method: "PUT", body: { ...profile, status: "retired", revision },
    });
    assert.equal((await update(0))[0], 204);
    assert.equal((await update(0))[0], 409);
    const [, directory] = await api("/workforce");
    assert.equal(directory.departments[0]._id, department._id);
    assert.equal(directory.employees[0].status, "retired");
    assert.equal(directory.employees[0].revision, 1);
    console.log("Workforce hierarchy, owner isolation, and revision checks PASS");

    const registryPath = "/workshop-registry";
    const registry = {
      schema_version: 1, path_base: "metadata fixture",
      resources: [
        { id: "fixture-tested", status: "validated", purpose: "A tagged procedure fixture", local_path: "11_Validated_Examples/fixture.md", license: "CC0",
          original_url: "https://example.invalid/reference?remove=value", hidden_metadata: "excluded", license_evidence: "https://example.invalid/license", integrity_manifest: "manifests/sha.json" },
        { id: "fixture-source", status: "acquired", local_path: "../../unrelated.txt", original_url: "javascript:void(0)" },
      ],
    };
    const importRegistry = (body, user) => api(registryPath, { method: "POST", body, user });
    assert.equal((await importRegistry(registry, other))[0], 403);
    assert.equal((await api(registryPath, { user: other }))[0], 403);
    assert.equal((await importRegistry({ ...registry, schema_version: 2 }))[0], 400);
    assert.equal((await importRegistry({ ...registry, resources: [registry.resources[0], registry.resources[0]] }))[0], 400);
    const [imported, importResult] = await importRegistry(registry);
    assert.equal(imported, 200);
    assert.equal(importResult.total, 2);
    assert.deepEqual((await importRegistry(registry))[1], importResult);
    const [, matching] = await api(registryPath + "?q=tagged&status=validated");
    assert.deepEqual(matching.entries.map((entry) => entry.id), ["fixture-tested"]);
    assert.equal(matching.entries[0].hidden_metadata, undefined);
    assert.equal(matching.entries[0].localPath, "11_Validated_Examples/fixture.md");
    assert.equal(matching.entries[0].licenseEvidence, "https://example.invalid/license");
    assert.equal(matching.entries[0].integrityManifest, "manifests/sha.json");
    assert.equal(matching.entries[0].originalUrl, "https://example.invalid/reference");
    const [, acquired] = await api(registryPath + "?status=acquired");
    assert.equal(acquired.entries[0].localPath, "");
    assert.equal(acquired.entries[0].originalUrl, "");
    console.log("Workshop registry import, source normalization, filtering, replay, and owner isolation PASS");

    const note = {
      kind: "procedure", status: "validated", title: "Disposable provenance check",
      source: "fixture://workshop/procedure", author: "Integration fixture", project: "Leviathan",
      summary: "Workshop calibration observations", body: "Disposable record.", evidence: "Expected marker found.",
    };
    const saveNote = (body, user) => api("/knowledge", { method: "POST", body, user });
    assert.equal((await saveNote(note, other))[0], 403);
    assert.equal((await saveNote({ ...note, evidence: "" }))[0], 400);
    const [noteStatus, storedNote] = await saveNote(note);
    assert.equal(noteStatus, 201);
    assert.equal((await api("/knowledge?q=calibration&kind=procedure", { user: other }))[0], 403);
    const [searchStatus, matches] = await api("/knowledge?q=calibration&kind=procedure");
    assert.equal(searchStatus, 200);
    assert.deepEqual(matches.map((match) => match._id), [storedNote._id]);
    assert.equal(matches[0].body, undefined);
    assert.deepEqual((await api("/knowledge?q=calibration&kind=research"))[1], []);
    assert.equal((await api("/knowledge/" + storedNote._id))[1].evidence, note.evidence);
    console.log("Knowledge provenance, full-text search, and owner isolation PASS");

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

    const scenario = liveObjectiveRuns ? {
      title: "Leviathan disposable live QA",
      instruction: "Inspect the disposable candidate. The report must explicitly identify each marker as present or missing.",
      criteria: ["candidate.txt contains LEVIATHAN-PRESENT", "candidate.txt contains LEVIATHAN-MISSING"],
    } : objectiveRequest;
    const [, orchestration] = await api("/objectives", { method: "POST", body: scenario });
    const runs = "/objective-runs/" + orchestration._id;
    const [, qaEmployee] = await hire(profile);
    const [, mateEmployee] = await hire({ ...profile, role: "first-mate", departmentId: "" });
    const [, airEmployee] = await hire({ ...profile, role: "air", departmentId: "" });
    const [, correctionEmployee] = await hire({ ...profile, role: "worker" });
    await api("/dispatch", { method: "PATCH", body: { paused: true } });
    const sourceId = await submit(liveObjectiveRuns
      ? "The disposable candidate.txt contains LEVIATHAN-PRESENT. Report that the candidate is ready for QA. Do not use tools or modify files."
      : "dependent-run source", "development", undefined, { profile: liveObjectiveRuns ? "read-only" : "development" });
    const qa = { id: randomUUID(), role: "qa", sourceId, employeeId: qaEmployee._id, evidence: liveObjectiveRuns ? "Use a read-only shell command to read candidate.txt in the working directory. Report whether LEVIATHAN-MISSING is absent." : "Check the disposable marker." };
    const mate = { id: randomUUID(), role: "first-mate", sourceId: qa.id, employeeId: mateEmployee._id, evidence: "Resolve findings." };
    const air = { id: randomUUID(), role: "air", sourceId: mate.id, employeeId: airEmployee._id, evidence: "Inspect how the review proceeded." };
    const correction = {
      id: randomUUID(), role: "correction", sourceId: mate.id, employeeId: correctionEmployee._id,
      evidence: "In the disposable working directory, append the line LEVIATHAN-MISSING to candidate.txt and verify both lines. Make no other changes.",
    };
    const retest = {
      id: randomUUID(), role: "qa", sourceId: correction.id, employeeId: qaEmployee._id,
      evidence: "Retest after correction. Use a read-only shell command to read candidate.txt and verify each marker.",
    };
    const createRun = (body, user) => api(runs, { method: "POST", body, user });
    assert.equal((await createRun(qa, other))[0], 403);
    assert.equal((await createRun(qa))[0], 201);
    assert.equal((await createRun(qa))[0], 200);
    assert.equal((await createRun({ ...qa, evidence: "Different digest" }))[0], 409);
    assert.equal((await createRun(mate))[0], 201);
    assert.equal((await createRun(air))[0], 201);
    assert.equal((await createRun(correction))[0], 201);
    assert.equal((await createRun({ ...correction, id: randomUUID() }))[0], 409);
    assert.equal((await createRun(retest))[0], 201);
    assert.equal((await api(runs, { user: other }))[0], 403);
    const [, waitingRuns] = await api(runs);
    assert.deepEqual(waitingRuns.map((run) => run.status), Array(5).fill("waiting"));
    if (liveObjectiveRuns) [sourceId, qa.id, mate.id, air.id, correction.id, retest.id].forEach((id) => liveRunIds.add(id));
    const beforeRuns = launchCount;
    await api("/dispatch", { method: "PATCH", body: { paused: false } });
    const [sourceTurn, qaTurn, mateTurn, airTurn, correctedTurn, retestTurn] = await Promise.all(
      [sourceId, qa.id, mate.id, air.id, correction.id, retest.id].map((id) => settle(id, liveObjectiveRuns ? 240_000 : 35_000)),
    );
    assert.equal(launchCount - beforeRuns, 6);
    assert.equal(new Set([sourceTurn, qaTurn, mateTurn, airTurn, correctedTurn, retestTurn].map((turn) => turn.codexThreadId)).size, 6);
    for (const [turn, predecessor] of [[qaTurn, sourceTurn], [mateTurn, qaTurn], [airTurn, mateTurn], [retestTurn, correctedTurn]]) {
      assert.equal(turn.status, "completed");
      assert.equal(turn.profile, "read-only");
      assert.ok(Date.parse(turn.startedAt) >= Date.parse(predecessor.finishedAt));
      assert.match(turn.prompt, /Preceding turn result/);
      if (!liveObjectiveRuns) assert.match(turn.prompt, /mock response/);
    }
    assert.equal(correctedTurn.status, "completed", correctedTurn.error);
    assert.equal(correctedTurn.profile, "development");
    assert.ok(Date.parse(correctedTurn.startedAt) >= Date.parse(mateTurn.finishedAt));
    assert.match(correctedTurn.prompt, /Preceding turn result/);
    assert.equal((await api("/objectives/" + orchestration._id))[1].status, "active");
    if (liveObjectiveRuns) {
      const response = qaTurn.events.filter((event) => event.view === "response").map((event) => event.text).join("");
      assert.match(response, /LEVIATHAN-MISSING/);
      assert.match(response, /fail|absent|missing/i);
      assert.ok(qaTurn.events.some((event) => event.view === "execution" && /candidate\.txt/.test(event.text)));
      assert.match(mateTurn.prompt, /LEVIATHAN-MISSING/);
      assert.match(readFileSync(path.join(objectiveFixture, "candidate.txt"), "utf8"), /^LEVIATHAN-PRESENT\r?\nLEVIATHAN-MISSING\r?\n?$/);
      assert.ok(retestTurn.events.some((event) => event.view === "response" && /QA_VERDICT: PASS/.test(event.text)));
      console.log("Live subscription QA identified a missing criterion, woke the First Mate, dispatched a bounded correction and verified the corrected candidate.");
    }
    await api("/dispatch", { method: "PATCH", body: { paused: true } });
    const unavailable = { ...qa, id: randomUUID() };
    assert.equal((await createRun(unavailable))[0], 201);
    assert.equal((await api("/workforce/employees/" + qaEmployee._id, {
      method: "PUT", body: { ...profile, status: "paused", revision: 0 },
    }))[0], 204);
    const futureId = randomUUID();
    assert.equal((await api("/schedule", { method: "POST", body: {
      id: futureId, hostId: device.id, workspace: "development", model: "gpt-6.2-sol", effort: "low",
      prompt: "Future dependency fixture", scheduledAt: Date.now() + 60_000,
    } }))[0], 201);
    const jobs = db.db.collection("operations_jobs");
    const blockedIds = Array.from({ length: 51 }, () => randomUUID());
    await jobs.insertMany(blockedIds.map((_id) => ({
      _id, ownerId: owner, hostId: device.id, status: "waiting", parentId: futureId, createdAt: new Date(0),
    })));
    const beforeUnavailable = launchCount;
    await api("/dispatch", { method: "PATCH", body: { paused: false } });
    assert.equal((await settle(unavailable.id)).status, "interrupted");
    assert.equal(launchCount, beforeUnavailable);
    await api("/schedule/" + futureId, { method: "DELETE" });
    await jobs.deleteMany({ _id: { $in: blockedIds } });
    if (!liveObjectiveRuns) {
      const noCorrection = { ...mate, id: randomUUID(), sourceId: retest.id };
      assert.equal((await createRun(noCorrection))[0], 201);
      const skipped = { ...correction, id: randomUUID(), sourceId: noCorrection.id };
      assert.equal((await createRun(skipped))[0], 201);
      const outcome = await settle(skipped.id);
      assert.equal(outcome.status, "interrupted");
      assert.match(outcome.error, /did not authorize correction/);
    }
    const quotaHold = { ...air, id: randomUUID() };
    const oldUsage = usageObservation;
    const heldUntil = Math.floor(Date.now() / 1000) + 120;
    usageObservation = {
      primary: { usedPercent: 100, windowDurationMins: null, resetsAt: heldUntil }, observedAt: Date.now(),
    };
    await until(async () => (await api("/headquarters"))[1].workforce[0].usageResumesAt === heldUntil * 1000);
    const beforeHold = launchCount;
    assert.equal((await createRun(quotaHold))[0], 201);
    await until(async () => (await detail(quotaHold.id)).status === "queued");
    assert.equal(launchCount, beforeHold);
    usageObservation = { ...oldUsage, observedAt: Date.now() };
    assert.equal((await settle(quotaHold.id)).status, "completed");
    assert.equal(launchCount, beforeHold + 1);
    assert.equal((await api("/activity", { user: other }))[0], 403);
    assert.equal((await api("/activity?after=invalid"))[0], 400);
    const [, activity] = await api("/activity");
    assert.ok(activity.some((event) => event.sourceId === orchestration._id && event.type === "objective-opened"));
    assert.ok(activity.some((event) => event.sourceId === retest.id && event.type === "turn-finished" && event.status === "completed"));
    assert.ok(activity.every((event, index) => index === 0 || Date.parse(activity[index - 1].at) >= Date.parse(event.at)));
    assert.deepEqual((await api("/activity?type=knowledge-recorded"))[1].map((event) => event.sourceId), [storedNote._id]);
    const [, activeObjective] = await api("/objectives/" + orchestration._id);
    for (const [revision, criterion] of activeObjective.criteria.entries()) {
      const reviewed = await api("/objectives/" + orchestration._id + "/criteria/" + criterion.id + "/review", {
        method: "POST", body: { decision: "accepted", evidence: "Confirmed against the independent retest transcript.", revision },
      });
      assert.equal(reviewed[0], 204);
    }
    assert.equal((await api("/objectives/" + orchestration._id))[1].status, "completed");
    assert.ok((await api("/activity?type=objective-accepted"))[1].some((event) => event.sourceId === orchestration._id));
    console.log("Dependent QA, First Mate, AIR, correction, retest, and owner acceptance gate PASS");

    const projectSettings = {
      name: "Disposable project", description: "Project and workforce verification.", workspace: "development",
      instructions: "Preserve the disposable file.", repositories: ["crossworld_backend"], status: "active",
    };
    const projectCreate = (user) => api("/projects", { method: "POST", body: projectSettings, user });
    assert.equal((await projectCreate(other))[0], 403);
    const [projectCreated, project] = await projectCreate(owner);
    assert.equal(projectCreated, 201);
    const projectPath = "/projects/" + project._id;
    assert.equal((await api(projectPath))[1].instructions, projectSettings.instructions);
    const linked = { ...objectiveRequest, projectId: project._id };
    assert.equal((await api("/objectives", { method: "POST", body: { ...linked, projectId: randomUUID() } }))[0], 409);
    const [linkedStatus, linkedObjective] = await api("/objectives", { method: "POST", body: linked });
    assert.equal(linkedStatus, 201);
    assert.deepEqual((await api("/objectives?projectId=" + project._id))[1].map((item) => item._id), [linkedObjective._id]);
    const assignment = {
      id: randomUUID(), hostId: device.id, workspace: "development", model: "gpt-6.2-sol", effort: "low",
      prompt: "Ordinary assignment test", objectiveId: linkedObjective._id, employeeId: correctionEmployee._id,
    };
    const requestAssignment = (body, user) => api("/jobs", { method: "POST", body, user });
    assert.equal((await requestAssignment(assignment, other))[0], 403);
    assert.equal((await requestAssignment({ ...assignment, workspace: "workshop" }))[0], 409);
    assert.equal((await requestAssignment(assignment))[0], 201);
    assert.equal((await requestAssignment(assignment))[0], 200);
    assert.equal((await requestAssignment({ ...assignment, prompt: "Different request" }))[0], 409);
    const assigned = await settle(assignment.id);
    assert.equal(assigned.status, "completed", assigned.error);
    assert.equal(assigned.prompt, assignment.prompt);
    assert.equal(assigned.projectId, project._id);
    assert.ok(assigned.events.some((event) => /Assignment context observed/.test(event.text)));
    const continuedAssignment = await submit("Assigned follow-up", "development", assignment.id);
    assert.equal((await settle(continuedAssignment)).employeeId, correctionEmployee._id);
    const assignmentsEndpoint = "/objectives/" + linkedObjective._id + "/assignments";
    assert.deepEqual((await api(assignmentsEndpoint))[1].map((entry) => entry._id), [continuedAssignment, assignment.id]);
    assert.equal((await createRun({ ...qa, id: randomUUID(), sourceId: assignment.id }))[0], 409);
    await api("/dispatch", { method: "PATCH", body: { paused: true } });
    const beforeProjectPause = launchCount;
    const heldAssignment = { ...assignment, id: randomUUID() };
    assert.equal((await requestAssignment(heldAssignment))[0], 201);
    const pauseProject = (revision) => api(projectPath, {
      method: "PUT", body: { ...projectSettings, status: "paused", revision },
    });
    assert.equal((await pauseProject(0))[0], 204);
    assert.equal((await pauseProject(0))[0], 409);
    await api("/dispatch", { method: "PATCH", body: { paused: false } });
    assert.equal((await settle(heldAssignment.id)).status, "interrupted");
    assert.equal(launchCount, beforeProjectPause);
    assert.equal((await api("/objectives", { method: "POST", body: linked }))[0], 409);
    const projectActivity = (await api("/activity?projectId=" + project._id))[1];
    assert.ok(projectActivity.some((event) => event.sourceId === assignment.id && event.type === "turn-finished"));
    assert.ok(projectActivity.every((event) => event.projectId === project._id));
    console.log("Projects, scoped objectives, workload, project pause, and exact assignment replay PASS");

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
    const pausedHeadquarters = (await api("/headquarters"))[1];
    assert.equal(pausedHeadquarters.paused, true);
    assert.equal(pausedHeadquarters.next[0]._id, scheduled.id);
    assert.ok(Date.parse(pausedHeadquarters.next[0].scheduledAt) <= Date.now());
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
    assert.equal(headquarters.paused, false);
    assert.equal(headquarters.objectives.completed, 2);
    assert.ok(Number.isFinite(Date.parse(headquarters.observedAt)));
    assert.deepEqual(headquarters.workforce.map(({ _id, state }) => [_id, state]), [[device.id, "idle"]]);
    assert.ok(!JSON.stringify(headquarters).includes(host.digest));
    assert.deepEqual(headquarters.workforce[0].usage, { ...usageObservation, secondary: null });
    assert.ok(headquarters.jobs.completed >= 1);
    assert.ok(headquarters.recent.some((entry) => entry._id === scheduled.id && entry.status === "completed"));
    console.log("Durable schedule, offline catch-up, dispatch pause, rescheduling, cancellation, and replay PASS");

    const recurring = {
      id: randomUUID(), hostId: device.id, workspace: "development", model: "gpt-6.2-sol", effort: "low",
      prompt: "Bounded recurring turn", scheduledAt: Date.now() + 1500, repeat: { days: 1, count: 2 },
    };
    const registerSeries = (body, user) => api("/recurrence", { method: "POST", body, user });
    const inspectSeries = async (id) => (await api("/recurrence"))[1].find((entry) => entry._id === id);
    assert.equal((await registerSeries(recurring, other))[0], 403);
    assert.equal((await registerSeries({ ...recurring, repeat: { days: 1, count: 50 } }))[0], 400);
    offline = true;
    const beforeSeries = launchCount;
    assert.equal((await registerSeries(recurring))[0], 201);
    assert.equal((await registerSeries(recurring))[0], 200);
    assert.equal((await registerSeries({ ...recurring, prompt: "Different series contents" }))[0], 409);
    const first = await inspectSeries(recurring.id);
    assert.equal(first.remaining, 2);
    assert.equal((await api("/jobs/" + first.occurrenceId))[0], 404);
    const stopped = { ...recurring, id: randomUUID(), scheduledAt: Date.now() + 1000 };
    assert.equal((await registerSeries(stopped))[0], 201);
    assert.equal((await api("/recurrence/" + stopped.id, { method: "DELETE", user: other }))[0], 403);
    assert.equal((await api("/recurrence/" + stopped.id, { method: "DELETE" }))[0], 204);
    const recurrenceRecords = db.db.collection("operations_recurrence");
    const lateAt = recurring.scheduledAt - 3 * 86_400_000;
    await recurrenceRecords.updateOne({ _id: recurring.id }, { $set: { nextAt: new Date(lateAt) } });
    offline = false;
    assert.equal((await settle(first.occurrenceId)).status, "completed");
    const second = await until(async () => {
      const entry = await inspectSeries(recurring.id);
      return entry.remaining === 1 && entry;
    });
    assert.notEqual(second.occurrenceId, first.occurrenceId);
    assert.ok(Date.parse(second.nextAt) > Date.now());
    assert.equal((Date.parse(second.nextAt) - lateAt) % 86_400_000, 0);
    assert.equal(launchCount, beforeSeries + 1);
    await recurrenceRecords.updateOne({ _id: recurring.id }, { $set: { nextAt: new Date(Date.now() - 10) } });
    assert.equal((await settle(second.occurrenceId)).status, "completed");
    await until(async () => (await inspectSeries(recurring.id)).state === "completed");
    const cancelledSeries = await inspectSeries(stopped.id);
    assert.equal(cancelledSeries.state, "cancelled");
    assert.equal((await api("/jobs/" + cancelledSeries.occurrenceId))[0], 404);
    assert.equal(launchCount, beforeSeries + 2);
    const recoverable = { ...recurring, id: randomUUID(), scheduledAt: Date.now() + 60_000 };
    assert.equal((await registerSeries(recoverable))[0], 201);
    const unclaimed = await inspectSeries(recoverable.id);
    const occurrenceJobs = db.db.collection("operations_jobs");
    await occurrenceJobs.insertOne({
      _id: unclaimed.occurrenceId, seriesId: recoverable.id, ownerId: owner, hostId: device.id,
      status: "scheduled", scheduledAt: new Date(recoverable.scheduledAt), createdAt: new Date(), prompt: "Unclaimed fixture",
    });
    await recurrenceRecords.updateOne({ _id: recoverable.id }, { $set: { state: "cancelled" } });
    assert.equal((await api("/recurrence/" + recoverable.id, { method: "DELETE" }))[0], 204);
    assert.equal((await detail(unclaimed.occurrenceId)).status, "cancelled");
    const historical = Array.from({ length: 26 }, () => ({
      _id: randomUUID(), ownerId: owner, hostId: device.id, state: "completed", createdAt: new Date(),
    }));
    const active = { ...recurring, id: randomUUID(), scheduledAt: Date.now() + 60_000 };
    assert.equal((await registerSeries(active))[0], 201);
    await recurrenceRecords.insertMany(historical);
    assert.equal((await inspectSeries(active.id)).state, "active");
    assert.equal((await api("/recurrence/" + active.id, { method: "DELETE" }))[0], 204);
    await recurrenceRecords.deleteMany({ _id: { $in: historical.map((entry) => entry._id) } });
    console.log("Durable repeat series, missed interval catch-up, cancellation, replay, and owner isolation PASS");

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
    const attention = (await api("/headquarters"))[1];
    assert.equal(attention.workforce[0].state, "approval required");
    assert.equal(attention.workforce[0].job._id, interactive);
    assert.ok(attention.approvals.some((entry) => entry._id === interactive));

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
  const historySession = randomUUID();
  const foreignCursor = randomUUID();
  const historyRows = Array.from({ length: 55 }, (_, index) => ({
    _id: index === 0 ? historySession : randomUUID(), sessionId: historySession, ownerId: owner,
    createdAt: new Date("2026-01-01T12:00:00Z"), status: "completed", prompt: "History cursor fixture",
  }));
  await db.db.collection("operations_jobs").insertMany([
    ...historyRows, { ...historyRows[1], _id: foreignCursor, ownerId: other },
  ]);
  const sessionHistory = `/jobs?session=${historySession}&compact=true`;
  const [pageStatus, latestPage] = await api(sessionHistory);
  assert.equal(pageStatus, 200);
  assert.equal(latestPage.length, 50);
  assert.equal((await api(`${sessionHistory}&before=${foreignCursor}`))[0], 404);
  assert.equal((await api(`${sessionHistory}&before=${latestPage.at(-1)._id}`, { user: other }))[0], 403);
  assert.equal((await api(`${sessionHistory}&before=invalid`))[0], 400);
  const [olderStatus, olderPage] = await api(`${sessionHistory}&before=${latestPage.at(-1)._id}`);
  assert.equal(olderStatus, 200);
  assert.equal(olderPage.length, 5);
  assert.deepEqual([...latestPage, ...olderPage].map(({ _id }) => _id), historyRows.map(({ _id }) => _id).sort().reverse());
  console.log("Owner-scoped conversation cursor, tied timestamps, and isolation PASS");

  const { id: actionHost, token: actionToken } =
    (await api("/hosts", { method: "POST", body: { label: "Typed action fixture" } }))[1];
  const actionSend = backendClient(base, actionToken);
  const instance = randomUUID();
  await actionSend("/heartbeat", { instance, efforts: ["low"], media: true, resources: {
    observedAt: Date.now(), cpu: 28, memory: { total: 4096, free: 1024, secret: "test-only" }, drives: {},
  } });
  const [, infrastructure] = await api("/infrastructure");
  const observed = infrastructure.devices.find(item => item._id === actionHost);
  assert.equal(observed.online, true);
  assert.equal(observed.name, "Typed action fixture");
  assert.deepEqual(observed.resources.memory, { total: 4096, free: 1024 });
  assert.equal((await api("/infrastructure", { user: other }))[0], 403);
  const actionProject = (await api("/projects", { method: "POST", body: {
    name: "Action fixture project", description: "Controlled typed proposal", workspace: "development",
  } }))[1]._id;
  const actionJob = randomUUID();
  const restrictedJob = randomUUID();
  const now = new Date();
  const actionRow = {
    _id: actionJob, ownerId: owner, hostId: actionHost, activeHost: actionHost, instance, sessionId: actionJob,
    status: "running", createdAt: now, leaseUntil: new Date(+now + 45000), workerRole: "direct",
    studioTools: true, studioActor: { role: "first-mate", binding: "unassigned" },
  };
  const jobStore = db.db.collection("operations_jobs");
  await jobStore.insertOne({ ...actionRow, _id: restrictedJob, workerRole: "qa" });
  const proposalBody = {
    instance, callId: "call_fixture", project: "Action fixture project", title: "Verify a real handoff",
    instruction: "Check the fixture result.", criteria: ["Record the observed result."], priority: "normal",
  };
  await assert.rejects(actionSend(`/jobs/${restrictedJob}/objective-proposal`, proposalBody), { status: 409 });
  await assert.rejects(actionSend(`/jobs/${restrictedJob}/studio-briefing`, { instance }), { status: 409 });
  await jobStore.updateOne({ _id: restrictedJob }, { $set: { workerRole: "direct", studioTools: false } });
  await assert.rejects(actionSend(`/jobs/${restrictedJob}/studio-briefing`, { instance }), { status: 409 });
  await jobStore.updateOne({ _id: restrictedJob }, { $set: { status: "completed" }, $unset: { activeHost: "" } });
  await jobStore.insertOne(actionRow);
  const studioBrief = await actionSend(`/jobs/${actionJob}/studio-briefing`, { instance });
  assert.ok(studioBrief.projects.some(item => item.name === "Action fixture project" && item.url.includes(actionProject)));
  assert.equal(studioBrief.turns.running, 1);
  const pathForAction = `/jobs/${actionJob}/objective-proposal`;
  assert.equal((await actionSend(pathForAction, proposalBody)).state, "pending");
  assert.equal((await actionSend(pathForAction, proposalBody)).state, "pending");
  await assert.rejects(actionSend(pathForAction, { ...proposalBody, title: "Changed replay" }), { status: 409 });
  const [, proposal] = await api(pathForAction);
  assert.equal(proposal.projectId, actionProject);
  assert.equal((await api(`/objectives/${proposal.objectiveId}`))[0], 404);
  const approval = { method: "POST", body: { digest: proposal.digest, decision: "approve" } };
  assert.equal((await api(pathForAction, { ...approval, user: other }))[0], 403);
  assert.equal((await fetch(base + "/operations" + pathForAction, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${actionToken}` },
    body: JSON.stringify(approval.body),
  })).status, 401);
  assert.equal((await api(pathForAction, approval))[1].state, "applied");
  assert.equal((await api(pathForAction, approval))[1].state, "applied");
  const [, created] = await api(`/objectives/${proposal.objectiveId}`);
  assert.equal(created.provenance.sourceTurnId, actionJob);
  assert.equal(created.provenance.authorizedBy, "owner");
  assert.equal(created.revision, 0);
  console.log("Typed objective proposal, worker scope, explicit owner decision, and applied replay PASS");
  await jobStore.updateOne({ _id: actionJob }, {
    $set: { status: "failed", finishedAt: new Date() }, $unset: { activeHost: "" },
  });
  const mark = { method: "POST", body: { kind: "incident", id: actionJob } };
  assert.equal((await api("/headquarters/attention", { ...mark, user: other }))[0], 403);
  assert.equal((await api("/headquarters/attention", mark))[0], 204);
  assert.equal((await api("/headquarters/attention", mark))[0], 204);
  const [, afterRead] = await api("/headquarters");
  assert.ok(afterRead.attentionRead.includes("incident:" + actionJob));
  console.log("Owner-only infrastructure and durable attention read state PASS");

  const staleJob = randomUUID();
  await jobStore.insertOne({ ...actionRow, _id: staleJob, sessionId: staleJob, leaseUntil: new Date(Date.now() + 45000) });
  const stalePath = `/jobs/${staleJob}/objective-proposal`;
  assert.equal((await actionSend(stalePath, proposalBody)).state, "pending");
  const [, stale] = await api(stalePath);
  await db.db.collection("operations_projects").updateOne({ _id: actionProject }, { $inc: { revision: 1 } });
  assert.equal((await api(stalePath, { method: "POST", body: { digest: stale.digest, decision: "approve" } }))[0], 409);
  assert.equal((await api(`/objectives/${stale.objectiveId}`))[0], 404);
  await jobStore.updateOne({ _id: staleJob }, { $set: { status: "completed" }, $unset: { activeHost: "" } });

  const imageFixtures = Array.from({ length: 3 }, () => ({
    _id: randomUUID(), ownerId: owner, hostId: actionHost, state: "ready",
    mime: "image/png", size: 999, sha256: "c".repeat(64),
  }));
  await db.db.collection("operations_media").insertMany(imageFixtures);
  const registerFixture = async (index, projectId, approve) => {
    const [result, body] = await saveReference({
      ...referencePayload, id: randomUUID(), mediaId: imageFixtures[index]._id, projectId,
      name: "Approved reference selection fixture " + index,
    });
    assert.equal(result, 201);
    if (approve) assert.equal((await api(`/references/${encodeURIComponent(body._id)}/status`, {
      method: "PUT", body: { revision: 0, status: "approved" },
    }))[0], 204);
    return body._id;
  };
  const selectedReference = await registerFixture(0, actionProject, true);
  await registerFixture(1, actionProject, false);
  await registerFixture(2, "", true);
  const [knowledgeStatus] = await api("/knowledge", { method: "POST", body: {
    projectId: actionProject, kind: "procedure", status: "owner-approved", title: "Fixture method",
    source: "Isolated test", evidence: "Observed", author: "Owner fixture", summary: "Use approved test results.", body: "Verification.",
  } });
  assert.equal(knowledgeStatus, 201);
  const employee = randomUUID();
  await db.db.collection("operations_workforce").insertOne({
    _id: employee, ownerId: owner, kind: "employee", name: "Fixture Artist",
    role: "art-director", workspace: "development", status: "available",
  });
  const assignmentBody = {
    id: randomUUID(), objectiveId: created._id, employeeId: employee, hostId: actionHost,
    workspace: "development", model: "gpt-6.2-sol", effort: "low",
    prompt: "Check the approved reference.", includeProjectReferences: true,
  };
  await actionSend("/heartbeat", { instance, efforts: ["low"], media: true });
  const submitWithReferences = body => api("/jobs", { method: "POST", body });
  assert.equal((await submitWithReferences(assignmentBody))[0], 201);
  assert.equal((await submitWithReferences(assignmentBody))[0], 200);
  assert.equal((await submitWithReferences({ ...assignmentBody, includeProjectReferences: false }))[0], 409);
  const referenceJob = await actionSend("/claim", { instance });
  assert.equal(referenceJob._id, assignmentBody.id);
  assert.deepEqual(referenceJob.mediaInputs.map(item => item.id), [imageFixtures[0]._id]);
  assert.match(referenceJob.prompt, /untrusted supporting context/);
  assert.match(referenceJob.prompt, /Fixture method/);
  await actionSend(`/jobs/${referenceJob._id}/sync`, {
    instance, offset: 0, events: [], result: { status: "completed", error: "" },
  });
  const withdrawnJob = randomUUID();
  assert.equal((await submitWithReferences({ ...assignmentBody, id: withdrawnJob }))[0], 201);
  assert.equal((await api(`/references/${encodeURIComponent(selectedReference)}/status`, {
    method: "PUT", body: { revision: 1, status: "superseded" },
  }))[0], 204);
  assert.equal(await actionSend("/claim", { instance }), null);
  const [, withdrawn] = await api(`/jobs/${withdrawnJob}`);
  assert.equal(withdrawn.status, "interrupted");
  assert.match(withdrawn.error, /approved project image changed/);
  console.log("Assignment approved-image selection, category and scope separation, and replay PASS");

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
  if (objectiveFixture) {
    unlinkSync(path.join(objectiveFixture, "candidate.txt"));
    rmdirSync(objectiveFixture);
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

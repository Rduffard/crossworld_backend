import { createHash, randomUUID } from "node:crypto";
import { acquireWorkerLock, loadCredential } from "./windows.mjs";
import { appendFileSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { AppServer, discoverCodex, model, runTurn } from "./codex.mjs";
import { turnControl } from "./control.mjs";
import { findFfmpeg, localMediaStorage, pollMedia } from "./media-storage.mjs";
import { developmentRepositories, protectedDirectories, sandboxFor, verifyDirectory, verifySandbox, workspacePaths } from "./profiles.mjs";

import promptLimits from "../../src/modules/operations/prompt-limits.js";
import usageTools from "../../src/modules/operations/usage.js";
import diagnostics from "../../src/modules/operations/diagnostics.js";
import { resourceSampler } from "./resources.mjs";

const { PROMPT_LIMIT } = promptLimits;
const { rateLimitObservation, usageHoldUntil } = usageTools;
const interval = 1000;
const offlineLimit = 15_000;

export function backendClient(base, token) {
  if (!base) throw new Error("Set OPERATIONS_BACKEND_URL or open Start Crossworld Operations.cmd.");
  const url = new URL(base);
  const loopback = process.env.OPERATIONS_LOOPBACK_TEST === "1" &&
    url.protocol === "http:" && url.hostname === "127.0.0.1";
  if ((!loopback && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) {
    throw new Error("Use an HTTPS backend URL without credentials, query, or fragment.");
  }
  return async (endpoint, body) => {
    const response = await fetch(`${url.href.replace(/\/$/, "")}/operations/worker${endpoint}`, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4000),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw Object.assign(new Error(`Operations request failed (HTTP ${response.status}).`), { status: response.status });
    }
    return response.json();
  };
}

export const { redact } = diagnostics;

export async function runWorker({ send, efforts, execute, token, signal, profiles, getUsage, getResources, mediaStorage,
  mediaOutput = false, boundedCorrections = false, employeeConversations = false, backgroundReviews = false,
  relayVersion, supervised = false, draining = () => false, reportHeartbeat, log = console.log }) {
  const instance = randomUUID();
  const mediaController = new AbortController();
  const mediaTask = mediaStorage && pollMedia({ send, signal: AbortSignal.any([signal, mediaController.signal]), instance, storage: mediaStorage });
  let advertisedProfiles = profiles;
  const active = new Map();
  let reviewSupported = false;
  let lastContact = Date.now();
  let heartbeat = 0;
  let disconnected = false;
  let connected = false;
  async function sync(lane, state) {
    if (!state.batch) {
      const events = state.events.slice(0, 5);
      const result = events.length === state.events.length ? state.result : undefined;
      state.batch = { instance, offset: state.offset, events, result };
    }
    const reply = await send(`/jobs/${state.job._id}/sync`, { ...state.batch, control: state.control.snapshot() });
    state.batch = undefined;
    state.events.splice(0, reply.eventCount - state.offset);
    state.offset = reply.eventCount;
    if (["cancelled", "cancelling", "interrupted"].includes(reply.status)) {
      state.controller.abort(reply.status === "interrupted" ? "interrupted" : "cancelled");
    }
    if (reply.status === "running") state.control.receive(reply);
    if (state.result && ["completed", "cancelled", "interrupted", "failed"].includes(reply.status)) active.delete(lane);
  }
  async function step(lane) {
    const previous = active.get(lane);
    if (previous) return sync(lane, previous);
    if (draining()) return;
    const job = await send("/claim", { instance, extendedPrompts: true, lane });
    if (!job || signal.aborted) return;
    const state = { job, offset: job.eventCount || 0, events: [], controller: new AbortController() };
    state.control = turnControl(state.controller.signal, (value) => redact(value, token));
    active.set(lane, state);
    if (job.status === "cancelling") {
      state.result = { status: "cancelled", error: "" };
      return;
    }
    const record = (view, label, value) => {
      const clean = redact(value, token).toWellFormed();
      const messageId = view === "activity" && ["Agent commentary", "Agent message"].includes(label)
        ? randomUUID() : undefined;
      let index = 0;
      while (index < clean.length) {
        let end = Math.min(index + 3000, clean.length);
        if (clean.charCodeAt(end - 1) >= 0xd800 && clean.charCodeAt(end - 1) <= 0xdbff) end--;
        state.events.push({ view, label: redact(label, token).slice(0, 120), text: clean.slice(index, end),
          ...(messageId ? { messageId } : {}) });
        index = end;
      }
    };
    record("activity", "Job assigned", "The Windows worker received the job.");
    state.execution = Promise.resolve().then(() => execute(job, record, state.controller.signal, state.control, instance))
      .catch(() => ({ status: "failed", error: "Local execution failed." }))
      .then((result) => {
        const status = state.controller.signal.aborted && result.status !== "completed"
          ? state.controller.signal.reason : result.status;
        state.result = { ...result, status, error: redact(result.error, token).slice(0, 2000) };
      });
  }
  try {
    while (!signal.aborted) {
      try {
        if (Date.now() - heartbeat >= 5000) {
          const announce = () => send("/heartbeat", {
            instance, efforts, profiles: advertisedProfiles, extendedPrompts: true, boundedCorrections, employeeConversations, backgroundReviews, media: !!mediaStorage, usage: getUsage?.() || undefined,
            mediaVideoFrames: mediaStorage?.videoFrames === true,
            mediaOutput,
            mediaUsage: mediaStorage?.latestUsage(),
            resources: getResources?.(),
            relayVersion, supervised,
          });
          let capabilities;
          try { capabilities = await announce(); }
          catch (error) {
            if (error.status !== 400 || !advertisedProfiles?.includes("full-access")) throw error;
            advertisedProfiles = advertisedProfiles.filter((profile) => profile !== "full-access");
            capabilities = await announce();
            log("Relay did not accept Full Access. Restricted profiles remain available until the worker restarts.");
          }
          reviewSupported = backgroundReviews && capabilities?.backgroundReviews === true;
          heartbeat = Date.now();
          reportHeartbeat?.({ profiles: advertisedProfiles, backgroundReviews: reviewSupported, active: active.size });
        }
        await step("primary");
        if (reviewSupported || active.has("review")) await step("review");
        lastContact = Date.now();
        if (disconnected) log("Operations connection restored.");
        else if (!connected) log("Connected to Crossworld Operations. Device authentication verified.");
        connected = true;
        disconnected = false;
        if (draining() && active.size === 0) return;
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          throw new Error("Device registration is invalid or revoked. Open Register Crossworld Operations.cmd.", { cause: error });
        }
        if (!disconnected) {
          const hint = error.status === 404 ? "Operations is unavailable on the backend. Check deployment and owner configuration." :
            error.status === 409 ? "Waiting for the previous worker lease or assignment to clear." :
            "Operations connection unavailable. Check HTTPS connectivity.";
          log(`${hint} Retrying.`);
        }
        disconnected = true;
        if (Date.now() - lastContact >= offlineLimit) {
          for (const state of active.values()) state.controller.abort("interrupted");
        }
      }
      const backlog = [...active.values()].some(state => state.events.length >= 5);
      await sleep(!disconnected && backlog ? 50 : interval, undefined, { signal }).catch(() => {});
    }
  } finally {
    mediaController.abort();
    await mediaTask;
    await Promise.all([...active].map(async ([lane, state]) => {
      state.controller.abort("interrupted");
      await state.execution;
      await sync(lane, state).catch(() => {});
    }));
  }
}

function resolvedWorkspaces() {
  return Object.fromEntries(Object.entries(workspacePaths).map(([key, directory]) => {
    const resolved = realpathSync(directory);
    if (resolved.toLowerCase() !== directory.toLowerCase() || !statSync(resolved).isDirectory()) {
      throw new Error(`Authorized workspace is missing or redirected: ${directory}`);
    }
    return [key, resolved];
  }));
}

function localSessions(deviceId) {
  const ledger = path.join(process.env.LOCALAPPDATA, "Crossworld Operations", `threads-${deviceId}.jsonl`);
  const threads = new Map();
  let content = "";
  try { content = readFileSync(ledger, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const line of content.split("\n").filter(Boolean)) {
    const { threadId, workspace, profile = "read-only" } = JSON.parse(line);
    threads.set(threadId, { workspace, profile });
  }
  return {
    allows: (threadId, workspace, profile) => {
      const saved = threads.get(threadId);
      return saved?.workspace === workspace && saved?.profile === profile;
    },
    remember(threadId, workspace, profile) {
      if (threads.has(threadId)) return;
      appendFileSync(ledger, JSON.stringify({ threadId, workspace, profile }) + "\n", { flush: true });
      threads.set(threadId, { workspace, profile });
    },
  };
}

export async function verifyMediaOutbox(exe, storage, workshopRoots) {
  const [root] = workshopRoots;
  const probe = new AppServer(exe, root);
  let outbox;
  let sibling;
  try {
    outbox = await storage.openOutbox(randomUUID());
    sibling = await storage.openOutbox(randomUUID());
    const roots = [...workshopRoots, outbox.directory];
    await probe.initialize();
    await verifySandbox(probe, root, sandboxFor(root, roots), [...storage.protectedPaths, sibling.directory], roots);
    return true;
  } catch { return false; }
  finally {
    probe.close();
    await outbox?.removeIfEmpty().catch(() => {});
    await sibling?.removeIfEmpty().catch(() => {});
  }
}

async function startWorker(draining = () => false) {
  const startup = phase => {
    if (process.connected && process.argv.includes("--supervised")) {
      process.send({ type: "startup", phase }, () => {});
    }
  };
  startup("codex-discovery");
  const { exe, version } = discoverCodex();
  const workspaces = resolvedWorkspaces();
  const autonomousNetwork = process.env.OPERATIONS_AUTONOMOUS_NETWORK === "development";
  let fullAccess = false;
  const editRoots = {};
  const candidates = { development: developmentRepositories, workshop: [workspaces.workshop] };
  const exclusions = (roots) => protectedDirectories.filter((directory) => !roots.some((root) => {
    const relative = path.relative(root, directory);
    return !relative || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep));
  }));
  const probe = new AppServer(exe, workspaces.development);
  let efforts;
  let usage;
  const observeUsage = (rateLimits) => {
    if (rateLimits?.limitId != null && rateLimits.limitId !== "codex") return;
    usage = rateLimitObservation({ ...rateLimits, observedAt: Date.now() }) || usage;
  };
  let lastUsageAttempt = 0;
  async function refreshUsage(server) {
    lastUsageAttempt = Date.now();
    try {
      const { rateLimits, rateLimitsByLimitId } = await server.request("account/rateLimits/read", {});
      observeUsage(rateLimitsByLimitId?.codex || rateLimits);
    } catch { /* Telemetry is optional. Stale readings automatically expire. */ }
  }
  async function refreshHeldUsage() {
    lastUsageAttempt = Date.now();
    const server = new AppServer(exe, workspaces.development);
    try {
      await server.initialize();
      await refreshUsage(server);
    } catch { /* Keep the observed snapshot until it expires. */ }
    finally { server.close(); }
  }
  try {
    startup("subscription-check");
    await probe.initialize();
    efforts = await probe.capabilities();
    if (!efforts.length) throw new Error("No supported reasoning efforts were reported.");
    await refreshUsage(probe);
    console.log(`${version} · ChatGPT sign-in verified · ${model} (${efforts.join(", ")})`);
    console.log("Authorized workspaces:", ...Object.values(workspaces));
    if (process.env.OPERATIONS_FULL_ACCESS === "1") {
      try {
        const result = await probe.request("command/exec", {
          command: [process.execPath, "-e", "console.log('CW_FULL_ACCESS_READY')"],
          cwd: workspaces.development, sandboxPolicy: { type: "dangerFullAccess" }, timeoutMs: 12000,
        });
        fullAccess = result.exitCode === 0 && result.stdout.trim() === "CW_FULL_ACCESS_READY";
      } catch { /* Other profiles can still be used. */ }
      if (fullAccess) {
        console.log("Full Access enabled. Commands run with the Windows worker account's permissions.");
      } else {
        console.error("Full Access command probe failed. Other profiles can still be used.");
      }
    }
  } finally {
    probe.close();
  }
  startup("workspace-checks");
  for (const [profile, directories] of Object.entries(candidates)) {
    let profileProbe;
    try {
      const roots = directories.map(verifyDirectory);
      profileProbe = new AppServer(exe, roots[0]);
      await profileProbe.initialize();
      await verifySandbox(profileProbe, roots[0], sandboxFor(roots[0], roots), exclusions(roots), roots);
      editRoots[profile] = roots;
      console.log(`Editing verified for ${profile}.`);
    } catch (error) {
      console.error(`Editing unavailable for ${profile}. ${error.message}`);
    } finally {
      profileProbe?.close();
    }
  }
  if (process.argv.includes("--check")) return;
  if (process.argv.includes("--check-device")) {
    const send = backendClient(process.env.OPERATIONS_BACKEND_URL, loadCredential({ onboard: false, register: false }));
    const result = await send("/readiness");
    if (result.authenticated !== true) throw new Error("The backend did not confirm device authentication.");
    console.log("Persisted device authentication verified without acquiring a relay lease.");
    return;
  }
  if (draining()) return;
  startup("device-credential");
  const token = loadCredential({ onboard: process.argv.includes("--onboard"), register: process.argv.includes("--register") });
  startup("media-storage");
  const mediaRoot = process.env.OPERATIONS_MEDIA_ROOT || "D:\\Crossworld Operations\\Media";
  const mediaOptions = {
    workspaceRoots: Object.values(workspaces),
    requirePrivateAcl: true,
    ffmpeg: await findFfmpeg(process.env.OPERATIONS_FFMPEG_EXE, [...Object.values(workspaces), mediaRoot]),
    ...(process.env.OPERATIONS_MEDIA_QUOTA_BYTES ? { quota: Number(process.env.OPERATIONS_MEDIA_QUOTA_BYTES) } : {}),
  };
  const mediaStorage = await localMediaStorage(mediaRoot, mediaOptions).catch(() => {
    console.error("Media storage is unavailable. Check the local media directory and quota.");
  });
  const mediaOutput = !!(mediaStorage && editRoots.workshop && await verifyMediaOutbox(exe, mediaStorage, editRoots.workshop));
  if (mediaStorage && editRoots.workshop && !mediaOutput) console.error("Private artifact exports are unavailable. The job-folder sandbox check failed.");
  const sessions = localSessions(token.split(".")[0]);
  const send = backendClient(process.env.OPERATIONS_BACKEND_URL, token);
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  process.on("SIGTERM", () => controller.abort());
  startup("relay-connect");
  await runWorker({
    send, token, efforts, profiles: ["read-only", ...Object.keys(editRoots), ...(fullAccess ? ["full-access"] : [])],
    signal: controller.signal, mediaStorage, mediaOutput,
    relayVersion: createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex").slice(0, 12),
    supervised: process.connected === true && process.argv.includes("--supervised"),
    draining,
    reportHeartbeat: report => {
      if (process.connected) process.send({ type: "heartbeat", ...report }, () => {});
    },
    getResources: process.env.OPERATIONS_RESOURCE_TELEMETRY === "1" ? resourceSampler() : undefined,
    getUsage: () => {
      if (usageHoldUntil(usage) && Date.now() - lastUsageAttempt >= 120_000) void refreshHeldUsage();
      return usage;
    },
    boundedCorrections: true,
    employeeConversations: true,
    backgroundReviews: process.env.OPERATIONS_BACKGROUND_REVIEWS === "1",
    execute: async (job, record, signal, control, instance) => {
      const profile = job.profile || "read-only";
      const unrestricted = profile === "full-access";
      const correction = job.workerRole === "correction";
      const strictReadOnly = ["assignment", "employee-conversation"].includes(job.workerRole);
      if ((strictReadOnly && profile !== "read-only") ||
          (job.workerRole === "employee-conversation" && !job.employeeContext) ||
          (correction && profile !== job.workspace) || !Object.hasOwn(workspaces, job.workspace) || job.model !== model || !efforts.includes(job.effort) ||
          (unrestricted ? !fullAccess : profile !== "read-only" && (profile !== job.workspace || !Object.hasOwn(editRoots, profile))) ||
          typeof job.prompt !== "string" || job.prompt.length > PROMPT_LIMIT || !job.prompt.isWellFormed() ||
          (job.codexThreadId && !sessions.allows(job.codexThreadId, job.workspace, profile))) {
        return { status: "failed", error: "Job is outside the worker allowlist." };
      }
      if (job.status === "cancelling" || job.eventCount > 0) {
        return { status: "interrupted", error: "Previous assignment cannot be safely replayed." };
      }
      if (job.outputMedia && (!mediaOutput || job.codexThreadId || profile !== "workshop" || correction)) {
        return { status: "failed", error: "Job-scoped media export is unavailable on this host." };
      }
      const roots = profile === "read-only" || unrestricted ? [] : editRoots[profile].map(verifyDirectory);
      const [root] = roots;
      const cwd = root || workspaces[job.workspace];
      let staged;
      let outbox;
      if (job.mediaInputs?.length) {
        if (!mediaStorage) return { status: "failed", error: "The media store is unavailable." };
        try { staged = await mediaStorage.stageImages(job.mediaInputs); }
        catch { return { status: "failed", error: "An authorized image could not be verified or staged." }; }
      }
      try {
        if (job.outputMedia) {
          outbox = await mediaStorage.openOutbox(job._id);
          roots.push(outbox.directory);
        }
        return await runTurn(new AppServer(exe, cwd), job, cwd, record, signal, control, {
          root,
          roots,
          gitRoots: profile === "development" && !correction ? roots : [],
          protectedDirectories: unrestricted ? undefined : [...exclusions(roots), ...(mediaStorage?.protectedPaths || [])],
          supervised: !!root && !correction,
          fullAccess: unrestricted && fullAccess,
          autonomousNetwork: !correction && autonomousNetwork && profile === "development",
          strictReadOnly,
          employeeContext: job.employeeContext,
          delegatedOutcomes: job.delegatedOutcomes,
          approvedDecisions: job.approvedDecisions,
          localMcp: !job.workerRole || job.workerRole === "direct",
          observeUsage,
          imagePaths: staged?.files,
          artifactDir: outbox?.directory,
          publishArtifact: outbox ? (filename) => mediaStorage.publishArtifact(job._id, filename, (phase, metadata) =>
            send(`/media/jobs/${job._id}/artifacts`, { instance, phase, ...metadata }), signal) : undefined,
          proposeObjective: job.studioActions === true ? (callId, value) => send(`/jobs/${job._id}/objective-proposal`, {
            instance, callId, project: redact(value.project, token), title: redact(value.title, token),
            instruction: redact(value.instruction, token), priority: value.priority,
            criteria: Array.isArray(value.criteria) ? value.criteria.map(item => redact(item, token)) : undefined,
          }) : undefined,
          delegateOperationsReview: job.studioActions === true ? (callId, employee) =>
            send(`/jobs/${job._id}/delegate-operations-review`, { instance, callId, employee: redact(employee, token) }) : undefined,
          readStudioRecords: job.studioActions === true ? (query) =>
            send(`/jobs/${job._id}/studio-records`, { ...query, instance }) : undefined,
          readStudioBriefing: job.studioActions === true ? () => send(`/jobs/${job._id}/studio-briefing`, { instance }) : undefined,
          remember: (threadId) => sessions.remember(threadId, job.workspace, profile),
        });
      } finally {
        await staged?.cleanup().catch(() => {});
        await outbox?.removeIfEmpty().catch(() => {});
      }
    },
  });
}

async function main() {
  if (process.platform !== "win32" || Number(process.versions.node.split(".")[0]) < 22) {
    throw new Error("The worker requires Windows and Node.js 22 or later.");
  }
  if (process.argv.some(argument => argument === "--check" || argument === "--check-device")) return startWorker();
  let drainRequested = false;
  if (process.connected) {
    process.on("message", message => { if (message?.type === "drain") drainRequested = true; });
    process.once("disconnect", () => { drainRequested = true; });
  }
  let releaseLock;
  try {
    releaseLock = await acquireWorkerLock();
    await startWorker(() => drainRequested);
  }
  finally {
    await releaseLock?.();
    if (process.connected) process.disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

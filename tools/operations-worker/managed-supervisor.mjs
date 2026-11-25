import { fork } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { acquireWorkerLock, loadCredential } from "./windows.mjs";
import { backendClient } from "./worker.mjs";
import releaseFormat from "../../src/modules/operations/managed-release-format.js";

const digest = /^[a-f\d]{64}$/;
const allowed = /^(?:tools\/operations-worker\/[\w .-]+\.(?:mjs|md|cmd|ps1)|src\/modules\/operations\/(?:assignment-scopes|diagnostics|media-artifacts|prompt-limits|usage)\.js)$/;
const entrypoint = "tools/operations-worker/worker.mjs";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export function releaseStore(root) {
  if (!path.isAbsolute(root) || realpathSync(root) !== root) throw new Error("Invalid managed release directory.");
  const stateFile = path.join(root, "state.json");
  const journalFile = path.join(root, "handover.json");
  const read = file => JSON.parse(readFileSync(file, "utf8"));
  const write = (file, value) => {
    const staged = file + "." + randomUUID();
    writeFileSync(staged, JSON.stringify(value), { flag: "wx", flush: true, mode: 0o600 });
    renameSync(staged, file);
  };
  function open(id) {
    if (typeof id !== "string" || !digest.test(id)) throw new Error("Invalid release digest.");
    const directory = path.join(root, id);
    if (realpathSync(directory) !== directory) throw new Error("Redirected release directory.");
    const manifest = path.join(directory, "runtime-manifest.json");
    const info = lstatSync(manifest);
    if (!info.isFile() || info.nlink !== 1 || info.size > 65536) throw new Error("Unsafe worker manifest.");
    const bytes = readFileSync(manifest);
    const files = JSON.parse(bytes);
    if (hash(bytes) !== id || !Array.isArray(files) || files.length > 64 ||
        new Set(files.map(item => item.file)).size !== files.length || !files.some(item => item.file === entrypoint)) {
      throw new Error("Release manifest does not match its approved digest.");
    }
    for (const entry of files) {
      if (typeof entry.file !== "string" || !allowed.test(entry.file) || !digest.test(entry.sha256)) throw new Error("Unsafe manifest entry.");
      const file = path.join(directory, entry.file);
      const stat = lstatSync(file);
      if (realpathSync(file) !== file || !stat.isFile() || stat.nlink !== 1 || stat.size > 1048576 || hash(readFileSync(file)) !== entry.sha256) {
        throw new Error("A managed relay file did not match its manifest.");
      }
    }
    const expected = new Set(["runtime-manifest.json", ...files.map(entry => entry.file)]);
    const directories = new Set();
    for (const file of expected) {
      let parent = path.posix.dirname(file);
      while (parent !== ".") {
        directories.add(parent);
        parent = path.posix.dirname(parent);
      }
    }
    const pending = [""];
    while (pending.length) {
      const parent = pending.pop();
      for (const entry of readdirSync(path.join(directory, parent), { withFileTypes: true })) {
        const member = path.posix.join(parent, entry.name);
        if (entry.isDirectory() && directories.has(member)) pending.push(member);
        else if (!entry.isFile() || !expected.has(member)) throw new Error("The managed release contains an unmanifested entry.");
      }
    }
    return { worker: path.join(directory, entrypoint), version: files.find(item => item.file === entrypoint).sha256.slice(0, 12) };
  }
  function stage(pkg) {
    const release = releaseFormat.parsePackage(pkg);
    if (!release) throw new Error("Invalid reviewed worker package.");
    const target = path.join(root, release.digest);
    if (!existsSync(target)) {
      const staging = path.join(root, ".stage-" + randomUUID());
      mkdirSync(staging, { mode: 0o700 });
      try {
        const pending = path.join(staging, release.digest);
        for (const [file, bytes] of release.files) {
          const destination = path.join(pending, file);
          mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
          writeFileSync(destination, bytes, { flag: "wx", mode: 0o600, flush: true });
        }
        writeFileSync(path.join(pending, "runtime-manifest.json"), release.manifest, { flag: "wx", mode: 0o600, flush: true });
        releaseStore(staging).open(release.digest);
        try { renameSync(pending, target); }
        catch (error) { if (!existsSync(target)) throw error; }
      } finally {
        rmSync(staging, { force: true, recursive: true });
      }
    }
    return open(release.digest);
  }
  return {
    open, stage,
    list: () => readdirSync(root).flatMap(name => {
      if (!digest.test(name)) return [];
      try {
        open(name);
        return [{ name, stagedAt: lstatSync(path.join(root, name)).mtimeMs }];
      } catch { return []; }
    }).sort((a, b) => b.stagedAt - a.stagedAt || a.name.localeCompare(b.name)).slice(0, 16).map(item => item.name),
    state: () => read(stateFile),
    save: state => write(stateFile, state),
    journal: () => existsSync(journalFile) ? read(journalFile) : null,
    record: intent => write(journalFile, intent),
    clear: () => { if (existsSync(journalFile)) unlinkSync(journalFile); },
  };
}

export function lifecycleController({ store, service, send }) {
  let state = store.state();
  const save = value => { store.save(value); state = value; };
  const receipt = (intent, status, active, previous = state.previous) => {
    save({ active, previous, receipt: { id: intent._id, status, active } });
    store.clear();
  };

  async function recover() {
    const journal = store.journal();
    const completed = journal && state.receipt?.id === journal._id;
    if (journal && !completed) {
      await service.start(store.open(journal.current));
      receipt(journal, "rolled-back", journal.current);
    } else {
      await service.start(store.open(state.active));
      if (completed) store.clear();
    }
  }

  async function poll() {
    if (state.receipt) {
      const { id, ...body } = state.receipt;
      await send("/supervisor/" + id + "/receipt", body);
      save({ active: state.active, previous: state.previous });
    }
    const releases = [...new Set([state.active, ...(state.previous ? [state.previous] : []), ...store.list()])].slice(0, 16);
    const intent = await send("/supervisor/poll", {
      active: state.active, previous: state.previous ?? null, releases, ...(store.stage ? { remoteStaging: true } : {}),
    });
    if (!intent) {
      if (store.stage) await stagePending();
      return;
    }
    if (intent.current !== state.active || !["restart", "update", "rollback"].includes(intent.operation) ||
        (intent.operation === "restart" ? intent.target !== state.active : intent.target === state.active) ||
        (intent.operation === "rollback" && intent.target !== state.previous)) {
      throw new Error("The lifecycle request no longer matches the local release.");
    }
    let target;
    try {
      target = store.open(intent.target);
      await service.probe(target);
    } catch {
      receipt(intent, "failed", state.active);
      return;
    }
    if ((await send("/handover-readiness", {})).ready !== true) {
      receipt(intent, "failed", state.active);
      return;
    }
    store.record(intent);
    try { await service.drain(); }
    catch {
      await service.restore(store.open(state.active));
      receipt(intent, "failed", state.active);
      return;
    }
    try {
      await service.start(target);
      receipt(intent, "completed", intent.target, intent.target === intent.current ? state.previous : intent.current);
    } catch {
      await service.stopRejected();
      await service.start(store.open(intent.current));
      receipt(intent, "rolled-back", intent.current);
    }
  }
  async function stagePending() {
    let request;
    try { request = await send("/supervisor/staging/poll", {}); }
    catch (error) {
      if (error.status !== 404) throw error;
      return;
    }
    if (!request || Date.parse(request.expiresAt) <= Date.now()) return;
    let status;
    try {
      store.stage(request.package);
      status = "staged";
    } catch {
      status = "failed";
    }
    await send("/supervisor/staging/" + request._id + "/receipt", { status, digest: request.package?.digest });
  }
  return { recover, poll };
}

export function workerProcess({ launch, readinessMs = 110_000, drainMs = 25_000, probe }) {
  let child;
  let exit;
  let observation;
  let requiredProfiles = ["read-only", "development", "workshop"];
  function waitForExit(milliseconds) {
    return Promise.race([exit.then(() => true), delay(milliseconds).then(() => false)]);
  }
  return {
    probe,
    async start(release) {
      if (child) throw new Error("The previous worker process is still present.");
      const instance = launch(release.worker);
      child = instance;
      observation = null;
      exit = new Promise(resolve => {
        instance.once("error", done);
        instance.once("exit", done);
        function done() { if (child === instance) child = null; resolve(); }
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error("The expected authenticated heartbeat did not arrive.")), readinessMs);
        const onMessage = message => {
          if (message?.type !== "heartbeat") return;
          observation = message;
          if (message.relayVersion === release.version && Array.isArray(message.profiles) &&
              requiredProfiles.every(profile => message.profiles.includes(profile))) finish();
        };
        function finish(error) {
          clearTimeout(timer);
          instance.off("message", onMessage);
          if (error) reject(error);
          else { requiredProfiles = observation.profiles; resolve(); }
        }
        instance.on("message", onMessage);
        exit.then(() => finish(new Error("The relay exited before its expected heartbeat.")));
      });
      instance.on("message", message => { if (message?.type === "heartbeat") observation = message; });
    },
    async drain() {
      if (!child) return;
      if (!child.connected || observation?.active !== 0) throw new Error("The worker could not confirm it is idle.");
      child.send({ type: "drain" });
      if (!await waitForExit(drainMs)) throw new Error("The worker did not acknowledge drain.");
    },
    async stopRejected() {
      if (!child) return;
      if (observation?.active > 0) throw new Error("The rejected worker reports active assignments.");
      child.kill();
      if (!await waitForExit(5000)) throw new Error("The rejected worker did not exit.");
    },
    async restore(release) {
      if (child && !await waitForExit(drainMs)) throw new Error("The prior worker is still draining.");
      await this.start(release);
    },
    alive: () => !!child,
    disconnect: () => { if (child?.connected) child.disconnect(); },
  };
}

async function main() {
  if (process.platform !== "win32" || process.argv[2] !== "--managed-releases") throw new Error("Run the enrolled Windows supervisor.");
  process.env.OPERATIONS_BACKEND_URL ||= "https://api.crossworldcreative.com";
  const root = process.argv[3];
  const key = hash(homedir().toLowerCase()).slice(0, 24);
  const releaseLock = await acquireWorkerLock("\\\\.\\pipe\\crossworld-operations-supervisor-" + key);
  let service;
  let pulse;
  try {
    const send = backendClient(process.env.OPERATIONS_BACKEND_URL, loadCredential({ onboard: false, register: false }));
    const spawn = (worker, args) => fork(worker, args, { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
    service = workerProcess({
      launch: worker => spawn(worker, ["--supervised"]),
      probe: ({ worker }) => new Promise((resolve, reject) => {
        const child = spawn(worker, ["--check"]);
        const timer = setTimeout(() => { child.kill(); reject(new Error("Release preflight timed out.")); }, 115_000);
        child.once("error", error => { clearTimeout(timer); reject(error); });
        child.once("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error("Release preflight failed.")); });
      }),
    });
    const store = releaseStore(root);
    const controller = lifecycleController({ store, service, send });
    pulse = setInterval(() => send("/supervisor/pulse", {}).catch(() => {}), 5000);
    await controller.recover();
    await controller.poll();
    writeFileSync(path.join(root, "supervisor-ready.json"), JSON.stringify({
      active: store.state().active, observedAt: new Date().toISOString(),
    }), { flush: true });
    for (;;) {
      if (!service.alive() || store.journal()) throw new Error("The managed relay requires restart or interrupted handover recovery.");
      await controller.poll().catch(error => console.error(error.message));
      await delay(5000);
    }
  } finally {
    clearInterval(pulse);
    service?.disconnect();
    await releaseLock();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

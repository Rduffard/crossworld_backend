const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const workerFiles = /^tools\/operations-worker\/[\w -]+\.(?:mjs|cmd|md)$/;
const workerDependencies = ["diagnostics", "media-artifacts", "prompt-limits", "usage"]
  .map(name => "src/modules/operations/" + name + ".js");
const workerReleaseFile = file => workerFiles.test(file) || workerDependencies.includes(file);

function createWorkerSupervisor({ directory, service }) {
  if (!path.isAbsolute(directory) || directory !== fs.realpathSync(directory)) throw new Error("Invalid supervisor directory.");
  const active = path.join(directory, "active-worker.json");
  const journal = path.join(directory, "worker-restart.json");
  const name = (value) => {
    if (typeof value !== "string" || !/^worker-[a-f\d-]{36}$/.test(value)) throw new Error("Invalid worker version directory.");
    return value;
  };
  const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
  function save(file, value) {
    const staged = `${file}.${randomUUID()}`;
    fs.writeFileSync(staged, JSON.stringify(value), { mode: 0o600, flag: "wx", flush: true });
    fs.renameSync(staged, file);
  }
  const versionPath = (version) => {
    const location = path.join(directory, name(version));
    if (location !== fs.realpathSync(location)) throw new Error("Redirected worker version directory.");
    return location;
  };
  async function recover() {
    if (!fs.existsSync(journal)) return;
    const { previous, phase } = read(journal);
    const location = versionPath(previous);
    if (phase === "draining") await service.drainAndStop();
    else await service.stop();
    save(active, { version: previous });
    await service.startAndWait(location);
    fs.unlinkSync(journal);
  }
  let busy = false;
  async function exclusively(action) {
    if (busy) throw new Error("A worker restart is already in progress.");
    busy = true;
    try { return await action(); }
    finally { busy = false; }
  }
  return {
    recover: () => exclusively(recover),
    activate: (intent, release) => exclusively(async () => {
      await recover();
      const previous = name(read(active).version);
      if (intent.target !== previous) throw new Error("The reviewed active worker version has changed.");
      versionPath(previous);
      const next = `worker-${randomUUID()}`;
      const location = path.join(directory, next);
      if (!release.files.includes("tools/operations-worker/worker.mjs")) throw new Error("Worker entrypoint missing.");
      if (release.files.some(file => !workerReleaseFile(file))) throw new Error("Invalid worker release file.");
      fs.mkdirSync(location, { mode: 0o700 });
      for (const file of release.files) {
        const target = path.join(location, file);
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
        fs.writeFileSync(target, release.readFile(file), {
          mode: 0o600, flag: "wx", flush: true,
        });
      }
      await service.probe(location);
      const receipt = { previous, next, commit: intent.headSha };
      save(journal, { ...receipt, phase: "draining" });
      await service.drainAndStop();
      save(journal, { ...receipt, phase: "starting" });
      try {
        save(active, { version: next });
        await service.startAndWait(location);
        fs.unlinkSync(journal);
      } catch (error) {
        await recover();
        throw error;
      }
    }),
  };
}

module.exports = { createWorkerSupervisor, workerReleaseFile, workerDependencies };

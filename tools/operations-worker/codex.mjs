import { execFileSync, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

export const model = "gpt-6.2-sol";

export function discoverCodex() {
  const platform = ({ x64: "x64", arm64: "arm64" })[process.arch];
  if (process.platform !== "win32" || !platform) throw new Error("A supported Windows host is required.");
  const binary = platform === "x64" ? "x86_64" : "aarch64";
  const npm = path.join(process.env.APPDATA, "npm", "node_modules", "@openai", "codex");
  const vendor = ["vendor", `${binary}-pc-windows-msvc`, "bin", "codex.exe"];
  const candidates = [
    process.env.OPERATIONS_CODEX_EXE,
    ...process.env.PATH.split(path.delimiter).map((dir) => path.join(dir, "codex.exe")),
    path.join(npm, "node_modules", "@openai", `codex-win32-${platform}`, ...vendor),
    path.join(npm, ...vendor),
  ];
  const exe = candidates.find((file) => file && path.isAbsolute(file) &&
    path.basename(file).toLowerCase() === "codex.exe" && existsSync(file));
  if (!exe) throw new Error("Set OPERATIONS_CODEX_EXE to the absolute path to codex.exe.");
  const version = execFileSync(exe, ["--version"], {
    encoding: "utf8", timeout: 5000, windowsHide: true, env: codexEnvironment(),
  }).trim();
  if (!/^codex-cli 0\.172\./.test(version)) throw new Error(`App-server compatibility requires Codex CLI 0.172.x. Found ${version}.`);
  return { exe, version };
}

// Pass only Windows runtime paths and the local Codex profile to the child.
function codexEnvironment() {
  const keys = /^(path|pathext|userprofile|home|homedrive|homepath|appdata|localappdata|systemroot|windir|systemdrive|comspec|temp|tmp|programdata|programfiles(?:\(x86\))?|codex_home)$/i;
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => keys.test(key)));
}

export class AppServer extends EventEmitter {
  constructor(exe, cwd, disabledServers = []) {
    super();
    this.exe = exe;
    this.pending = new Map();
    this.counter = 0;
    this.child = spawn(exe, [
      "app-server", "--listen", "stdio://",
      "-c", 'forced_login_method="chatgpt"',
      "-c", 'model_provider="openai"',
      "-c", 'service_tier="default"',
      "-c", 'web_search="disabled"',
      "-c", 'shell_environment_policy.inherit="none"',
      ...["multi_agent", "multi_agent_v2", "plugins", "computer_use", "browser_use", "in_app_browser"]
        .flatMap((feature) => ["--disable", feature]),
      ...disabledServers.flatMap((name) => ["-c", `mcp_servers.${name}.enabled=false`]),
    ], { cwd, env: codexEnvironment(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const fail = (error) => {
      if (this.closed) return;
      this.closed = error;
      for (const finish of this.pending.values()) finish(error);
      this.emit("closed", error);
    };
    this.child.once("error", fail);
    this.child.stdin.on("error", fail);
    this.child.once("exit", (code) => fail(new Error(`Codex app-server exited (${code ?? "terminated"}).`)));
    this.child.stderr.resume();
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      let message;
      try { message = JSON.parse(line); } catch { fail(new Error("Invalid Codex protocol output.")); return; }
      if (message.method && message.id !== undefined) {
        this.emit("approval", message.method);
        const decisions = {
          "item/commandExecution/requestApproval": { decision: "decline" },
          "item/fileChange/requestApproval": { decision: "decline" },
          "item/permissions/requestApproval": { permissions: {}, scope: "turn" },
        };
        const result = Object.hasOwn(decisions, message.method) && decisions[message.method];
        this.write(result ? { id: message.id, result } : {
          id: message.id, error: { code: -32601, message: "Server request unavailable in this worker." },
        });
      } else if (message.method) {
        this.emit("notification", message.method, message.params);
      } else {
        this.pending.get(message.id)?.(message.error && new Error(message.error.message), message.result);
      }
    });
  }

  write(message) {
    if (!this.closed) this.child.stdin.write(JSON.stringify(message) + "\n");
  }

  request(method, params) {
    if (this.closed) return Promise.reject(this.closed);
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      const finish = (error, value) => {
        clearTimeout(timer);
        this.pending.delete(id);
        if (error) reject(error);
        else resolve(value);
      };
      const timer = setTimeout(() => finish(new Error(`Codex request timed out (${method}).`)), 20_000);
      this.pending.set(id, finish);
      this.write({ id, method, params });
    });
  }

  async initialize() {
    await this.request("initialize", { clientInfo: { name: "crossworld_operations", version: "0.1.0" } });
    this.write({ method: "initialized" });
    const { account } = await this.request("account/read", { refreshToken: false });
    if (account?.type !== "chatgpt") throw new Error("Codex must already be signed in using ChatGPT.");
  }

  async capabilities() {
    let cursor;
    do {
      const page = await this.request("model/list", { cursor, limit: 100, includeHidden: true });
      const selected = page.data.find((entry) => entry.model === model);
      if (selected) return selected.supportedReasoningEfforts.map((entry) => entry.reasoningEffort);
      cursor = page.nextCursor;
    } while (cursor);
    throw new Error(`${model} is unavailable for this Codex account.`);
  }

  async enabledServers(cwd) {
    const { config } = await this.request("config/read", { includeLayers: false, cwd });
    return Object.entries(config.mcp_servers || {})
      .filter(([, server]) => server.enabled !== false).map(([name]) => name);
  }

  close() {
    this.child.stdin.end();
    this.child.kill();
  }
}

export async function runTurn(server, job, cwd, record, signal) {
  let threadId = job.codexThreadId;
  let turnId;
  let interruptSent = false;
  let timeout;
  let finalResponse = "";
  const output = new Map();
  const stop = () => {
    timeout ||= setTimeout(() => server.close(), 8000);
    if (threadId && turnId && !interruptSent) {
      interruptSent = true;
      server.request("turn/interrupt", { threadId, turnId }).catch(() => server.close());
    }
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    signal.throwIfAborted();
    await server.initialize();
    signal.throwIfAborted();
    const connectors = await server.enabledServers(cwd);
    if (connectors.length) {
      if (connectors.some((name) => !/^[\w-]+$/.test(name))) {
        throw new Error("Use a local Codex profile without unsupported MCP server names.");
      }
      server.close();
      server = new AppServer(server.exe, cwd, connectors);
      await server.initialize();
      if ((await server.enabledServers(cwd)).length) throw new Error("Failed to disable local MCP servers.");
    }
    signal.throwIfAborted();
    const settings = {
      cwd, model: job.model, modelProvider: "openai", approvalPolicy: "never",
      sandbox: "read-only", serviceTier: "default",
      developerInstructions: "Run this remote diagnostic in the selected workspace only. Do not read credentials, production secrets, or files outside the selected workspace. Do not write files or promote any production assets.",
    };
    const thread = await server.request(threadId ? "thread/resume" : "thread/start",
      threadId ? { ...settings, threadId, excludeTurns: true } : settings);
    if (thread.approvalPolicy !== "never" || thread.model !== job.model ||
        thread.modelProvider !== "openai" || thread.cwd.toLowerCase() !== cwd.toLowerCase() ||
        thread.sandbox?.type !== "readOnly" || thread.sandbox.networkAccess !== false) {
      throw new Error("Codex did not confirm the requested execution policy.");
    }
    threadId = thread.thread.id;
    signal.throwIfAborted();
    record("activity", "Codex session ready", `${job.model} · ${job.effort} · ${cwd}`);

    const done = new Promise((resolve) => {
      server.once("closed", (error) => resolve({ status: "failed", error: { message: error.message } }));
      server.on("approval", (method) => record("execution", "Approval request denied", method));
      server.on("notification", (method, params) => {
        if (params?.threadId !== threadId) return;
        const item = params.item;
        if (method === "turn/completed") {
          if (params.turn.status === "interrupted") record("activity", "Turn interrupted", "Codex confirmed cancellation.");
          resolve(params.turn);
        }
        if (method === "error") record("execution", params.willRetry ? "Codex error · retrying" : "Codex error",
          params.error?.message || "Unknown error");
        if (method === "item/commandExecution/outputDelta" || method === "item/fileChange/outputDelta") {
          const combined = (output.get(params.itemId) || "") + params.delta;
          const boundary = combined.lastIndexOf("\n") + 1;
          if (boundary) record("execution", `Output · ${params.itemId}`, combined.slice(0, boundary));
          output.set(params.itemId, combined.slice(boundary, boundary + 64_000));
        }
        if (!["item/started", "item/completed"].includes(method) || !item) return;
        if (method === "item/completed") {
          if (output.get(item.id)) record("execution", `Output · ${item.id}`, output.get(item.id));
          output.delete(item.id);
          if (item.type === "agentMessage") {
            if (item.phase === "commentary") record("activity", "Agent message", item.text);
            else finalResponse = item.text;
          }
        }
        if (item.type === "commandExecution") {
          if (method === "item/started") record("activity", "Command started", item.command);
          record("execution", `Command ${item.status} · ${item.id}`,
            [item.command, item.cwd, item.exitCode == null ? "" : `Exit code ${item.exitCode}`]
              .filter(Boolean).join("\n"));
          if (item.aggregatedOutput) record("execution", `Command output · ${item.id}`, item.aggregatedOutput);
        }
        if (item.type === "fileChange") {
          record("execution", `File changes ${item.status}`, JSON.stringify(item.changes, null, 2));
        }
      });
    });
    const started = await server.request("turn/start", {
      threadId, input: [{ type: "text", text: job.prompt }], model: job.model, effort: job.effort,
      approvalPolicy: "never", sandboxPolicy: { type: "readOnly", networkAccess: false },
      serviceTier: "default",
    });
    turnId = started.turn.id;
    record("activity", "Turn started", "Codex accepted the prompt.");
    if (signal.aborted) stop();
    const turn = await done;
    if (finalResponse) record("response", "Final response", finalResponse);
    const status = ({ completed: "completed", interrupted: "cancelled", failed: "failed" })[turn.status] || "failed";
    const error = turn.error?.codexErrorInfo === "usageLimitExceeded"
      ? `ChatGPT usage limit reached. ${turn.error.message}`
      : turn.error?.message || "";
    return { status, threadId, error };
  } catch (error) {
    return { status: signal.aborted ? "interrupted" : "failed", threadId, error: error.message };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", stop);
    server.close();
  }
}

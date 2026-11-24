import { execFileSync, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { approvalPolicy, autonomousNetworkGrant, sandboxFor, scopedGrant, verifySandbox } from "./profiles.mjs";

const declines = {
  "item/commandExecution/requestApproval": { decision: "decline" },
  "item/fileChange/requestApproval": { decision: "decline" },
  "item/permissions/requestApproval": { permissions: {}, scope: "turn" },
  "mcpServer/elicitation/request": { action: "decline", content: null, _meta: null },
};
const approvalNames = {
  "item/commandExecution/requestApproval": "Command execution",
  "item/fileChange/requestApproval": "File change",
  "item/permissions/requestApproval": "Request additional permissions",
  "mcpServer/elicitation/request": "MCP server confirmation",
};

export function isMcpConfirmation(params, verifiedServer) {
  const schema = params?.requestedSchema;
  return !!verifiedServer?.(params?.serverName) && params?.mode === "form" &&
    schema?.type === "object" && schema.properties && typeof schema.properties === "object" &&
    !Array.isArray(schema.properties) && Object.keys(schema.properties).length === 0 &&
    !schema.required?.length;
}

export const model = "gpt-6.2-sol";
const nativeInspectionTools = {
  blender: ["get_addon_status", "get_scene_info"],
  unityMCP: ["find_gameobjects", "get_test_job"],
  aseprite: ["get_sprite_info"],
};

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
  const keys = /^(path|pathext|userprofile|home|homedrive|homepath|appdata|localappdata|systemroot|windir|systemdrive|comspec|temp|tmp|programdata|programfiles(?:\(x86\))?|programw6432|username|userdomain|ssh_auth_sock|codex_home)$/i;
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => keys.test(key)));
}

export class AppServer extends EventEmitter {
  constructor(exe, cwd, disabledServers = [], scopedServers = {}) {
    super();
    this.exe = exe;
    this.pending = new Map();
    this.counter = 0;
    this.child = spawn(exe, [
      "app-server", "--listen", "stdio://",
      "-c", 'approval_policy="never"',
      "--enable", "request_permissions_tool",
      "-c", 'forced_login_method="chatgpt"',
      "-c", 'model_provider="openai"',
      "-c", 'service_tier="default"',
      "-c", 'web_search="disabled"',
      "-c", 'shell_environment_policy.inherit="all"',
      ...["multi_agent", "multi_agent_v2", "plugins", "computer_use", "browser_use", "in_app_browser"]
        .flatMap((feature) => ["--disable", feature]),
      ...disabledServers.flatMap((name) => ["-c", `mcp_servers.${name}.enabled=false`]),
      ...Object.entries(scopedServers).flatMap(([name, allowed]) => [
        "-c", `mcp_servers.${name}.enabled_tools=${JSON.stringify(allowed)}`,
        "-c", `mcp_servers.${name}.required=false`,
        ...allowed.flatMap((tool) => ["-c", `mcp_servers.${name}.tools.${tool}.approval_mode="approve"`]),
      ]),
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
        const result = Object.hasOwn(declines, message.method) && declines[message.method];
        if (result && this.emit("approval", message, result)) return;
        this.write(result ? { id: message.id, result } : {
          id: message.id, error: { code: -32601, message: "Server request unavailable in this worker." },
        });
      } else if (message.method) {
        this.emit("notification", message.method, message.params);
      } else {
        this.pending.get(message.id)?.(message.error && Object.assign(new Error(message.error.message), {
          protocol: true,
        }), message.result);
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
    await this.request("initialize", {
      clientInfo: { name: "crossworld_operations", version: "0.2.0" },
      capabilities: { experimentalApi: true },
    });
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

export async function runTurn(server, job, cwd, record, signal, control, scope = {}) {
  let threadId = job.codexThreadId;
  let turnId;
  let interruptSent = false;
  let timeout;
  let finalResponse = "";
  let finished = false;
  const output = new Map();
  const headLimit = 48_000;
  const tailLimit = 16_000;
  function recordOutput(id, delta) {
    const stream = output.get(id) || { remaining: headLimit, overflow: 0, tail: "", pending: "" };
    const fragment = delta.slice(0, stream.remaining);
    stream.remaining -= fragment.length;
    if (fragment.length < delta.length) {
      stream.overflow += delta.length - fragment.length;
      stream.tail = (stream.tail + delta.slice(fragment.length)).slice(-tailLimit);
    }
    const combined = stream.pending + fragment;
    const boundary = combined.length >= 3000 ? combined.lastIndexOf("\n") + 1 : 0;
    if (boundary) record("execution", `Output · ${id}`, combined.slice(0, boundary));
    stream.pending = combined.slice(boundary);
    output.set(id, stream);
  }
  function flushOutput(id) {
    const stream = output.get(id);
    if (!stream) return;
    const omitted = stream.overflow - stream.tail.length;
    const notice = omitted ? `\n[${omitted} characters of command or file output omitted]\n` : "";
    record("execution", `Output · ${id}`, stream.pending + notice + stream.tail);
    output.delete(id);
  }
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
      const scopedServers = scope.localMcp ? Object.fromEntries(connectors.filter((name) =>
        Object.hasOwn(nativeInspectionTools, name)).map((name) => [name, nativeInspectionTools[name]])) : {};
      server.close();
      server = new AppServer(server.exe, cwd, connectors.filter((name) => !Object.hasOwn(scopedServers, name)), scopedServers);
      await server.initialize();
      if ((await server.enabledServers(cwd)).some((name) => !Object.hasOwn(scopedServers, name))) {
        throw new Error("Failed to restrict local MCP servers.");
      }
    }
    signal.throwIfAborted();
    const fullAccess = job.profile === "full-access";
    if (fullAccess && scope.fullAccess !== true) throw new Error("Full Access is disabled on this host.");
    const sandboxPolicy = fullAccess ? { type: "dangerFullAccess" } : sandboxFor(scope.root, scope.roots);
    if (scope.protectedDirectories) await verifySandbox(server, cwd, sandboxPolicy, scope.protectedDirectories, scope.roots || scope.root);
    const settings = {
      cwd, model: job.model, modelProvider: "openai", approvalPolicy: "never", approvalsReviewer: "user",
      sandbox: fullAccess ? "danger-full-access" : "read-only", serviceTier: "default",
      developerInstructions: [
        "Work within the selected Operations workspace. Use existing local authentication without printing or reading credentials.",
        "Commit, push, or open a pull request only when the owner explicitly instructs you.",
        "For GitHub pull requests, use gh if available. Otherwise use the Operations open-pull-request.mjs helper with the absolute repository path, source branch, base branch, title, and optional body.",
        "Never publish packages, releases, or release tags, or enable publishing workflows.",
        "Production art promotion requires a separate explicit human approval for the exact command and target. Follow the active filesystem permission profile.",
        "If a tool or permission is unavailable, record the limitation and continue independent work when possible.",
      ].join(" "),
    };
    const thread = await server.request(threadId ? "thread/resume" : "thread/start",
      threadId ? { ...settings, threadId, excludeTurns: true } : settings);
    const expectedSandbox = fullAccess ? "dangerFullAccess" : "readOnly";
    if (thread.approvalPolicy !== "never" || thread.model !== job.model ||
        thread.modelProvider !== "openai" || thread.cwd.toLowerCase() !== cwd.toLowerCase() ||
        thread.sandbox?.type !== expectedSandbox || (!fullAccess && thread.sandbox.networkAccess !== false)) {
      throw new Error("Codex did not confirm the requested execution policy.");
    }
    threadId = thread.thread.id;
    scope.remember?.(threadId);
    signal.throwIfAborted();
    record("activity", "Codex session ready", `${job.model} · ${job.effort} · ${cwd}`);

    const done = new Promise((resolve) => {
      server.once("closed", (error) => resolve({ status: "failed", error: { message: error.message } }));
      server.on("approval", async (message, decline) => {
        const p = message.params;
        let result = decline;
        try {
          if (!fullAccess && control && !signal.aborted && !finished && p?.threadId === threadId && (!turnId || p.turnId === turnId)) {
            const elicitation = message.method === "mcpServer/elicitation/request";
            const confirm = elicitation && isMcpConfirmation(p, scope.reviewMcpConfirmation);
            const grant = message.method === "item/permissions/requestApproval"
              ? scopedGrant(p.permissions, scope) : null;
            const automatic = grant && autonomousNetworkGrant(p.permissions, scope);
            if (automatic) {
              server.write({ id: message.id, result: { permissions: automatic, scope: "turn" } });
              record("execution", "Network granted by host policy", "Development turn · network only");
              return;
            }
            const commandApproval = scope.supervised && message.method === "item/commandExecution/requestApproval" &&
              typeof p.command === "string" && !!p.command.trim();
            const paths = JSON.stringify(p.permissions || p.additionalPermissions || p.commandActions ||
              [p.grantRoot || p.cwd].filter(Boolean));
            if (elicitation && !confirm) {
              record("execution", "Unsupported MCP prompt declined", p.serverName || "Unknown MCP server");
              server.write({ id: message.id, result: decline });
              return;
            }
            const choice = await control.approve({
              operation: elicitation ? `MCP confirmation · ${p.serverName}` : p.command || approvalNames[message.method],
              paths,
              reason: commandApproval
                ? [p.reason, "Approving once may run this command outside the workspace sandbox."].filter(Boolean).join("\n")
                : [elicitation ? p.message : p.reason,
                  grant?.network && "This grants network access for the remainder of the turn."].filter(Boolean).join("\n"),
              canApprove: paths.length <= 4000 && (p.command?.length ?? 0) <= 4000 &&
                (confirm || !!grant || commandApproval),
            });
            if (choice === "approve" && !finished && !signal.aborted) {
              if (confirm && isMcpConfirmation(p, scope.reviewMcpConfirmation)) {
                result = { action: "accept", content: {}, _meta: null };
              } else if (commandApproval) {
                result = { decision: "accept" };
              } else if (grant) {
                const checked = scopedGrant(p.permissions, scope);
                if (checked) result = { permissions: checked, scope: "turn" };
              }
            }
          }
        } catch { /* Decline if the request cannot be relayed. */ }
        server.write({ id: message.id, result });
        record("execution", result === decline ? "Approval denied or expired" : "Approval sent to Codex", message.method);
      });
      server.on("notification", (method, params) => {
        if (["warning", "configWarning", "deprecationNotice"].includes(method)) {
          record("execution", "Codex warning", params?.message || params?.summary || method);
        }
        if (params?.threadId !== threadId) return;
        const item = params.item;
        if (method === "turn/completed") {
          finished = true;
          if (params.turn.status === "interrupted") record("activity", "Turn interrupted", "Codex confirmed cancellation.");
          resolve(params.turn);
        }
        if (method === "error") record("execution", params.willRetry ? "Codex error · retrying" : "Codex error",
          params.error?.message || "Unknown error");
        if (method === "item/commandExecution/outputDelta" || method === "item/fileChange/outputDelta") {
          recordOutput(params.itemId, params.delta);
        }
        if (!["item/started", "item/completed"].includes(method) || !item) return;
        if (method === "item/completed") {
          if (!output.has(item.id) && item.type === "commandExecution" && item.aggregatedOutput) {
            recordOutput(item.id, item.aggregatedOutput);
          }
          flushOutput(item.id);
          if (item.type === "agentMessage") {
            if (item.phase === "commentary") record("activity", "Agent message", item.text);
            else {
              if (finalResponse) record("activity", "Agent message", finalResponse);
              finalResponse = item.text;
            }
          }
        }
        if (item.type === "commandExecution") {
          if (method === "item/started") record("activity", "Command started", item.command);
          record("execution", `Command ${item.status} · ${item.id}`,
            [item.command, item.cwd, item.exitCode == null ? "" : `Exit code ${item.exitCode}`]
              .filter(Boolean).join("\n"));
        }
        if (item.type === "fileChange") {
          record("execution", `File changes ${item.status}`, JSON.stringify(item.changes, null, 2));
        }
        if (["mcpToolCall", "dynamicToolCall", "webSearch", "imageView", "collabAgentToolCall"].includes(item.type)) {
          record("execution", `Tool ${item.type} · ${method.split("/")[1]}`, JSON.stringify(item, null, 2));
        }
      });
    });
    const started = await server.request("turn/start", {
      threadId, input: [{ type: "text", text: job.prompt }], model: job.model, effort: job.effort,
      approvalPolicy: !control || fullAccess ? "never" : { granular: {
        ...approvalPolicy.granular, sandbox_approval: !!scope.supervised, mcp_elicitations: !!scope.reviewMcpConfirmation,
      } }, approvalsReviewer: "user", sandboxPolicy,
      serviceTier: "default",
    });
    turnId = started.turn.id;
    control?.ready(threadId, turnId, async (id, text) => {
      if (finished || signal.aborted) return "rejected";
      try {
        const accepted = await server.request("turn/steer", {
          threadId, expectedTurnId: turnId, clientUserMessageId: id,
          input: [{ type: "text", text }],
        });
        if (accepted.turnId !== turnId) return "uncertain";
        record("activity", "Steering accepted", id);
        return "accepted";
      } catch (error) {
        return error.protocol ? "rejected" : "uncertain";
      }
    });
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
    finished = true;
    for (const id of output.keys()) flushOutput(id);
    control?.finish();
    clearTimeout(timeout);
    signal.removeEventListener("abort", stop);
    server.close();
  }
}

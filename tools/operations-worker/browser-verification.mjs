import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const frontend = "https://www.crossworldcreative.com";
const backend = "https://api.crossworldcreative.com";

export function allowedBrowserRequest(rawUrl, method) {
  const url = new URL(rawUrl);
  if (!["GET", "HEAD"].includes(method) || url.username || url.password || url.search || url.hash) return false;
  return (url.origin === frontend && (["/", "/operations", "/favicon.ico"].includes(url.pathname) ||
    /^\/assets\/[a-zA-Z0-9_-]+\.(?:css|js|woff2|svg|png|webp)$/.test(url.pathname))) ||
    (url.origin === backend && url.pathname === "/healthz");
}

function browserProtocol(chrome) {
  let id = 0;
  let buffer = "";
  const pending = new Map();
  const listeners = new Map();
  const fail = () => {
    for (const callback of pending.values()) callback({ error: true });
    pending.clear();
  };
  chrome.on("error", fail);
  chrome.on("exit", fail);
  chrome.stdio[3].on("error", fail);
  chrome.stdio[4].on("error", fail);
  chrome.stdio[4].setEncoding("utf8");
  chrome.stdio[4].on("data", chunk => {
    buffer += chunk;
    const messages = buffer.split("\0");
    buffer = messages.pop();
    for (const message of messages) {
      const response = JSON.parse(message);
      if (response.id) {
        pending.get(response.id)?.(response);
        pending.delete(response.id);
      } else {
        listeners.get(response.method)?.(response.params, response.sessionId);
      }
    }
  });
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => {
        pending.delete(current);
        reject(new Error("Browser command timed out."));
      }, 10_000);
      pending.set(current, ({ result, error }) => {
        clearTimeout(timer);
        if (error) reject(new Error("Browser command failed."));
        else resolve(result);
      });
      chrome.stdio[3].write(JSON.stringify({ id: current, method, params, sessionId }) + "\0");
    });
  }
  return { send, on: (method, callback) => listeners.set(method, callback) };
}

async function serveRequest(send, { requestId, request }, sessionId, signal) {
  if (allowedBrowserRequest(request.url, request.method)) {
    const response = await fetch(request.url, { method: request.method, redirect: "error", credentials: "omit",
      signal: AbortSignal.any([signal, AbortSignal.timeout(7000)]) }).catch(() => null);
    if (response) {
      const headers = ["content-type", "access-control-allow-origin"].flatMap(name => {
        const value = response.headers.get(name);
        return value ? [{ name, value }] : [];
      });
      const chunks = [];
      let length = 0;
      if (response.body) for await (const chunk of response.body) {
        length += chunk.length;
        if (length > 8 * 1024 * 1024) throw new Error("Browser resource exceeds the verification limit.");
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks, length).toString("base64");
      return send("Fetch.fulfillRequest", { requestId, responseCode: response.status, responseHeaders: headers, body }, sessionId);
    }
  }
  return send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, sessionId);
}

export async function verifyBrowserRelease(executablePath, signal) {
  if (signal.aborted) throw signal.reason;
  const root = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(root, "crossworld-browser-"));
  const chrome = spawn(executablePath, [
    "--headless", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-quic", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    "--remote-debugging-pipe", "--proxy-server=http://127.0.0.1:1", "--proxy-bypass-list=<-loopback>",
    "--user-data-dir=" + directory, "about:blank",
  ], { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  const exited = once(chrome, "close").catch(() => {});
  const terminate = () => chrome.kill();
  signal.addEventListener("abort", terminate, { once: true });
  try {
    if (signal.aborted) throw signal.reason;
    const { send, on } = browserProtocol(chrome);
    const statuses = new Map();
    on("Fetch.requestPaused", (params, sessionId) => {
      void serveRequest(async (method, details) => {
        if (params.request.url === frontend + "/operations" && params.resourceType === "Document") {
          statuses.set(sessionId, details.responseCode);
        }
        return send(method, details, sessionId);
      }, params, sessionId, signal).catch(() =>
        send("Fetch.failRequest", { requestId: params.requestId, errorReason: "Failed" }, sessionId).catch(() => {}));
    });
    const observations = [];
    for (const width of [390, 1440]) {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      await send("Network.enable", {}, sessionId);
      await send("Network.setBypassServiceWorker", { bypass: true }, sessionId);
      await send("Fetch.enable", {}, sessionId);
      await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 }, sessionId);
      const { errorText } = await send("Page.navigate", { url: frontend + "/operations" }, sessionId);
      if (errorText) throw new Error("The Operations entry could not load.");
      let observed;
      const deadline = Date.now() + 8000;
      do {
        const { result } = await send("Runtime.evaluate", { returnByValue: true, expression:
          "({ content: !!document.querySelector('#root')?.textContent.trim(), " +
          "overflow: document.documentElement.scrollWidth > innerWidth, origin: location.origin })" }, sessionId);
        observed = result.value;
        if (!observed?.content) await delay(150, undefined, { signal });
      } while (!observed?.content && Date.now() < deadline);
      observations.push({ width, status: statuses.get(sessionId), expectedOrigin: observed?.origin === frontend,
        content: observed?.content === true, overflow: observed?.overflow === true });
      await send("Target.closeTarget", { targetId });
    }
    await send("Browser.close").catch(() => {});
    return observations;
  } finally {
    signal.removeEventListener("abort", terminate);
    terminate();
    await exited;
    if (path.dirname(await realpath(directory)) === root) {
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
}

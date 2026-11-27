const express = require("express");

const freshnessMs = 15 * 60 * 1000;
const throttleMs = 60 * 1000;
const repoPattern = /^[a-z\d][a-z\d-]*\/(?!\.{1,2}$)[\w.-]+$/i;
const pick = (value, keys) => Object.fromEntries(keys.map(key => [
  key, ["string", "number", "boolean"].includes(typeof value?.[key]) ? value[key] : null,
]));
const sections = {
  workflows: ["/actions/runs?per_page=5", value => value.workflow_runs.slice(0, 5).map(run =>
    pick(run, ["id", "name", "status", "conclusion", "created_at", "updated_at", "head_branch"]))],
  commits: ["/commits?per_page=12", value => value.slice(0, 12).map(item => ({
    ...pick(item, ["sha"]), author: pick(item.author, ["login"]).login,
    date: pick(item.commit?.author, ["date"]).date,
    summary: typeof item.commit?.message === "string" ? item.commit.message.split("\n")[0].slice(0, 200) : null,
  }))],
  pulls: ["/pulls?state=open&per_page=5", value => value.slice(0, 5).map(item =>
    pick(item, ["number", "title", "updated_at", "draft"]))],
  issues: ["/issues?state=open&per_page=15", value => value.filter(item => !item.pull_request).slice(0, 5).map(item =>
    pick(item, ["number", "title", "updated_at"]))],
  releases: ["/releases?per_page=3", value => value.slice(0, 3).map(item =>
    pick(item, ["id", "tag_name", "name", "published_at", "prerelease"]))],
};
const failure = error => ["rate-limited", "unavailable"].includes(error.message) ? error.message : "request-failed";
const maxRepositories = 8;

function createEngineering({ repositories, fetchData = fetch, now = Date.now }) {
  const router = express.Router();
  let snapshot;
  let nextAttempt = 0;
  let pending;
  const configuredRepositories = () => [...new Set(repositories().filter(name => repoPattern.test(name)))];

  function status() {
    const names = configuredRepositories();
    const entries = new Map((snapshot?.repositories || []).map(item => [item.name, item]));
    const selected = names.slice(0, maxRepositories).map(name => entries.get(name) || { name, status: "not-refreshed" });
    const stale = (observedAt) => observedAt != null && now() - observedAt >= freshnessMs;
    return {
      configured: names.length,
      limit: maxRepositories,
      observedAt: snapshot?.observedAt ?? null,
      stale: snapshot ? selected.some(repo => stale(repo.observedAt) ||
        Object.values(repo.details || {}).some(section => stale(section.observedAt))) : null,
      degraded: !!snapshot && selected.some(repo => repo.status !== "available" ||
        Object.values(repo.details || {}).some(section => section.status !== "available")),
      nextAttempt: nextAttempt > now() ? nextAttempt : null,
      repositories: snapshot ? selected : [],
    };
  }

  async function github(repository, suffix = "") {
    const response = await fetchData(`https://api.github.com/repos/${repository}${suffix}`, {
      redirect: "error", signal: AbortSignal.timeout(6000),
      headers: { accept: "application/vnd.github+json", "user-agent": "crossworld-operations" },
    });
    if (!response.ok) {
      const limited = response.status === 429 ||
        (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")));
      if (limited) {
        const retry = Number(response.headers.get("retry-after"));
        const reset = Number(response.headers.get("x-ratelimit-reset"));
        nextAttempt = Math.max(nextAttempt, now() + (Number.isFinite(retry) && retry > 0 ? retry * 1000 : throttleMs),
          Number.isFinite(reset) ? reset * 1000 : 0);
      }
      throw new Error(limited ? "rate-limited" : response.status === 404 ? "unavailable" : "request-failed");
    }
    return response.json();
  }

  router.get("/", (_req, res) => res.json(status()));

  const fresh = entry => entry?.status === "available" && now() - entry.observedAt < freshnessMs;
  const repositoryFresh = repo => fresh(repo) && Object.keys(sections).every(key => fresh(repo.details?.[key]));

  function refresh(configured, { force = false } = {}) {
    nextAttempt = now() + throttleMs;
    pending = (async () => {
      const entries = [];
      const previous = new Map((snapshot?.repositories || []).map(repo => [repo.name, repo]));
      let limited = false;
      for (const name of configured) {
        const cached = previous.get(name);
        if (!force && repositoryFresh(cached)) {
          entries.push(cached);
          continue;
        }
        if (limited) {
          entries.push(!force && cached ? cached : { ...cached, name, status: "not-refreshed" });
          continue;
        }
        try {
          const repo = !force && fresh(cached) ? cached : { ...await github(name), observedAt: now() };
          const details = Object.fromEntries(await Promise.all(Object.entries(sections).map(async ([key, [path, summarize]]) => {
            if (!force && fresh(cached?.details?.[key])) return [key, cached.details[key]];
            try {
              return [key, { status: "available", items: summarize(await github(name, path)), observedAt: now() }];
            } catch (error) {
              return [key, { ...cached?.details?.[key], status: failure(error) }];
            }
          })));
          entries.push({
            name, status: "available", details, observedAt: repo.observedAt,
            ...pick(repo, ["visibility", "default_branch", "language", "pushed_at", "size", "open_issues_count"]),
          });
          limited = Object.values(details).some(value => value.status === "rate-limited");
        } catch (error) {
          const cause = failure(error);
          entries.push({ ...cached, name, status: cause });
          limited = cause === "rate-limited";
        }
      }
      snapshot = { observedAt: now(), repositories: entries };
    })().finally(() => { pending = undefined; });
    return pending;
  }

  router.refreshWhenDue = () => {
    if (pending || nextAttempt > now()) return;
    const configured = configuredRepositories().slice(0, maxRepositories);
    const known = new Map((snapshot?.repositories || []).map(repo => [repo.name, repo]));
    if (configured.some(name => !repositoryFresh(known.get(name)))) return refresh(configured);
  };

  router.post("/refresh", async (_req, res) => {
    if (pending) {
      await pending;
      return res.json(status());
    }
    if (nextAttempt > now()) return res.status(429).json({ message: "GitHub refresh is temporarily throttled." });
    const configured = configuredRepositories().slice(0, maxRepositories);
    if (!configured.length) return res.status(409).json({ message: "No GitHub repositories are configured." });
    await refresh(configured, { force: true });
    return res.json(status());
  });
  return router;
}

module.exports = { createEngineering };

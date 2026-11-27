import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import engineering from "../../src/modules/operations/engineering.js";

test("Engineering fetches only configured repositories, caches reads, and respects rate limits", async () => {
  let now = 1000000;
  const calls = [];
  const app = express();
  app.use(engineering.createEngineering({
    repositories: () => ["studio/project", "studio/private", "studio/..", "studio/other"],
    now: () => now,
    fetchData: async url => {
      calls.push(url);
      if (url.includes("/actions/")) return Response.json({ workflow_runs: [
        { id: 42, name: "Verify", conclusion: "failure", nested: { untrusted: "omit" } },
      ] });
      if (url.includes("/commits?")) return Response.json([{ sha: "abc", commit: {
        message: "One line\nKeep this body private", author: { date: "sample-date", email: "omit" },
      } }]);
      if (url.includes("/pulls?") || url.includes("/issues?") || url.includes("/releases?")) return Response.json([]);
      if (url.endsWith("/private")) return new Response(null, { status: 429, headers: { "retry-after": "120" } });
      return Response.json({ visibility: "public", default_branch: "main", arbitrary: "omit" });
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const view = () => fetch(url).then(response => response.json());
    const refresh = () => fetch(url + "/refresh", { method: "POST" });
    assert.equal((await view()).observedAt, null);
    assert.equal(calls.length, 0);
    assert.equal((await refresh()).status, 200);
    const snapshot = await view();
    assert.equal(snapshot.repositories[0].details.workflows.items[0].conclusion, "failure");
    assert.equal(snapshot.repositories[0].details.commits.items[0].summary, "One line");
    assert.equal(snapshot.repositories[1].status, "rate-limited");
    assert.equal(snapshot.repositories[2].status, "not-refreshed");
    assert.equal(snapshot.degraded, true);
    assert.doesNotMatch(JSON.stringify(snapshot), /nested|arbitrary|Keep this body|email/i, "only allowlisted fields should be returned");
    assert.equal(calls.length, 7);
    now += 61000;
    assert.equal((await refresh()).status, 429);
    assert.equal(calls.length, 7);
    now += 15 * 60 * 1000;
    assert.equal((await view()).stale, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("Engineering preserves prior observations through partial refreshes", async () => {
  let now = 1000000;
  let degraded = false;
  const app = express();
  app.use(engineering.createEngineering({
    repositories: () => ["studio/first", "studio/second", "studio/third"],
    now: () => now,
    fetchData: async url => {
      if (degraded && url.endsWith("/second")) {
        return new Response(null, { status: 403, headers: { "retry-after": "180", "x-ratelimit-reset": "invalid" } });
      }
      if (url.includes("/actions/")) return degraded
        ? new Response(null, { status: 502 }) : Response.json({ workflow_runs: [{ id: 42 }] });
      if (url.includes("?")) return Response.json([]);
      return Response.json({ visibility: "public", default_branch: "main" });
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const refresh = () => fetch(url + "/refresh", { method: "POST" }).then(response => response.json());
    const initial = await refresh();
    assert.equal(initial.degraded, false);
    assert.equal(initial.repositories.length, 3);
    const previous = now;
    now += 16 * 60 * 1000;
    degraded = true;
    const partial = await refresh();
    assert.equal(partial.degraded, true);
    assert.equal(partial.stale, true);
    assert.equal(partial.observedAt, now);
    assert.equal(partial.nextAttempt, now + 180_000);
    const [first, second, third] = partial.repositories;
    assert.equal(first.observedAt, now);
    assert.equal(first.details.workflows.status, "request-failed");
    assert.equal(first.details.workflows.observedAt, previous);
    assert.equal(first.details.workflows.items[0].id, 42);
    assert.equal(second.status, "rate-limited");
    assert.equal(second.observedAt, previous);
    assert.equal(second.default_branch, "main");
    assert.equal(third.status, "not-refreshed");
    assert.equal(third.observedAt, previous);
    assert.equal(third.details.workflows.items[0].id, 42);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("automatic Engineering refresh retries after a failure but honors GitHub backoff", async () => {
  let now = 1000000;
  let status = 502;
  let calls = 0;
  const router = engineering.createEngineering({
    repositories: () => ["studio/project"], now: () => now,
    fetchData: async url => {
      calls++;
      if (status !== 200) return new Response(null, { status, headers: { "retry-after": "120" } });
      return Response.json(url.includes("/actions/") ? { workflow_runs: [] } : url.includes("?") ? [] : {});
    },
  });
  await router.refreshWhenDue();
  assert.equal(calls, 1);
  now += 59_999;
  assert.equal(router.refreshWhenDue(), undefined);
  now++;
  status = 429;
  await router.refreshWhenDue();
  assert.equal(calls, 2);
  now += 119_999;
  assert.equal(router.refreshWhenDue(), undefined);
  now++;
  status = 200;
  await router.refreshWhenDue();
  assert.equal(calls, 8);
  now += 60_000;
  assert.equal(router.refreshWhenDue(), undefined);
});

test("automatic Engineering retries only failed or stale observations", async () => {
  let now = 1000000;
  let failing = true;
  const calls = [];
  const router = engineering.createEngineering({
    repositories: () => ["studio/healthy", "studio/partial"], now: () => now,
    fetchData: async url => {
      calls.push(url);
      if (url.includes("/partial/commits") && failing) return new Response(null, { status: 502 });
      return Response.json(url.includes("/actions/") ? { workflow_runs: [] } : url.includes("?") ? [] : {});
    },
  });
  await router.refreshWhenDue();
  assert.equal(calls.length, 12);
  for (let attempt = 0; attempt < 2; attempt++) {
    calls.length = 0;
    now += 60_000;
    if (attempt) failing = false;
    await router.refreshWhenDue();
    assert.deepEqual(calls, ["https://api.github.com/repos/studio/partial/commits?per_page=12"]);
  }
  now += 60_000;
  assert.equal(router.refreshWhenDue(), undefined);
});

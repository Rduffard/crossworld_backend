import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import finance from "../../src/modules/operations/finance.js";

test("Finance separates scoped budgets, retains prior versions and excludes future actuals", async () => {
  const ownerId = "owner-fixture";
  const entry = (_id, kind, amount, date, projectId = null, createdAt = date) => ({
    _id, kind, amount, date, projectId, createdAt, ownerId, month: date.slice(0, 7), currency: "USD",
  });
  const records = [
    entry("older-budget", "budget", 5000, "2025-05-30", null, "2025-04-30"),
    entry("latest-budget", "budget", 4000, "2025-05-02", null, "2025-05-02"),
    entry("project-budget", "budget", 1000, "2025-05-01", "project-fixture"),
    entry("project-expense", "expense", 200, "2025-05-10", "project-fixture"),
    entry("general-expense", "expense", 300, "2025-05-18"),
    entry("future-expense", "expense", 9000, "2025-05-28"),
    entry("future-commitment", "monthly", 15000, "2025-06-10"),
    entry("recurring", "monthly", 110, "2025-01-31"),
  ];
  function find(scope) {
    return {
      sort() { return this; },
      limit() { return this; },
      async toArray() {
        return records.filter(record => record.ownerId === scope.ownerId && scope.$or.some(({ kind, month, date }) =>
          (typeof kind === "string" ? kind === record.kind : kind.$in.includes(record.kind)) &&
          (month === undefined || month === record.month) && (!date || record.date <= date.$lte)));
      },
    };
  }
  const app = express();
  app.use(express.json(), finance.createFinance({
    records: () => ({ find }),
    projects: () => ({ findOne: async () => ({ _id: "project-fixture" }) }),
    owner: () => ownerId,
    now: () => new Date("2025-05-20T12:00:00Z"),
  }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const may = await fetch(url + "?month=2025-05").then(response => response.json());
    assert.deepEqual(may.totals.USD, { expenses: 500, annualCommitments: 1320, budget: 4000 });
    assert.deepEqual(may.projectBudgets, [{ projectId: "project-fixture", currency: "USD", budget: 1000, expenses: 200 }]);
    assert.equal(may.entries.find(item => item._id === "older-budget").budgetSuperseded, true);
    assert.equal(may.entries.find(item => item._id === "latest-budget").budgetSuperseded, false);
    assert.equal(may.entries.some(item => item._id.startsWith("future-")), false);
    assert.equal(may.renewals[0].date, "2025-05-31");
    const june = await fetch(url + "?month=2025-06").then(response => response.json());
    assert.equal(june.totals.USD.expenses, null);
    assert.equal(june.totals.USD.annualCommitments, 181320);
    const response = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "f7e61c2d-35b2-422b-9e55-539ad8aedacf", kind: "expense",
        date: "2025-05-21", amount: 100, category: "Cloud", currency: "USD", name: "Future invoice" }),
    });
    assert.equal(response.status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("Expense trends return six chronological months with owner-scoped actuals and separate currencies", async () => {
  const ownerId = "owner-fixture";
  const now = () => new Date("2025-05-20T12:00:00Z");
  let pipeline;
  const app = express();
  app.use(finance.createFinance({
    owner: () => ownerId,
    now,
    records: () => ({
      aggregate(stages) {
        pipeline = stages;
        return { async toArray() {
          return [
            { _id: { month: "2024-12", currency: "USD" }, total: 150 },
            { _id: { month: "2025-05", currency: "USD" }, total: 500 },
            { _id: { month: "2025-05", currency: "EUR" }, total: 320 },
          ];
        } };
      },
    }),
  }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}/trends`;
    const response = await fetch(endpoint);
    assert.equal(response.status, 200);
    const { months } = await response.json();
    assert.deepEqual(months, [
      { month: "2024-12", expenses: { USD: 150 } },
      { month: "2025-01", expenses: {} },
      { month: "2025-02", expenses: {} },
      { month: "2025-03", expenses: {} },
      { month: "2025-04", expenses: {} },
      { month: "2025-05", expenses: { USD: 500, EUR: 320 } },
    ]);
    assert.deepEqual(pipeline[0].$match.ownerId, ownerId);
    assert.deepEqual(pipeline[0].$match.kind, "expense");
    assert.deepEqual(pipeline[0].$match.date, { $lte: "2025-05-20" });
    assert.deepEqual(pipeline[0].$match.month, { $gte: "2024-12", $lte: "2025-05" });
    assert.equal((await fetch(endpoint + "?month=2025-13")).status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

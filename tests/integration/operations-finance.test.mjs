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

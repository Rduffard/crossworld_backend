const express = require("express");

const categories = ["Cloud", "Software", "Domains", "Hosting", "Equipment", "Other"];
const currencies = ["USD", "CAD", "EUR", "GBP"];
const kinds = ["expense", "monthly", "annual", "budget"];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value) => typeof value === "string" && datePattern.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function renewalInMonth(entry, month) {
  if (entry.kind !== "monthly" && entry.kind !== "annual") return null;
  if (entry.date.slice(0, 7) > month || (entry.kind === "annual" && entry.date.slice(5, 7) !== month.slice(5, 7))) {
    return null;
  }
  const end = new Date(month + "-01T00:00:00Z");
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const day = Math.min(Number(entry.date.slice(8)), end.getUTCDate());
  return month + "-" + String(day).padStart(2, "0");
}

function createFinance({ records, projects, owner, now = () => new Date() }) {
  const router = express.Router();
  router.get("/", async (req, res) => {
    const today = now().toISOString().slice(0, 10);
    const month = req.query.month ?? today.slice(0, 7);
    if (typeof month !== "string" || !validDate(month + "-01")) {
      return res.status(400).json({ message: "Choose a valid reporting month." });
    }
    const matching = await records().find({
      ownerId: owner(),
      $or: [
        { kind: { $in: ["monthly", "annual"] }, date: { $lte: month + "-31" } },
        { kind: "expense", month, date: { $lte: today } },
        { kind: "budget", month },
      ],
    }, { projection: { ownerId: 0 } }).sort({ date: -1, _id: 1 }).limit(1001).toArray();
    if (matching.length > 1000) return res.status(409).json({ message: "The reporting period exceeds the record limit." });
    const totals = {};
    const scopedExpenses = new Map();
    const currentBudgets = new Map();
    const scopeKey = ({ projectId, currency }) => JSON.stringify([projectId || null, currency]);
    for (const entry of matching) {
      const tally = totals[entry.currency] ??= { expenses: null, annualCommitments: null, budget: null };
      const scope = scopeKey(entry);
      if (entry.kind === "expense") {
        tally.expenses = (tally.expenses ?? 0) + entry.amount;
        scopedExpenses.set(scope, (scopedExpenses.get(scope) ?? 0) + entry.amount);
      }
      if (entry.kind === "budget") {
        const previous = currentBudgets.get(scope);
        const created = +new Date(entry.createdAt);
        const earlier = previous && +new Date(previous.createdAt);
        if (!previous || created > earlier || (created === earlier && entry._id > previous._id)) {
          currentBudgets.set(scope, entry);
        }
      }
      if (["monthly", "annual"].includes(entry.kind)) {
        tally.annualCommitments = (tally.annualCommitments ?? 0) + entry.amount * (entry.kind === "monthly" ? 12 : 1);
      }
    }
    const projectBudgets = [];
    for (const [scope, entry] of currentBudgets) {
      if (!entry.projectId) totals[entry.currency].budget = entry.amount;
      else projectBudgets.push({ projectId: entry.projectId, currency: entry.currency, budget: entry.amount,
        expenses: scopedExpenses.get(scope) ?? null });
    }
    const renewals = matching.flatMap(entry => {
      const date = renewalInMonth(entry, month);
      return date ? [{ id: entry._id, name: entry.name, date, amount: entry.amount, currency: entry.currency }] : [];
    }).sort((a, b) => a.date.localeCompare(b.date));
    const entries = matching.map(entry => entry.kind === "budget"
      ? { ...entry, budgetSuperseded: currentBudgets.get(scopeKey(entry))._id !== entry._id } : entry);
    return res.json({ month, entries, totals, projectBudgets, renewals, billing: { status: "unavailable" } });
  });

  router.post("/", async (req, res) => {
    const { id, kind, amount, currency, date, category, projectId } = req.body ?? {};
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (typeof id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id) ||
        !kinds.includes(kind) || !currencies.includes(currency) || !categories.includes(category) ||
        !Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000000 || !validDate(date) ||
        !name || name.length > 160 || !name.isWellFormed() ||
        (projectId != null && (typeof projectId !== "string" || projectId.length > 80))) {
      return res.status(400).json({ message: "Provide a valid expense, commitment, or budget." });
    }
    if (kind === "expense" && date > now().toISOString().slice(0, 10)) {
      return res.status(400).json({ message: "An actual expense must be dated today or earlier." });
    }
    const ownerId = owner();
    if (projectId && !await projects().findOne({ _id: projectId, ownerId })) {
      return res.status(404).json({ message: "Project unavailable." });
    }
    const fields = { kind, amount, currency, date, category, name, projectId: projectId || null };
    const _id = ownerId + ":" + id;
    const saved = await records().findOneAndUpdate({ _id, ownerId }, {
      $setOnInsert: { ...fields, month: date.slice(0, 7), source: "manual", createdAt: new Date() },
    }, { upsert: true, returnDocument: "after", includeResultMetadata: true });
    if (Object.entries(fields).some(([key, value]) => saved.value[key] !== value)) {
      return res.status(409).json({ message: "This submission ID already refers to another record." });
    }
    return res.status(saved.lastErrorObject.updatedExisting ? 200 : 201).json({ _id });
  });
  return router;
}

module.exports = { createFinance };

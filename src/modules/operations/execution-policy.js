const express = require("express");

const profiles = ["read-only", "development", "workshop", "full-access"];
const efforts = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
const validModel = value => typeof value === "string" && /^[a-z\d][a-z\d._-]{0,79}$/i.test(value);
const validators = {
  model: validModel,
  effort: value => efforts.includes(value),
  profile: value => profiles.includes(value),
};
const defaultPolicy = {
  revision: 0, defaults: { model: "gpt-6.2-sol", effort: "medium", profile: "read-only" },
  maxExecutions: 1, authority: "locked", departments: {}, employees: {},
  bounds: { models: [], efforts: [], profiles: [] },
};
const isRecord = value => value && typeof value === "object" && !Array.isArray(value);
const idPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/;

function configuration(value, allowInherited) {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return (allowInherited ? entries.length > 0 : entries.length === 3) &&
    entries.every(([field, option]) => Object.hasOwn(validators, field) && validators[field](option));
}

function overrides(value) {
  return isRecord(value) && Object.keys(value).length <= 100 &&
    Object.entries(value).every(([id, settings]) => idPattern.test(id) && configuration(settings, true));
}

function choices(values, valid, limit) {
  return Array.isArray(values) && values.length <= limit && new Set(values).size === values.length && values.every(valid);
}

function effectiveConfiguration(policy, departmentId, employeeId, assignment = {}) {
  return { ...policy.defaults, ...policy.departments[departmentId], ...policy.employees[employeeId], ...assignment };
}

function createExecutionPolicy({ records, directory, owner }) {
  const router = express.Router();
  async function view() {
    const policy = await records().findOne({ _id: owner() }, { projection: { _id: 0 } }) || defaultPolicy;
    return { ...policy, enforcement: "pending" };
  }
  router.get("/", async (_req, res) => res.json(await view()));
  router.get("/preview", async (req, res) => {
    const { employeeId } = req.query;
    if (typeof employeeId !== "string" || !idPattern.test(employeeId)) {
      return res.status(400).json({ message: "Specify an employee to preview." });
    }
    const employee = await directory().findOne({ _id: employeeId, ownerId: owner(), kind: "employee" });
    if (!employee) return res.status(404).json({ message: "Employee unavailable." });
    const policy = await view();
    return res.json({
      configuration: effectiveConfiguration(policy, employee.departmentId, employeeId),
      revision: policy.revision, enforcement: policy.enforcement,
    });
  });
  router.put("/", async (req, res) => {
    const { revision, defaults, maxExecutions, authority, departments, employees, bounds } = req.body || {};
    if (!Number.isSafeInteger(revision) || revision < 0 ||
        !Number.isSafeInteger(maxExecutions) || maxExecutions < 1 ||
        !["locked", "approval-required", "bounded-discretion"].includes(authority) ||
        !configuration(defaults, false) || !overrides(departments) || !overrides(employees) ||
        !choices(bounds?.models, validModel, 16) || !choices(bounds?.efforts, validators.effort, efforts.length) ||
        !choices(bounds?.profiles, validators.profile, profiles.length) ||
        (authority === "bounded-discretion" && ![bounds.models, bounds.efforts, bounds.profiles].every(values => values.length))) {
      return res.status(400).json({ message: "Provide valid execution defaults, overrides, capacity, and First Mate bounds." });
    }
    const ownerId = owner();
    const ids = [...Object.keys(departments), ...Object.keys(employees)];
    if (ids.length) {
      const matching = await directory().find({ ownerId, _id: { $in: ids } }, { projection: { kind: 1 } }).toArray();
      const matches = new Map(matching.map(record => [record._id, record.kind]));
      if (Object.keys(departments).some(id => matches.get(id) !== "department") ||
          Object.keys(employees).some(id => matches.get(id) !== "employee")) {
        return res.status(400).json({ message: "An override refers to an unavailable employee or department." });
      }
    }
    try {
      const result = await records().updateOne({ _id: ownerId, revision }, { $set: {
        defaults, maxExecutions, authority, departments, employees,
        bounds: { models: bounds.models, efforts: bounds.efforts, profiles: bounds.profiles },
        revision: revision + 1,
      } }, { upsert: revision === 0 });
      if (result.matchedCount || result.upsertedCount) return res.json(await view());
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    return res.status(409).json({ message: "Settings changed in another session. Reload and review before saving again." });
  });
  return router;
}

module.exports = { createExecutionPolicy, effectiveConfiguration };

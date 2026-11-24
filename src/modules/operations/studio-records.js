const { precedingResult } = require("./objective-runs");

const definitions = {
  employees: { source: "workforce", filter: { kind: "employee" },
    fields: ["name", "role", "roleId", "departmentId", "supervisorId", "responsibilities", "workspace", "status"],
    workspace: "workforce", record: "employee" },
  roles: { source: "workforce", filter: { kind: "role" }, fields: ["name", "key", "responsibilities"] },
  departments: { source: "workforce", filter: { kind: "department" }, fields: ["name", "responsibilities"] },
  mandates: { source: "workforce", filter: { kind: "project-assignment" },
    fields: ["name", "employeeId", "projectId", "objectiveId", "supervisorId", "responsibilities", "status", "activationSource"] },
  projects: { source: "projects", fields: ["name", "description", "workspace", "status", "revision"],
    workspace: "projects", record: "project" },
  objectives: { source: "objectives", fields: ["title", "projectId", "priority", "status", "criteria", "revision"],
    scope: ["projectId"], workspace: "objectives", record: "objective" },
  assignments: { source: "jobs", filter: { employeeId: { $type: "string" } },
    scope: ["employeeId", "projectId", "objectiveId"], workspace: "command",
    fields: ["title", "employeeId", "assigneeName", "reviewerName", "projectId", "objectiveId", "status", "error", "reviewOf",
      "delegatedBy.sourceTurnId", "delegatedBy.employeeId", "delegatedBy.sessionId", "createdAt", "startedAt", "finishedAt",
      "scheduledAt", "leaseUntil", "workerRole", "eventCount"] },
};
const idPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/;
const validStatus = /^[a-z-]{1,24}$/;

async function studioRecords({ sources, ownerId, input, jobView, eventBatches }) {
  const { kind, id, status, limit = 10, offset = 0, employeeId, projectId, objectiveId } = input || {};
  const definition = typeof kind === "string" && Object.hasOwn(definitions, kind) && definitions[kind];
  if (!definition || !Number.isSafeInteger(limit) || limit < 1 || limit > 20 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 1000 ||
      (status !== undefined && (typeof status !== "string" || !validStatus.test(status)))) return null;
  const filter = { ownerId, ...definition.filter };
  for (const [key, value] of Object.entries({ id, employeeId, projectId, objectiveId })) {
    if (value === undefined) continue;
    if (typeof value !== "string" || !idPattern.test(value) ||
        (key !== "id" && !definition.scope?.includes(key) && !(kind === "mandates" && key !== "objectiveId"))) return null;
    filter[key === "id" ? "_id" : key] = value;
  }
  if (status !== undefined && definition.fields.includes("status")) filter.status = status;
  const records = await sources[definition.source]().find(filter, {
    projection: Object.fromEntries(definition.fields.map(field => [field, 1])),
  }).sort(kind === "assignments" ? { createdAt: -1, _id: 1 } : { _id: 1 }).skip(offset).limit(limit + 1).toArray();
  const items = records.slice(0, limit).map(record => {
    const item = kind === "assignments" ? jobView(record) : record;
    if (definition.workspace) {
      const query = new URLSearchParams({ workspace: definition.workspace });
      if (definition.record) {
        query.set("source", definition.record);
        query.set("record", item._id);
      } else query.set("job", item._id);
      item.url = "/operations?" + query;
    }
    if (kind === "mandates" && item.activationSource === "foundation-objective") {
      item.statusExplanation = "The objective records effective activation and acceptance.";
    }
    return item;
  });
  if (kind === "assignments" && id && items[0]?.status === "completed") {
    items[0].resultExcerpt = (await precedingResult(items[0], eventBatches)).trim();
  }
  return { observedAt: new Date(), kind, items, nextOffset: records.length > limit ? offset + limit : null };
}

module.exports = { studioRecords };

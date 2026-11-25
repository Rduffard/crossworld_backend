async function employeeContext({ workforce, projects, objectives, jobs }, ownerId, employee) {
  const owner = { ownerId };
  const active = { ...owner, status: "active" };
  const [role, supervisor, mandates, assignments] = await Promise.all([
    workforce().findOne({ ...owner, kind: "role", key: employee.role }, {
      projection: { name: 1, responsibilities: 1 },
    }),
    employee.supervisorId ? workforce().findOne({ ...owner, kind: "employee", _id: employee.supervisorId }, {
      projection: { name: 1, role: 1 },
    }) : null,
    workforce().find({ ...owner, kind: "project-assignment", employeeId: employee._id, status: "assigned" }, {
      projection: { projectId: 1, objectiveId: 1, responsibilities: 1 },
    }).sort({ _id: 1 }).limit(10).toArray(),
    jobs().find({ ...owner, employeeId: employee._id, status: { $in: ["waiting", "queued", "running", "scheduled"] } }, {
      projection: { title: 1, status: 1, objectiveId: 1, leaseUntil: 1 },
    }).sort({ createdAt: -1, _id: 1 }).limit(10).toArray(),
  ]);
  const [activeProjects, activeObjectives] = await Promise.all([
    projects().find({ ...active, _id: { $in: mandates.map(item => item.projectId) } }, {
      projection: { name: 1 },
    }).toArray(),
    objectives().find({ ...active, _id: { $in: mandates.map(item => item.objectiveId) } }, {
      projection: { title: 1 },
    }).toArray(),
  ]);
  const projectNames = new Map(activeProjects.map(item => [item._id, item.name]));
  const objectiveNames = new Map(activeObjectives.map(item => [item._id, item.title]));
  return {
    id: employee._id, name: employee.name, role: role?.name || employee.role,
    roleResponsibilities: role?.responsibilities, supervisor: supervisor || { name: "Owner" },
    responsibilities: employee.responsibilities, guidance: employee.instructions,
    communicationPrinciple: "Speak in the first person when speaking as yourself. Attribute work done by other employees accurately and disclose uncertainty.",
    ...(employee.identity ? { identity: employee.identity } : {}),
    projects: mandates.filter(item => projectNames.has(item.projectId) && objectiveNames.has(item.objectiveId)).map(item => ({
      projectId: item.projectId, name: projectNames.get(item.projectId), objective: objectiveNames.get(item.objectiveId),
      responsibilities: item.responsibilities,
      url: "/operations?workspace=objectives&source=objective&record=" + item.objectiveId,
    })),
    assignments: assignments.map(({ _id, title, status, leaseUntil }) => ({
      title, status: status === "running" && leaseUntil < new Date() ? "interrupted" : status,
      url: "/operations?workspace=command&job=" + _id,
    })),
  };
}

module.exports = { employeeContext };

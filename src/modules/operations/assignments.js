async function resolveAssignment({ objectives, workforce, projects }, {
  ownerId, objectiveId, employeeId, workspace, roles = ["worker", "lead", "art-director"],
}) {
  const [objective, employee] = await Promise.all([
    objectives().findOne({ _id: objectiveId, ownerId, status: "active" }),
    workforce().findOne({
      _id: employeeId, ownerId, kind: "employee", workspace, status: "available",
      role: { $in: roles },
    }),
  ]);
  const project = objective?.projectId && await projects().findOne({
    _id: objective.projectId, ownerId, status: "active", workspace,
  });
  return objective && employee && (!objective.projectId || project) ? { objective, employee, project } : null;
}

function assignmentFields({ objective, employee, project }, context = {}) {
  return {
    objectiveId: objective._id, employeeId: employee._id, assignedRole: employee.role,
    assigneeName: employee.name, title: objective.title,
    ...(project ? { projectId: project._id } : {}),
    assignmentContext: "\n\nOwner-provided assignment context (JSON): " + JSON.stringify({
      objective: objective.title, instruction: objective.instruction, criteria: objective.criteria.map(({ text }) => text),
      employee: employee.name, responsibilities: employee.responsibilities, employeeInstructions: employee.instructions,
      ...(project ? { project: project.name, projectInstructions: project.instructions } : {}),
      ...context,
    }),
  };
}

module.exports = { resolveAssignment, assignmentFields };

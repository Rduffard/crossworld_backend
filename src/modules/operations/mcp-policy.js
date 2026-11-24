const catalog = Object.freeze({
  "blender.get_scene_info": { workspaces: ["workshop"], schema: "empty" },
  "blender.look": { workspaces: ["workshop"], schema: "empty" },
  "aseprite.get_sprite_info": { workspaces: ["workshop"], schema: "sprite" },
  "aseprite.add_frame": { workspaces: ["workshop"], schema: "sprite", write: true },
  "unityMCP.get_test_job": { workspaces: ["development", "workshop"], schema: "testJob" },
  "unityMCP.run_tests": { workspaces: ["development", "workshop"], schema: "editMode", write: true },
});

// Approving settings cannot register a new tool or override its argument schema.
function toolRuleKey(value) {
  const parts = value.split(":");
  const [role, workspace, tool] = parts;
  return parts.length === 3 && /^[a-z][a-z0-9-]{0,31}$/.test(role) &&
    Object.hasOwn(catalog, tool) && catalog[tool].workspaces.includes(workspace);
}

function toolIntent(value, job) {
  const tool = value.tool;
  const workspace = job.workspace;
  const role = job.workerRole || "direct";
  if (typeof tool !== "string" || !Object.hasOwn(catalog, tool)) return null;
  const rule = catalog[tool];
  const args = value.arguments;
  if (!rule.workspaces.includes(workspace) || !args || Array.isArray(args) || typeof args !== "object" ||
      (rule.write && job.profile !== workspace)) return null;
  if (rule.schema === "sprite") {
    if (Object.keys(args).length !== 1 || typeof args.filename !== "string" || args.filename.length > 200 ||
        !/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.aseprite$/.test(args.filename)) return null;
  } else if (rule.schema === "testJob") {
    if (Object.keys(args).length !== 1 || typeof args.job_id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(args.job_id)) return null;
  } else if (rule.schema === "editMode") {
    if (Object.keys(args).length !== 2 || args.mode !== "EditMode" || !Array.isArray(args.assembly_names) ||
        args.assembly_names.length !== 1 || typeof args.assembly_names[0] !== "string" ||
        !/^[a-zA-Z][\w.]{1,79}$/.test(args.assembly_names[0])) return null;
  } else if (Object.keys(args).length) return null;
  return { operation: "mcpTool", tool, role, workspace, profile: job.profile || "read-only", arguments: args };
}

module.exports = { catalog, toolIntent, toolRuleKey };

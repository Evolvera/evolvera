import fs from "node:fs";
import path from "node:path";
import { assertOwnedWorkspace } from "./ownership.mjs";
import { canonicalize, isWithin, requireContext, UsersError } from "./registry.mjs";

const FIELDS = ["extensions", "skills", "prompts", "themes"];
const CREDENTIAL_NAMES = new Set(["auth.json", "settings.json", "models.json", "mcp.json", "memory"]);
const fail = (code, message) => { throw new UsersError(code, message); };
const within = (root, target) => isWithin(root, target);
const clean = (value) => typeof value === "string" ? "[redacted]" : "[invalid resource]";
const sourceOf = (entry) => typeof entry === "string" ? entry : entry && typeof entry.source === "string" ? entry.source : null;
const isRemote = (value) => /^(?:npm:|git\+|https?:\/\/|ssh:\/\/|git@)/i.test(value) || (/^(?:@[^/]+\/)?[^./\\]+@[^\\/]+$/.test(value) && !path.isAbsolute(value));
const isMcp = (value) => /(?:^|[\/@:])(?:pi-mcp-adapter|mcp)(?:$|[@/])/i.test(value);
const hasCredentialPart = (value) => value.split(/[\\/]+/).some((part) => CREDENTIAL_NAMES.has(part.toLowerCase()));

function rootsFor(workspace, profile) {
  return [...new Set([workspace.workspaceRoot, profile.agentDir, ...profile.sharedAssets, ...profile.contexts])];
}

function admitLocal(value, base, roots, diagnostics, resource) {
  if (typeof value !== "string" || !value || hasCredentialPart(value)) {
    diagnostics.push({ code: "RESOURCE_BLOCKED", resource, source: clean(value) });
    return null;
  }
  let canonical;
  try { canonical = canonicalize(path.isAbsolute(value) ? value : path.resolve(base, value)); } catch {
    diagnostics.push({ code: "RESOURCE_UNRESOLVABLE", resource, source: clean(value) });
    return null;
  }
  if (!roots.some((root) => within(root, canonical))) {
    diagnostics.push({ code: "RESOURCE_OUTSIDE_OWNER", resource, source: clean(value) });
    return null;
  }
  return canonical;
}

function admitList(values, base, roots, diagnostics, resource, isKevin) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) {
    diagnostics.push({ code: "RESOURCE_LIST_INVALID", resource, source: "[invalid list]" });
    return [];
  }
  const result = [];
  for (const value of values) {
    if (typeof value !== "string") {
      diagnostics.push({ code: "RESOURCE_INVALID", resource, source: "[invalid resource]" });
      continue;
    }
    const prefix = /^[+!-]/.test(value) ? value[0] : "";
    const target = prefix ? value.slice(1) : value;
    if (isKevin && isMcp(target)) {
      diagnostics.push({ code: "MCP_BLOCKED", resource, source: clean(target) });
    } else if (/^builtin:/i.test(target)) {
      result.push(value);
    } else {
      const local = admitLocal(target, base, roots, diagnostics, resource);
      if (local) result.push(prefix + local);
    }
  }
  return result;
}

function admitPackages(settings, base, roots, diagnostics, isKevin) {
  if (settings.packages === undefined) return [];
  if (!Array.isArray(settings.packages)) {
    diagnostics.push({ code: "PACKAGE_LIST_INVALID", resource: "packages", source: "[invalid list]" });
    return [];
  }
  const result = [];
  for (const entry of settings.packages) {
    const source = sourceOf(entry);
    if (!source) {
      diagnostics.push({ code: "PACKAGE_INVALID", resource: "packages", source: "[invalid package]" });
    } else if (isKevin && isMcp(source)) {
      diagnostics.push({ code: "MCP_BLOCKED", resource: "packages", source: clean(source) });
    } else if (isRemote(source)) {
      // Remote specs survive only because this list came from the explicit profile settings input.
      result.push(entry);
    } else {
      const local = admitLocal(source, base, roots, diagnostics, "packages");
      if (local) result.push(typeof entry === "string" ? local : { ...entry, source: local });
    }
  }
  return result;
}

function hasUnadmittedContext(cwd, roots) {
  for (let dir = cwd; ; dir = path.dirname(dir)) {
    if (!roots.some((root) => within(root, dir))) return true;
    if (path.dirname(dir) === dir) return false;
  }
}

/** Inventory and admit caller-supplied profile resources before constructing a loader. */
export function admitUserResources(profileContext, request = {}) {
  requireContext(profileContext);
  const workspace = assertOwnedWorkspace(profileContext, request.cwd);
  if (request.workspace && (request.workspace.userId !== profileContext.id || request.workspace.cwd !== workspace.cwd || request.workspace.workspaceRoot !== workspace.workspaceRoot)) {
    fail("WORKSPACE_RECEIPT_MISMATCH", "workspace receipt does not match the effective owned workspace");
  }
  const roots = rootsFor(workspace, profileContext);
  const diagnostics = [];
  const isKevin = profileContext.id === "kevin";
  const global = { ...(request.settings ?? {}) };
  const project = { ...(request.projectSettings ?? {}) };
  for (const field of FIELDS) {
    global[field] = admitList(global[field], profileContext.agentDir, roots, diagnostics, field, isKevin);
    project[field] = admitList(project[field], path.join(workspace.cwd, ".pi"), roots, diagnostics, field, isKevin);
  }
  global.packages = admitPackages(global, profileContext.agentDir, roots, diagnostics, isKevin);
  project.packages = admitPackages(project, path.join(workspace.cwd, ".pi"), roots, diagnostics, isKevin);

  const cli = request.cliPaths ?? {};
  const cliPaths = {};
  for (const field of FIELDS) cliPaths[field] = admitList(cli[field], workspace.cwd, roots, diagnostics, `cli-${field}`, isKevin);
  const contextPaths = [];
  if (request.contextPaths !== undefined && !Array.isArray(request.contextPaths)) {
    diagnostics.push({ code: "RESOURCE_LIST_INVALID", resource: "contexts", source: "[invalid list]" });
  } else {
    for (const value of request.contextPaths ?? []) {
      const local = admitLocal(value, workspace.cwd, roots, diagnostics, "contexts");
      if (local) contextPaths.push(local);
    }
  }
  return Object.freeze({
    userId: profileContext.id,
    cwd: workspace.cwd,
    workspaceRoot: workspace.workspaceRoot,
    settings: Object.freeze(global),
    projectSettings: Object.freeze(project),
    cliPaths: Object.freeze(Object.fromEntries(Object.entries(cliPaths).map(([key, value]) => [key, Object.freeze(value)]))),
    contextPaths: Object.freeze(contextPaths),
    diagnostics: Object.freeze(diagnostics.map((item) => Object.freeze(item))),
  });
}

/** Return the public loader inputs after complete pre-construction admission. */
export function buildAdmittedLoaderOptions(profileContext, request = {}) {
  const admitted = admitUserResources(profileContext, request);
  const roots = rootsFor({ workspaceRoot: admitted.workspaceRoot }, profileContext);
  const cli = admitted.cliPaths;
  const admittedContextFiles = admitted.contextPaths.map((file) => ({ path: file, content: fs.readFileSync(file, "utf8") }));
  const settings = { ...admitted.settings, ...admitted.projectSettings };
  for (const field of [...FIELDS, "packages"]) settings[field] = [...(admitted.settings[field] ?? []), ...(admitted.projectSettings[field] ?? [])];
  return Object.freeze({
    cwd: admitted.cwd,
    agentDir: profileContext.agentDir,
    settings: Object.freeze(settings),
    projectSettings: admitted.projectSettings,
    additionalExtensionPaths: cli.extensions,
    additionalSkillPaths: cli.skills,
    additionalPromptTemplatePaths: cli.prompts,
    additionalThemePaths: cli.themes,
    noContextFiles: hasUnadmittedContext(admitted.cwd, roots),
    agentsFilesOverride: () => ({ agentsFiles: admittedContextFiles }),
    diagnostics: admitted.diagnostics,
  });
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { assertOwnedWorkspace } from "./ownership.mjs";
import { canonicalize, isWithin, requireContext, UsersError } from "./registry.mjs";

const FIELDS = ["extensions", "skills", "prompts", "themes"];
const CREDENTIAL_NAMES = new Set(["auth.json", "settings.json", "models.json", "mcp.json", "memory"]);
const fail = (code, message) => { throw new UsersError(code, message); };
const within = (root, target) => isWithin(root, target);
const clean = (value) => typeof value === "string" ? "[redacted]" : "[invalid resource]";
const sourceOf = (entry) => typeof entry === "string" ? entry : entry && typeof entry.source === "string" ? entry.source : null;
const isRemote = (value) => /^(?:npm:|git\+|https?:\/\/|ssh:\/\/|git@)/i.test(value) || (/^(?:@[^/]+\/)?[^./\\]+@[^\\/]+$/.test(value) && !path.isAbsolute(value));
const isMcp = (value) => typeof value === "string" && /(?:^|[\\/@:])(?:pi-mcp-adapter|mcp)(?=$|[./@\\])/i.test(value);
const hasCredentialPart = (value) => value.split(/[\\/]+/).some((part) => CREDENTIAL_NAMES.has(part.toLowerCase()));
const sdkRequire = createRequire(path.join(path.dirname(process.execPath), "node_modules", "@earendil-works", "pi-coding-agent", "dist", "core", "package-manager.js"));
let semver;
const semverApi = () => semver ??= sdkRequire("semver");
const PACKAGE_RESOURCE_FIELDS = ["extensions", "skills", "prompts", "themes"];

function rootsFor(workspace, profile) {
  return [...new Set([workspace.workspaceRoot, profile.agentDir, ...profile.sharedAssets, ...profile.contexts])];
}

function admitLocal(value, base, roots, diagnostics, resource, { requireExisting = true } = {}) {
  if (typeof value !== "string" || !value || hasCredentialPart(value)) {
    diagnostics.push({ code: "RESOURCE_BLOCKED", resource, source: clean(value) });
    return null;
  }
  const requested = path.resolve(base, value);
  let canonical;
  try { canonical = canonicalize(requested); } catch {
    diagnostics.push({ code: "RESOURCE_UNRESOLVABLE", resource, source: clean(value) });
    return null;
  }
  if (!roots.some((root) => within(root, canonical))) {
    diagnostics.push({ code: "RESOURCE_OUTSIDE_OWNER", resource, source: clean(value) });
    return null;
  }
  if (canonical !== requested) {
    diagnostics.push({ code: "RESOURCE_ALIAS", resource, source: clean(value) });
    return null;
  }
  try {
    const stat = fs.lstatSync(canonical);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || (stat.isFile() && stat.nlink > 1)) {
      diagnostics.push({ code: "RESOURCE_ALIAS", resource, source: clean(value) });
      return null;
    }
  } catch (error) {
    if (requireExisting || error.code !== "ENOENT") {
      diagnostics.push({ code: "RESOURCE_UNRESOLVABLE", resource, source: clean(value) });
      return null;
    }
  }
  return canonical;
}

function manifestContainsMcp(metadata) {
  return isMcp(metadata.name) || PACKAGE_RESOURCE_FIELDS.some((field) => Array.isArray(metadata.pi?.[field]) && metadata.pi[field].some(isMcp));
}

function validatePackageManifest(directory, versionRange) {
  const manifest = path.join(directory, "package.json");
  let metadata;
  try {
    const stat = fs.lstatSync(manifest);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1 || canonicalize(manifest) !== manifest) return null;
    const fd = fs.openSync(manifest, "r");
    try {
      const opened = fs.fstatSync(fd);
      if (!opened.isFile() || opened.nlink > 1 || opened.ino !== stat.ino || opened.dev !== stat.dev) return null;
      metadata = JSON.parse(fs.readFileSync(fd, "utf8"));
    } finally { fs.closeSync(fd); }
  } catch { return null; }
  const versionApi = semverApi();
  if (!metadata || typeof metadata.name !== "string" || typeof metadata.version !== "string" || !versionApi.valid(metadata.version)) return null;
  if (versionRange !== null && versionRange !== undefined) {
    const range = versionApi.validRange(versionRange);
    if (!range || !versionApi.satisfies(metadata.version, range)) return null;
  }
  const entries = metadata.pi;
  if (entries !== undefined && (typeof entries !== "object" || entries === null || Array.isArray(entries))) return null;
  for (const field of PACKAGE_RESOURCE_FIELDS) {
    if (entries?.[field] === undefined) continue;
    if (!Array.isArray(entries[field]) || entries[field].some((entry) => typeof entry !== "string" || !entry || path.isAbsolute(entry) || /^[a-zA-Z]:/.test(entry) || entry.split(/[\\/]+/).some((part) => part === ".."))) return null;
  }
  return metadata;
}

function packageNameAndVersion(source) {
  const value = source.replace(/^npm:/i, "");
  const match = /^(?:(@[^/]+\/[^@/]+)|([^@/]+))(?:@(.+))?$/.exec(value);
  if (!match) return null;
  return { name: match[1] ?? match[2], version: match[3] ?? null };
}

function admitPackageSource(source, base, roots, diagnostics, isKevin, packageRoots) {
  if (isKevin && isMcp(source)) {
    diagnostics.push({ code: "MCP_BLOCKED", resource: "packages", source: clean(source) });
    return null;
  }
  if (isRemote(source)) {
    const spec = packageNameAndVersion(source);
    if (!spec) {
      diagnostics.push({ code: "PACKAGE_REMOTE_BLOCKED", resource: "packages", source: clean(source) });
      return null;
    }
    for (const root of packageRoots) {
      const candidate = path.join(root, ...spec.name.split("/"));
      const local = admitLocal(candidate, base, roots, diagnostics, "packages");
      if (!local) continue;
      const metadata = validatePackageManifest(local, spec.version);
      if (!metadata) {
        diagnostics.push({ code: "PACKAGE_MANIFEST_INVALID", resource: "packages", source: clean(source) });
        continue;
      }
      if (isKevin && manifestContainsMcp(metadata)) {
        diagnostics.push({ code: "MCP_BLOCKED", resource: "packages", source: clean(source) });
        continue;
      }
      if (metadata.name !== spec.name) {
        diagnostics.push({ code: isKevin && metadata.name === "pi-mcp-adapter" ? "MCP_BLOCKED" : "PACKAGE_IDENTITY_MISMATCH", resource: "packages", source: clean(source) });
        continue;
      }
      return local;
    }
    diagnostics.push({ code: "PACKAGE_NOT_INSTALLED", resource: "packages", source: clean(source) });
    return null;
  }
  const local = admitLocal(source, base, roots, diagnostics, "packages");
  if (!local) return null;
  try {
    if (fs.lstatSync(local).isDirectory() && fs.existsSync(path.join(local, "package.json"))) {
      const metadata = validatePackageManifest(local);
      if (!metadata) {
        diagnostics.push({ code: "PACKAGE_MANIFEST_INVALID", resource: "packages", source: clean(source) });
        return null;
      }
      if (isKevin && manifestContainsMcp(metadata)) {
        diagnostics.push({ code: "MCP_BLOCKED", resource: "packages", source: clean(source) });
        return null;
      }
    }
  } catch {
    diagnostics.push({ code: "PACKAGE_MANIFEST_INVALID", resource: "packages", source: clean(source) });
    return null;
  }
  return local;
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

function admitPackages(settings, base, roots, diagnostics, isKevin, packageRoots) {
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
    } else {
      const local = admitPackageSource(source, base, roots, diagnostics, isKevin, packageRoots);
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

function candidateMetadata(candidate, ownerRoots, { allowMissing = true } = {}) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate) || !ownerRoots.some((root) => within(root, candidate))) {
    fail("RESOURCE_INVENTORY_REJECTED", "resource candidate is outside selected owner roots");
  }
  let stat;
  try { stat = fs.lstatSync(candidate); } catch (error) {
    if (allowMissing && (error.code === "ENOENT" || error.code === "ENOTDIR")) return null;
    fail("RESOURCE_INVENTORY_UNAVAILABLE", "resource candidate metadata cannot be inspected");
  }
  const canonical = canonicalize(candidate);
  if (canonical !== candidate || stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || (stat.isFile() && stat.nlink > 1)) {
    fail("RESOURCE_INVENTORY_REJECTED", "resource candidate identity is not canonical and unique");
  }
  return stat;
}

function inventoryCandidate(candidate, ownerRoots, seen) {
  const stat = candidateMetadata(candidate, ownerRoots);
  if (!stat || seen.has(candidate)) return;
  seen.add(candidate);
  if (stat.isDirectory()) {
    let entries;
    try { entries = fs.readdirSync(candidate, { withFileTypes: true }); } catch {
      fail("RESOURCE_INVENTORY_UNAVAILABLE", "resource candidate directory cannot be inventoried");
    }
    for (const entry of entries) inventoryCandidate(path.join(candidate, entry.name), ownerRoots, seen);
  }
}

function validateDeclaredPath(value, resourceRoot) {
  if (typeof value !== "string" || !value) fail("RESOURCE_INVENTORY_REJECTED", "package resource declaration is invalid");
  const hasPrefix = /^[+!-]/.test(value);
  const relative = hasPrefix ? value.slice(1) : value;
  if (path.isAbsolute(relative) || /^[a-zA-Z]:/.test(relative) || relative.split(/[\\/]+/).some((part) => part === "..")) {
    fail("RESOURCE_INVENTORY_REJECTED", "package resource declaration escapes its owner root");
  }
  if (value.startsWith("!") || value.startsWith("-")) return null;
  const segments = relative.split(/[\\/]+/);
  const prefix = [];
  for (const segment of segments) {
    if ([...segment].some((character) => "*?[]{}()".includes(character))) break;
    prefix.push(segment);
  }
  return path.resolve(resourceRoot, ...(prefix.length ? prefix : []));
}

function inventoryPackage(directory, entry, ownerRoots, seen, isKevin) {
  const directoryStat = candidateMetadata(directory, ownerRoots);
  if (!directoryStat) return;
  if (!directoryStat.isDirectory()) {
    inventoryCandidate(directory, ownerRoots, seen);
    return;
  }
  const manifestPath = path.join(directory, "package.json");
  const manifestStat = candidateMetadata(manifestPath, ownerRoots);
  if (manifestStat) inventoryCandidate(manifestPath, ownerRoots, seen);
  let metadata = null;
  if (manifestStat) {
    metadata = validatePackageManifest(directory);
    if (!metadata || (isKevin && manifestContainsMcp(metadata))) return;
  }
  const ignorePaths = [".gitignore", ".ignore", ".fdignore"].map((name) => path.join(directory, name));
  for (const ignorePath of ignorePaths) inventoryCandidate(ignorePath, ownerRoots, seen);
  for (const field of PACKAGE_RESOURCE_FIELDS) {
    const roots = [path.join(directory, field)];
    const entryValues = entry?.[field];
    if (entryValues !== undefined && !Array.isArray(entryValues)) fail("RESOURCE_INVENTORY_REJECTED", "package resource filters must be arrays");
    for (const value of entryValues ?? []) {
      const declared = validateDeclaredPath(value, directory);
      if (declared) roots.push(declared);
    }
    for (const value of metadata?.pi?.[field] ?? []) {
      const declared = validateDeclaredPath(value, directory);
      if (declared) roots.push(declared);
    }
    for (const root of roots) inventoryCandidate(root, ownerRoots, seen);
  }
}

/** Fail before native resource resolution when any native or request-bound candidate has unsafe identity. */
export function validateAdmittedResourceInventory(profileContext, request = {}) {
  requireContext(profileContext);
  const workspace = assertOwnedWorkspace(profileContext, request.cwd);
  const roots = rootsFor(workspace, profileContext);
  const seen = new Set();
  const candidates = [];
  const packageRoots = {
    global: profileContext.sharedAssets.map((root) => path.join(root, "npm", "node_modules")),
    project: [path.join(workspace.cwd, ".pi", "npm", "node_modules"), ...profileContext.sharedAssets.map((root) => path.join(root, "npm", "node_modules"))],
  };
  const isKevin = profileContext.id === "kevin";
  const addPackage = (entry, base, searchRoots) => {
    const source = sourceOf(entry);
    if (!source || /^builtin:/i.test(source) || (isKevin && isMcp(source))) return;
    if (isRemote(source)) {
      const spec = packageNameAndVersion(source);
      if (!spec) return;
      for (const root of searchRoots) {
        const directory = path.join(root, ...spec.name.split("/"));
        const stat = candidateMetadata(directory, roots);
        if (stat) {
          inventoryPackage(directory, entry, roots, seen, isKevin);
          return;
        }
      }
      return;
    }
    inventoryPackage(path.resolve(base, source), entry, roots, seen, isKevin);
  };
  const addSettings = (settings, base, searchRoots) => {
    for (const field of FIELDS) for (const value of Array.isArray(settings?.[field]) ? settings[field] : []) {
      const target = typeof value === "string" ? value.replace(/^[+!-]/, "") : "";
      if (target && !/^builtin:/i.test(target)) candidates.push(path.resolve(base, target));
    }
    for (const entry of Array.isArray(settings?.packages) ? settings.packages : []) addPackage(entry, base, searchRoots);
  };
  for (const base of [profileContext.agentDir, path.join(workspace.cwd, ".pi")]) {
    for (const field of FIELDS) candidates.push(path.join(base, field));
  }
  addSettings(request.settings, profileContext.agentDir, packageRoots.global);
  addSettings(request.projectSettings, path.join(workspace.cwd, ".pi"), packageRoots.project);
  const bound = request.requestInputs ?? {};
  for (const field of FIELDS) for (const value of bound.cliPaths?.[field] ?? []) {
    if (typeof value !== "string") fail("RESOURCE_INVENTORY_REJECTED", "request-bound resource path is invalid");
    const target = value.replace(/^[+!-]/, "");
    if (!/^builtin:/i.test(target)) candidates.push(path.resolve(workspace.cwd, target));
  }
  for (const value of bound.contextPaths ?? []) {
    if (typeof value !== "string") fail("RESOURCE_INVENTORY_REJECTED", "request-bound context path is invalid");
    candidates.push(path.resolve(workspace.cwd, value));
  }
  for (const candidate of candidates) inventoryCandidate(path.resolve(candidate), roots, seen);

  const trustedSkillRoots = [path.join(request.homeDir ?? bound.homeDir ?? os.homedir(), ".agents", "skills")];
  for (let dir = workspace.cwd; ; dir = path.dirname(dir)) {
    trustedSkillRoots.push(path.join(dir, ".agents", "skills"));
    if (dir === workspace.workspaceRoot || path.dirname(dir) === dir) break;
  }
  for (const root of new Set(trustedSkillRoots.map((item) => path.resolve(item)))) {
    if (!roots.some((ownerRoot) => within(ownerRoot, root))) {
      let stat;
      try { stat = fs.lstatSync(root); } catch (error) {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") continue;
        fail("RESOURCE_INVENTORY_UNAVAILABLE", "trusted skill root metadata cannot be inspected");
      }
      if (stat) fail("RESOURCE_INVENTORY_REJECTED", "trusted skill root is outside selected owner roots");
    } else {
      inventoryCandidate(root, roots, seen);
    }
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
  const sharedPackageRoots = profileContext.sharedAssets.map((root) => path.join(root, "npm", "node_modules"));
  // npm refs designate common CODE and resolve only from the admitted shared inventory; owned overlays must be explicit local paths.
  const globalPackageRoots = [...new Set(sharedPackageRoots)];
  const projectPackageRoots = [...new Set([path.join(workspace.cwd, ".pi", "npm", "node_modules"), ...globalPackageRoots])];
  global.packages = admitPackages(global, profileContext.agentDir, roots, diagnostics, isKevin, globalPackageRoots);
  project.packages = admitPackages(project, path.join(workspace.cwd, ".pi"), roots, diagnostics, isKevin, projectPackageRoots);

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
  const loaderOptions = Object.freeze({
    cwd: admitted.cwd,
    agentDir: profileContext.agentDir,
    additionalExtensionPaths: cli.extensions,
    additionalSkillPaths: cli.skills,
    additionalPromptTemplatePaths: cli.prompts,
    additionalThemePaths: cli.themes,
    noContextFiles: hasUnadmittedContext(admitted.cwd, roots),
    agentsFilesOverride: () => ({ agentsFiles: admittedContextFiles }),
  });
  return Object.freeze({
    settings: Object.freeze(settings),
    projectSettings: admitted.projectSettings,
    loaderOptions,
    diagnostics: admitted.diagnostics,
  });
}

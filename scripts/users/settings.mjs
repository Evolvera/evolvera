import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { assertOwnedWorkspace } from "./ownership.mjs";
import { canonicalize, UsersError } from "./registry.mjs";
import { admitUserResources } from "./resources.mjs";

const fail = (code, message) => { throw new UsersError(code, message); };
const FIELDS = ["extensions", "skills", "prompts", "themes"];
const sdkRequire = createRequire(path.join(path.dirname(process.execPath), "node_modules", "@earendil-works", "pi-coding-agent", "dist", "core", "settings-manager.js"));
let lockfile;
const lockfileApi = () => lockfile ??= sdkRequire("proper-lockfile");

function assertFileIdentity(file) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink > 1 || canonicalize(file) !== file) {
      fail("SETTINGS_ALIAS", "selected settings file is not a unique regular file");
    }
  } catch (error) {
    if (error instanceof UsersError) throw error;
    if (error.code !== "ENOENT") fail("SETTINGS_UNAVAILABLE", "selected settings file cannot be inspected");
  }
}

function assertPathIdentity(file, { fileMayBeMissing = true } = {}) {
  const parent = path.dirname(file);
  let canonicalParent;
  try { canonicalParent = canonicalize(parent); } catch (error) {
    if (error.code !== "ENOENT") fail("SETTINGS_UNAVAILABLE", "selected settings directory cannot be resolved");
    canonicalParent = parent;
  }
  if (canonicalParent !== parent) fail("SETTINGS_ALIAS", "selected settings directory is an alias");
  try {
    const stat = fs.lstatSync(parent);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("SETTINGS_ALIAS", "selected settings directory is not canonical");
  } catch (error) {
    if (error instanceof UsersError) throw error;
    if (error.code !== "ENOENT") fail("SETTINGS_UNAVAILABLE", "selected settings directory cannot be inspected");
  }
  try {
    fs.lstatSync(file);
    assertFileIdentity(file);
  } catch (error) {
    if (error instanceof UsersError) throw error;
    if (!fileMayBeMissing || error.code !== "ENOENT") fail("SETTINGS_UNAVAILABLE", "selected settings file cannot be inspected");
  }
}

function assertSelectedPaths(profile, cwd) {
  if (typeof cwd !== "string" || !path.isAbsolute(cwd)) fail("SETTINGS_CWD_INVALID", "an explicit absolute owned cwd is required");
  const workspace = assertOwnedWorkspace(profile, cwd);
  if (canonicalize(profile.agentDir) !== profile.agentDir) fail("SETTINGS_AGENT_ALIAS", "selected agent directory changed identity");
  const globalFile = path.join(profile.agentDir, "settings.json");
  const projectFile = path.join(workspace.cwd, ".pi", "settings.json");
  assertPathIdentity(globalFile);
  assertPathIdentity(projectFile);
  return workspace;
}

function checkNativeErrors(manager) {
  const errors = manager.drainErrors();
  if (errors.length) fail("SETTINGS_LOAD_FAILED", "native settings load or persistence failed");
}

function openSelectedFile(file, flags, scope) {
  assertPathIdentity(file);
  const existing = (() => { try { return fs.lstatSync(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; } })();
  if (existing && (existing.isSymbolicLink() || !existing.isFile() || existing.nlink > 1)) {
    fail("SETTINGS_ALIAS", `selected ${scope} settings file is not a unique regular file`);
  }
  const fd = fs.openSync(file, flags, 0o600);
  try {
    assertPathIdentity(file);
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.nlink > 1 || (existing && (opened.ino !== existing.ino || opened.dev !== existing.dev))) {
      fail("SETTINGS_ALIAS", `selected ${scope} settings file changed identity`);
    }
    return fd;
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function createSelectedStorage(profile, cwd) {
  const workspace = assertSelectedPaths(profile, cwd);
  const files = {
    global: path.join(profile.agentDir, "settings.json"),
    project: path.join(workspace.cwd, ".pi", "settings.json"),
  };
  return Object.freeze({
    withLock(scope, update) {
      if (scope !== "global" && scope !== "project") fail("SETTINGS_SCOPE_INVALID", "native settings requested an unknown scope");
      assertSelectedPaths(profile, cwd);
      const file = files[scope];
      let release;
      try {
        assertSelectedPaths(profile, cwd);
        const fileExists = fs.existsSync(file);
        if (fileExists) release = lockfileApi().lockSync(file, { realpath: false });
        assertSelectedPaths(profile, cwd);
        const current = fileExists ? (() => {
          const fd = openSelectedFile(file, "r", scope);
          try { return fs.readFileSync(fd, "utf8"); } finally { fs.closeSync(fd); }
        })() : undefined;
        assertSelectedPaths(profile, cwd);
        const next = update(current);
        if (next === undefined) return;
        if (typeof next !== "string") fail("SETTINGS_STORAGE_INVALID", "native settings produced a non-string write");
        assertSelectedPaths(profile, cwd);
        if (!release) release = lockfileApi().lockSync(file, { realpath: false });
        assertSelectedPaths(profile, cwd);
        fs.writeFileSync(file, next, "utf8");
      } finally {
        if (release) release();
      }
    },
  });
}

const PUBLIC_MUTATORS = [
  "setProjectTrusted", "applyOverrides", "setLastChangelogVersion", "setDefaultProvider", "setDefaultModel", "setDefaultModelAndProvider",
  "setSteeringMode", "setFollowUpMode", "setTheme", "setDefaultThinkingLevel", "setModelThinkingLevel", "removeModelThinkingLevel",
  "setTransport", "setCompactionEnabled", "setRetryEnabled", "setHttpIdleTimeoutMs", "setCacheWarmingMode", "setHideThinkingBlock",
  "setShowCacheMissNotices", "setShellPath", "setQuietStartup", "setDefaultProjectTrust", "setShellCommandPrefix", "setNpmCommand",
  "setCollapseChangelog", "setEnableInstallTelemetry", "setEnableAnalytics", "setPackages", "setProjectPackages", "setExtensionPaths",
  "setProjectExtensionPaths", "setSkillPaths", "setProjectSkillPaths", "setPromptTemplatePaths", "setProjectPromptTemplatePaths",
  "setThemePaths", "setProjectThemePaths", "setEnableSkillCommands", "setShowImages", "setImageWidthCells", "setClearOnShrink",
  "setShowTerminalProgress", "setTuiMode", "setFullscreenExitOutput", "setFullscreenScrollbar", "setFullscreenCopyOnSelect",
  "setFullscreenWheelScrollLines", "setImageAutoResize", "setBlockImages", "setEnabledModels", "setDoubleEscapeAction", "setTreeFilterMode",
  "setShowHardwareCursor", "setEditorPaddingX", "setOutputPad", "setAutocompleteMaxVisible", "setMermaidRenderingMode", "setWarnings",
];

function project(scope, method, profile, cwd) {
  assertSelectedPaths(profile, cwd);
  const raw = method();
  if (raw === undefined) return raw;
  const request = scope === "project" ? { cwd, projectSettings: raw } : { cwd, settings: raw };
  const admitted = admitUserResources(profile, request);
  return scope === "project" ? admitted.projectSettings : admitted.settings;
}

/**
 * Create the native SDK settings manager on the selected files, then guard its public
 * getter/reload/setter/flush surface with profile-bound resource admission.
 */
export function createAdmittedSettingsManager(sdkExports, profileContext, options = {}) {
  const SettingsManager = sdkExports?.SettingsManager;
  if (!SettingsManager || typeof SettingsManager.fromStorage !== "function") {
    fail("SETTINGS_API_UNAVAILABLE", "public SettingsManager.fromStorage and SettingsStorage are required");
  }
  const cwd = options.cwd;
  assertSelectedPaths(profileContext, cwd);
  const manager = SettingsManager.fromStorage(createSelectedStorage(profileContext, cwd), options.settingsOptions ?? {});
  if (!manager || typeof manager.getSettings !== "function" || typeof manager.getGlobalSettings !== "function" || typeof manager.getProjectSettings !== "function" || typeof manager.reload !== "function" || typeof manager.drainErrors !== "function") {
    fail("SETTINGS_API_INCOMPATIBLE", "public SettingsManager methods are incomplete");
  }
  checkNativeErrors(manager);

  const originalGlobal = manager.getGlobalSettings.bind(manager);
  const originalProject = manager.getProjectSettings.bind(manager);
  const originalEffective = manager.getSettings.bind(manager);
  manager.getGlobalSettings = () => project("global", originalGlobal, profileContext, cwd);
  manager.getProjectSettings = () => project("project", originalProject, profileContext, cwd);
  manager.getSettings = () => {
    assertSelectedPaths(profileContext, cwd);
    const globalRaw = originalGlobal();
    const projectRaw = originalProject();
    const effective = originalEffective();
    const admitted = admitUserResources(profileContext, { cwd, settings: globalRaw, projectSettings: projectRaw });
    for (const field of [...FIELDS, "packages"]) {
      effective[field] = Object.hasOwn(projectRaw, field) ? admitted.projectSettings[field] : admitted.settings[field];
    }
    return effective;
  };

  const originalReload = manager.reload.bind(manager);
  manager.reload = async (...args) => {
    assertSelectedPaths(profileContext, cwd);
    const result = await originalReload(...args);
    checkNativeErrors(manager);
    return result;
  };

  const originalFlush = manager.flush.bind(manager);
  manager.flush = async (...args) => {
    assertSelectedPaths(profileContext, cwd);
    const result = await originalFlush(...args);
    checkNativeErrors(manager);
    return result;
  };

  for (const name of PUBLIC_MUTATORS) {
    if (typeof manager[name] !== "function") continue;
    const original = manager[name].bind(manager);
    manager[name] = (...args) => {
      assertSelectedPaths(profileContext, cwd);
      const result = original(...args);
      if (name === "setProjectTrusted") checkNativeErrors(manager);
      return result;
    };
  }
  return manager;
}

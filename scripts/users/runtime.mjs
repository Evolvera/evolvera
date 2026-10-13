import fs from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { types as utilTypes } from "node:util";
import { assertOwnedSession, assertOwnedWorkspace } from "./ownership.mjs";
import { createUserCredentialStore } from "./credentials.mjs";
import { createProviderQuotaCollector } from "./provider-quotas.mjs";
import { createAccount, selectSessionAccount } from "./account-session.mjs";
import { createAccountConfigPolicy, createSealedAccountAuthContext, wrapModelsStore } from "./sdk-auth-source.mjs";
import { ACCOUNT_LAUNCH_CONTEXT_ENV, decodeAccountLaunchContext, getUserHome } from "./environment.mjs";
import { launchOrcaAccountChild } from "./child-command.mjs";
import { UsersError, canonicalize, isWithin, requireContext, listUsers, registerUser, removeUser, resolveUser } from "./registry.mjs";
import { registerUserSwitchParticipant, lookupUserSwitchParticipants, acquireUserSwitchReadiness } from "./switch-readiness.mjs";
import { buildAdmittedLoaderOptions, validateAdmittedResourceInventory } from "./resources.mjs";
import { createAdmittedSettingsManager } from "./settings.mjs";

const CORE = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/index.js";
const RECEIPT = Symbol.for("pi.users.context");
const fail = (code) => Object.assign(new Error(code), { code });

async function publicSdk() { return import(pathToFileURL(CORE).href); }

function assertSessionDirectory(profile, directory) {
  if (typeof directory !== "string" || !path.isAbsolute(directory)) throw fail("USER_SESSION_ROOT_MISMATCH");
  const resolved = path.resolve(directory);
  let canonical;
  try { canonical = canonicalize(resolved); } catch { throw fail("USER_SESSION_ROOT_UNDECIDABLE"); }
  if (canonical !== resolved || !profile.sessionRoots.some((root) => isWithin(root, canonical))) throw fail("USER_SESSION_ROOT_MISMATCH");
  return canonical;
}

const SCHEDULE_SESSION_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

function inspectScheduleEntry(entry, kind) {
  let stat;
  try { stat = fs.lstatSync(entry); } catch (error) {
    if (error.code === "ENOENT") return;
    throw fail("USER_SCHEDULE_METADATA_UNDECIDABLE");
  }
  if (stat.isSymbolicLink()) throw fail("USER_SCHEDULE_ALIAS");
  if (kind === "directory" ? !stat.isDirectory() : !stat.isFile()) throw fail("USER_SCHEDULE_ENTRY_INVALID");
  if (kind === "file" && stat.nlink > 1) throw fail("USER_SCHEDULE_ALIAS");
  let canonical;
  try { canonical = fs.realpathSync.native(entry); } catch { throw fail("USER_SCHEDULE_METADATA_UNDECIDABLE"); }
  if (canonical !== entry) throw fail("USER_SCHEDULE_ALIAS");
}

function assertManagedSchedule(profile, request) {
  const workspace = assertOwnedWorkspace(profile, request.cwd);
  if (request.root !== workspace.workspaceRoot) throw fail("USER_SCHEDULE_ROOT_MISMATCH");
  if (typeof request.path !== "string" || !path.isAbsolute(request.path) || request.path.includes("\0") || path.resolve(request.path) !== request.path) {
    throw fail("USER_SCHEDULE_PATH_INVALID");
  }
  const basename = path.basename(request.path);
  const derivedId = basename.endsWith(".json") ? basename.slice(0, -5) : "";
  const sessionId = request.sessionId === undefined ? derivedId : request.sessionId;
  if (typeof sessionId !== "string" || !SCHEDULE_SESSION_ID.test(sessionId) || (request.sessionId !== undefined && request.sessionId !== derivedId)) {
    throw fail("USER_SCHEDULE_SESSION_ID_INVALID");
  }
  const expected = path.join(workspace.workspaceRoot, ".pi", "subagent-schedules", `${sessionId}.json`);
  if (request.path !== expected) throw fail("USER_SCHEDULE_PATH_MISMATCH");
  try {
    if (canonicalize(expected) !== expected) throw fail("USER_SCHEDULE_ALIAS");
  } catch (error) {
    if (error?.code?.startsWith("USER_SCHEDULE_")) throw error;
    throw fail("USER_SCHEDULE_METADATA_UNDECIDABLE");
  }
  inspectScheduleEntry(path.join(workspace.workspaceRoot, ".pi"), "directory");
  inspectScheduleEntry(path.dirname(expected), "directory");
  inspectScheduleEntry(expected, "file");
  inspectScheduleEntry(`${expected}.lock`, "file");
  inspectScheduleEntry(`${expected}.tmp`, "file");
  return workspace;
}

function createSelectedSessionAssertion(profile) {
  const lexicalPath = (value) => {
    if (typeof value !== "string" || !path.isAbsolute(value) || value.includes("\0")) throw new UsersError("SESSION_INVALID", "sessionPath must be an absolute path");
    const resolved = path.resolve(value);
    if (!profile.sessionRoots.some((root) => isWithin(root, resolved) && path.relative(root, resolved) !== "")) {
      throw new UsersError("SESSION_NOT_OWNED", "session is not inside a session root owned by this user");
    }
    return resolved;
  };
  return (request = {}) => {
    lexicalPath(request.sessionPath);
    const owned = assertOwnedSession(profile, request);
    if (owned.parentSession !== undefined) {
      lexicalPath(owned.parentSession);
      assertOwnedSession(profile, { sessionPath: owned.parentSession, cwd: request.cwd ?? owned.workspace?.cwd });
    }
    return owned;
  };
}

function assertManagedRequest(profile, request = {}, assertSelectedSession) {
  if (request.userId !== undefined && request.userId !== profile.id) throw fail("USER_RESOURCE_PROFILE_MISMATCH");
  if (request.resource === "pi-subagents-schedules") return assertManagedSchedule(profile, request);
  if (request.resource === "pi-subagents-workspace") {
    const workspace = assertOwnedWorkspace(profile, request.cwd);
    if (request.root !== workspace.workspaceRoot || request.worktreeOrigin !== workspace.worktreeOrigin) throw fail("USER_WORKSPACE_RECEIPT_MISMATCH");
    return workspace;
  }
  if (request.resource === "pi-subagents-loader") {
    const cwd = request.cwd ?? request.effectiveCwd;
    const configCwd = request.configCwd ?? cwd;
    const workspace = assertOwnedWorkspace(profile, cwd);
    const config = assertOwnedWorkspace(profile, configCwd);
    if (workspace.userId !== config.userId) throw fail("USER_RESOURCE_OWNER_MISMATCH");
    const frontmatter = request.frontmatter ?? {};
    if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) throw fail("USER_FRONTMATTER_INVALID");
    const homeDir = getUserHome(profile);
    if (request.homeDir !== undefined && path.resolve(request.homeDir) !== path.resolve(homeDir)) throw fail("USER_RESOURCE_HOME_MISMATCH");
    const cliPaths = Object.fromEntries(["extensions", "skills", "prompts", "themes"].map((field) => {
      const values = request.cliPaths?.[field];
      if (values !== undefined && !Array.isArray(values)) throw fail("USER_RESOURCE_PATHS_INVALID");
      return [field, [...(values ?? [])]];
    }));
    for (const field of ["extensions", "skills"]) {
      const entries = frontmatter[field];
      if (entries !== undefined && entries !== true && entries !== false && !Array.isArray(entries)) throw fail("USER_FRONTMATTER_INVALID");
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (typeof entry !== "string") throw fail("USER_FRONTMATTER_INVALID");
        if (!(entry.includes("/") || entry.includes("\\") || entry.startsWith("~"))) continue;
        const resolved = entry === "~" || entry.startsWith("~/") || entry.startsWith("~\\")
          ? path.resolve(homeDir + entry.slice(1))
          : path.isAbsolute(entry) ? path.resolve(entry) : path.resolve(config.cwd, entry);
        if (field === "extensions" && !(cliPaths.extensions ?? []).some((candidate) => path.resolve(candidate) === resolved)) throw fail("USER_FRONTMATTER_PATH_UNADMITTED");
        if (field === "skills" && !cliPaths.skills.some((candidate) => path.resolve(candidate) === resolved)) cliPaths.skills.push(resolved);
      }
    }
    const boundInputs = { cliPaths, contextPaths: request.contextPaths, homeDir };
    const resourceRequest = {
      cwd: config.cwd,
      settings: request.settings,
      projectSettings: request.projectSettings,
      cliPaths,
      contextPaths: request.contextPaths,
      homeDir,
      requestInputs: boundInputs,
    };
    validateAdmittedResourceInventory(profile, resourceRequest);
    const settingsManager = createAdmittedSettingsManager(request.sdk ?? request.sdkExports, profile, {
      cwd: config.cwd,
      resourceRequest: boundInputs,
    });
    const admitted = buildAdmittedLoaderOptions(profile, {
      ...resourceRequest,
      settings: settingsManager.getGlobalSettings(),
      projectSettings: settingsManager.getProjectSettings(),
    });
    return Object.freeze({
      settingsManager,
      resourceLoaderOptions: admitted.loaderOptions,
    });
  }
  if (request.resource === "pi-subagents-global-config") {
    if (typeof request.root !== "string" || request.root.includes("\0") || path.resolve(request.root) !== profile.agentDir || canonicalize(profile.agentDir) !== profile.agentDir) throw fail("USER_RESOURCE_ROOT_MISMATCH");
    return profile;
  }
  if (request.resource === "pi-subagents-agents") {
    if (!Array.isArray(profile.sharedAssets) || profile.sharedAssets.length !== 1) throw fail("USER_RESOURCE_PROFILE_MISMATCH");
    const expected = path.join(profile.sharedAssets[0], "agents");
    if (typeof request.root !== "string" || request.root.includes("\0") || path.resolve(request.root) !== expected || canonicalize(expected) !== expected) throw fail("USER_RESOURCE_ROOT_MISMATCH");
    return profile;
  }
  if (request.resource === "pi-subagents-memory") {
    const workspace = assertOwnedWorkspace(profile, request.cwd);
    if (typeof request.root !== "string" || request.root.includes("\0")) throw fail("USER_RESOURCE_ROOT_MISMATCH");
    const name = path.basename(request.root);
    // pi-subagents 0.18.2 memory.ts:isUnsafeName; project/local use the passed cwd.
    if (!name || name.length > 128 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) throw fail("USER_RESOURCE_NAME_INVALID");
    const roots = [
      path.join(profile.agentDir, "agent-memory", name),
      path.join(workspace.cwd, ".pi", "agent-memory", name),
      path.join(workspace.cwd, ".pi", "agent-memory-local", name),
    ];
    if (profile.id === "evolvera") roots.push(path.join(path.dirname(profile.agentDir), "agent-memory", name));
    const resolved = path.resolve(request.root);
    if (!roots.includes(resolved) || canonicalize(resolved) !== resolved) throw fail("USER_RESOURCE_ROOT_MISMATCH");
    return workspace;
  }
  if (request.resource === "pi-subagents-transcript") {
    const workspace = assertOwnedWorkspace(profile, request.cwd);
    const expected = path.join(workspace.workspaceRoot, ".pi", "subagent-output");
    if (typeof request.root !== "string" || request.root.includes("\0") || path.resolve(request.root) !== expected || canonicalize(expected) !== expected) throw fail("USER_RESOURCE_ROOT_MISMATCH");
    if (typeof request.sessionId !== "string" || !SCHEDULE_SESSION_ID.test(request.sessionId)) throw fail("USER_RESOURCE_SESSION_ID_INVALID");
    return workspace;
  }
  if (request.resource === "pi-env-inspect" || request.resource === "pi-subagents-agent-root" || request.resource === "memory-settings") {
    if (request.root !== profile.agentDir) throw fail("USER_RESOURCE_ROOT_MISMATCH");
    if (request.cwd) return assertOwnedWorkspace(profile, request.cwd);
    return profile;
  }
  if (request.resource === "project-memory") {
    const workspace = assertOwnedWorkspace(profile, request.cwd);
    const expected = path.join(workspace.cwd, ".pi", "memory");
    if (typeof request.memoryRoot !== "string" || path.resolve(request.memoryRoot) !== expected || canonicalize(expected) !== expected) throw fail("USER_MEMORY_ROOT_MISMATCH");
    return workspace;
  }
  if (request.resource === "pi-subagents-session-directory") {
    const workspace = assertOwnedWorkspace(profile, request.cwd);
    if (request.workspaceRoot !== workspace.workspaceRoot) throw fail("USER_WORKSPACE_RECEIPT_MISMATCH");
    return assertSessionDirectory(profile, request.sessionDir);
  }
  if (["pi-session-create", "pi-session-new", "pi-session-fork"].includes(request.resource)) {
    const workspace = assertOwnedWorkspace(profile, request.cwd);
    assertSessionDirectory(profile, request.sessionDir);
    if (request.parentSession !== undefined && request.parentSession !== null && request.parentSession !== "") {
      assertSelectedSession({ sessionPath: request.parentSession, cwd: workspace.cwd });
    }
    return workspace;
  }
  if (request.resource === "pi-subagents-session" || request.sessionPath) return assertSelectedSession(request);
  throw fail("USER_RESOURCE_REQUEST_UNSUPPORTED");
}

function createReceipt(profile, modelRuntime, sdk, assertSelectedSession) {
  const receipt = {
    profile,
    modelRuntime,
    assertOwnedWorkspace: (cwd) => assertOwnedWorkspace(profile, cwd),
    assertOwnedSession: (request) => assertSelectedSession(request),
    admitUserResources: (request) => assertManagedRequest(profile, { ...request, sdk }, assertSelectedSession),
  };
  Object.freeze(receipt);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, RECEIPT);
  if (descriptor) {
    if (descriptor.value?.profile !== profile || descriptor.value?.modelRuntime !== modelRuntime) throw fail("USER_RECEIPT_ALREADY_INITIALIZED");
    return descriptor.value;
  }
  Object.defineProperty(globalThis, RECEIPT, { value: receipt, enumerable: false, writable: false, configurable: false });
  return receipt;
}

export function createGuardedSessionRuntimeClass(AgentSessionRuntime) {
  if (typeof AgentSessionRuntime !== "function") throw fail("USER_SDK_API_UNAVAILABLE");
  return class GuardedAgentSessionRuntime extends AgentSessionRuntime {
    constructor(profile, initial, services, createRuntime, diagnostics, fallbackMessage) {
      requireContext(profile);
      const assertSelectedSession = createSelectedSessionAssertion(profile);
      const initialCwd = initial?.sessionManager?.getCwd?.();
      if (!initial?.sessionFile || !initialCwd) throw fail("USER_INITIAL_SESSION_INVALID");
      assertSelectedSession({ sessionPath: initial.sessionFile, cwd: initialCwd });
      super(initial, services, createRuntime, diagnostics, fallbackMessage);
      Object.defineProperty(this, "profile", { value: profile, enumerable: true, writable: false, configurable: false });
      Object.defineProperty(this, "assertSelectedSession", { value: assertSelectedSession, enumerable: false, writable: false, configurable: false });
    }

    async switchSession(sessionPath, options) {
      const cwd = options?.cwdOverride ?? this.session.sessionManager.getCwd();
      this.assertSelectedSession({ sessionPath, cwd });
      return super.switchSession(sessionPath, options);
    }

    async importFromJsonl(inputPath, cwdOverride) {
      this.assertSelectedSession({ sessionPath: inputPath, cwd: cwdOverride ?? this.session.sessionManager.getCwd() });
      return super.importFromJsonl(inputPath, cwdOverride);
    }

    async newSession(options) {
      const cwd = this.session.sessionManager.getCwd();
      if (options?.parentSession) this.assertSelectedSession({ sessionPath: options.parentSession, cwd });
      this.assertSelectedSession({ sessionPath: this.session.sessionFile, cwd });
      assertManagedRequest(this.profile, { cwd, sessionDir: this.session.sessionManager.getSessionDir(), resource: "pi-session-new" }, this.assertSelectedSession);
      return super.newSession(options);
    }

    async fork(entryId, options) {
      const cwd = this.session.sessionManager.getCwd();
      this.assertSelectedSession({ sessionPath: this.session.sessionFile, cwd });
      assertManagedRequest(this.profile, { cwd, sessionDir: this.session.sessionManager.getSessionDir(), resource: "pi-session-fork" }, this.assertSelectedSession);
      return super.fork(entryId, options);
    }
  };
}

// Only validated non-secret registry fields bind the immutable profile snapshot to IPC.
export function getUserProfileToken(profile) {
  requireContext(profile);
  return createHash("sha256").update(JSON.stringify(profile)).digest("hex");
}

// No credentials or SDK construction in target preflight; settings are owner-checked configuration.
export function preflightUserSwitch(profile, cwd = profile.workspaces[0]) {
  requireContext(profile);
  const workspace = assertOwnedWorkspace(profile, cwd);
  getUserHome(profile);
  const readSettings = (file) => {
    let stat;
    try { stat = fs.lstatSync(file); } catch (error) { if (error.code === "ENOENT") return {}; throw fail("USER_SWITCH_SETTINGS_UNAVAILABLE"); }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1024 * 1024 || canonicalize(file) !== file) throw fail("USER_SWITCH_SETTINGS_INVALID");
    const fd = fs.openSync(file, "r");
    try {
      const opened = fs.fstatSync(fd);
      if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.nlink !== 1) throw fail("USER_SWITCH_SETTINGS_INVALID");
      const value = JSON.parse(fs.readFileSync(fd, "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw fail("USER_SWITCH_SETTINGS_INVALID");
      return value;
    } finally { fs.closeSync(fd); }
  };
  const request = {
    cwd: workspace.cwd, homeDir: getUserHome(profile),
    settings: readSettings(path.join(profile.agentDir, "settings.json")),
    projectSettings: readSettings(path.join(workspace.cwd, ".pi", "settings.json")),
  };
  validateAdmittedResourceInventory(profile, request);
  const admitted = buildAdmittedLoaderOptions(profile, request);
  if (admitted.diagnostics.length) throw fail("USER_SWITCH_RESOURCES_UNADMITTED");
  return Object.freeze({ id: profile.id, cwd: workspace.cwd, token: getUserProfileToken(profile) });
}

function createFreshUser(profile, request) {
  // Validate before deriving paths; registerUser remains the sole registry writer/authority.
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(request.id)) throw fail("USER_ID_INVALID");
  const base = path.join(path.dirname(profile.registryPath), "profiles", request.id);
  const agentDir = path.join(base, ".pi", "agent");
  const sessionRoot = path.join(base, "sessions");
  const workspace = path.join(base, "workspace");
  const label = request.label ?? request.id;
  const existing = listUsers({ registryPath: profile.registryPath }).find((user) => user.id === request.id);
  if (existing) {
    const selected = resolveUser({ registryPath: profile.registryPath, id: request.id });
    if (selected.agentDir !== agentDir || selected.sessionRoots.length !== 1 || selected.sessionRoots[0] !== sessionRoot || selected.workspaces.length !== 1 || selected.workspaces[0] !== workspace || selected.label !== label || selected.adoption !== "new") throw fail("USER_EXISTS");
    return `${selected.id}: registrado`;
  }
  if (canonicalize(base) !== base) throw fail("USER_CREATE_ROOT_ALIAS");
  try { fs.lstatSync(base); throw fail("USER_CREATE_ROOT_EXISTS"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  // The default workspace inherits HOME/.pi: admit only this profile's exact marker, never HOME.
  const created = registerUser({ registryPath: profile.registryPath, id: request.id, label, agentDir,
    sessionRoots: [sessionRoot], workspaces: [workspace], contexts: [path.dirname(agentDir)], sharedAssets: [...profile.sharedAssets] });
  // Failure leaves the registration explicit and never deletes/adopts an existing namespace.
  fs.mkdirSync(path.dirname(base), { recursive: true });
  fs.mkdirSync(base, { recursive: false });
  for (const directory of [agentDir, sessionRoot, workspace]) fs.mkdirSync(directory, { recursive: true });
  return `${created.id}: criado (sem credenciais ou histórico)`;
}

async function createUsuarioRuntimeControl(profile, receipt, channel) {
  const { createUsuarioFactory } = await import(new URL("../../extensions/usuario.ts", import.meta.url).href);
  const factoryPath = fileURLToPath(new URL("../../extensions/usuario.ts", import.meta.url));
  let host, mode, fenced = false, commands = 0, callbacks = 0, lifecycle = 0, switching = false, active = true;
  const owner = Object.freeze({});
  const nextTurnLedgers = new WeakMap();
  const refreshes = new Set();
  let disposing = false, shutdownLease;
  const current = (ctx) => !!host && ctx.sessionManager === host.session.sessionManager;
  const nextTurnPending = (session) => (nextTurnLedgers.get(session)?.entries.length ?? 0) > 0;
  const assertOpen = () => { if (fenced || !active) throw fail("USER_SWITCH_READINESS_ACTIVE"); };
  const withLifecycle = (fn) => async (...args) => {
    assertOpen(); lifecycle++;
    try { return await fn(...args); } finally { lifecycle--; }
  };
  const refresh = receipt.modelRuntime.refresh.bind(receipt.modelRuntime);
  receipt.modelRuntime.refresh = (...args) => {
    if (!disposing) assertOpen();
    lifecycle++;
    let result;
    try { result = refresh(...args); } catch (error) { lifecycle--; throw error; }
    const pending = Promise.resolve(result);
    refreshes.add(pending);
    const settled = () => { refreshes.delete(pending); lifecycle--; };
    pending.then(settled, settled);
    return result; // Preserve the native public refresh result/promise and runtime identity.
  };
  const namesForLoadedRoots = () => {
    const loaded = host.services.resourceLoader.getExtensions();
    if (loaded.errors.length) throw fail("USER_SWITCH_CAPABILITIES_UNPROVED");
    const names = ["principal"];
    const seen = new Set();
    for (const extension of loaded.extensions) {
      const file = String(extension.resolvedPath ?? extension.path).replaceAll("\\", "/");
      let name;
      if (file.endsWith("/plastic-memory/index.ts")) {
        if (!extension.handlers.size && !extension.commands.size && !extension.tools.size) continue; // Disabled/bridge activation.
        if (!["session_start", "session_shutdown", "session_before_compact", "session_before_switch", "before_agent_start"].every((hook) => extension.handlers.has(hook)) || !extension.commands.has("plastic:status") || !extension.commands.has("memory:accept")) throw fail("USER_SWITCH_PLASTIC_UNPROVED");
        name = "plastic-memory";
      } else if (/\/(?:pi-subagents|pi-subagents-0\.18\.2-users)\/src\/index\.ts$/.test(file)) {
        // Known root activation registers after the exact bound manager and scheduler exist.
        if (!extension.handlers.has("session_start") || !extension.handlers.has("session_shutdown") || !extension.tools.size) throw fail("USER_SWITCH_SUBAGENTS_UNPROVED");
        name = "subagents";
      } else if ([...extension.commands.keys()].some((key) => key === "plastic:status" || key.startsWith("memory:")) || [...extension.tools.keys()].some((key) => /subagent|memory_/.test(key))) {
        throw fail("USER_SWITCH_ROOT_UNPROVED");
      }
      if (name) {
        if (seen.has(name)) throw fail("USER_SWITCH_ROOT_DUPLICATED");
        seen.add(name); names.push(name);
      }
    }
    return names;
  };
  const control = Object.freeze({
    async execute(request, ctx) {
      if (!current(ctx)) return "USER_SWITCH_NOT_ROOT";
      if (request.operation === "display" || request.operation === "status") return JSON.stringify({ id: profile.id, label: profile.label, pid: process.pid, managed: !!channel, mode, switching, pendingNextTurnUnproved: nextTurnPending(host.session), nextTurnProof: nextTurnLedgers.get(host.session)?.lastProof ?? null, interactiveSwitch: "UNVERIFIED" });
      if (request.operation === "list") return JSON.stringify(listUsers({ registryPath: profile.registryPath }));
      if (request.operation === "create") {
        assertOpen();
        if (switching || commands !== 1 || callbacks || lifecycle || !ctx.isIdle() || ctx.hasPendingMessages()) return "USER_SWITCH_PRINCIPAL_BUSY";
        try { return createFreshUser(profile, request); } catch (error) { return error.code ?? "USER_CREATE_FAILED"; }
      }
      // Preserve native interactive built-ins until their public concurrent-command proof is admitted.
      if (mode !== "rpc" || ctx.mode !== "rpc") return mode === "interactive" ? "USER_SWITCH_INTERACTIVE_UNVERIFIED" : "USER_SWITCH_MODE_UNSUPPORTED";
      if (!channel) return "USER_SWITCH_SUPERVISOR_UNAVAILABLE";
      if (switching) return "USER_SWITCH_ALREADY_PENDING";
      switching = true;
      let lease, intent, committed = false;
      const manager = host.session.sessionManager;
      const origin = { sessionPath: manager.getSessionFile(), sessionId: manager.getSessionId() };
      try {
        const target = resolveUser({ registryPath: profile.registryPath, id: request.id });
        const destination = preflightUserSwitch(target);
        assertSelectedOrigin();
        intent = { ...origin, target: destination.id, targetToken: destination.token, cwd: destination.cwd };
        await channel.prepare(intent);
        const lookup = lookupUserSwitchParticipants({ names: namesForLoadedRoots() });
        if (!lookup.ok) throw fail("USER_SWITCH_PARTICIPANTS_UNPROVED");
        lease = acquireUserSwitchReadiness({ expected: lookup.expected });
        if (!lease.acquired) throw fail(`USER_SWITCH_${String(lease.reason).replaceAll("-", "_").toUpperCase()}`);
        // ALL fences are acquired synchronously before principal readiness is examined.
        assertSelectedOrigin();
        if (nextTurnPending(host.session)) throw fail("USER_SWITCH_NEXT_TURN_UNPROVED");
        if (commands !== 1 || callbacks || lifecycle || !ctx.isIdle() || ctx.hasPendingMessages() || host.session.isBashRunning || host.session.hasPendingBashMessages) throw fail("USER_SWITCH_PRINCIPAL_BUSY");
        if (preflightUserSwitch(resolveUser({ registryPath: profile.registryPath, id: request.id }), destination.cwd).token !== destination.token) throw fail("USER_SWITCH_TARGET_DRIFT");
        await channel.commit(intent);
        assertSelectedOrigin();
        if (commands !== 1 || callbacks || lifecycle || !ctx.isIdle() || ctx.hasPendingMessages()) throw fail("USER_SWITCH_PRINCIPAL_CHANGED");
        ctx.shutdown(); // Public RPC flag; the supervisor sends supported readonly get_state as its wake.
        committed = true;
        shutdownLease = lease;
        channel.shutdownRequested(intent);
        return undefined; // Never append/notify after commitment.
      } catch (error) {
        if (committed) {
          // The public shutdown flag is already set: no history message, fence release or retry.
          process.stderr.write("USER_SWITCH_SHUTDOWN_RECEIPT_UNVERIFIED\n");
          return undefined;
        }
        return error.code ?? "USER_SWITCH_FAILED";
      } finally {
        if (!committed) {
          const released = lease?.acquired ? lease.release() : { ok: true };
          if (intent && released.ok) channel.cancel(intent);
          switching = false;
          if (!released.ok) throw fail("USER_SWITCH_RELEASE_UNPROVED");
        }
      }
      function assertSelectedOrigin() {
        if (!current(ctx) || host.session.sessionManager !== manager || manager.getSessionFile() !== origin.sessionPath || manager.getSessionId() !== origin.sessionId) throw fail("USER_SWITCH_ORIGIN_CHANGED");
        receipt.assertOwnedSession({ sessionPath: origin.sessionPath, cwd: manager.getCwd() });
      }
    },
  });
  return Object.freeze({
    setMode(value) { mode = value; },
    bindHost(value) {
      host = value;
      const registered = registerUserSwitchParticipant({ name: "principal", owner,
        isCurrent: (identity) => active && identity.receipt === receipt && host.profile === profile && host.services.modelRuntime === receipt.modelRuntime && host.session.modelRuntime === receipt.modelRuntime,
        acquireFence: () => {
          if (fenced) return undefined;
          fenced = true; let active = true;
          return () => { if (!active) return true; active = false; fenced = false; return true; };
        },
      });
      if (!registered.ok) throw fail("USER_SWITCH_PRINCIPAL_UNAVAILABLE");
      for (const name of ["newSession", "fork", "switchSession", "importFromJsonl"]) host[name] = withLifecycle(host[name].bind(host));
      const dispose = host.dispose.bind(host);
      host.dispose = async (...args) => {
        disposing = true;
        try {
          const result = await dispose(...args);
          // Native root shutdown handlers (including SUB's awaited disposal/stop) ran
          // under the lease. Close principal admission before release completes
          // Plastic's deferred shutdown; never replay work into a live old host.
          active = false;
          if (shutdownLease) {
            const released = shutdownLease.release();
            if (!released.ok) {
              process.stderr.write(`${JSON.stringify({ code: "USER_SWITCH_SHUTDOWN_RELEASE_UNPROVED", reason: released.reason, participant: released.participant ?? "none", failure: released.failure ?? "none" })}\n`);
              throw fail("USER_SWITCH_SHUTDOWN_RELEASE_UNPROVED");
            }
            shutdownLease = undefined;
          }
          await host.services.settingsManager.flush();
          while (refreshes.size) await Promise.all([...refreshes]);
          if (!fenced && !registered.unregister().ok) throw fail("USER_SWITCH_PRINCIPAL_CLEANUP_UNPROVED");
          return result;
        } finally { disposing = false; }
      };
    },
    guardSession(session) {
      const ledger = { entries: [], revision: 0, frames: new Set(), eventState: undefined };
      nextTurnLedgers.set(session, ledger);
      const send = session.sendCustomMessage.bind(session);
      // Inspect only stable data descriptors, NEVER invoke a sender's getter a
      // second time. Opaque/proxy/accessor inputs may queue work: keep an
      // unproved entry while forwarding the ORIGINAL objects unchanged.
      const dataProperties = (value, names, optional = false) => {
        try {
          if (value == null) return optional ? Object.fromEntries(names.map((name) => [name, undefined])) : undefined;
          if (typeof value !== "object" || utilTypes.isProxy(value)) return undefined;
          const prototype = Object.getPrototypeOf(value);
          if (prototype !== null && prototype !== Object.prototype) return undefined;
          const result = {};
          for (const name of names) {
            const descriptor = Object.getOwnPropertyDescriptor(value, name) ?? (prototype && Object.getOwnPropertyDescriptor(prototype, name));
            if (descriptor && !("value" in descriptor)) return undefined;
            result[name] = descriptor?.value;
          }
          return result;
        } catch { return undefined; }
      };
      session.sendCustomMessage = withLifecycle((message, options) => {
        const payload = dataProperties(message, ["customType", "content", "display", "details"]);
        const delivery = dataProperties(options, ["deliverAs"], true);
        const uncertain = !payload || !delivery;
        const mayQueue = uncertain || delivery.deliverAs === "nextTurn";
        const result = send(message, options);
        if (mayQueue) {
          ledger.entries.push(uncertain ? { unproved: true } : { ...payload, contentMissing: payload.content == null });
          ledger.revision++;
          for (const frame of ledger.frames) if (frame.nativeBatch === undefined) frame.tainted = true;
        }
        return result;
      });
      const agent = session.agent;
      const prompt = agent.prompt.bind(agent);
      const subscribe = agent.subscribe.bind(agent);
      const frames = ledger.frames;
      const matches = (entry, message) => !entry.unproved && message?.role === "custom" && Object.is(entry.customType, message.customType) &&
        (entry.contentMissing ? Array.isArray(message.content) && message.content.length === 0 : Object.is(entry.content, message.content)) &&
        Object.is(entry.display, message.display) && Object.is(entry.details, message.details);
      const finishFrame = (frame, succeeded) => {
        frames.delete(frame);
        // Non-secret enum diagnostics only: roles/counts/flags, never message content.
        ledger.lastProof = Object.freeze({ succeeded, tainted: frame.tainted, taint: frame.taint ?? null, ambiguous: frame.ambiguous,
          prefixComplete: frame.prefixComplete, batchBound: !!frame.nativeBatch, batchRoles: frame.batchRoles ?? null,
          queueStart: frame.queueStart ?? null, snapshot: frame.snapshot.length, cohort: frame.cohort.length,
          prefixIndex: frame.prefixIndex ?? 0, revisionStable: frame.revision === frame.startRevision });
        if (!succeeded || frame.tainted || frame.ambiguous || !frame.prefixComplete || !frame.nativeBatch || frame.revision !== frame.startRevision) return;
        const consumed = new Set(frame.cohort);
        ledger.entries = ledger.entries.filter((entry) => !consumed.has(entry));
      };
      session.prompt = ((original) => function (...args) {
        const entryTainted = session !== host?.session || session.isIdle !== true || session.isStreaming !== false;
        const frame = { session, startRevision: ledger.revision, snapshot: ledger.entries.slice(), cohort: [], nativeBatch: undefined,
          prefixComplete: false, tainted: entryTainted, taint: entryTainted ? "entry-not-idle-root" : undefined,
          ambiguous: false };
        for (const active of frames) { active.ambiguous = true; frame.ambiguous = true; }
        frames.add(frame);
        let result;
        try { result = original.apply(this, args); } catch (error) { finishFrame(frame, false); throw error; }
        Promise.resolve(result).then(() => finishFrame(frame, true), () => finishFrame(frame, false));
        return result;
      })(session.prompt);
      agent.prompt = (...args) => {
        const frame = frames.size === 1 ? frames.values().next().value : undefined;
        if (frames.size > 1) for (const active of frames) active.ambiguous = true;
        const batch = args[0];
        // SDK normal batches are [user, ...asides] or [system-head, user, ...asides];
        // the system head may carry sections OR forced content. Shape is not
        // provenance: the native normal phase below is the provenance guard.
        const queueStart = Array.isArray(batch) && batch[0]?.role === "user" ? 1 :
          Array.isArray(batch) && batch[0]?.role === "system" && batch[1]?.role === "user" ? 2 : 0;
        if (frame && frame.batchRoles === undefined) {
          try { frame.batchRoles = Array.isArray(batch) ? batch.slice(0, 12).map((message) => ["system", "user", "assistant", "custom", "toolResult"].includes(message?.role) ? message.role : "other") : [typeof batch]; } catch { frame.batchRoles = ["unreadable"]; }
          frame.queueStart = queueStart;
        }
        // SDK1.0.1 sets the PUBLIC session.isStreaming flag synchronously just
        // before its normal Agent.prompt call. A handled slash/input frame does
        // not: another caller's copied batch is NOT an accepted-queue receipt.
        const nativeNormalPhase = session === host?.session && session.isStreaming === true && commands === 0 && callbacks === 0;
        if (frame && !nativeNormalPhase) { frame.tainted = true; frame.taint ??= "agent-prompt-not-native-normal-phase"; }
        if (frame && nativeNormalPhase && queueStart === 0) frame.taint ??= "batch-shape-unrecognized";
        if (frame && nativeNormalPhase && !frame.tainted && !frame.ambiguous && frame.nativeBatch === undefined && queueStart > 0) {
          frame.nativeBatch = batch.slice();
          frame.revision = ledger.revision;
          if (frame.startRevision !== ledger.revision) { frame.tainted = true; frame.taint ??= "revision-changed-before-batch"; }
          for (let index = 0; index < frame.snapshot.length; index++) {
            const message = frame.nativeBatch[index + queueStart];
            if (!matches(frame.snapshot[index], message)) { frame.tainted = true; frame.taint ??= `cohort-mismatch-${index}`; break; }
            frame.cohort.push(frame.snapshot[index]);
          }
        }
        return prompt(...args);
      };
      ledger.eventState = { batch: undefined, index: 0, awaitingEnd: false, frame: undefined };
      subscribe((event) => {
        // A run's end always closes its prefix window, even when its frame was
        // tainted/finished earlier; otherwise a stale window marks the NEXT
        // frame ambiguous (observed natively: ambiguous=true, prefixIndex=0).
        if (event.type === "agent_end") { ledger.eventState.frame = undefined; return; }
        const active = frames.size === 1 ? frames.values().next().value : undefined;
        if (!active || active.tainted || active.ambiguous || !active.nativeBatch) return;
        if (event.type === "agent_start") {
          if (ledger.eventState.frame === active && active.prefixComplete) return; // native continue within the same frame
          if (ledger.eventState.frame && frames.has(ledger.eventState.frame)) { active.ambiguous = true; active.taint ??= "overlapping-run-window"; return; }
          ledger.eventState = { batch: active.nativeBatch, index: 0, awaitingEnd: false, frame: active };
          return;
        }
        const state = ledger.eventState;
        if (state.frame !== active || state.batch !== active.nativeBatch || active.prefixComplete) return;
        const expected = state.batch[state.index];
        if (event.type === "message_start") {
          if (state.awaitingEnd || event.message !== expected) { active.tainted = true; active.taint ??= `prefix-start-mismatch-${state.index}`; }
          else state.awaitingEnd = true;
        } else if (event.type === "message_end") {
          if (!state.awaitingEnd || event.message !== expected) { active.tainted = true; active.taint ??= `prefix-end-mismatch-${state.index}`; }
          else {
            state.awaitingEnd = false;
            state.index++;
            active.prefixIndex = state.index;
            if (state.index === state.batch.length) active.prefixComplete = true;
          }
        }
      });
    },
    guardLoader(loader) { loader.reload = withLifecycle(loader.reload.bind(loader)); },
    loaderOptions(base) {
      return { ...base, extensionFactories: [...(base.extensionFactories ?? []), { name: "usuario", builtin: true, factory: (pi) => {
        pi.on("input", () => fenced ? { action: "handled" } : { action: "continue" });
        return createUsuarioFactory(Object.freeze({ async execute(request, ctx) {
          const response = await control.execute(request, ctx);
          // Native RPC's public notify is display-only. Never steer/queue a refusal into an active turn.
          if (response !== undefined && ctx.mode === "rpc") { ctx.ui.notify(response, "info"); return undefined; }
          return response;
        } }))(pi);
      } }],
        extensionsOverride(loaded) {
          const original = base.extensionsOverride ? base.extensionsOverride(loaded) : loaded;
          return { ...original, extensions: original.extensions.filter((extension) => extension.resolvedPath !== factoryPath).map((extension) => ({ ...extension,
            commands: new Map([...extension.commands].map(([name, command]) => [name, { ...command, handler: async (args, ctx) => {
              assertOpen();
              // Only /usuario's control requires the root manager. Preserve other native
              // commands in descendant contexts; the shared fence still blocks admission.
              commands++;
              try { return await command.handler(args, ctx); } finally { commands--; }
            } }])),
            handlers: new Map([...extension.handlers].map(([event, handlers]) => [event, handlers.map((handler) => async (...args) => {
              if (event === "input" && fenced) return { action: "handled" };
              // Shutdown teardown must run under the lease; no accepted work is cancelled.
              const track = ["input", "before_agent_start", "session_before_switch", "session_before_fork", "session_before_tree", "user_bash"].includes(event);
              if (track) { assertOpen(); callbacks++; }
              try { return await handler(...args); } finally { if (track) callbacks--; }
            })])),
          })) };
        },
      };
    },
  });
}

// The SDK owns CLI parsing, session selection, settings, trust and every execution mode.
export function createUserRuntime(registryPath, { pickAccount, createStore = createUserCredentialStore, createModelRuntime, sdkRoot, inheritedAccountId, onAccountSelected, launchOrcaChild = launchOrcaAccountChild, orcaPlatform = process.platform, localAppData = process.env.LOCALAPPDATA, providerQuotaFetch, providerQuotaNow } = {}) {
  if (typeof registryPath !== "string" || !path.isAbsolute(registryPath)) throw fail("REGISTRY_PATH_INVALID");
  if (inheritedAccountId !== undefined && (typeof inheritedAccountId !== "string" || !/^[a-z][a-z0-9-]{1,31}$/.test(inheritedAccountId))) throw fail("ACCOUNT_LAUNCH_CONTEXT_INVALID");
  if (onAccountSelected !== undefined && typeof onAccountSelected !== "function") throw fail("ACCOUNT_RUNTIME_CALLBACK_INVALID");
  const invocation = { accountId: inheritedAccountId };
  const boundProcessEnv = Object.freeze(Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === "string")));
  const makePicker = async (users, explicitId) => {
    if (explicitId !== undefined) return explicitId;
    if (inheritedAccountId !== undefined) return inheritedAccountId;
    if (typeof pickAccount !== "function") throw fail("ACCOUNT_SELECTION_REQUIRED");
    return pickAccount(users);
  };
  const metadataCredentials = Object.freeze({
    read: async () => undefined,
    list: async () => [],
    modify: async () => { throw fail("METADATA_CREDENTIALS_READ_ONLY"); },
    delete: async () => { throw fail("METADATA_CREDENTIALS_READ_ONLY"); },
  });
  const readOnlyStore = (store) => Object.freeze({
    read: (...args) => store.read(...args),
    list: (...args) => store.list(...args),
    modify: async () => { throw fail("AUTH_COMMAND_READ_ONLY"); },
    delete: async () => { throw fail("AUTH_COMMAND_READ_ONLY"); },
  });
  const stripAuth = (providers) => Object.fromEntries(Object.entries(providers).map(([id, value]) => {
    const safe = { ...value };
    delete safe.apiKey; delete safe.headers;
    if (Array.isArray(safe.models)) safe.models = safe.models.map((model) => { const copy = { ...model }; delete copy.headers; return copy; });
    if (safe.modelOverrides && typeof safe.modelOverrides === "object") safe.modelOverrides = Object.fromEntries(Object.entries(safe.modelOverrides).map(([key, model]) => {
      const copy = { ...model }; delete copy.headers; return [key, copy];
    }));
    return [id, safe];
  }));
  return async function accountRuntimeFactory(request) {
    if (!request || typeof request !== "object" || typeof request.purpose !== "string") throw fail("ACCOUNT_RUNTIME_REQUEST_INVALID");
    const metadata = request.purpose === "metadata";
    let selected;
    if (request.purpose === "application") {
      if (!request.sessionManager) throw fail("ACCOUNT_SESSION_INVALID");
      const pickForInvocation = async (users) => {
        const id = await makePicker(users, request.accountId);
        if (inheritedAccountId !== undefined && id !== inheritedAccountId) throw fail("ACCOUNT_BINDING_CONFLICT");
        if (invocation.accountId !== undefined && id !== invocation.accountId) throw fail("ACCOUNT_PROCESS_RESTART_REQUIRED");
        return id;
      };
      selected = await selectSessionAccount({
        registryPath,
        sessionManager: request.sessionManager,
        sessionStartEvent: request.sessionStartEvent,
        predecessorSessionManager: request.predecessorSessionManager,
        pickAccount: pickForInvocation,
      });
      if (inheritedAccountId !== undefined && selected.id !== inheritedAccountId) throw fail("ACCOUNT_BINDING_CONFLICT");
      if (invocation.accountId !== undefined && selected.id !== invocation.accountId) throw fail("ACCOUNT_PROCESS_RESTART_REQUIRED");
      invocation.accountId ??= selected.id;
      await onAccountSelected?.(Object.freeze({ version: 1, accountId: selected.id, registryPath: path.resolve(registryPath) }));
    } else if (request.purpose === "auth-command") {
      const users = listUsers({ registryPath });
      const id = await makePicker(users, request.accountId);
      if (inheritedAccountId !== undefined && id !== inheritedAccountId) throw fail("ACCOUNT_BINDING_CONFLICT");
      selected = resolveUser({ registryPath, id });
    } else if (!metadata) throw fail("ACCOUNT_RUNTIME_PURPOSE_UNSUPPORTED");

    const accountEnv = !metadata && selected.id === "evolvera" && selected.adoption === "reference"
      ? boundProcessEnv
      : Object.freeze({});
    const explicitSdkRoot = request.sdkRoot ?? sdkRoot;
    if (!metadata && (typeof explicitSdkRoot !== "string" || !path.isAbsolute(explicitSdkRoot))) throw fail("ACCOUNT_SDK_ROOT_REQUIRED");
    const selectedStore = metadata ? metadataCredentials : createStore(selected, { sdkRoot: explicitSdkRoot, accountEnv });
    const credentials = request.purpose === "auth-command" && request.readonly ? readOnlyStore(selectedStore) : selectedStore;
    const authContext = createSealedAccountAuthContext({ env: accountEnv, files: [] });
    const accountConfigPolicy = metadata
      ? Object.freeze({ env: accountEnv, filterConfig: stripAuth, filterRegistration: (config) => stripAuth({ value: config }).value, wrapModelsStore: (store) => wrapModelsStore(store, undefined) })
      : createAccountConfigPolicy({ profile: selected, env: accountEnv });
    if (typeof createModelRuntime !== "function") throw fail("ACCOUNT_RUNTIME_ADAPTER_UNAVAILABLE");
    const timeout = metadata || request.purpose === "application" ? AbortSignal.timeout(request.modelRuntimeTimeoutMs ?? 15_000) : request.signal;
    const modelRuntime = await createModelRuntime({
      purpose: request.purpose, credentials, authContext, accountConfigPolicy, signal: timeout,
      modelsPath: path.join(request.agentDir, "models.json"),
      refreshOnCreate: false,
    });
    const result = { modelRuntime, credentials };
    if (request.purpose === "application") {
      const { createUsuarioFactory } = await import(new URL("../../extensions/usuario.ts", import.meta.url).href);
      const { createManagedSessionUsageFactory } = await import(new URL("../../extensions/session-usage.ts", import.meta.url).href);
      const factoryPath = fileURLToPath(new URL("../../extensions/usuario.ts", import.meta.url));
      const usagePath = fileURLToPath(new URL("../../extensions/session-usage.ts", import.meta.url));
      const usageAgentPath = path.resolve(request.agentDir, "extensions", "session-usage.ts");
      const account = selected;
      const quotaRead = createProviderQuotaCollector({ readCredential: (providerId, options) => selectedStore.read(providerId, options), fetchImpl: providerQuotaFetch, now: providerQuotaNow });
      const boundQuotaRead = async (ctx) => {
        if (ctx?.sessionManager !== request.sessionManager) throw fail("ACCOUNT_USAGE_NOT_ROOT");
        return quotaRead();
      };
      result.resourceLoaderOptions = {
        extensionFactories: [{ name: "usuario", builtin: true, factory: createUsuarioFactory(Object.freeze({
          async execute(command, ctx) {
            if (ctx.sessionManager !== request.sessionManager) return "ACCOUNT_CONTROL_NOT_ROOT";
            if (command.operation === "display" || command.operation === "status") return JSON.stringify({ id: account.id, label: account.label, managed: true, binding: "fixed-for-process" });
            if (command.operation === "list") return JSON.stringify(listUsers({ registryPath }));
            if (command.operation === "create") {
              try { return `${createAccount({ registryPath, id: command.id, label: command.label }).id}: criado (sem credenciais ou histórico)`; }
              catch (error) { return error.code ?? "USER_CREATE_FAILED"; }
            }
            if (command.operation === "use") {
              resolveUser({ registryPath, id: command.id });
              return `Conta validada. Para usar ${command.id}, encerre este processo e inicie um novo com a conta desejada; sessões vinculadas a outra conta exigem um novo processo.`;
            }
            if (command.operation === "remove") {
              if (command.id === account.id) return "USER_REMOVE_ACTIVE";
              if (!ctx.hasUI || typeof ctx.ui?.confirm !== "function") return "USER_REMOVE_CONFIRMATION_REQUIRED";
              let target;
              try { target = resolveUser({ registryPath, id: command.id }); }
              catch (error) { return error.code ?? "USER_REMOVE_FAILED"; }
              let confirmed = false;
              try {
                confirmed = await ctx.ui.confirm(
                  `Remove registration for ${target.id} (${target.label})?`,
                  `This removes only the registry registration. Credentials and history remain on disk. Sessions bound to this account cannot resume until its registration is restored. Continue?`,
                );
              } catch { return "USER_REMOVE_CONFIRMATION_FAILED"; }
              if (confirmed !== true) return "USER_REMOVE_CANCELLED";
              try {
                const removed = removeUser(target, { activeAccountId: account.id });
                return JSON.stringify({ id: removed.id, recoveryPath: removed.recoveryPath });
              } catch (error) { return error.code ?? "USER_REMOVE_FAILED"; }
            }
            if (command.operation === "orca") {
              if (orcaPlatform !== "win32") return "ORCA_PLATFORM_UNSUPPORTED";
              try {
                const context = decodeAccountLaunchContext(process.env[ACCOUNT_LAUNCH_CONTEXT_ENV]);
                if (context.accountId !== account.id || context.registryPath !== path.resolve(registryPath)) return "ACCOUNT_LAUNCH_CONTEXT_INVALID";
                if (typeof localAppData !== "string" || !path.isAbsolute(localAppData) || typeof process.argv[1] !== "string" || !path.isAbsolute(process.argv[1])) return "ORCA_CONFIGURATION_MISSING";
                const status = launchOrcaChild({
                  orcaCommand: path.resolve(localAppData, "Programs", "orca", "resources", "bin", "orca.EXE"),
                  nodePath: path.resolve(process.execPath),
                  entrypointPath: path.resolve(process.argv[1]),
                  shell: "powershell.exe",
                  worktree: command.worktree,
                });
                return status === 0 ? "Orca terminal created." : `ORCA_TERMINAL_CREATE_FAILED${Number.isInteger(status) ? ` (${status})` : ""}`;
              } catch (error) {
                const code = ["ACCOUNT_CHILD_LAUNCH_INVALID", "ACCOUNT_CHILD_INVOCATION_FAILED", "ACCOUNT_CHILD_COMMAND_INVALID", "ACCOUNT_LAUNCH_CONTEXT_INVALID"].includes(error?.code)
                  ? error.code : "ORCA_TERMINAL_CREATE_FAILED";
                return code;
              }
            }
            return "USUARIO_OPERATION_UNSUPPORTED";
          },
        })) }, { name: "session-usage-managed", builtin: true, factory: createManagedSessionUsageFactory(boundQuotaRead, account.id) }],
        extensionsOverride(loaded) {
          const original = loaded;
          return { ...original, extensions: original.extensions.filter((extension) => {
            const resolvedPath = path.resolve(extension.resolvedPath);
            return resolvedPath !== factoryPath && resolvedPath !== usagePath && resolvedPath !== usageAgentPath;
          }) };
        },
      };
    }
    return Object.freeze(result);
  };
}

export async function runUserMode(main, argv, options) {
  if (typeof main !== "function") throw fail("NATIVE_MAIN_UNAVAILABLE");
  return main(argv, options);
}

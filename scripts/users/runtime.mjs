import fs from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { types as utilTypes } from "node:util";
import { assertOwnedSession, assertOwnedWorkspace } from "./ownership.mjs";
import { createUserCredentialStore } from "./credentials.mjs";
import { getUserHome } from "./environment.mjs";
import { UsersError, canonicalize, isWithin, requireContext, listUsers, registerUser, resolveUser } from "./registry.mjs";
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
            if (!released.ok) throw fail("USER_SWITCH_SHUTDOWN_RELEASE_UNPROVED");
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

// Native base class is public; subclassing is deferred until the installed SDK is loaded.
export async function createUserRuntime(profileContext, { cwd, sessionDir, initialSessionPath, switchChannel } = {}) {
  const profile = requireContext(profileContext);
  if (process.env.PI_USER_ID !== profile.id || process.env.PI_CODING_AGENT_DIR !== profile.agentDir || path.resolve(os.homedir()) !== path.resolve(getUserHome(profile))) {
    throw fail("USER_ENVIRONMENT_MISMATCH");
  }
  const workspace = assertOwnedWorkspace(profile, cwd);
  const selectedSessionDir = sessionDir ?? profile.sessionRoots[0];
  assertSessionDirectory(profile, selectedSessionDir);
  const assertSelectedSession = createSelectedSessionAssertion(profile);
  if (initialSessionPath) assertSelectedSession({ sessionPath: initialSessionPath, cwd: workspace.cwd });
  else assertManagedRequest(profile, { cwd: workspace.cwd, sessionDir: selectedSessionDir, resource: "pi-session-create" }, assertSelectedSession);
  const sdk = await publicSdk();
  for (const name of ["ModelRuntime", "SessionManager", "AgentSessionRuntime", "SettingsManager", "createAgentSessionServices", "createAgentSessionFromServices", "InteractiveMode", "runRpcMode", "runPrintMode", "initTheme"]) {
    if (!sdk[name]) throw fail("USER_SDK_API_UNAVAILABLE");
  }
  const credentials = createUserCredentialStore(profile);
  const modelRuntime = await sdk.ModelRuntime.create({
    credentials,
    modelsPath: path.join(profile.agentDir, "models.json"),
    modelsStorePath: path.join(profile.agentDir, "cache", "models.json"),
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  const receipt = createReceipt(profile, modelRuntime, sdk, assertSelectedSession);
  const usuario = await createUsuarioRuntimeControl(profile, receipt, switchChannel);
  const settingsManager = createAdmittedSettingsManager(sdk, profile, { cwd: workspace.cwd });
  const globalSettings = settingsManager.getGlobalSettings();
  const projectSettings = settingsManager.getProjectSettings();
  validateAdmittedResourceInventory(profile, { cwd: workspace.cwd, settings: globalSettings, projectSettings });
  const admitted = buildAdmittedLoaderOptions(profile, { cwd: workspace.cwd, settings: globalSettings, projectSettings });
  const services = await sdk.createAgentSessionServices({
    cwd: workspace.cwd,
    agentDir: profile.agentDir,
    settingsManager,
    modelRuntime,
    resourceLoaderOptions: usuario.loaderOptions(admitted.loaderOptions),
  });
  usuario.guardLoader(services.resourceLoader);
  const sessionManager = initialSessionPath
    ? sdk.SessionManager.open(initialSessionPath, selectedSessionDir, workspace.cwd)
    : sdk.SessionManager.create(workspace.cwd, selectedSessionDir);
  const sessionPath = sessionManager.getSessionFile?.() ?? sessionManager.sessionFile;
  if (sessionPath) assertSelectedSession({ sessionPath, cwd: workspace.cwd });
  const created = await sdk.createAgentSessionFromServices({ services, sessionManager });
  usuario.guardSession(created.session);
  const GuardedSessionRuntime = createGuardedSessionRuntimeClass(sdk.AgentSessionRuntime);
  const host = new GuardedSessionRuntime(profile, created.session, services, async ({ cwd: targetCwd, sessionManager: targetManager, sessionStartEvent }) => {
    const target = assertOwnedWorkspace(profile, targetCwd);
    const managerWorkspace = assertOwnedWorkspace(profile, targetManager.getCwd());
    assertSelectedSession({ sessionPath: targetManager.getSessionFile(), cwd: managerWorkspace.cwd });
    assertSessionDirectory(profile, targetManager.getSessionDir());
    const targetSettings = createAdmittedSettingsManager(sdk, profile, { cwd: target.cwd });
    const targetResources = buildAdmittedLoaderOptions(profile, {
      cwd: target.cwd,
      settings: targetSettings.getGlobalSettings(),
      projectSettings: targetSettings.getProjectSettings(),
    });
    const targetServices = await sdk.createAgentSessionServices({
      cwd: target.cwd, agentDir: profile.agentDir, settingsManager: targetSettings,
      modelRuntime, resourceLoaderOptions: usuario.loaderOptions(targetResources.loaderOptions),
    });
    usuario.guardLoader(targetServices.resourceLoader);
    const targetCreated = await sdk.createAgentSessionFromServices({ services: targetServices, sessionManager: targetManager, sessionStartEvent });
    usuario.guardSession(targetCreated.session);
    return { ...targetCreated, services: targetServices, diagnostics: targetServices.diagnostics };
  }, services.diagnostics, created.modelFallbackMessage);
  usuario.bindHost(host);
  const runtime = {
    sdk, profile, receipt, modelRuntime, host,
    setUserMode: usuario.setMode,
    get settingsManager() { return host.services.settingsManager; },
    get services() { return host.services; },
    get sessionManager() { return host.session.sessionManager; },
    get session() { return host.session; },
  };
  return Object.freeze(runtime);
}

export async function runUserMode(runtime, mode, options = {}) {
  const { sdk, host, services } = runtime;
  runtime.setUserMode(mode);
  if (mode === "text" || mode === "json") return sdk.runPrintMode(host, { mode, ...options });
  if (mode === "rpc") return sdk.runRpcMode(host);
  if (mode === "interactive") {
    sdk.initTheme(services.settingsManager.getTheme());
    const app = new sdk.InteractiveMode(host, options.interactiveOptions);
    await app.init();
    await app.run();
    return 0;
  }
  throw fail("USER_MODE_INVALID");
}

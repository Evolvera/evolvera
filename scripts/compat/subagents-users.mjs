import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const PACKAGE_NAME = "@tintinweb/pi-subagents";
export const PACKAGE_VERSION = "0.18.2";
export const ENTRY_RELATIVE = path.join("src", "index.ts");
const MODULES = ["src/agent-runner.ts", "src/agent-manager.ts", "src/index.ts", "src/memory.ts", "src/output-file.ts", "src/schedule-store.ts", "src/custom-agents.ts", "src/schedule.ts"];
const KEY = 'Symbol.for("pi.users.context")';
const FINAL_DIR = "pi-subagents-0.18.2-users";
const fail = (message) => { throw new Error(`Subagents compatibility staging refused: ${message}`); };
const within = (parent, child) => { const rel = path.relative(parent, child); return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)); };
function canonical(p, label) {
  if (typeof p !== "string" || !path.isAbsolute(p) || p.includes("\0")) fail(`${label} must be an explicit absolute path`);
  let real;
  try { real = fs.realpathSync.native(path.resolve(p)); } catch { fail(`${label} must exist and resolve`); }
  if (path.resolve(p) !== real) fail(`${label} must be canonical`);
  return real;
}
function one(text, anchor, replacement, label) {
  const i = text.indexOf(anchor);
  if (i < 0 || text.indexOf(anchor, i + anchor.length) !== -1) fail(`anchor mismatch: ${label}`);
  return text.slice(0, i) + replacement + text.slice(i + anchor.length);
}
const RECEIPT = `import * as usersPath from "node:path";
const USERS_CONTEXT_KEY = ${KEY};
const USERS_READINESS_KEY = Symbol.for("pi.users.switch-readiness.api.v1");
const usersReadiness = (() => {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, USERS_READINESS_KEY);
    const api = descriptor && "value" in descriptor ? descriptor.value : undefined;
    return descriptor && !descriptor.configurable && !descriptor.writable && api && Object.isFrozen(api) &&
      api.version === 1 && api.processIdentity?.pid === process.pid && Object.isFrozen(api.processIdentity) && Object.isFrozen(api.processIdentity.token) &&
      typeof api.registerUserSwitchParticipant === "function" && typeof api.acquireUserSwitchReadiness === "function" ? api : undefined;
  } catch { return undefined; }
})();
const usersMarker = process.env.PI_USER_ID;
const usersDescriptor = Object.getOwnPropertyDescriptor(globalThis, USERS_CONTEXT_KEY);
const usersManaged = usersMarker !== undefined || usersDescriptor !== undefined;
let usersContext;
if (usersManaged) {
  if (!usersDescriptor || !("value" in usersDescriptor) || usersDescriptor.configurable || usersDescriptor.writable) throw new Error("Managed pi-subagents requires a valid matching users receipt");
  usersContext = usersDescriptor.value;
  const profile = usersContext?.profile;
  const runtime = usersContext?.modelRuntime;
  if (!usersContext || typeof usersContext !== "object" || !Object.isFrozen(usersContext) ||
      !profile || typeof profile !== "object" || !Object.isFrozen(profile) ||
      typeof profile.id !== "string" || profile.id.length === 0 ||
      typeof profile.agentDir !== "string" || !usersPath.isAbsolute(profile.agentDir) || profile.agentDir.includes("\\0") ||
      (usersMarker !== undefined && usersMarker !== profile.id) ||
      typeof usersContext.assertOwnedWorkspace !== "function" || typeof usersContext.assertOwnedSession !== "function" ||
      typeof usersContext.admitUserResources !== "function" || runtime == null ||
      (typeof runtime !== "object" && typeof runtime !== "function")) throw new Error("Managed pi-subagents requires a valid matching users receipt");
}
function usersWorkspace(cwd) {
  if (!usersManaged) return undefined;
  const owned = usersContext.assertOwnedWorkspace(cwd);
  if (!owned || owned.userId !== usersContext.profile.id || typeof owned.workspaceRoot !== "string" || !usersPath.isAbsolute(owned.workspaceRoot)) throw new Error("Managed pi-subagents workspace ownership is unavailable");
  usersContext.admitUserResources({ resource: "pi-subagents-workspace", userId: usersContext.profile.id, cwd: owned.cwd, root: owned.workspaceRoot, worktreeOrigin: owned.worktreeOrigin });
  return owned;
}
function usersSession(sessionPath, cwd) {
  if (!usersManaged) return;
  usersContext.assertOwnedSession({ sessionPath, cwd });
  usersContext.admitUserResources({ resource: "pi-subagents-session", userId: usersContext.profile.id, sessionPath, cwd });
}
`;

function adaptRunner(s) {
  if (!s.includes('import { basename, dirname, isAbsolute, join, resolve } from "node:path";')) fail("runner path import anchor mismatch");
  s = one(s, 'const configCwd = options.configCwd ?? effectiveCwd;\n\n  const env = await detectEnv(options.pi, effectiveCwd);',
    `const configCwd = options.configCwd ?? effectiveCwd;
  const effectiveOwnership = usersWorkspace(effectiveCwd);
  const configOwnership = usersWorkspace(configCwd);
  if (usersManaged && effectiveOwnership.userId !== configOwnership.userId) throw new Error("Managed pi-subagents cwd/config ownership mismatch");
  if (options.resumeSessionFile) usersSession(options.resumeSessionFile, effectiveCwd);
  if (usersManaged) usersContext.admitUserResources({ resource: "pi-subagents-agent-root", root: usersContext.profile.agentDir, userId: usersContext.profile.id });
  const childResourceBinding = usersManaged ? usersContext.admitUserResources({
    resource: "pi-subagents-loader",
    userId: usersContext.profile.id,
    cwd: effectiveCwd,
    configCwd,
    frontmatter: { extensions: agentConfig?.extensions, skills: agentConfig?.skills },
    cliPaths: {
      extensions: Array.isArray(agentConfig?.extensions) ? agentConfig.extensions.filter((entry) => typeof entry === "string" && (entry.includes("/") || entry.includes("\\\\") || entry.startsWith("~"))).map((entry) => entry === "~" || entry.startsWith("~/") || entry.startsWith("~\\\\") ? resolve(homedir() + entry.slice(1)) : isAbsolute(entry) ? entry : resolve(configCwd, entry)) : [],
      skills: [], prompts: [], themes: [],
    },
    contextPaths: [],
    homeDir: homedir(),
  }) : undefined;
  if (usersManaged && (!childResourceBinding?.settingsManager ||
      typeof childResourceBinding.settingsManager.getGlobalSettings !== "function" ||
      typeof childResourceBinding.settingsManager.getProjectSettings !== "function" ||
      typeof childResourceBinding.settingsManager.reload !== "function" ||
      !childResourceBinding.resourceLoaderOptions || typeof childResourceBinding.resourceLoaderOptions !== "object")) {
    throw new Error("Managed pi-subagents requires a profile-bound admitted child settings manager and resource loader");
  }

  const env = await detectEnv(options.pi, effectiveCwd);`, "pre-ingestion runner guard and child admission");
  s = one(s, 'const agentDir = getAgentDir();', 'const agentDir = usersManaged ? usersContext.profile.agentDir : getAgentDir();', "managed agent root");
  s = one(s, `  const loader = new DefaultResourceLoader({
    cwd: configCwd,
    agentDir,
    noExtensions,
    additionalExtensionPaths,
    extensionsOverride,
    noSkills,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPromptOverride: () => systemPrompt,
    appendSystemPromptOverride: () => [],
  });`, `  const loader = new DefaultResourceLoader({
    ...(usersManaged ? { ...childResourceBinding.resourceLoaderOptions, settingsManager: childResourceBinding.settingsManager } : { cwd: configCwd, agentDir }),
    noExtensions,
    additionalExtensionPaths: usersManaged ? childResourceBinding.resourceLoaderOptions.additionalExtensionPaths : additionalExtensionPaths,
    extensionsOverride,
    noSkills,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPromptOverride: () => systemPrompt,
    appendSystemPromptOverride: () => [],
  });`, "admitted native child resource loader");
  s = one(s, 'const settingsManager = SettingsManager.create(configCwd, agentDir);', 'const settingsManager = usersManaged ? childResourceBinding.settingsManager : SettingsManager.create(configCwd, agentDir);', "reuse admitted manager in child session");
  s = one(s, 'const defaultSessionDir = process.env.PI_CODING_AGENT_SESSION_DIR ?? settingsManager.getSessionDir?.();',
    'const defaultSessionDir = process.env.PI_CODING_AGENT_SESSION_DIR ?? settingsManager.getSessionDir?.();\n  if (usersManaged) usersContext.admitUserResources({ resource: "pi-subagents-session-directory", userId: usersContext.profile.id, cwd: effectiveCwd, workspaceRoot: effectiveOwnership.workspaceRoot, sessionDir: configuredSessionDir ?? defaultSessionDir });', "session directory pre-admission");
  s = one(s, 'const parentModelRuntime = (ctx.modelRegistry as unknown as { runtime?: unknown }).runtime;',
    'const parentModelRuntime = usersManaged ? usersContext.modelRuntime : (ctx.modelRegistry as unknown as { runtime?: unknown }).runtime;', "parent model runtime");
  s = one(s, '...(parentModelRuntime !== undefined && { modelRuntime: parentModelRuntime as never }),',
    '...(parentModelRuntime !== undefined && { modelRuntime: parentModelRuntime as never }),', "session runtime anchor");
  return s;
}
function adaptManager(s) {
  s = one(s, '  private runningForeground = 0;\n', `  private runningForeground = 0;
  private usersSwitchFenceCount = 0;
  private usersSettling = 0;

  acquireUsersSwitchFence(): (() => boolean) | undefined {
    if (this.usersSwitchFenceCount !== 0 || this.queue.length !== 0 || this.runningBackground !== 0 || this.runningForeground !== 0 || this.usersSettling !== 0 || [...this.agents.values()].some((record) => record.status === "running" || record.status === "queued" || record.startGate !== undefined)) return undefined;
    this.usersSwitchFenceCount++;
    let active = true;
    return () => {
      if (!active) return true;
      active = false;
      this.usersSwitchFenceCount--;
      if (this.usersSwitchFenceCount === 0) this.drainQueue();
      return true;
    };
  }

  private assertUsersDispatchAllowed(): void {
    if (this.usersSwitchFenceCount !== 0) throw new Error("USER_SWITCH_READINESS_ACTIVE");
  }
` , "manager fence state and owner release");
  s = one(s, '  spawn(\n    pi: ExtensionAPI,', '  spawn(\n    pi: ExtensionAPI,', "spawn method cardinality");
  s = one(s, '  ): string {\n    // Validate before the queue branch — a queued spawn should fail at the', '  ): string {\n    this.assertUsersDispatchAllowed();\n    // Validate before the queue branch — a queued spawn should fail at the', "spawn dispatch fence before record/state effects");
  s = one(s, '  private startAgent(id: string, record: AgentRecord, { pi, ctx, type, prompt, options }: SpawnArgs) {\n    // Re-validate', '  private startAgent(id: string, record: AgentRecord, { pi, ctx, type, prompt, options }: SpawnArgs) {\n    this.assertUsersDispatchAllowed();\n    // Re-validate', "common startAgent dispatch fence");
  s = one(s, '  private settleRun(record: AgentRecord, guardCallback: boolean, pool: Pool | undefined): void {\n', '  private settleRun(record: AgentRecord, guardCallback: boolean, pool: Pool | undefined): void {\n    this.usersSettling++;\n    try {\n', "completion delivery latch begins before terminal result callbacks");
  s = one(s, '    if (record.isBackground || pool !== undefined) this.drainQueue();\n  }', '    if (record.isBackground || pool !== undefined) this.drainQueue();\n    } finally { this.usersSettling--; }\n  }', "completion delivery latch ends after queue release");
  s = one(s, '  private drainQueue() {\n    for (;;) {', '  private drainQueue() {\n    if (this.usersSwitchFenceCount !== 0) return;\n    for (;;) {', "queue drain preserves queued entries under fence");
  s = one(s, '  async resume(\n    id: string,', '  async resume(\n    id: string,', "resume method cardinality");
  s = one(s, '  ): Promise<AgentRecord | undefined> {\n    const record = this.agents.get(id);', '  ): Promise<AgentRecord | undefined> {\n    this.assertUsersDispatchAllowed();\n    const record = this.agents.get(id);', "resume fence before state/session effects");
  s = one(s, '    // Foreground resume: run inline and return the settled record.\n    record.status = "running";', '    // Foreground resume: run inline and return the settled record.\n    this.usersSettling++;\n    try {\n    record.status = "running";', "inline resume latch before running and completion delivery");
  s = one(s, '    return record;\n  }\n\n  /**\n   * Start a background resume run:', '    return record;\n    } finally { this.usersSettling--; }\n  }\n\n  /**\n   * Start a background resume run:', "inline resume latch until owned-child settlement returns");
  s = one(s, '  private startResume(\n    id: string,', '  private startResume(\n    id: string,', "background resume method cardinality");
  s = one(s, '  ) {\n    if (!record.session) return;\n\n    record.status = "running";', '  ) {\n    this.assertUsersDispatchAllowed();\n    if (!record.session) return;\n\n    record.status = "running";', "background resume dispatch fence");
  s = one(s, '    const settle = () => {\n      detachParentSignal?.();', '    const settle = () => {\n      this.usersSettling++;\n      try {\n      detachParentSignal?.();', "background resume settlement latch begins before results/queue delivery");
  s = one(s, '      this.drainQueue();\n    };\n\n    const promise = resumeAgent(record.session, prompt, {', '      this.drainQueue();\n      } finally { this.usersSettling--; }\n    };\n\n    const promise = resumeAgent(record.session, prompt, {', "background resume settlement latch ends after delivery");
  s = one(s, 'const baseCwd = customCwd ?? ctx.cwd;\n\n    // Worktree isolation:',
    `const baseCwd = customCwd ?? ctx.cwd;
    usersWorkspace(baseCwd);

    // Worktree isolation:`, "pre-worktree base guard");
  s = one(s, '      worktreeCwd = customCwd !== undefined ? wt.workPath : wt.path;\n      this.worktreeRepos.add(baseCwd);',
    `      worktreeCwd = customCwd !== undefined ? wt.workPath : wt.path;
      usersWorkspace(worktreeCwd);
      this.worktreeRepos.add(baseCwd);`, "derived external worktree guard");
  // Managed profiles never run the unconditional crash-recovery \`git worktree prune\` on the
  // process cwd unless worktree isolation is enabled; owned worktree repos are still pruned below.
  s = one(s, '    try { pruneWorktrees(process.cwd()); } catch { /* ignore */ }',
    '    if (!usersManaged || isWorktreeIsolationEnabled()) { try { pruneWorktrees(process.cwd()); } catch { /* ignore */ } }', "managed crash-recovery prune only with worktree isolation");
  return s;
}
function adaptIndex(s) {
  s = one(s, 'export default function (pi: ExtensionAPI) {',
    `export default function (pi: ExtensionAPI) {
  if (usersManaged) {
    usersWorkspace(process.cwd());
    usersContext.admitUserResources({ resource: "pi-subagents-global-config", userId: usersContext.profile.id, root: usersContext.profile.agentDir });
    if (getAgentDir() !== usersContext.profile.agentDir) throw new Error("Managed pi-subagents SDK agentDir does not match the users profile");
  }`, "entry receipt and guarded SDK profile root");
  s = one(s, 'const scheduler = new SubagentScheduler();', `const scheduler = new SubagentScheduler();
  let usersSwitchRegistration;
  if (usersManaged && ownsManagerRegistry && usersReadiness) {
    usersSwitchRegistration = usersReadiness.registerUserSwitchParticipant({
      name: "subagents",
      owner: registryEntry,
      isCurrent: (identity) => identity?.receipt === usersContext && ownsManagerRegistry &&
        (globalThis as any)[MANAGER_KEY] === registryEntry && !!manager && !!scheduler,
      acquireFence: () => {
        const releaseManager = manager.acquireUsersSwitchFence();
        if (!releaseManager) return undefined;
        const releaseScheduler = scheduler.acquireUsersSwitchFence();
        if (!releaseScheduler) {
          if (!releaseManager()) return undefined;
          return undefined;
        }
        let active = true;
        return () => {
          if (!active) return true;
          active = false;
          const managerReleased = releaseManager();
          const schedulerReleased = releaseScheduler();
          return schedulerReleased !== false && managerReleased !== false;
        };
      },
    });
  }`, "managed root registration after exact manager ownership and scheduler creation");
  s = one(s, 'if (ownsManagerRegistry && (globalThis as any)[MANAGER_KEY] === registryEntry) {\n      delete (globalThis as any)[MANAGER_KEY];', 'if (ownsManagerRegistry && (globalThis as any)[MANAGER_KEY] === registryEntry) {\n      usersSwitchRegistration?.unregister?.();\n      delete (globalThis as any)[MANAGER_KEY];', "root-only participant unregister with exact manager entry cleanup");
  s = one(s, 'const path = resolveStorePath(ctx.cwd, sessionId);\n      const store = new ScheduleStore(path);',
    `const owned = usersWorkspace(ctx.cwd);
      const path = resolveStorePath(ctx.cwd, sessionId);
      if (usersManaged) usersContext.admitUserResources({ resource: "pi-subagents-schedules", userId: usersContext.profile.id, cwd: owned.cwd, root: owned.workspaceRoot, path });
      const store = new ScheduleStore(path);`, "scheduled store guard");
  s = one(s, 'existing.outputFile = createOutputFilePath(ctx.cwd, id, ctx.sessionManager.getSessionId());',
    'existing.outputFile = createOutputFilePath(ctx.cwd, id, ctx.sessionManager.getSessionId());', "resume transcript anchor");
  return s;
}
function adaptMemory(s) {
  s = one(s, 'const current = join(getAgentDir(), "agent-memory", agentName);',
    'const current = join(usersManaged ? usersContext.profile.agentDir : getAgentDir(), "agent-memory", agentName);', "profile memory root");
  s = one(s, 'const legacy = join(homedir(), ".pi", "agent-memory", agentName);',
    'const legacy = usersManaged ? join(usersPath.dirname(usersContext.profile.agentDir), "agent-memory", agentName) : join(homedir(), ".pi", "agent-memory", agentName);', "legacy memory ownership");
  s = one(s, 'if (!existsSync(current) && existsSync(legacy) && !isSymlink(legacy)) {',
    'if (!existsSync(current) && (!usersManaged || usersContext.profile.id === "evolvera") && existsSync(legacy) && !isSymlink(legacy)) {', "legacy memory adoption policy");
  s = one(s, '  const memoryDir = resolveMemoryDir(agentName, scope, cwd);\n  // Create the memory directory',
    `  if (usersManaged) usersWorkspace(cwd);
  const memoryDir = resolveMemoryDir(agentName, scope, cwd);
  if (usersManaged) usersContext.admitUserResources({ resource: "pi-subagents-memory", userId: usersContext.profile.id, root: memoryDir, cwd });
  // Create the memory directory`, "memory pre-read/write admission");
  s = one(s, '  const memoryDir = resolveMemoryDir(agentName, scope, cwd);\n  const existingMemory = readMemoryIndex(memoryDir);',
    `  if (usersManaged) usersWorkspace(cwd);
  const memoryDir = resolveMemoryDir(agentName, scope, cwd);
  if (usersManaged) usersContext.admitUserResources({ resource: "pi-subagents-memory", userId: usersContext.profile.id, root: memoryDir, cwd });
  const existingMemory = readMemoryIndex(memoryDir);`, "readonly memory pre-read admission");
  return s;
}
function adaptOutput(s) {
  s = one(s, '  const encoded = encodeCwd(cwd);\n  const root = join(tmpdir(), `pi-subagents-${process.getuid?.() ?? 0}`);',
    `  const owned = usersManaged ? usersWorkspace(cwd) : undefined;
  const encoded = encodeCwd(cwd);
  const root = usersManaged ? join(owned.workspaceRoot, ".pi", "subagent-output") : join(tmpdir(), \`pi-subagents-\${process.getuid?.() ?? 0}\`);
  if (usersManaged) usersContext.admitUserResources({ resource: "pi-subagents-transcript", userId: usersContext.profile.id, cwd: owned.cwd, root, sessionId });`, "managed transcript root");
  return s;
}
function adaptCustomAgents(s) {
  if (!s.includes('import { existsSync, readdirSync, readFileSync } from "node:fs";')) fail("custom-agent fs import anchor mismatch");
  s = one(s, '  const agents = new Map<string, AgentConfig>();\n  loadFromDir(globalDir, agents, "global", strict);',
    `  const agents = new Map<string, AgentConfig>();
  if (usersManaged) {
    const sharedAssets = usersContext.profile.sharedAssets;
    if (!Array.isArray(sharedAssets) || sharedAssets.length !== 1) throw new Error("Managed pi-subagents requires exactly one canonical shared code root for common agents");
    const commonDir = join(sharedAssets[0], "agents");
    usersContext.admitUserResources({ resource: "pi-subagents-agents", userId: usersContext.profile.id, root: commonDir });
    let commonStat;
    try { commonStat = statSync(commonDir); } catch { throw new Error("Managed pi-subagents common agents source is unavailable"); }
    if (!commonStat.isDirectory() || realpathSync.native(commonDir) !== commonDir) throw new Error("Managed pi-subagents common agents source is not canonical");
    try { readdirSync(commonDir); } catch { throw new Error("Managed pi-subagents common agents source is unreadable"); }
    loadFromDir(commonDir, agents, "global", strict);
  }
  loadFromDir(globalDir, agents, "global", strict);`, "admitted common custom-agent discovery");
  s = one(s, 'import { existsSync, readdirSync, readFileSync } from "node:fs";', 'import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";', "common-agent canonical metadata imports");
  return s;
}
function adaptScheduleStore(s) {
  s = one(s, '  return join(cwd, ".pi", "subagent-schedules", `${sessionId}.json`);',
    `  if (usersManaged) {
    const owned = usersWorkspace(cwd);
    const file = join(owned.workspaceRoot, ".pi", "subagent-schedules", \`\${sessionId}.json\`);
    usersContext.admitUserResources({ resource: "pi-subagents-schedules", userId: usersContext.profile.id, cwd: owned.cwd, root: owned.workspaceRoot, sessionId, path: file });
    return file;
  }
  return join(cwd, ".pi", "subagent-schedules", \`\${sessionId}.json\`);`, "managed schedule path");
  return s;
}
function adaptSchedule(s) {
  s = one(s, '  private manager: AgentManager | undefined;\n', `  private manager: AgentManager | undefined;
  private usersSwitchFence = false;
  private usersInFlight = 0;
  private usersDeferredTimers: { id: string; store: ScheduleStore; once: boolean }[] = [];
  private usersDeferredOnce = new Map<ScheduleStore, Set<string>>();

  acquireUsersSwitchFence(): (() => boolean) | undefined {
    if (this.usersSwitchFence || this.usersInFlight !== 0) return undefined;
    this.usersSwitchFence = true;
    let active = true;
    return () => {
      if (!active) return true;
      active = false;
      if (!this.usersSwitchFence) return false;
      this.usersSwitchFence = false;
      const timers = this.usersDeferredTimers.splice(0);
      this.usersDeferredOnce.clear();
      for (const { id, store, once } of timers) {
        if (this.store !== store) continue;
        if (once) this.dispatchOneShot(id, store);
        else this.dispatchTimerJob(id);
      }
      return true;
    };
  }

  private dispatchTimerJob(id: string): boolean {
    if (this.usersSwitchFence) {
      if (this.store) this.usersDeferredTimers.push({ id, store: this.store, once: false });
      return false;
    }
    return this.executeJob(id);
  }

  private dispatchOneShot(id: string, scheduledStore: ScheduleStore | undefined = this.store): void {
    if (this.usersSwitchFence) {
      if (scheduledStore) {
        let pending = this.usersDeferredOnce.get(scheduledStore);
        if (!pending) this.usersDeferredOnce.set(scheduledStore, pending = new Set());
        if (!pending.has(id)) {
          pending.add(id);
          this.usersDeferredTimers.push({ id, store: scheduledStore, once: true });
        }
      }
      return;
    }
    if (!scheduledStore || this.store !== scheduledStore) return;
    this.executeJob(id);
    scheduledStore.update(id, { enabled: false });
    const updated = scheduledStore.get(id);
    if (updated) this.emit({ type: "updated", job: updated });
  }
` , "scheduler fence, deferred timer dispatch and in-flight state");
  s = one(s, 'setInterval(() => this.executeJob(job.id), job.intervalMs)', 'setInterval(() => this.dispatchTimerJob(job.id), job.intervalMs)', "interval dispatch fence");
  s = one(s, '          this.executeJob(job.id);\n            // Auto-disable one-shots after they fire (mirrors pi-cron-schedule)\n            store.update(job.id, { enabled: false });\n            const updated = store.get(job.id);\n            if (updated) this.emit({ type: "updated", job: updated });', '          this.dispatchOneShot(job.id, store);', "one-shot pre-disable dispatch fence");
  s = one(s, 'new Cron(job.schedule, () => this.executeJob(job.id))', 'new Cron(job.schedule, () => this.dispatchTimerJob(job.id))', "cron dispatch fence");
  s = one(s, '  private executeJob(id: string): void {', '  private executeJob(id: string): boolean {', "executeJob dispatch result contract");
  s = one(s, '    if (!store || !pi || !ctx || !manager) return;\n    const job = store.get(id);\n    if (!job?.enabled) return;\n\n    store.update(id, { lastStatus: "running" });', '    if (!store || !pi || !ctx || !manager) return false;\n    const job = store.get(id);\n    if (!job?.enabled) return false;\n    if (this.usersSwitchFence) {\n      if (job.scheduleType === "once") {\n        let pending = this.usersDeferredOnce.get(store);\n        if (!pending) this.usersDeferredOnce.set(store, pending = new Set());\n        if (!pending.has(id)) {\n          pending.add(id);\n          this.usersDeferredTimers.push({ id, store, once: true });\n        }\n      } else this.usersDeferredTimers.push({ id, store, once: false });\n      return false;\n    }\n\n    this.usersInFlight++;\n    store.update(id, { lastStatus: "running" });', "timer refusal before persisted running state and completion latch");
  s = one(s, '      this.emit({ type: "error", jobId: id, error });\n      return;\n    }', '      this.emit({ type: "error", jobId: id, error });\n      this.usersInFlight--;\n      return true;\n    }', "scheduler failed spawn completion latch");
  s = one(s, '    const finalize = (status: "success" | "error") => {\n      const next = this.getNextRun(id);\n      const current = store.get(id);\n      store.update(id, {\n        lastRun: new Date().toISOString(),\n        lastStatus: status,\n        runCount: (current?.runCount ?? 0) + 1,\n        nextRun: next,\n      });\n    };', '    let finalized = false;\n    const finalize = (status: "success" | "error") => {\n      if (finalized) return;\n      finalized = true;\n      const next = this.getNextRun(id);\n      const current = store.get(id);\n      store.update(id, {\n        lastRun: new Date().toISOString(),\n        lastStatus: status,\n        runCount: (current?.runCount ?? 0) + 1,\n        nextRun: next,\n      });\n      this.usersInFlight--;\n    };', "finalize persisted before clearing scheduler busy latch");
  s = one(s, '    } else {\n      // Spawn returned without a promise (defensive — bypassQueue path always sets one).\n      finalize("success");\n    }\n  }', '    } else {\n      // Spawn returned without a promise (defensive — bypassQueue path always sets one).\n      finalize("success");\n    }\n    return true;\n  }', "executeJob admitted completion result");
  return s;
}

function transform(name, source) {
  let output;
  switch (name) {
    case "src/index.ts": output = adaptIndex(source); break;
    case "src/agent-runner.ts": output = adaptRunner(source); break;
    case "src/agent-manager.ts": output = adaptManager(source); break;
    case "src/memory.ts": output = adaptMemory(source); break;
    case "src/output-file.ts": output = adaptOutput(source); break;
    case "src/schedule-store.ts": output = adaptScheduleStore(source); break;
    case "src/custom-agents.ts": output = adaptCustomAgents(source); break;
    case "src/schedule.ts": output = adaptSchedule(source); break;
    default: fail(`undeclared module ${name}`);
  }
  return `${RECEIPT}\n${output}`;
}

/** Stage a verified 0.18.2 copy with users guards; the installed package is never modified. */
export function stageSubagentsProfileCompatibility(sourceRoot, stagingRoot, profileContext) {
  const source = canonical(sourceRoot, "sourceRoot");
  const destination = canonical(stagingRoot, "stagingRoot");
  if (within(source, destination) || within(destination, source)) fail("sourceRoot and stagingRoot must be disjoint");
  const profile = profileContext?.profile ?? profileContext;
  if (!profile || typeof profile.id !== "string" || profile.id.length === 0 || typeof profile.agentDir !== "string" || !path.isAbsolute(profile.agentDir) || profile.agentDir.includes("\0")) fail("profileContext must identify a profile with an absolute agentDir");
  if (!fs.statSync(destination).isDirectory()) fail("stagingRoot must be a directory");
  const metadata = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8"));
  if (metadata.name !== PACKAGE_NAME || metadata.version !== PACKAGE_VERSION || JSON.stringify(metadata.pi?.extensions) !== JSON.stringify(["./src/index.ts"])) fail("package identity, version, or entry mismatch");
  for (const relative of MODULES) {
    const stat = fs.lstatSync(path.join(source, relative));
    if (!stat.isFile() || stat.isSymbolicLink()) fail(`module must be a regular source file: ${relative}`);
  }
  const finalRoot = path.join(destination, FINAL_DIR);
  if (fs.existsSync(finalRoot)) fail("staging destination already exists");
  const temporary = path.join(destination, `.${FINAL_DIR}-${process.pid}-${randomBytes(8).toString("hex")}.tmp`);
  try {
    const transformed = new Map();
    for (const relative of MODULES) {
      const sourceText = fs.readFileSync(path.join(source, relative), "utf8");
      transformed.set(relative, transform(relative, sourceText));
    }
    fs.mkdirSync(temporary);
    fs.cpSync(source, temporary, { recursive: true, dereference: false, filter: (p) => !path.relative(source, p).split(path.sep).some((part) => ["node_modules", ".git", "dist"].includes(part)) });
    for (const [relative, output] of transformed) {
      const file = path.join(temporary, relative);
      fs.writeFileSync(file, output, { flag: "w" });
    }
    fs.renameSync(temporary, finalRoot);
  } catch (error) {
    try { fs.rmSync(temporary, { recursive: true, force: true }); } catch { /* only this unique temporary staging tree */ }
    throw error;
  }
  return Object.freeze({ packageRoot: finalRoot, entry: path.join(finalRoot, ENTRY_RELATIVE) });
}

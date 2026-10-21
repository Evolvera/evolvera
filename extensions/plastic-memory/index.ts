import type { BeforeAgentStartEvent, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePlasticMemorySettings, type ResolvedPlasticMemorySettings } from "./config.ts";
import { makeProject, validatePublicationCandidate, type PublicationCandidate } from "./project/schema.ts";
import { loadProject, publishProject } from "./project/store.ts";
import { makeProposalDecision, proposalQueueHead, reconstructProposalQueue } from "./session/ledger.ts";

export type PlasticMemoryOwnerMode = "full" | "bridge";

const USER_CONTEXT_KEY = Symbol.for("pi.users.context");

type ManagedUserContext = {
  profile: { id: string; agentDir: string };
  assertOwnedWorkspace(cwd: string): unknown;
  assertOwnedSession(request: { sessionPath: string; cwd: string }): unknown;
  admitUserResources(request: Record<string, unknown>): unknown;
};
type JsonObject = Record<string, unknown>;
type SettingsRead = { valid: true; value?: JsonObject } | { valid: false };

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readSettingsFile(file: string): SettingsRead {
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    return isJsonObject(value) ? { valid: true, value } : { valid: false };
  } catch (error: any) {
    return error?.code === "ENOENT" ? { valid: true } : { valid: false };
  }
}

export function resolvePlasticMemoryOwnerModeFromResolved(
  resolved: ResolvedPlasticMemorySettings,
): PlasticMemoryOwnerMode {
  try {
    return resolved.config.enabled && !resolved.observationalMemoryConfigured.any ? "full" : "bridge";
  } catch {
    return "bridge";
  }
}

export function resolvePlasticMemoryOwnerMode(
  globalSettings?: unknown,
  projectSettings?: unknown,
): PlasticMemoryOwnerMode {
  try {
    return resolvePlasticMemoryOwnerModeFromResolved(resolvePlasticMemorySettings(globalSettings, projectSettings));
  } catch {
    return "bridge";
  }
}

function agentRootFromModule(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

function unavailableContext(): never {
  throw new Error("managed user context is unavailable");
}

/**
 * Returns only the registry-issued process receipt; PI_USER_ID is detection, never authority.
 * The descriptor is inspected before its value so an accessor or replaceable slot can neither
 * run code nor stand in for the launcher's frozen, non-configurable, non-writable receipt.
 */
export function managedMemoryContext(cwd?: string, sessionPath?: string): ManagedUserContext | undefined {
  const marker = process.env.PI_USER_ID;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, USER_CONTEXT_KEY);
  if (marker === undefined && descriptor === undefined) return undefined;
  if (!descriptor || !("value" in descriptor) || descriptor.configurable || descriptor.writable) unavailableContext();
  const value = descriptor.value as ManagedUserContext;
  if (!value || typeof value !== "object" || !Object.isFrozen(value)) unavailableContext();
  const profile = value.profile;
  if (!profile || typeof profile !== "object" || !Object.isFrozen(profile)
      || typeof profile.id !== "string" || profile.id.length === 0
      || typeof profile.agentDir !== "string" || !isAbsolute(profile.agentDir)
      || (marker !== undefined && marker !== profile.id)
      || typeof value.assertOwnedWorkspace !== "function" || typeof value.assertOwnedSession !== "function"
      || typeof value.admitUserResources !== "function"
      || value.modelRuntime === null || (typeof value.modelRuntime !== "object" && typeof value.modelRuntime !== "function")) {
    unavailableContext();
  }
  if (cwd !== undefined) {
    if (typeof cwd !== "string" || !isAbsolute(cwd)) throw new Error("workspace ownership is unavailable");
    value.assertOwnedWorkspace(resolve(cwd));
  }
  if (sessionPath !== undefined) {
    if (cwd === undefined || typeof sessionPath !== "string" || !isAbsolute(sessionPath)) throw new Error("session ownership is unavailable");
    value.assertOwnedSession({ sessionPath: resolve(sessionPath), cwd: resolve(cwd) });
  }
  return value;
}
export function readPlasticMemorySettings(cwd = process.cwd()): ResolvedPlasticMemorySettings {
  if (typeof cwd !== "string" || !isAbsolute(cwd)) {
    return resolvePlasticMemorySettings(undefined, undefined);
  }
  const managed = managedMemoryContext(cwd);
  const root = managed?.profile.agentDir ?? agentRootFromModule();
  if (managed) managed.admitUserResources({ resource: "memory-settings", root, cwd: resolve(cwd) });
  const globalSettings = readSettingsFile(join(root, "settings.json"));
  const projectSettings = readSettingsFile(join(resolve(cwd), ".pi", "settings.json"));
  if (!globalSettings.valid || !projectSettings.valid) return resolvePlasticMemorySettings(undefined, undefined);
  return resolvePlasticMemorySettings(globalSettings.value, projectSettings.value);
}

export function resolvePlasticMemoryOwnerModeFromFiles(cwd = process.cwd()): PlasticMemoryOwnerMode {
  try {
    return resolvePlasticMemoryOwnerModeFromResolved(readPlasticMemorySettings(cwd));
  } catch {
    return "bridge";
  }
}

function currentMemoryRoot(ctx: { cwd?: unknown; sessionManager?: { getSessionFile?: () => string } }): { cwd: string; memoryRoot: string } {
  if (typeof ctx.cwd !== "string" || !isAbsolute(ctx.cwd)) throw new Error("current project cwd is unavailable");
  const cwd = resolve(ctx.cwd);
  const managed = managedMemoryContext(cwd);
  if (managed) {
    const sessionPath = ctx.sessionManager?.getSessionFile?.();
    if (typeof sessionPath !== "string" || !isAbsolute(sessionPath)) throw new Error("current session ownership is unavailable");
    managedMemoryContext(cwd, sessionPath);
    managed.admitUserResources({ resource: "project-memory", cwd, memoryRoot: join(cwd, ".pi", "memory") });
  }
  return { cwd, memoryRoot: join(cwd, ".pi", "memory") };
}

function combineProjectContext(systemPrompt: unknown, block: string): string {
  const prior = typeof systemPrompt === "string" ? systemPrompt : "";
  return prior ? `${block}\n\n${prior}` : block;
}

function predictedProjectIdentity(cwd: string): { provenance: { root: string }; name: string; repository: string } {
  return { provenance: { root: cwd }, name: basename(cwd), repository: basename(cwd) };
}

async function activatePlasticMemoryExtension(pi: ExtensionAPI): Promise<void> {
  const resolved = readPlasticMemorySettings(process.cwd());
  if (resolvePlasticMemoryOwnerModeFromResolved(resolved) !== "full") return;

  const [coordinatorModule, contextModule, toolsModule, commandsModule, recallModule, searchModule, runnerRuntimeModule] = await Promise.all([
    import("./runtime/coordinator.ts"),
    import("./project/context.ts"),
    import("./runtime/tools.ts"),
    import("./runtime/commands.ts"),
    import("./session/recall.ts"),
    import("./project/search.ts"),
    import("./runtime/runner-runtime.ts"),
  ]);
  const { assembleProjectContext } = contextModule;
  let currentProjectCwd: string | undefined;
  let currentContext: ExtensionContext | undefined;
  const coordinator = coordinatorModule.registerPlasticMemoryCoordinator(pi, {
    config: resolved.config,
    runtime: () => currentContext ? runnerRuntimeModule.createPiRunnerRuntime(currentContext.modelRegistry) : undefined,
    projectId: (ctx?: ExtensionContext) => {
      const cwd = ctx ? currentMemoryRoot(ctx).cwd : currentProjectCwd;
      if (!cwd) return undefined;
      if (!ctx) managedMemoryContext(cwd, currentContext?.sessionManager?.getSessionFile?.());
      const memoryRoot = join(cwd, ".pi", "memory");
      const project = loadProject(memoryRoot);
      if (project) return project.frontMatter.id;
      const identity = predictedProjectIdentity(cwd);
      return makeProject(identity.provenance, identity).id;
    },
    projectSnapshot: () => {
      if (!currentProjectCwd) return {};
      managedMemoryContext(currentProjectCwd, currentContext?.sessionManager?.getSessionFile?.());
      const memoryRoot = join(currentProjectCwd, ".pi", "memory");
      return assembleProjectContext(memoryRoot, { architectureRoot: memoryRoot, repositoryRoot: currentProjectCwd });
    },
  });

  pi.on("before_agent_start", (event: BeforeAgentStartEvent, ctx: ExtensionContext): { systemPrompt: string } | undefined => {
    currentContext = ctx;
    try {
      const { cwd, memoryRoot } = currentMemoryRoot(ctx);
      currentProjectCwd = cwd;
      const project = assembleProjectContext(memoryRoot, { architectureRoot: memoryRoot, repositoryRoot: cwd });
      return { systemPrompt: combineProjectContext(event.systemPrompt, project.block) };
    } catch {
      return undefined;
    }
  });

  const branchFor = (ctx: any) => {
    currentMemoryRoot(ctx);
    if (!ctx?.sessionManager || typeof ctx.sessionManager.getBranch !== "function") throw new Error("current session branch is unavailable");
    return {
      entries: ctx.sessionManager.getBranch(),
      binding: coordinator.getBinding(ctx),
      leafId: typeof ctx.sessionManager.getLeafId === "function" ? ctx.sessionManager.getLeafId() : undefined,
    };
  };
  const memoryRootFor = (ctx: any): string => currentMemoryRoot(ctx).memoryRoot;
  const validateProposalCandidate = (args: JsonObject): PublicationCandidate => {
    for (const field of ["category", "title", "target", "body", "confidence"]) if (!(field in args)) throw new Error(`${field} is required`);
    return validatePublicationCandidate(args);
  };
  const projectFor = (ctx: any): { cwd: string; memoryRoot: string; projectId: string; project?: { provenance: { root: string }; name: string; repository: string } } => {
    const { cwd, memoryRoot } = currentMemoryRoot(ctx);
    const project = loadProject(memoryRoot);
    if (project) return { cwd, memoryRoot, projectId: project.frontMatter.id };
    const identity = predictedProjectIdentity(cwd);
    return { cwd, memoryRoot, projectId: makeProject(identity.provenance, identity).id, project: identity };
  };
  const queueHeadFor = (args: JsonObject, ctx: any) => {
    const branch = branchFor(ctx);
    const queue = reconstructProposalQueue({ branchEntries: branch.entries, binding: branch.binding, leafId: branch.leafId });
    if (!queue.valid) throw new Error(queue.reason ?? "proposal queue is invalid");
    const head = proposalQueueHead(queue);
    if (!head) throw new Error("proposal queue is empty");
    if (args.proposalId !== undefined && (typeof args.proposalId !== "string" || args.proposalId !== head.data.proposalId)) throw new Error("proposal ID is not the FIFO head");
    const project = projectFor(ctx);
    const candidate = validateProposalCandidate(head.data.candidate as JsonObject);
    if (head.data.projectId !== project.projectId) throw new Error("proposal project does not match the current project");
    return { branch, queue, head, project, candidate };
  };
  const appendVisibleDecision = (ctx: any, head: any, binding: any, decision: "accepted" | "rejected", priorDecisionCount: number) => {
    const record = makeProposalDecision(head, decision, binding);
    pi.appendEntry(record.customType, record.data);
    const visible = branchFor(ctx);
    const after = reconstructProposalQueue({ branchEntries: visible.entries, binding: visible.binding, leafId: visible.leafId });
    const observed = after.valid && after.decisions.filter((entry: any) => entry.data.proposalId === head.data.proposalId && entry.data.decision === decision).length === priorDecisionCount + 1;
    if (!observed || after.unresolved.some((entry: any) => entry.data.proposalId === head.data.proposalId)) throw new Error("proposal decision was not durably appended");
    coordinator.refreshProposalWidget(ctx);
    return after;
  };
  const operations = {
    recall: (id: string, ctx: any) => {
      const branch = branchFor(ctx);
      if (id.startsWith("pm:p:") || id.startsWith("pm:c:")) return searchModule.recallExact(memoryRootFor(ctx), id);
      return recallModule.recallSession({ ...branch, id });
    },
    search: (filters: Record<string, unknown>, ctx: any) => {
      const branch = branchFor(ctx);
      return recallModule.searchMemory({
        ...branch,
        projectRoot: memoryRootFor(ctx),
        projectSearch: searchModule.searchProject,
        filters: filters as any,
      });
    },
    status: (ctx: any) => {
      const { cwd, memoryRoot } = currentMemoryRoot(ctx);
      const project = assembleProjectContext(memoryRoot, { architectureRoot: memoryRoot, repositoryRoot: cwd });
      return { status: "ready", owner: "plastic-memory", cwd, mode: project.mode, architectureStatus: project.architectureStatus, warnings: project.warnings };
    },
    view: (args: { mode?: string }, ctx: any) => {
      const { cwd, memoryRoot } = currentMemoryRoot(ctx);
      const project = assembleProjectContext(memoryRoot, { architectureRoot: memoryRoot, repositoryRoot: cwd });
      return { status: "ready", mode: args.mode ?? "visible", context: project.block, note: "Full chunk bodies require memory_recall with an exact id." };
    },
    unavailable: (operation: string) => ({ status: "unavailable", state: "unavailable", reason: `${operation} is unavailable: this root exposes no provider-backed worker or proposal-to-canonical publication path` }),
  };
  toolsModule.registerMemoryTools(pi, operations);
  commandsModule.registerMemoryCommands(pi, {
    status: operations.status,
    plasticStatus: (ctx: any) => coordinator.getStatus(ctx),
    view: operations.view,
    propose: (args: JsonObject, ctx: any) => {
      if (typeof ctx?.cwd !== "string" || !isAbsolute(ctx.cwd)) return operations.unavailable("project promotion");
      const candidate = validateProposalCandidate(args);
      const project = loadProject(memoryRootFor(ctx));
      const active = project?.chunks.find((chunk) => chunk.frontMatter.status === "active" && chunk.frontMatter.target === candidate.target);
      const action = candidate.supersedes ? "supersede" : active ? "update" : "create";
      const warnings = active && !candidate.supersedes && candidate.chunkId !== active.frontMatter.id ? ["active target requires its chunkId or supersedes"] : [];
      return {
        status: "preview", action, projectExists: Boolean(project), target: candidate.target, category: candidate.category,
        ...(active ? { activeChunkId: active.frontMatter.id, activeChunkTitle: active.frontMatter.title } : {}), warnings,
      };
    },
    accept: (args: JsonObject, ctx: any) => {
      if (!args.__manualJson && (Object.keys(args).length === 0 || "proposalId" in args)) {
        const queued = queueHeadFor(args, ctx);
        const result = publishProject(queued.project.memoryRoot, { ...(queued.project.project ? { project: queued.project.project } : {}), candidate: queued.candidate }, { accepted: true });
        const after = appendVisibleDecision(ctx, queued.head, queued.branch.binding, "accepted", queued.queue.decisions.filter((entry: any) => entry.data.proposalId === queued.head.data.proposalId).length);
        return { ...result, proposalId: queued.head.data.proposalId, decision: "accepted", queueHead: after.head?.data.proposalId };
      }
      const project = projectFor(ctx);
      const candidate = validateProposalCandidate(args);
      const result = publishProject(project.memoryRoot, { ...(project.project ? { project: project.project } : {}), candidate }, { accepted: true });
      return result;
    },
    reject: (args: JsonObject, ctx: any) => {
      const queued = queueHeadFor(args, ctx);
      const after = appendVisibleDecision(ctx, queued.head, queued.branch.binding, "rejected", queued.queue.decisions.filter((entry: any) => entry.data.proposalId === queued.head.data.proposalId).length);
      return { status: "rejected", proposalId: queued.head.data.proposalId, decision: "rejected", queueHead: after.head?.data.proposalId };
    },
    migrate: () => operations.unavailable("migration"),
    backfill: () => operations.unavailable("backfill execution"),
    retry: () => operations.unavailable("retry execution"),
  });
}

export default function plasticMemoryExtension(pi: ExtensionAPI): Promise<void> {
  return activatePlasticMemoryExtension(pi);
}

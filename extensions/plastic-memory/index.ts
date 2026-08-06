import type { BeforeAgentStartEvent, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePlasticMemorySettings, type ResolvedPlasticMemorySettings } from "./config.ts";
import { CATEGORIES, CONFIDENCES, makeChunk, validateEvidence } from "./project/schema.ts";
import { loadProject, publishProject, type PublicationCandidate } from "./project/store.ts";

export type PlasticMemoryOwnerMode = "full" | "bridge";

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

export function readPlasticMemorySettings(cwd = process.cwd()): ResolvedPlasticMemorySettings {
  if (typeof cwd !== "string" || !isAbsolute(cwd)) {
    return resolvePlasticMemorySettings(undefined, undefined);
  }
  const globalSettings = readSettingsFile(join(agentRootFromModule(), "settings.json"));
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

function currentMemoryRoot(ctx: { cwd?: unknown }): { cwd: string; memoryRoot: string } {
  if (typeof ctx.cwd !== "string" || !isAbsolute(ctx.cwd)) throw new Error("current project cwd is unavailable");
  const cwd = resolve(ctx.cwd);
  return { cwd, memoryRoot: join(cwd, ".pi", "memory") };
}

function combineProjectContext(systemPrompt: unknown, block: string): string {
  const prior = typeof systemPrompt === "string" ? systemPrompt : "";
  return prior ? `${block}\n\n${prior}` : block;
}

async function activatePlasticMemoryExtension(pi: ExtensionAPI): Promise<void> {
  const resolved = readPlasticMemorySettings();
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
    projectSnapshot: () => {
      if (!currentProjectCwd) return {};
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
    if (!ctx?.sessionManager || typeof ctx.sessionManager.getBranch !== "function") throw new Error("current session branch is unavailable");
    return {
      entries: ctx.sessionManager.getBranch(),
      binding: coordinator.getBinding(ctx),
      leafId: typeof ctx.sessionManager.getLeafId === "function" ? ctx.sessionManager.getLeafId() : undefined,
    };
  };
  const memoryRootFor = (ctx: any): string => currentMemoryRoot(ctx).memoryRoot;
  const candidateFrom = (args: JsonObject): PublicationCandidate => ({
    category: args.category as PublicationCandidate["category"], title: args.title as string, target: args.target as string,
    body: args.body as string, confidence: args.confidence as PublicationCandidate["confidence"],
    ...(args.evidence !== undefined ? { evidence: args.evidence as PublicationCandidate["evidence"] } : {}),
    ...(args.chunkId !== undefined ? { chunkId: args.chunkId as string } : {}),
    ...(args.supersedes !== undefined ? { supersedes: args.supersedes as string } : {}),
    ...(args.links !== undefined ? { links: args.links as string[] } : {}),
    ...(args.status !== undefined ? { status: args.status as PublicationCandidate["status"] } : {}),
  });
  const validateProposalCandidate = (args: JsonObject): PublicationCandidate => {
    for (const field of ["category", "title", "target", "body", "confidence"]) if (!(field in args)) throw new Error(`${field} is required`);
    const candidate = candidateFrom(args);
    if (!CATEGORIES.includes(candidate.category)) throw new Error("category is invalid");
    if (!CONFIDENCES.includes(candidate.confidence)) throw new Error("confidence is invalid");
    const evidence = candidate.evidence === undefined ? [] : Array.isArray(candidate.evidence) ? candidate.evidence.map((item) => validateEvidence(item)) : (() => { throw new Error("evidence must be an array"); })();
    makeChunk("pm:p:" + "0".repeat(32), {
      category: candidate.category, status: candidate.status ?? "active", confidence: candidate.confidence, title: candidate.title,
      target: candidate.target, sourceHead: "UNKNOWN", evidenceIds: evidence.map((item) => item.id), links: candidate.links ?? [],
      id: candidate.chunkId, supersedes: candidate.supersedes,
    }, candidate.body);
    return candidate;
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
      const { cwd, memoryRoot } = currentMemoryRoot(ctx);
      const candidate = candidateFrom(args);
      const input: { project?: { provenance: { root: string }; name: string; repository: string }; candidate: PublicationCandidate } = { candidate };
      if (!loadProject(memoryRoot)) input.project = { provenance: { root: cwd }, name: basename(cwd), repository: basename(cwd) };
      return publishProject(memoryRoot, input, { accepted: true });
    },
    migrate: () => operations.unavailable("migration"),
    backfill: () => operations.unavailable("backfill execution"),
    retry: () => operations.unavailable("retry execution"),
  });
}

export default function plasticMemoryExtension(pi: ExtensionAPI): Promise<void> {
  return activatePlasticMemoryExtension(pi);
}

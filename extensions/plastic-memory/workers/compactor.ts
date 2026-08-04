import { digestParts } from "../common/safety.ts";
import { extractCycleSourceFacts, type CycleSourceFacts, type StructuredFacts } from "../compaction/extract.ts";
import { prepareSemanticCompaction, type CycleInput, type EngineInput, type EngineResult, type PreparedCompaction } from "../compaction/engine.ts";
import { buildLunaRequest, projectSnapshot, type CumulativeState, type LunaRequest, type ProjectSnapshot } from "../compaction/render.ts";
import type { SessionEntry } from "../session/types.ts";
import { runBoundedRole, type RunnerResult, type RunnerRuntime } from "./runner.ts";

export type CompactorInput = Readonly<{
  engine: Omit<EngineInput, "compact">;
  /** The exact two cycles eligible for this detached compaction stride. */
  eligibleCycles: CycleInput[];
  priorState?: CumulativeState;
  projectSnapshot: ProjectSnapshot | unknown;
  runtime: RunnerRuntime;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
}>;
export type CompactorResult = Readonly<{
  ok: boolean;
  detached: true;
  prepared?: PreparedCompaction;
  engine?: EngineResult;
  runner?: RunnerResult;
  reason?: string;
}>;

const COMPACTOR_SYSTEM = "Maintain cumulative structured state. Return JSON with summary, state, and optional details; deterministic source identities are authoritative.";
const FACT_KEYS: (keyof StructuredFacts)[] = ["activeMemoryIds", "files", "commands", "errors", "decisions", "constraints", "goals", "openLoops"];
function mergeFacts(cycles: CycleSourceFacts[]): StructuredFacts {
  const result = Object.fromEntries(FACT_KEYS.map((key) => [key, [] as string[]])) as Record<keyof StructuredFacts, string[]>;
  for (const cycle of cycles) for (const key of FACT_KEYS) for (const value of cycle.facts[key]) if (!result[key].includes(value)) result[key].push(value);
  return result;
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function promptFor(request: LunaRequest): string {
  return JSON.stringify({
    exactEligibleCycles: request.cycleIds,
    sourceEntryIds: request.sourceEntryIds,
    sourceDigests: request.sourceDigests,
    sourceFactsDigest: request.sourceFactsDigest,
    priorStructuredState: request.priorState,
    deterministicFacts: request.facts,
    boundedProjectSnapshot: request.projectSnapshot,
    output: { summary: "bounded cumulative prose", state: "echo exact cycle/source identities and preserve all facts", details: "optional scrubbed metadata" },
  });
}
function responseObject(value: unknown): { summary?: unknown; state?: unknown; details?: unknown } | undefined {
  const output = record(value);
  if (!output) return undefined;
  const nested = record(output.result);
  return nested ?? output;
}

/** Prepare compaction off the visible turn; the engine is called only after the detached model result is verified. */
export async function runCompactor(input: CompactorInput): Promise<CompactorResult> {
  if (input.eligibleCycles.length === 0) return { ok: false, detached: true, reason: "no eligible cycles" };
  const snapshot = projectSnapshot(input.projectSnapshot);
  const facts = input.eligibleCycles.map((cycle) => extractCycleSourceFacts(
    "customType" in cycle ? cycle.data : cycle,
    input.engine.branchEntries,
    input.engine.activeMemoryIds ?? [],
  ));
  const request = buildLunaRequest(facts, input.priorState, snapshot, mergeFacts(facts));
  const runner = await runBoundedRole({
    role: "compactor",
    prompt: promptFor(request),
    systemPrompt: COMPACTOR_SYSTEM,
    runtime: input.runtime,
    signal: input.signal,
    inputTokens: Math.ceil(JSON.stringify(request).length / 4) + 2_048,
  });
  if (!runner.ok) return { ok: false, detached: true, runner, reason: runner.reason };
  if (input.isCurrent && !input.isCurrent()) return { ok: false, detached: true, runner, reason: "stale-generation" };
  const response = responseObject(runner.response);
  if (!response) return { ok: false, detached: true, runner, reason: "compactor output is not structured" };
  let engine: EngineResult;
  try {
    engine = prepareSemanticCompaction({
      ...input.engine,
      priorState: input.priorState,
      projectSnapshot: snapshot,
      cycles: input.engine.cycles,
      compact: () => response,
    });
  } catch (error) {
    return { ok: false, detached: true, runner, reason: error instanceof Error ? error.message : String(error) };
  }
  if (!engine.eligible) return { ok: false, detached: true, engine, runner, reason: engine.reason };
  return { ok: true, detached: true, prepared: engine.prepared, engine, runner };
}

export const prepareDetachedCompaction = runCompactor;
export const buildCompactorRequest = promptFor;

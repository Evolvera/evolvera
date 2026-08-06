import { digestParts } from "../common/safety.ts";
import { extractCycleSourceFacts, type CycleSourceFacts, type StructuredFacts } from "../compaction/extract.ts";
import { prepareSemanticCompaction, type CycleInput, type EngineInput, type EngineResult, type PreparedCompaction } from "../compaction/engine.ts";
import { buildLunaRequest, projectSnapshot, type CumulativeState, type LunaRequest, type ProjectSnapshot } from "../compaction/render.ts";
import type { SessionEntry } from "../session/types.ts";
import { runBoundedRole, type RunnerResult, type RunnerRuntime } from "./runner.ts";

export type CompactorInput = Readonly<{
  engine: Omit<EngineInput, "compact">;
  /** Every unacknowledged closed cycle before the selected retained suffix; when physical budget forces emergency mode, all folded normally-retained cycles stay in this same request and cumulative state. */
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

const COMPACTOR_SYSTEM = "Maintain cumulative structured state. Return JSON with summary, optional state.facts, and optional details; deterministic source identities are authoritative and must not be echoed.";
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
    readOnlyIdentityContext: {
      cycleIds: request.cycleIds,
      sourceEntryIds: request.sourceEntryIds,
      sourceDigests: request.sourceDigests,
      instruction: "READ-ONLY context only. Never return these identity arrays; deterministic code fills them.",
    },
    sourceFactsDigest: request.sourceFactsDigest,
    priorStructuredState: request.priorState,
    deterministicFacts: request.facts,
    boundedProjectSnapshot: request.projectSnapshot,
    output: {
      response: "single JSON object only; no prose outside the JSON, no markdown fence, and no trailing commentary",
      summary: "required bounded cumulative prose string in plain text with neutral wording; renderVerifiedCompaction strips a leading summaryHeader(...) if present and re-adds its own header; assertNoSensitiveText applies, so never include credentials, tokens, keys, or file contents that look like secrets",
      state: {
        optional: true,
        facts: Object.fromEntries(FACT_KEYS.map((key) => [key, "optional array of strings; values are union-merged with deterministicFacts, so this may only add facts"])),
      },
      identityRule: "HARD RULE: omit cycleIds, sourceEntryIds, and sourceDigests entirely from the response. They must not appear under state, details, or any other key; they are authoritative read-only context and are filled by deterministic code.",
      details: "optional scrubbed metadata object",
    },
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

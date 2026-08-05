import { makeObservationId, recordDigest } from "../common/ids.ts";
import { scrubSensitiveText } from "../common/safety.ts";
import { makePlasticEntry } from "../session/ledger.ts";
import { PLASTIC_OBSERVATIONS_RECORDED, type Observation, type PlasticEntry, type SessionBinding, type SessionEntry } from "../session/types.ts";
import type { CompletedTurnSnapshot } from "../session/cycles.ts";
import { runBoundedRole, type RunnerResult, type RunnerRuntime } from "./runner.ts";

export type ObserverInput = Readonly<{
  binding: SessionBinding;
  snapshot: CompletedTurnSnapshot;
  sourceEntries: SessionEntry[];
  priorObservations?: Observation[];
  priorReflections?: unknown[];
  runtime: RunnerRuntime;
  signal?: AbortSignal;
}>;
export type ObserverResult = Readonly<{
  ok: boolean;
  status: "complete" | "empty-valid" | "invalid" | "failed" | "stale";
  manifestValid: boolean;
  observations: Observation[];
  record?: PlasticEntry<"plastic.observations.recorded">;
  runner?: RunnerResult;
  reason?: string;
}>;

const OBSERVER_SYSTEM = "Extract durable observations only. Return JSON with the scalar coverageManifest identity fields (omit sourceEntryIds) and observations. Never invent source ids.";
const MAX_OBSERVATION_CHARS = 2_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function exactIds(actual: unknown, expected: readonly string[]): actual is string[] {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((id, index) => id === expected[index]);
}
/** Echoing the deterministic span ids proves nothing (code hands them to the model), so the array is optional; a supplied array must still match exactly. */
function manifestIds(actual: unknown, expected: readonly string[]): boolean {
  return actual === undefined || exactIds(actual, expected);
}
type ManifestFailureCode =
  | "missing-coverage-manifest"
  | "invalid-coverage-manifest"
  | "mismatch-snapshotId"
  | "mismatch-cycleId"
  | "mismatch-sourceDigest"
  | "mismatch-completedTurnEndId"
  | "mismatch-sourceEntryIds"
  | "mismatch-sessionId"
  | "mismatch-generation"
  | "mismatch-branchId";

function responseManifest(value: Record<string, unknown>): unknown {
  return value.coverageManifest ?? value.manifest ?? value.coverage;
}
function manifestFailureCode(value: unknown, snapshot: CompletedTurnSnapshot, binding: SessionBinding): ManifestFailureCode | undefined {
  const output = record(value);
  if (!output) return "missing-coverage-manifest";
  const response = responseManifest(output);
  if (response === undefined) return "missing-coverage-manifest";
  const manifest = record(response);
  if (!manifest) return "invalid-coverage-manifest";
  if (manifest.snapshotId !== snapshot.snapshotId) return "mismatch-snapshotId";
  if (manifest.cycleId !== snapshot.cycleId) return "mismatch-cycleId";
  if (manifest.sourceDigest !== snapshot.span.sourceDigest) return "mismatch-sourceDigest";
  if (manifest.completedTurnEndId !== snapshot.span.completedTurnEndId) return "mismatch-completedTurnEndId";
  if (!manifestIds(manifest.sourceEntryIds, snapshot.span.sourceEntryIds)) return "mismatch-sourceEntryIds";
  if (manifest.sessionId !== binding.sessionId) return "mismatch-sessionId";
  if (manifest.generation !== binding.generation) return "mismatch-generation";
  if (manifest.branchId !== binding.branchId) return "mismatch-branchId";
  return undefined;
}
function clean(value: string, maximum: number): string {
  return scrubSensitiveText(value).replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, maximum);
}
function sourceIds(value: unknown, allowed: readonly string[]): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || !value.every((id) => typeof id === "string")) return undefined;
  const positions = new Map(allowed.map((id, index) => [id, index]));
  if (value.some((id) => !positions.has(id))) return undefined;
  // Membership in the span is the invariant; citation order is not a security property, so dedupe (first wins) and canonicalize by span position.
  return [...new Set(value as string[])].sort((left, right) => positions.get(left)! - positions.get(right)!);
}
type ObservationFailureCode = "invalid-observation-record" | "invalid-observation-content" | "invalid-observation-timestamp" | "invalid-observation-relevance" | "invalid-observation-sourceEntryIds";
type ParsedObservation = Readonly<{ observation: Observation }> | Readonly<{ failure: ObservationFailureCode }>;

/** Return only a fixed structural rejection code; model content and citation values never leave this boundary. */
function parseObservation(value: unknown, binding: SessionBinding, snapshot: CompletedTurnSnapshot): ParsedObservation {
  const source = record(value);
  if (!source) return { failure: "invalid-observation-record" };
  if (typeof source.content !== "string" || !source.content.trim()) return { failure: "invalid-observation-content" };
  if (typeof source.timestamp !== "string") return { failure: "invalid-observation-timestamp" };
  const relevance = source.relevance;
  if (relevance !== "low" && relevance !== "medium" && relevance !== "high" && relevance !== "critical") return { failure: "invalid-observation-relevance" };
  const ids = sourceIds(source.sourceEntryIds, snapshot.span.sourceEntryIds);
  if (!ids) return { failure: "invalid-observation-sourceEntryIds" };
  const content = clean(source.content, MAX_OBSERVATION_CHARS);
  if (!content) return { failure: "invalid-observation-content" };
  const id = typeof source.id === "string" && /^pm:o:[a-f0-9]{24}:[a-f0-9]{24}$/u.test(source.id)
    ? source.id
    : makeObservationId(binding.sessionId, recordDigest(binding.sessionId, snapshot.snapshotId, content));
  return { observation: { id, content, timestamp: clean(source.timestamp, 64), relevance, sourceEntryIds: ids, tokenCount: Math.max(1, Math.ceil(content.length / 4)) } };
}
function promptFor(input: ObserverInput): string {
  return JSON.stringify({
    binding: input.binding,
    snapshot: { ...input.snapshot, sourceEntries: input.sourceEntries },
    priorObservations: (input.priorObservations ?? []).slice(-200),
    priorReflections: (input.priorReflections ?? []).slice(-200),
    expectedCoverageManifest: {
      snapshotId: input.snapshot.snapshotId,
      cycleId: input.snapshot.cycleId,
      sourceDigest: input.snapshot.span.sourceDigest,
      completedTurnEndId: input.snapshot.span.completedTurnEndId,
      sourceEntryIds: input.snapshot.span.sourceEntryIds,
      sessionId: input.binding.sessionId,
      generation: input.binding.generation,
      branchId: input.binding.branchId,
    },
    output: {
      response: "single JSON object only; no prose, markdown fence, or trailing commentary",
      coverageManifest: "copy expectedCoverageManifest as this top-level field: flat, same key names, no additions; OMIT sourceEntryIds entirely because the deterministic ids are authoritative and are filled in by code",
      observations: {
        type: "array",
        empty: "use [] when there is nothing durable to record",
        item: {
          content: "non-empty string",
          timestamp: "string",
          relevance: "one of: low, medium, high, critical",
          sourceEntryIds: "non-empty subset of expectedCoverageManifest.sourceEntryIds; order does not matter and duplicates are normalized by code",
          id: "optional; if supplied, pm:o:<24 lowercase hex>:<24 lowercase hex>",
        },
      },
    },
  });
}

/** Run the observer against one immutable, bootstrap-approved snapshot. */
export async function runObserver(input: ObserverInput): Promise<ObserverResult> {
  const runner = await runBoundedRole({
    role: "observer",
    prompt: promptFor(input),
    systemPrompt: OBSERVER_SYSTEM,
    runtime: input.runtime,
    signal: input.signal,
    inputTokens: input.snapshot.tokenCount + 2_048,
  });
  if (!runner.ok) return { ok: false, status: runner.reason === "aborted" || runner.reason === "timeout" ? "stale" : "failed", manifestValid: false, observations: [], runner, reason: runner.reason };
  const output = record(runner.response);
  const manifestFailure = manifestFailureCode(runner.response, input.snapshot, input.binding);
  if (!output || manifestFailure) {
    const safeCode = manifestFailure ?? "missing-coverage-manifest";
    return {
      ok: false,
      status: "invalid",
      manifestValid: false,
      observations: [],
      runner,
      reason: `observer coverage manifest is missing, reordered, or identity-mismatched (${safeCode})`,
    };
  }
  if (output.status !== undefined && output.status !== "complete" && output.status !== "empty-valid") {
    return { ok: false, status: "invalid", manifestValid: true, observations: [], runner, reason: "observer reported partial coverage" };
  }
  if (!Array.isArray(output.observations)) return { ok: false, status: "invalid", manifestValid: true, observations: [], runner, reason: "observer observations are not an array" };
  const observations: Observation[] = [];
  for (const candidate of output.observations) {
    const parsed = parseObservation(candidate, input.binding, input.snapshot);
    if ("failure" in parsed) return { ok: false, status: "invalid", manifestValid: true, observations: [], runner, reason: `observer returned an invalid observation (${parsed.failure})` };
    observations.push(parsed.observation);
  }
  const unique = new Map(observations.map((observation) => [observation.id, observation]));
  const normalized = [...unique.values()];
  const recordEntry = normalized.length > 0 ? makePlasticEntry(PLASTIC_OBSERVATIONS_RECORDED, {
    schemaVersion: 1,
    ...input.binding,
    observations: normalized,
    span: input.snapshot.span,
  }) : undefined;
  return { ok: true, status: normalized.length > 0 ? "complete" : "empty-valid", manifestValid: true, observations: normalized, record: recordEntry, runner };
}

export const observeSnapshot = runObserver;
export const buildObserverRequest = promptFor;

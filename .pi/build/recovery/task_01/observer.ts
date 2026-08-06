import { makeObservationId, recordDigest } from "../common/ids.ts";
import { scrubSensitiveText } from "../common/safety.ts";
import { makePlasticEntry } from "../session/ledger.ts";
import { PLASTIC_OBSERVATIONS_RECORDED, type Observation, type PlasticEntry, type SessionBinding, type SessionEntry } from "../session/types.ts";
import type { CompletedTurnSnapshot } from "../session/cycles.ts";
import { prepareRolePrompt, runBoundedRole, type RunnerResult, type RunnerRuntime } from "./runner.ts";

export type ObserverInput = Readonly<{
  binding: SessionBinding;
  snapshot: CompletedTurnSnapshot;
  sourceEntries: SessionEntry[];
  /** The exact source ids visible to this bounded call; defaults to the snapshot span. */
  sourceEntryIds?: readonly string[];
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

const OBSERVER_SYSTEM = "Extract durable observations only. Return one JSON object containing semantic observations and exact source citations. Omit placeholders and blank observations; return [] if no durable non-empty fact exists. Do not return lifecycle identity, record ids, or a coverage manifest.";
const MAX_OBSERVATION_CHARS = 2_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function allowedSourceIds(input: ObserverInput): readonly string[] {
  return input.sourceEntryIds ?? input.snapshot.span.sourceEntryIds;
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
type ObservationFailureCode =
  | "invalid-observation-record"
  | "invalid-observation-content-missing"
  | "invalid-observation-content-null"
  | "invalid-observation-content-array"
  | "invalid-observation-content-object"
  | "invalid-observation-content-number"
  | "invalid-observation-content-boolean"
  | "invalid-observation-content-other"
  | "invalid-observation-timestamp"
  | "invalid-observation-relevance"
  | "invalid-observation-sourceEntryIds";
type ParsedObservation = Readonly<{ observation: Observation }> | Readonly<{ discard: true }> | Readonly<{ failure: ObservationFailureCode }>;

/** Return only a fixed structural rejection code; model content and citation values never leave this boundary. */
function parseObservation(value: unknown, binding: SessionBinding, snapshot: CompletedTurnSnapshot, allowed: readonly string[]): ParsedObservation {
  const source = record(value);
  if (!source) return { failure: "invalid-observation-record" };
  if (!Object.hasOwn(source, "content")) return { failure: "invalid-observation-content-missing" };
  const contentValue = source.content;
  if (contentValue === null) return { failure: "invalid-observation-content-null" };
  if (Array.isArray(contentValue)) return { failure: "invalid-observation-content-array" };
  if (typeof contentValue === "object") return { failure: "invalid-observation-content-object" };
  if (typeof contentValue === "number") return { failure: "invalid-observation-content-number" };
  if (typeof contentValue === "boolean") return { failure: "invalid-observation-content-boolean" };
  if (typeof contentValue !== "string") return { failure: "invalid-observation-content-other" };
  if (typeof source.timestamp !== "string") return { failure: "invalid-observation-timestamp" };
  const relevance = source.relevance;
  if (relevance !== "low" && relevance !== "medium" && relevance !== "high" && relevance !== "critical") return { failure: "invalid-observation-relevance" };
  const ids = sourceIds(source.sourceEntryIds, allowed);
  if (!ids) return { failure: "invalid-observation-sourceEntryIds" };
  const content = clean(contentValue, MAX_OBSERVATION_CHARS);
  if (!content) return { discard: true };
  // Model-provided ids are intentionally ignored. Identity is derived from the immutable
  // cycle, normalized content, and the citations that code just validated.
  const id = makeObservationId(binding.sessionId, recordDigest(binding.sessionId, { snapshotId: snapshot.snapshotId, sourceEntryIds: ids }, content));
  return { observation: { id, content, timestamp: clean(source.timestamp, 64), relevance, sourceEntryIds: ids, tokenCount: Math.max(1, Math.ceil(content.length / 4)) } };
}
function promptFor(input: ObserverInput): string {
  const sourceEntryIds = allowedSourceIds(input);
  return JSON.stringify({
    output: {
      response: "single JSON object only; no prose, markdown fence, or trailing commentary",
      observations: {
        type: "array",
        empty: "use [] when there is nothing durable to record; omit placeholders and blank observations",
        item: {
          content: "scalar JSON string; never array, object, or null; non-empty durable fact text; omit placeholders and blank observations",
          timestamp: "string",
          relevance: "one of: low, medium, high, critical",
          sourceEntryIds: "non-empty subset of sourceEntryIds; order does not matter and duplicates are normalized by code",
        },
      },
    },
    sourceEntries: input.sourceEntries,
    sourceEntryIds,
    priorObservations: (input.priorObservations ?? []).slice(-200),
    priorReflections: (input.priorReflections ?? []).slice(-200),
  });
}
export function observerRequestFits(input: ObserverInput): boolean {
  return prepareRolePrompt(promptFor(input)).ok;
}

/** Run the observer against one immutable, bootstrap-approved snapshot. */
export async function runObserver(input: ObserverInput): Promise<ObserverResult> {
  const runner = await runBoundedRole({
    role: "observer",
    prompt: promptFor(input),
    systemPrompt: OBSERVER_SYSTEM,
    runtime: input.runtime,
    signal: input.signal,
  });
  if (!runner.ok) return { ok: false, status: runner.reason === "aborted" || runner.reason === "timeout" ? "stale" : "failed", manifestValid: true, observations: [], runner, reason: runner.reason };
  const output = record(runner.response);
  if (!output) return { ok: false, status: "invalid", manifestValid: true, observations: [], runner, reason: "observer response is not a semantic object" };
  if (output.status !== undefined && output.status !== "complete" && output.status !== "empty-valid") {
    return { ok: false, status: "invalid", manifestValid: true, observations: [], runner, reason: "observer reported partial coverage" };
  }
  if (!Array.isArray(output.observations)) return { ok: false, status: "invalid", manifestValid: true, observations: [], runner, reason: "observer observations are not an array" };
  const observations: Observation[] = [];
  const allowed = allowedSourceIds(input);
  for (const candidate of output.observations) {
    const parsed = parseObservation(candidate, input.binding, input.snapshot, allowed);
    if ("failure" in parsed) return { ok: false, status: "invalid", manifestValid: true, observations: [], runner, reason: `observer returned an invalid observation (${parsed.failure})` };
    if ("discard" in parsed) continue;
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

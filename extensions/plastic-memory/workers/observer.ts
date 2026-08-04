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

const OBSERVER_SYSTEM = "Extract durable observations only. Return JSON with an exact coverageManifest echo and observations. Never invent source ids.";
const MAX_OBSERVATION_CHARS = 2_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function exactIds(actual: unknown, expected: readonly string[]): actual is string[] {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((id, index) => id === expected[index]);
}
function exactManifest(value: unknown, snapshot: CompletedTurnSnapshot, binding: SessionBinding): boolean {
  const manifest = record(value);
  return Boolean(manifest
    && manifest.snapshotId === snapshot.snapshotId
    && manifest.cycleId === snapshot.cycleId
    && manifest.sourceDigest === snapshot.span.sourceDigest
    && manifest.completedTurnEndId === snapshot.span.completedTurnEndId
    && exactIds(manifest.sourceEntryIds, snapshot.span.sourceEntryIds)
    && manifest.sessionId === binding.sessionId
    && manifest.generation === binding.generation
    && manifest.branchId === binding.branchId);
}
function responseManifest(value: Record<string, unknown>): unknown {
  return value.coverageManifest ?? value.manifest ?? value.coverage;
}
function clean(value: string, maximum: number): string {
  return scrubSensitiveText(value).replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, maximum);
}
function sourceIds(value: unknown, allowed: readonly string[]): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || !value.every((id) => typeof id === "string")) return undefined;
  const positions = new Map(allowed.map((id, index) => [id, index]));
  if (value.some((id) => !positions.has(id))) return undefined;
  const ids = value as string[];
  if (new Set(ids).size !== ids.length) return undefined;
  if (ids.some((id, index) => index > 0 && (positions.get(id)! <= positions.get(ids[index - 1])!))) return undefined;
  return ids;
}
function asObservation(value: unknown, binding: SessionBinding, snapshot: CompletedTurnSnapshot): Observation | undefined {
  const source = record(value);
  if (!source || typeof source.content !== "string" || !source.content.trim() || typeof source.timestamp !== "string") return undefined;
  const relevance = source.relevance;
  if (relevance !== "low" && relevance !== "medium" && relevance !== "high" && relevance !== "critical") return undefined;
  const ids = sourceIds(source.sourceEntryIds, snapshot.span.sourceEntryIds);
  if (!ids) return undefined;
  const content = clean(source.content, MAX_OBSERVATION_CHARS);
  if (!content) return undefined;
  const id = typeof source.id === "string" && /^pm:o:[a-f0-9]{24}:[a-f0-9]{24}$/u.test(source.id)
    ? source.id
    : makeObservationId(binding.sessionId, recordDigest(binding.sessionId, snapshot.snapshotId, content));
  return { id, content, timestamp: clean(source.timestamp, 64), relevance, sourceEntryIds: ids, tokenCount: Math.max(1, Math.ceil(content.length / 4)) };
}
function promptFor(input: ObserverInput): string {
  return JSON.stringify({
    binding: input.binding,
    snapshot: { ...input.snapshot, sourceEntries: input.sourceEntries },
    priorObservations: (input.priorObservations ?? []).slice(-200),
    priorReflections: (input.priorReflections ?? []).slice(-200),
    output: { coverageManifest: "must exactly echo snapshot identity and ordered sourceEntryIds", observations: "array; may be empty only for exact full-span empty-valid result" },
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
  if (!output || !exactManifest(responseManifest(output), input.snapshot, input.binding)) {
    return { ok: false, status: "invalid", manifestValid: false, observations: [], runner, reason: "observer coverage manifest is missing, reordered, or identity-mismatched" };
  }
  if (output.status !== undefined && output.status !== "complete" && output.status !== "empty-valid") {
    return { ok: false, status: "invalid", manifestValid: true, observations: [], runner, reason: "observer reported partial coverage" };
  }
  if (!Array.isArray(output.observations)) return { ok: false, status: "invalid", manifestValid: true, observations: [], runner, reason: "observer observations are not an array" };
  const observations: Observation[] = [];
  for (const candidate of output.observations) {
    const observation = asObservation(candidate, input.binding, input.snapshot);
    if (!observation) return { ok: false, status: "invalid", manifestValid: true, observations: [], runner, reason: "observer returned an invalid observation" };
    observations.push(observation);
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

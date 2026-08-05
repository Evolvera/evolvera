import { makeReflectionId, recordDigest } from "../common/ids.ts";
import { scrubSensitiveText } from "../common/safety.ts";
import { makePlasticEntry } from "../session/ledger.ts";
import { PLASTIC_REFLECTIONS_RECORDED, type Observation, type PlasticEntry, type Reflection, type SessionBinding } from "../session/types.ts";
import type { CompletedTurnSnapshot } from "../session/cycles.ts";
import { runBoundedRole, type RunnerResult, type RunnerRuntime } from "./runner.ts";

export type ReflectorInput = Readonly<{
  binding: SessionBinding;
  snapshot: CompletedTurnSnapshot;
  observations: Observation[];
  priorReflections?: Reflection[];
  runtime: RunnerRuntime;
  signal?: AbortSignal;
}>;
export type ReflectorResult = Readonly<{
  ok: boolean;
  status: "complete" | "empty-valid" | "invalid" | "failed" | "stale";
  manifestValid: boolean;
  reflections: Reflection[];
  record?: PlasticEntry<"plastic.reflections.recorded">;
  runner?: RunnerResult;
  reason?: string;
}>;

const REFLECTOR_SYSTEM = "Crystallize durable reflections from observations. Return JSON with the scalar coverageManifest identity fields (omit sourceEntryIds) and supporting observation ids. Do not close source coverage.";
const MAX_REFLECTION_CHARS = 2_000;

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
function manifest(value: unknown, snapshot: CompletedTurnSnapshot, binding: SessionBinding): boolean {
  const source = record(value);
  return Boolean(source
    && source.snapshotId === snapshot.snapshotId && source.cycleId === snapshot.cycleId
    && source.sourceDigest === snapshot.span.sourceDigest && source.completedTurnEndId === snapshot.span.completedTurnEndId
    && manifestIds(source.sourceEntryIds, snapshot.span.sourceEntryIds)
    && source.sessionId === binding.sessionId && source.generation === binding.generation && source.branchId === binding.branchId);
}
function clean(value: string, maximum: number): string {
  return scrubSensitiveText(value).replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, maximum);
}
function supportIds(value: unknown, allowed: readonly string[]): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || !value.every((id) => typeof id === "string")) return undefined;
  const positions = new Map(allowed.map((id, index) => [id, index]));
  const ids = value as string[];
  if (ids.some((id) => !positions.has(id))) return undefined;
  // Membership in the allowed observation ids is the invariant; citation order is not a security property, so dedupe (first wins) and canonicalize by position.
  return [...new Set(ids)].sort((left, right) => positions.get(left)! - positions.get(right)!);
}
function asReflection(value: unknown, binding: SessionBinding, snapshot: CompletedTurnSnapshot, allowed: readonly string[]): Reflection | undefined {
  const source = record(value);
  if (!source || typeof source.content !== "string" || !source.content.trim()) return undefined;
  const ids = supportIds(source.supportingObservationIds, allowed);
  if (!ids) return undefined;
  const content = clean(source.content, MAX_REFLECTION_CHARS);
  if (!content || /[\r\n]/u.test(content)) return undefined;
  const id = typeof source.id === "string" && /^pm:r:[a-f0-9]{24}:[a-f0-9]{24}$/u.test(source.id)
    ? source.id
    : makeReflectionId(binding.sessionId, recordDigest(binding.sessionId, snapshot.snapshotId, content));
  return { id, content, supportingObservationIds: ids, tokenCount: Math.max(1, Math.ceil(content.length / 4)) };
}
function promptFor(input: ReflectorInput): string {
  return JSON.stringify({
    binding: input.binding,
    snapshot: input.snapshot,
    observations: input.observations,
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
      reflections: {
        type: "array",
        empty: "use [] when there is nothing durable to record",
        item: {
          content: "non-empty string",
          supportingObservationIds: "non-empty subset of the listed observation ids; order does not matter and duplicates are normalized by code",
          id: "optional; if supplied, pm:r:<24 lowercase hex>:<24 lowercase hex>",
        },
      },
    },
  });
}

/** Run reflection only for the exact observer snapshot; reflection prose never proves coverage. */
export async function runReflector(input: ReflectorInput): Promise<ReflectorResult> {
  if (input.observations.length === 0) return { ok: true, status: "empty-valid", manifestValid: true, reflections: [] };
  const runner = await runBoundedRole({
    role: "reflector",
    prompt: promptFor(input),
    systemPrompt: REFLECTOR_SYSTEM,
    runtime: input.runtime,
    signal: input.signal,
    inputTokens: input.snapshot.tokenCount + 2_048,
  });
  if (!runner.ok) return { ok: false, status: runner.reason === "aborted" || runner.reason === "timeout" ? "stale" : "failed", manifestValid: false, reflections: [], runner, reason: runner.reason };
  const output = record(runner.response);
  if (!output || !manifest(output.coverageManifest ?? output.manifest ?? output.coverage, input.snapshot, input.binding)) {
    return { ok: false, status: "invalid", manifestValid: false, reflections: [], runner, reason: "reflector coverage manifest is missing, reordered, or identity-mismatched" };
  }
  if (output.status !== undefined && output.status !== "complete" && output.status !== "empty-valid") {
    return { ok: false, status: "invalid", manifestValid: true, reflections: [], runner, reason: "reflector reported partial coverage" };
  }
  if (!Array.isArray(output.reflections)) return { ok: false, status: "invalid", manifestValid: true, reflections: [], runner, reason: "reflector reflections are not an array" };
  const allowed = input.observations.map((observation) => observation.id);
  const reflections: Reflection[] = [];
  for (const candidate of output.reflections) {
    const reflection = asReflection(candidate, input.binding, input.snapshot, allowed);
    if (!reflection) return { ok: false, status: "invalid", manifestValid: true, reflections: [], runner, reason: "reflector returned an invalid reflection" };
    reflections.push(reflection);
  }
  const normalized = [...new Map(reflections.map((reflection) => [reflection.id, reflection])).values()];
  const recordEntry = normalized.length > 0 ? makePlasticEntry(PLASTIC_REFLECTIONS_RECORDED, {
    schemaVersion: 1,
    ...input.binding,
    reflections: normalized,
    span: input.snapshot.span,
  }) : undefined;
  return { ok: true, status: normalized.length > 0 ? "complete" : "empty-valid", manifestValid: true, reflections: normalized, record: recordEntry, runner };
}

export const reflectSnapshot = runReflector;
export const buildReflectorRequest = promptFor;

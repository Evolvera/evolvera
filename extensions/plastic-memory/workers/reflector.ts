import { makeReflectionId, recordDigest } from "../common/ids.ts";
import { scrubSensitiveText } from "../common/safety.ts";
import { makePlasticEntry } from "../session/ledger.ts";
import { PLASTIC_REFLECTIONS_RECORDED, type Observation, type PlasticEntry, type Reflection, type SessionBinding } from "../session/types.ts";
import type { CompletedTurnSnapshot } from "../session/cycles.ts";
import { runBoundedRole, type ModelTarget, type RunnerResult, type RunnerRuntime } from "./runner.ts";

export type ReflectorInput = Readonly<{
  binding: SessionBinding;
  snapshot: CompletedTurnSnapshot;
  observations: Observation[];
  priorReflections?: Reflection[];
  runtime: RunnerRuntime;
  signal?: AbortSignal;
  model?: ModelTarget;
  deadlineMs?: number;
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

const REFLECTOR_SYSTEM = "Crystallize durable reflections from observations. Return one JSON object containing semantic reflections and exact supporting observation citations. Do not return lifecycle identity, record ids, or a coverage manifest.";
const MAX_REFLECTION_CHARS = 2_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
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
  // Model-provided ids are never authoritative; reflection identity is code-owned.
  const id = makeReflectionId(binding.sessionId, recordDigest(binding.sessionId, { snapshotId: snapshot.snapshotId, supportingObservationIds: ids }, content));
  return { id, content, supportingObservationIds: ids, tokenCount: Math.max(1, Math.ceil(content.length / 4)) };
}
function promptFor(input: ReflectorInput): string {
  return JSON.stringify({
    observations: input.observations,
    priorReflections: (input.priorReflections ?? []).slice(-200),
    output: {
      response: "single JSON object only; no prose, markdown fence, or trailing commentary",
      reflections: {
        type: "array",
        empty: "use [] when there is nothing durable to record",
        item: {
          content: "non-empty string",
          supportingObservationIds: "non-empty subset of the listed observation ids; order does not matter and duplicates are normalized by code",
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
    model: input.model,
    deadlineMs: input.deadlineMs,
  });
  if (!runner.ok) return { ok: false, status: runner.reason === "aborted" || runner.reason === "timeout" ? "stale" : "failed", manifestValid: true, reflections: [], runner, reason: runner.reason };
  const output = record(runner.response);
  if (!output) return { ok: false, status: "invalid", manifestValid: true, reflections: [], runner, reason: "reflector response is not a semantic object" };
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

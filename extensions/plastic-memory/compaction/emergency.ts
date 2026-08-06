import { makeCycleId, recordDigest } from "../common/ids.ts";
import { sourceDigest, hasOrderedContextTail, isSourceEntry } from "../session/ledger.ts";
import { createCompletedTurnSnapshot, isTerminalAssistantEntry, partitionCompletedTurnSnapshot } from "../session/cycles.ts";
import type { CycleSourceFacts, SourceSpanFactsInput } from "./extract.ts";
import { extractSourceSpanFacts } from "./extract.ts";
import { finalizeEmergencyCompaction, physicalBudgetFits, validateClosedCycleSet, type CycleInput, type EngineResult, type PhysicalBudget, type PreparedCompaction } from "./engine.ts";
import { buildLunaRequest, projectSnapshot, type CumulativeState, type ProjectSnapshot } from "./render.ts";
import { makePlasticEntry } from "../session/ledger.ts";
import { PLASTIC_OBSERVATIONS_RECORDED, PLASTIC_REFLECTIONS_RECORDED, type Observation, type PlasticEntry, type Reflection, type SessionBinding, type SessionEntry } from "../session/types.ts";
import type { CompletedTurnSnapshot, SnapshotChunk } from "../session/cycles.ts";
import { observerRequestFits, runObserver } from "../workers/observer.ts";
import { runReflector } from "../workers/reflector.ts";
import { buildCompactorRequest } from "../workers/compactor.ts";
import { buildEmergencyModelTargets, runBoundedRole, type LunaModel, type RunnerRuntime } from "../workers/runner.ts";

export type EmergencyInput = Readonly<{
  binding: SessionBinding;
  branchEntries: SessionEntry[];
  activeEntryIds: string[];
  cycles: CycleInput[];
  physicalBudget: PhysicalBudget;
  activeMemoryIds?: string[];
}>;

export type TransientEmergencyUnit = Readonly<CycleSourceFacts & {
  kind: "transient-emergency";
  snapshotId: string;
}>;

export type EmergencySelection = Readonly<{
  unit: TransientEmergencyUnit;
  firstKeptEntryId: string;
  removedEntryIds: string[];
  retainedEntryIds: string[];
  removedTokens: number;
  maxRemovedTokens: number;
}>;

function message(entry: SessionEntry): Record<string, unknown> | undefined {
  return entry.message !== null && typeof entry.message === "object" ? entry.message as Record<string, unknown> : undefined;
}
function safeUser(entry: SessionEntry | undefined): boolean {
  return entry?.type === "message" && message(entry)?.role === "user";
}
function tokenValue(budget: PhysicalBudget, entry: SessionEntry): number | undefined {
  if (typeof entry.id !== "string" || !Object.hasOwn(budget.entryTokens, entry.id)) return undefined;
  const value = budget.entryTokens[entry.id];
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
function sumTokens(budget: PhysicalBudget, entries: readonly SessionEntry[]): number | undefined {
  let total = 0;
  for (const entry of entries) {
    const value = tokenValue(budget, entry);
    if (value === undefined || !Number.isSafeInteger(total + value)) return undefined;
    total += value;
  }
  return total;
}
function transientSpan(binding: SessionBinding, sourceEntries: readonly SessionEntry[]): SourceSpanFactsInput | undefined {
  const sourceEntryIds = sourceEntries.flatMap((entry) => typeof entry.id === "string" ? [entry.id] : []);
  const sourceStartId = sourceEntryIds[0];
  const sourceEndId = sourceEntryIds.at(-1);
  if (!sourceStartId || !sourceEndId) return undefined;
  const span = {
    sourceEntryIds,
    sourceDigest: sourceDigest([...sourceEntries]),
    sourceStartId,
    sourceEndId,
    completedTurnEndId: sourceEndId,
  };
  const snapshotId = recordDigest(binding.sessionId, { generation: binding.generation, branchId: binding.branchId }, {
    binding,
    span,
    completedTurnBoundary: span.completedTurnEndId,
  });
  return { ...span, cycleId: makeCycleId(binding.sessionId, snapshotId) };
}
function validBudget(budget: PhysicalBudget): boolean {
  return Number.isSafeInteger(budget.contextWindow) && budget.contextWindow > 0
    && Number.isSafeInteger(budget.fixedTokens) && budget.fixedTokens >= 0
    && budget.entryTokens !== null && typeof budget.entryTokens === "object";
}

/** Select the largest safe transient prefix; this function never appends or persists a record. */
export function selectEmergencyWindow(input: EmergencyInput): EmergencySelection | undefined {
  if (!validBudget(input.physicalBudget) || !hasOrderedContextTail(input.branchEntries)) return undefined;
  const branchIds = new Set(input.branchEntries.map((entry) => entry.id));
  const activeIds = new Set(input.activeEntryIds);
  if (input.activeEntryIds.some((id) => typeof id !== "string" || !branchIds.has(id)) || activeIds.size !== input.activeEntryIds.length) return undefined;
  const validated = validateClosedCycleSet({ binding: input.binding, branchEntries: input.branchEntries, cycles: input.cycles });
  if (!validated) return undefined;
  const sourceEntries = input.branchEntries.filter(isSourceEntry);
  const snapshot = createCompletedTurnSnapshot({ binding: input.binding, sourceEntries });
  if (snapshot.span.sourceEntryIds.length === 0) return undefined;
  const completed = sourceEntries.slice(0, snapshot.span.sourceEntryIds.length);
  const partition = partitionCompletedTurnSnapshot(snapshot, completed, Number.MAX_SAFE_INTEGER);
  if (!partition.ok) return undefined;
  const sourcePositions = new Map(sourceEntries.map((entry, index) => [entry.id!, index]));
  const newestProtectedStart = validated.cycles.length > 2
    ? sourcePositions.get(validated.cycles.at(-2)!.sourceStartId)
    : undefined;
  const maxRemovedTokens = Math.floor(input.physicalBudget.contextWindow * 3 / 5);
  const candidates: { firstKept: SessionEntry; sourcePrefix: SessionEntry[]; removed: SessionEntry[]; removedTokens: number }[] = [];

  for (let terminalIndex = 0; terminalIndex < completed.length; terminalIndex += 1) {
    if (!isTerminalAssistantEntry(completed[terminalIndex])) continue;
    const nextSource = sourceEntries[terminalIndex + 1];
    if (!safeUser(nextSource) || (activeIds.size > 0 && !activeIds.has(nextSource.id))) continue;
    const nextBranchIndex = input.branchEntries.findIndex((entry) => entry.id === nextSource.id);
    if (nextBranchIndex < 0) continue;
    if (newestProtectedStart !== undefined && terminalIndex + 1 > newestProtectedStart) continue;
    const removed = input.branchEntries.slice(0, nextBranchIndex);
    const retained = input.branchEntries.slice(nextBranchIndex);
    const removedTokens = sumTokens(input.physicalBudget, removed);
    const retainedTokens = sumTokens(input.physicalBudget, retained);
    if (removedTokens === undefined || retainedTokens === undefined || removedTokens <= 0 || removedTokens > maxRemovedTokens) continue;
    if (!physicalBudgetFits(input.physicalBudget, input.branchEntries, nextSource, 0)) continue;
    const prefix = completed.slice(0, terminalIndex + 1);
    // A cycle boundary can only be represented by a complete source prefix. The
    // partition above also rejects malformed or split tool exchanges before it.
    if (prefix.length === 0 || prefix.at(-1)?.id !== completed[terminalIndex].id) continue;
    candidates.push({ firstKept: nextSource, sourcePrefix: prefix, removed, removedTokens });
  }
  const selected = candidates.sort((left, right) => left.removedTokens - right.removedTokens).at(-1);
  if (!selected) return undefined;
  const span = transientSpan(input.binding, selected.sourcePrefix);
  if (!span) return undefined;
  const facts = extractSourceSpanFacts(span, input.branchEntries, input.activeMemoryIds ?? []);
  if (!facts) return undefined;
  const sourceSpan = {
    sourceEntryIds: span.sourceEntryIds,
    sourceDigest: span.sourceDigest,
    sourceStartId: span.sourceStartId,
    sourceEndId: span.sourceEndId,
    completedTurnEndId: span.completedTurnEndId,
  };
  const snapshotId = recordDigest(input.binding.sessionId, { generation: input.binding.generation, branchId: input.binding.branchId }, {
    binding: input.binding,
    span: sourceSpan,
    completedTurnBoundary: span.completedTurnEndId,
  });
  const unit: TransientEmergencyUnit = Object.freeze({ ...facts, kind: "transient-emergency", snapshotId });
  return Object.freeze({
    unit,
    firstKeptEntryId: selected.firstKept.id!,
    removedEntryIds: selected.removed.map((entry) => entry.id!),
    retainedEntryIds: input.branchEntries.slice(input.branchEntries.findIndex((entry) => entry.id === selected.firstKept.id)).map((entry) => entry.id!),
    removedTokens: selected.removedTokens,
    maxRemovedTokens,
  });
}

export const selectEmergencyCompaction = selectEmergencyWindow;
export const selectEmergencyCut = selectEmergencyWindow;

export type EmergencyPipelineInput = Readonly<{
  selection: EmergencySelection;
  binding: SessionBinding;
  branchEntries: SessionEntry[];
  runtime: RunnerRuntime;
  visibleModel?: LunaModel;
  priorState?: CumulativeState;
  projectSnapshot: ProjectSnapshot | unknown;
  runtimeToken?: string;
  now?: number;
  signal?: AbortSignal;
  deadlineMs?: number;
}>;
export type EmergencyPipelineSuccess = Readonly<{
  ok: true;
  cancel: false;
  records: PlasticEntry[];
  observations: Observation[];
  reflections: Reflection[];
  prepared: PreparedCompaction;
  rendered: PreparedCompaction["rendered"];
  pending: PreparedCompaction["pending"];
}>;
export type EmergencyPipelineFailure = Readonly<{
  ok: false;
  cancel: true;
  reason: "emergency semantic pipeline failed" | "emergency semantic pipeline aborted";
}>;
export type EmergencyPipelineResult = EmergencyPipelineSuccess | EmergencyPipelineFailure;

type CompactorResponse = { summary?: unknown; state?: unknown; details?: unknown };

function responseObject(value: unknown): CompactorResponse | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output = value as Record<string, unknown>;
  const nested = output.result;
  if (nested !== null && typeof nested === "object" && !Array.isArray(nested)) return nested as CompactorResponse;
  return output;
}
function remainingDeadline(startedAt: number, maximum: number): number {
  return Math.max(0, maximum - (Date.now() - startedAt));
}
function sourceEntriesFor(selection: EmergencySelection, branchEntries: readonly SessionEntry[]): SessionEntry[] | undefined {
  const byId = new Map(branchEntries.flatMap((entry) => typeof entry.id === "string" ? [[entry.id, entry] as const] : []));
  const entries = selection.unit.sourceEntryIds.map((id) => byId.get(id));
  return entries.every((entry): entry is SessionEntry => Boolean(entry)) ? entries : undefined;
}
function observerRecord(binding: SessionBinding, snapshot: CompletedTurnSnapshot, observations: Observation[]): PlasticEntry | undefined {
  return observations.length === 0 ? undefined : makePlasticEntry(PLASTIC_OBSERVATIONS_RECORDED, {
    schemaVersion: 1,
    ...binding,
    observations,
    span: snapshot.span,
  });
}
function reflectorRecord(binding: SessionBinding, snapshot: CompletedTurnSnapshot, reflections: Reflection[]): PlasticEntry | undefined {
  return reflections.length === 0 ? undefined : makePlasticEntry(PLASTIC_REFLECTIONS_RECORDED, {
    schemaVersion: 1,
    ...binding,
    reflections,
    span: snapshot.span,
  });
}
function aborted(signal: AbortSignal | undefined): boolean { return signal?.aborted === true; }

/**
 * Prepare one selected emergency span using only the existing semantic workers.
 * Selection, source entries, chunks, project input, and prior state are captured
 * before model work; no record or pending store is mutated here.
 */
export async function prepareEmergencyCompaction(input: EmergencyPipelineInput): Promise<EmergencyPipelineResult> {
  const maximum = Math.min(60_000, Math.max(0, Number.isFinite(input.deadlineMs ?? 60_000) ? input.deadlineMs ?? 60_000 : 0));
  const startedAt = Date.now();
  const fail = (): EmergencyPipelineFailure => ({
    ok: false,
    cancel: true,
    reason: aborted(input.signal) ? "emergency semantic pipeline aborted" : "emergency semantic pipeline failed",
  });
  if (aborted(input.signal) || maximum <= 0) return fail();

  let capturedEntries: SessionEntry[];
  let sourceEntries: SessionEntry[] | undefined;
  let snapshot: CompletedTurnSnapshot;
  let capturedProject: ProjectSnapshot;
  try {
    capturedEntries = input.branchEntries.map((entry) => structuredClone(entry));
    sourceEntries = sourceEntriesFor(input.selection, capturedEntries);
    const firstKeptIndex = capturedEntries.findIndex((entry) => entry.id === input.selection.firstKeptEntryId);
    const capturedIds = capturedEntries.map((entry) => entry.id);
    const removedIds = capturedEntries.slice(0, firstKeptIndex).map((entry) => entry.id);
    const retainedIds = capturedEntries.slice(firstKeptIndex).map((entry) => entry.id);
    const sourcePrefixIds = capturedEntries.slice(0, firstKeptIndex).filter(isSourceEntry).map((entry) => entry.id);
    if (!sourceEntries || sourceEntries.length === 0 || firstKeptIndex <= 0
      || JSON.stringify(removedIds) !== JSON.stringify(input.selection.removedEntryIds)
      || JSON.stringify(retainedIds) !== JSON.stringify(input.selection.retainedEntryIds)
      || JSON.stringify(sourcePrefixIds) !== JSON.stringify(input.selection.unit.sourceEntryIds)
      || capturedIds.some((id) => typeof id !== "string")) return fail();
    snapshot = createCompletedTurnSnapshot({ binding: input.binding, sourceEntries });
    if (snapshot.snapshotId !== input.selection.unit.snapshotId || snapshot.cycleId !== input.selection.unit.cycleId || snapshot.status !== "ready") return fail();
    capturedProject = projectSnapshot(input.projectSnapshot);
  } catch {
    return fail();
  }
  const capturedSelection = input.selection;
  const capturedSourceEntries = sourceEntries;
  if (!capturedSourceEntries) return fail();
  const capturedPriorState = input.priorState;
  const chunksInput = {
    binding: snapshot.binding,
    snapshot,
    runtime: input.runtime,
    signal: input.signal,
  };
  const partition = partitionCompletedTurnSnapshot(snapshot, capturedSourceEntries, 160_000, (chunk: SnapshotChunk) => observerRequestFits({
    ...chunksInput,
    sourceEntries: chunk.entries,
    sourceEntryIds: chunk.sourceEntryIds,
  }));
  if (!partition.ok || partition.chunks.length === 0) return fail();
  const chunks = partition.chunks.map((chunk) => Object.freeze({ ...chunk, entries: Object.freeze([...chunk.entries]), sourceEntryIds: Object.freeze([...chunk.sourceEntryIds]) }));
  const targets = buildEmergencyModelTargets(input.visibleModel);

  let observations: Observation[] | undefined;
  for (const target of targets) {
    if (aborted(input.signal) || remainingDeadline(startedAt, maximum) <= 0) return fail();
    const candidate: Observation[] = [];
    let valid = true;
    for (const chunk of chunks) {
      const result = await runObserver({
        binding: snapshot.binding,
        snapshot,
        sourceEntries: [...chunk.entries],
        sourceEntryIds: [...chunk.sourceEntryIds],
        runtime: input.runtime,
        signal: input.signal,
        model: target,
        deadlineMs: remainingDeadline(startedAt, maximum),
      });
      if (aborted(input.signal)) return fail();
      if (!result.ok || !result.manifestValid) { valid = false; break; }
      candidate.push(...result.observations);
    }
    if (valid) {
      observations = [...new Map(candidate.map((observation) => [observation.id, observation])).values()];
      break;
    }
  }
  if (!observations) return fail();

  let reflections: Reflection[] | undefined;
  if (observations.length === 0) {
    reflections = [];
  } else {
    for (const target of targets) {
      if (aborted(input.signal) || remainingDeadline(startedAt, maximum) <= 0) return fail();
      const result = await runReflector({
        binding: snapshot.binding,
        snapshot,
        observations: [...observations],
        runtime: input.runtime,
        signal: input.signal,
        model: target,
        deadlineMs: remainingDeadline(startedAt, maximum),
      });
      if (aborted(input.signal)) return fail();
      if (result.ok && result.manifestValid) {
        reflections = [...result.reflections];
        break;
      }
    }
  }
  if (!reflections) return fail();

  const request = buildLunaRequest([capturedSelection.unit], capturedPriorState, capturedProject, capturedSelection.unit.facts);
  const prompt = buildCompactorRequest(request);
  let prepared: PreparedCompaction | undefined;
  for (const target of targets) {
    if (aborted(input.signal) || remainingDeadline(startedAt, maximum) <= 0) return fail();
    const runner = await runBoundedRole({
      role: "compactor",
      prompt,
      runtime: input.runtime,
      signal: input.signal,
      model: target,
      deadlineMs: remainingDeadline(startedAt, maximum),
      inputTokens: Math.ceil(JSON.stringify(request).length / 4) + 2_048,
    });
    if (aborted(input.signal)) return fail();
    if (!runner.ok) continue;
    const response = responseObject(runner.response);
    if (!response || typeof response.summary !== "string" || response.summary.trim().length === 0) continue;
    const result: EngineResult = finalizeEmergencyCompaction({
      binding: snapshot.binding,
      branchEntries: capturedEntries,
      firstKeptEntryId: capturedSelection.firstKeptEntryId,
      sourceFacts: [capturedSelection.unit],
      observations: [...observations],
      reflections: [...reflections],
      priorState: capturedPriorState,
      projectSnapshot: capturedProject,
      runtimeToken: input.runtimeToken,
      now: input.now,
      compact: () => response,
    });
    if (result.eligible) {
      prepared = result.prepared;
      break;
    }
  }
  if (!prepared) return fail();
  const records = [observerRecord(snapshot.binding, snapshot, observations), reflectorRecord(snapshot.binding, snapshot, reflections)]
    .filter((record): record is PlasticEntry => Boolean(record));
  return {
    ok: true,
    cancel: false,
    records,
    observations,
    reflections,
    prepared,
    rendered: prepared.rendered,
    pending: prepared.pending,
  };
}

export const runEmergencyCompaction = prepareEmergencyCompaction;
export const prepareEmergencySemanticCompaction = prepareEmergencyCompaction;

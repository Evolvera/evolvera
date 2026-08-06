import { makeCycleId, recordDigest } from "../common/ids.ts";
import { sourceDigest, hasOrderedContextTail, isSourceEntry } from "../session/ledger.ts";
import { createCompletedTurnSnapshot, isTerminalAssistantEntry, partitionCompletedTurnSnapshot } from "../session/cycles.ts";
import type { CycleSourceFacts, SourceSpanFactsInput } from "./extract.ts";
import { extractSourceSpanFacts } from "./extract.ts";
import { physicalBudgetFits, validateClosedCycleSet, type CycleInput, type PhysicalBudget } from "./engine.ts";
import type { SessionBinding, SessionEntry } from "../session/types.ts";

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

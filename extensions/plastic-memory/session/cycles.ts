import { makeAttemptId, makeCycleId, recordDigest } from "../common/ids.ts";
import { digestParts } from "../common/safety.ts";
import {
  PLASTIC_CYCLE_ATTEMPTED,
  PLASTIC_CYCLE_CLOSED,
  SCHEMA_VERSION,
  isPlasticRecord,
  isSourceSpan,
  type CycleAttemptedData,
  type CycleClosedData,
  type PlasticEntry,
  type SessionBinding,
  type SessionEntry,
  type SourceSpan,
} from "./types.ts";
import { makePlasticEntry, sourceDigest as digestSourceEntries } from "./ledger.ts";

export type SnapshotStatus = "ready" | "empty-valid" | "oversized";
export type CompletedTurnSnapshot = {
  snapshotId: string;
  cycleId: string;
  binding: SessionBinding;
  span: SourceSpan;
  tokenCount: number;
  status: SnapshotStatus;
};
export type SnapshotInput = {
  binding: SessionBinding;
  sourceEntries: SessionEntry[];
  /** IDs from bootstrap.activeEntryIds. If supplied, anything outside it is rejected. */
  activeEntryIds?: string[];
  maxTokens?: number;
};
export type AttemptDecision = {
  allowed: boolean;
  reason?: "already-closed" | "pending" | "automatic-retry-exhausted" | "unchanged-failed-snapshot" | "oversized";
  record?: PlasticEntry<"plastic.cycle.attempted">;
};
export type AttemptOutcome = CycleAttemptedData["outcome"];
export type CycleOutcome = {
  outcome: "complete" | "empty-valid" | "partial" | "oversized" | "failed" | "stale";
  sourceEntryIds: string[];
  sourceStartId?: string;
  sourceEndId?: string;
  sourceDigest: string;
  completedTurnEndId?: string;
  observationIds?: string[];
  reflectionIds?: string[];
};

function entryText(entry: SessionEntry): string {
  const message = entry.message as { content?: unknown } | undefined;
  const content = message?.content ?? entry.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === "string" ? part : (part as { text?: unknown })?.text ?? "").join(" ");
  return "";
}
function tokenCount(entry: SessionEntry): number {
  const explicit = entry.tokenCount;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit >= 0) return explicit;
  return Math.ceil(entryText(entry).length / 4);
}
function isToolCallContentPart(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (value as { type?: unknown }).type === "toolCall";
}

/** A tool-call assistant is an in-progress turn until a later terminal assistant arrives. */
export function isTerminalAssistantEntry(entry: SessionEntry): boolean {
  if (entry.type !== "message") return false;
  const message = entry.message as {
    role?: unknown;
    content?: unknown;
    stopReason?: unknown;
    stop_reason?: unknown;
  } | undefined;
  if (message?.role !== "assistant") return false;
  const content = message.content ?? entry.content;
  if (Array.isArray(content) && content.some(isToolCallContentPart)) return false;
  const stopReason = message.stopReason ?? message.stop_reason;
  return stopReason !== "toolUse";
}
function spanFor(entries: SessionEntry[]): SourceSpan {
  const ids = entries.flatMap((entry) => typeof entry.id === "string" ? [entry.id] : []);
  const end = ids.at(-1) ?? "";
  return {
    sourceStartId: ids[0] ?? "",
    sourceEndId: end,
    sourceEntryIds: ids,
    sourceDigest: digestSourceEntries(entries),
    completedTurnEndId: end,
  };
}
function sameBinding(left: SessionBinding, right: SessionBinding): boolean {
  return left.sessionId === right.sessionId && left.generation === right.generation && left.branchId === right.branchId;
}
function sameSpan(left: SourceSpan, right: SourceSpan): boolean {
  return left.sourceStartId === right.sourceStartId && left.sourceEndId === right.sourceEndId
    && left.completedTurnEndId === right.completedTurnEndId && left.sourceDigest === right.sourceDigest
    && left.sourceEntryIds.length === right.sourceEntryIds.length
    && left.sourceEntryIds.every((id, index) => id === right.sourceEntryIds[index]);
}
function recordForSnapshot(snapshot: CompletedTurnSnapshot, outcome: AttemptOutcome, attemptCount: number, attemptId: string, phase: CycleAttemptedData["phase"], suppressionReason?: CycleAttemptedData["suppressionReason"]): PlasticEntry<"plastic.cycle.attempted"> {
  const data: CycleAttemptedData = {
    schemaVersion: SCHEMA_VERSION,
    ...snapshot.binding,
    ...snapshot.span,
    cycleId: snapshot.cycleId,
    attemptId,
    snapshotId: snapshot.snapshotId,
    phase,
    outcome,
    attemptCount,
    ...(suppressionReason ? { suppressionReason } : {}),
  };
  return makePlasticEntry(PLASTIC_CYCLE_ATTEMPTED, data);
}
function attemptsFor(snapshot: CompletedTurnSnapshot, records: SessionEntry[]): CycleAttemptedData[] {
  const latestByAttempt = new Map<string, CycleAttemptedData>();
  for (const entry of records) {
    if (!isPlasticRecord(entry) || entry.customType !== PLASTIC_CYCLE_ATTEMPTED) continue;
    const data = entry.data;
    if (data.snapshotId !== snapshot.snapshotId || !sameBinding(data, snapshot.binding) || !sameSpan(data, snapshot.span)) continue;
    latestByAttempt.set(data.attemptId, data);
  }
  return [...latestByAttempt.values()];
}

/** Build one contiguous, completed-turn opportunity from the post-bootstrap active window. */
export function createCompletedTurnSnapshot(input: SnapshotInput): CompletedTurnSnapshot {
  // An empty active window is not a restriction: a fresh-session bootstrap and every
  // post-cycle edge bootstrap carry `activeEntryIds: []`, and their sources are the
  // anchored descendants instead. Only a non-empty window bounds the snapshot.
  const allowed = input.activeEntryIds?.length ? new Set(input.activeEntryIds) : undefined;
  if (allowed && input.sourceEntries.some((entry) => typeof entry.id !== "string" || !allowed.has(entry.id))) {
    throw new Error("snapshot source is outside the active bootstrap window");
  }
  const entries = input.sourceEntries.filter((entry) => typeof entry.id === "string" && (!allowed || allowed.has(entry.id)));
  // One-shot observer bound. A single long agentic task has no completed turn until its
  // final answer, so the first observable prefix can be very large: a real 64-message audit
  // session reached ~115k tokens before its first terminal assistant and was skipped whole.
  // 160k keeps the call well inside Luna's 300k window (plus CONTEXT_OVERHEAD_TOKENS and the
  // reply) while making those sessions observable.
  const maxTokens = input.maxTokens ?? 160_000;
  // Chunk instead of dying: cover the LARGEST CONTIGUOUS PREFIX that ends at a terminal
  // assistant and fits `maxTokens`. Coverage must stay a prefix (never a suffix, never a
  // gap) because the next cycle continues from this boundary. Only when even the prefix
  // ending at the FIRST terminal assistant exceeds the bound is the window `oversized`,
  // and then the span stays the whole completed window exactly as before.
  let running = 0;
  let end = -1;
  let lastTerminal = -1;
  for (let index = 0; index < entries.length; index += 1) {
    running += tokenCount(entries[index]);
    if (!isTerminalAssistantEntry(entries[index])) continue;
    lastTerminal = index;
    if (running <= maxTokens) end = index;
  }
  const oversized = lastTerminal >= 0 && end < 0;
  const completed = oversized ? entries.slice(0, lastTerminal + 1) : end >= 0 ? entries.slice(0, end + 1) : [];
  const span = spanFor(completed);
  const snapshotPayload = {
    binding: input.binding,
    span,
    completedTurnBoundary: span.completedTurnEndId,
  };
  const snapshotId = recordDigest(input.binding.sessionId, { generation: input.binding.generation, branchId: input.binding.branchId }, snapshotPayload);
  const cycleId = makeCycleId(input.binding.sessionId, snapshotId);
  const tokenCountValue = completed.reduce((sum, entry) => sum + tokenCount(entry), 0);
  return {
    snapshotId,
    cycleId,
    binding: input.binding,
    span,
    tokenCount: tokenCountValue,
    status: completed.length === 0 ? "empty-valid" : oversized ? "oversized" : "ready",
  };
}

export const makeCompletedTurnSnapshot = createCompletedTurnSnapshot;

/** Idempotently select an attempt. A pending attempt is reused; failures permit one automatic retry. */
export function beginCycleAttempt(
  snapshot: CompletedTurnSnapshot,
  records: SessionEntry[] = [],
  options: { phase?: CycleAttemptedData["phase"]; explicitRetry?: boolean } = {},
): AttemptDecision {
  if (snapshot.status === "oversized") return { allowed: false, reason: "oversized" };
  const attempts = attemptsFor(snapshot, records);
  if (attempts.some((attempt) => attempt.outcome === "complete" || attempt.outcome === "empty-valid")) {
    return { allowed: false, reason: "already-closed" };
  }
  const pending = attempts.find((attempt) => attempt.outcome === "pending");
  if (pending) {
    return { allowed: true, reason: "pending", record: makePlasticEntry(PLASTIC_CYCLE_ATTEMPTED, pending) };
  }
  const failures = attempts.filter((attempt) => attempt.outcome === "failed" || attempt.outcome === "partial" || attempt.outcome === "stale");
  const attemptCount = attempts.reduce((max, attempt) => Math.max(max, attempt.attemptCount), -1) + 1;
  if (failures.length >= 2 && !options.explicitRetry) {
    const suppressed = recordForSnapshot(snapshot, "suppressed", attemptCount, makeAttemptId(snapshot.binding.sessionId, snapshot.snapshotId, attemptCount), options.phase ?? "observer", "automatic-retry-exhausted");
    return { allowed: false, reason: "automatic-retry-exhausted", record: suppressed };
  }
  const attemptId = makeAttemptId(snapshot.binding.sessionId, snapshot.snapshotId, attemptCount);
  return { allowed: true, record: recordForSnapshot(snapshot, "pending", attemptCount, attemptId, options.phase ?? "observer") };
}

export const selectCycleAttempt = beginCycleAttempt;

export function finishCycleAttempt(
  snapshot: CompletedTurnSnapshot,
  attempt: PlasticEntry<"plastic.cycle.attempted">,
  outcome: Exclude<AttemptOutcome, "pending" | "complete" | "empty-valid" | "suppressed">,
): PlasticEntry<"plastic.cycle.attempted"> | undefined {
  if (!isPlasticRecord(attempt) || attempt.customType !== PLASTIC_CYCLE_ATTEMPTED) return undefined;
  if (snapshot.status === "oversized") return undefined;
  if (!sameBinding(attempt.data, snapshot.binding) || attempt.data.cycleId !== snapshot.cycleId
    || attempt.data.snapshotId !== snapshot.snapshotId || !sameSpan(attempt.data, snapshot.span)) return undefined;
  return recordForSnapshot(snapshot, outcome, attempt.data.attemptCount, attempt.data.attemptId, attempt.data.phase, outcome === "stale" ? "stale-identity" : undefined);
}

/** Close only from an exact source manifest/span/digest. Model prose is never consulted. */
export function closeCycle(
  snapshot: CompletedTurnSnapshot,
  attempt: PlasticEntry<"plastic.cycle.attempted">,
  outcome: CycleOutcome,
  records: SessionEntry[] = [],
): PlasticEntry<"plastic.cycle.closed"> | undefined {
  if (!isPlasticRecord(attempt) || attempt.customType !== PLASTIC_CYCLE_ATTEMPTED) return undefined;
  if (snapshot.status === "oversized") return undefined;
  if (!sameBinding(attempt.data, snapshot.binding) || attempt.data.cycleId !== snapshot.cycleId
    || attempt.data.snapshotId !== snapshot.snapshotId || !sameSpan(attempt.data, snapshot.span)) return undefined;
  if (attempt.data.outcome !== "pending") return undefined;
  const latestAttempt = attemptsFor(snapshot, records.length > 0 ? records : [attempt]).find((candidate) => candidate.attemptId === attempt.data.attemptId);
  if (latestAttempt?.outcome !== "pending") return undefined;
  if (outcome.outcome !== "complete" && outcome.outcome !== "empty-valid") return undefined;
  const resultSpan: SourceSpan = {
    sourceStartId: outcome.sourceStartId ?? "",
    sourceEndId: outcome.sourceEndId ?? "",
    sourceEntryIds: outcome.sourceEntryIds,
    sourceDigest: outcome.sourceDigest,
    completedTurnEndId: outcome.completedTurnEndId ?? "",
  };
  if (!isSourceSpan(resultSpan) || !sameSpan(resultSpan, snapshot.span)) return undefined;
  const data: CycleClosedData = {
    schemaVersion: SCHEMA_VERSION,
    ...snapshot.binding,
    ...snapshot.span,
    cycleId: snapshot.cycleId,
    attemptId: attempt.data.attemptId,
    snapshotId: snapshot.snapshotId,
    status: outcome.outcome,
    observationIds: [...(outcome.observationIds ?? [])],
    reflectionIds: [...(outcome.reflectionIds ?? [])],
  };
  return makePlasticEntry(PLASTIC_CYCLE_CLOSED, data);
}

export const closeCompletedCycle = closeCycle;

export function isLateOutcome(snapshot: CompletedTurnSnapshot, outcome: CycleOutcome): boolean {
  return !sameSpan({
    ...snapshot.span,
    sourceEntryIds: outcome.sourceEntryIds,
    sourceStartId: outcome.sourceStartId ?? "",
    sourceEndId: outcome.sourceEndId ?? "",
    sourceDigest: outcome.sourceDigest,
    completedTurnEndId: outcome.completedTurnEndId ?? "",
  }, snapshot.span);
}

export function snapshotManifestDigest(snapshot: CompletedTurnSnapshot): string {
  return digestParts(snapshot.binding, snapshot.span.sourceEntryIds, snapshot.span.sourceDigest).slice(0, 32);
}

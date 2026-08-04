import { recordDigest } from "../common/ids.ts";
import { digestParts } from "../common/safety.ts";
import { createCompletedTurnSnapshot, isTerminalAssistantEntry, type CompletedTurnSnapshot } from "./cycles.ts";
import { foldLedger, makePlasticEntry, sourceDigest, sourceEntries } from "./ledger.ts";
import {
  PLASTIC_BACKFILL_CURSOR_RECORDED,
  SCHEMA_VERSION,
  isBackfillCursorRecord,
  type BootstrapData,
  type BackfillCursorData,
  type PlasticEntry,
  type SessionBinding,
  type SessionEntry,
} from "./types.ts";

const MAX_WINDOWS_IN_REPORT = 8;
const MAX_SOURCE_ENTRIES_PER_WINDOW = 2_000;
const MAX_WINDOW_TOKENS = 100_000;

type BackfillBootstrap = Pick<BootstrapData, "activeEntryIds" | "historicalPrefixIds" | "historicalGap">;
export type BackfillWindow = Readonly<{
  windowId: string;
  sourceEntryIds: string[];
  sourceStartId: string;
  sourceEndId: string;
  sourceDigest: string;
  completedTurnEndId: string;
  tokenCount: number;
  status: "ready" | "partial" | "oversized";
}>;
export type BackfillReport = Readonly<{
  status: "ready" | "partial" | "oversized" | "complete" | "conflict" | "unavailable";
  noWrite: true;
  branchId: string;
  historicalGap: "historical-unindexed";
  sourceDigest: string;
  cursor?: BackfillCursorData;
  nextEntryId?: string;
  safeWindows: BackfillWindow[];
  gaps: string[];
  conflicts: string[];
  cost: { windowsShown: number; sourceEntries: number; tokenCount: number; providerCalls: 0; writes: 0 };
}>;
export type BackfillRunState = Readonly<{
  windowId: string;
  attempts: number;
  outcome: "partial" | "oversized" | "failed" | "stale";
}>;
export type BackfillProcessResult = Readonly<{
  outcome: "complete" | "partial" | "oversized" | "failed" | "stale" | "paused";
  reason?: string;
}>;
export type BackfillInput = Readonly<{
  binding: SessionBinding;
  branchEntries: SessionEntry[];
  bootstrap: BackfillBootstrap;
  records?: SessionEntry[];
  append?: (entry: PlasticEntry<"plastic.backfill.cursor.recorded">) => void;
  priorRun?: BackfillRunState;
}>;
export type BackfillExecutionResult = Readonly<{
  status: "complete" | "partial" | "oversized" | "failed" | "stale" | "paused" | "suppressed" | "unavailable";
  report: BackfillReport;
  window?: BackfillWindow;
  cursor?: PlasticEntry<"plastic.backfill.cursor.recorded">;
  runState?: BackfillRunState;
  reason?: string;
}>;
export type BackfillProcessor = (window: BackfillWindow, snapshot: CompletedTurnSnapshot) => Promise<BackfillProcessResult> | BackfillProcessResult;

function ids(entries: readonly SessionEntry[]): string[] { return entries.flatMap((entry) => typeof entry.id === "string" ? [entry.id] : []); }
function tokenCount(entry: SessionEntry): number {
  const explicit = entry.tokenCount;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit >= 0) return explicit;
  const message = entry.message as { content?: unknown } | undefined;
  const content = message?.content ?? entry.content;
  return Math.ceil((typeof content === "string" ? content : JSON.stringify(content ?? "")).length / 4);
}
function sameBinding(left: BackfillCursorData, binding: SessionBinding): boolean {
  return left.sessionId === binding.sessionId && left.generation === binding.generation && left.branchId === binding.branchId;
}
function currentCursor(input: BackfillInput, branch: SessionEntry[], digest: string): BackfillCursorData | undefined {
  const candidates = [...(input.records ?? []), ...branch].filter(isBackfillCursorRecord).filter((entry) => sameBinding(entry.data, input.binding) && entry.data.sourceDigest === digest);
  return candidates.at(-1)?.data;
}
function safeHistoricalSources(input: BackfillInput, branch: SessionEntry[]): { entries: SessionEntry[]; gaps: string[]; conflicts: string[] } {
  const branchIds = new Set(ids(branch));
  const sourceById = new Map(sourceEntries(branch).flatMap((entry) => typeof entry.id === "string" ? [[entry.id, entry] as const] : []));
  const gaps: string[] = [];
  const conflicts: string[] = [];
  if (input.bootstrap.historicalGap !== "historical-unindexed") conflicts.push("unsupported bootstrap gap state");
  const historicalIds = input.bootstrap.historicalPrefixIds;
  for (const id of historicalIds) {
    if (!branchIds.has(id)) gaps.push(`historical entry is not on current branch: ${id}`);
    else if (!sourceById.has(id)) gaps.push(`historical entry is not source-renderable: ${id}`);
  }
  const ordered = historicalIds.map((id) => sourceById.get(id)).filter((entry): entry is SessionEntry => Boolean(entry));
  const positions = ordered.map((entry) => branch.indexOf(entry));
  if (positions.some((position, index) => index > 0 && position <= positions[index - 1])) conflicts.push("historical source order is not current-branch ordered");
  return { entries: ordered, gaps, conflicts };
}
function windowsFor(input: BackfillInput, historical: SessionEntry[], cursor?: BackfillCursorData): BackfillWindow[] {
  if (cursor && !cursor.nextEntryId) return [];
  const cursorIndex = cursor?.nextEntryId ? historical.findIndex((entry) => entry.id === cursor.nextEntryId) : -1;
  const start = cursor?.nextEntryId ? (cursorIndex >= 0 ? cursorIndex : historical.length) : 0;
  const windows: BackfillWindow[] = [];
  let offset = start;
  while (offset < historical.length && windows.length < MAX_WINDOWS_IN_REPORT) {
    // Scan only one bounded prospective window plus one boundary entry. A turn
    // that does not terminate in that scan is never treated as completed.
    const bounded = historical.slice(offset, offset + MAX_SOURCE_ENTRIES_PER_WINDOW);
    const boundary = historical[offset + MAX_SOURCE_ENTRIES_PER_WINDOW];
    const prospective = boundary ? [...bounded, boundary] : bounded;
    const terminalIndex = prospective.findIndex(isTerminalAssistantEntry);
    const boundedTerminalIndex = terminalIndex >= 0 && terminalIndex < bounded.length ? terminalIndex : -1;
    const entries = boundedTerminalIndex >= 0 ? bounded.slice(0, boundedTerminalIndex + 1) : bounded;
    const entryIds = ids(entries);
    const spanDigest = sourceDigest(entries);
    const snapshot = createCompletedTurnSnapshot({ binding: input.binding, sourceEntries: entries, activeEntryIds: entryIds, maxTokens: MAX_WINDOW_TOKENS });
    const oversizedByEntries = terminalIndex >= MAX_SOURCE_ENTRIES_PER_WINDOW;
    const status: BackfillWindow["status"] = oversizedByEntries
      ? "oversized"
      : boundedTerminalIndex >= 0
        ? (snapshot.status === "oversized" ? "oversized" : "ready")
        : "partial";
    const windowId = recordDigest(input.binding.sessionId, { generation: input.binding.generation, branchId: input.binding.branchId }, { sourceDigest: spanDigest, sourceEntryIds: entryIds, status });
    windows.push({ windowId, sourceEntryIds: entryIds, sourceStartId: entryIds[0] ?? "", sourceEndId: entryIds.at(-1) ?? "", sourceDigest: spanDigest, completedTurnEndId: boundedTerminalIndex >= 0 ? snapshot.span.completedTurnEndId : "", tokenCount: snapshot.tokenCount, status });
    if (status !== "ready") break;
    offset += boundedTerminalIndex + 1;
  }
  return windows;
}

/** Read-only report. It only inspects the supplied current branch and records. */
export function reportBackfill(input: BackfillInput): BackfillReport {
  if (!input || !Array.isArray(input.branchEntries)) throw new Error("backfill requires injected current-branch entries");
  const branch = foldLedger(input.branchEntries, { context: input.binding }).branch;
  const historical = safeHistoricalSources(input, branch);
  const digest = sourceDigest(historical.entries);
  const cursor = currentCursor(input, branch, digest);
  const conflicts = [...historical.conflicts];
  const staleCursor = [...(input.records ?? []), ...branch].filter(isBackfillCursorRecord).find((entry) => sameBinding(entry.data, input.binding) && entry.data.sourceDigest !== digest);
  if (staleCursor) conflicts.push("backfill cursor source digest is stale; no cursor advancement is safe");
  if (cursor?.nextEntryId && !historical.entries.some((entry) => entry.id === cursor.nextEntryId)) conflicts.push("backfill cursor next entry is not in the current historical source prefix");
  const safeWindows = conflicts.length === 0 && historical.gaps.length === 0 ? windowsFor(input, historical.entries, cursor) : [];
  if (historical.gaps.length > 0) conflicts.push("historical gaps prevent safe cursor advancement");
  const firstWindow = safeWindows[0];
  if (firstWindow?.status === "partial") historical.gaps.push("historical turn has no terminal assistant in the bounded scan");
  const tokenCountValue = safeWindows.reduce((sum, window) => sum + window.tokenCount, 0);
  const status: BackfillReport["status"] = conflicts.length > 0 ? "conflict"
    : firstWindow?.status === "partial" ? "partial"
      : firstWindow?.status === "oversized" ? "oversized"
        : safeWindows.length === 0 ? "complete" : "ready";
  const nextEntryId = safeWindows[0]?.sourceEntryIds[0];
  return {
    status, noWrite: true, branchId: input.binding.branchId, historicalGap: input.bootstrap.historicalGap, sourceDigest: digest,
    ...(cursor ? { cursor } : {}), ...(nextEntryId ? { nextEntryId } : {}), safeWindows, gaps: historical.gaps, conflicts,
    cost: { windowsShown: safeWindows.length, sourceEntries: safeWindows.reduce((sum, window) => sum + window.sourceEntryIds.length, 0), tokenCount: tokenCountValue, providerCalls: 0, writes: 0 },
  };
}
export const inspectBackfill = reportBackfill;

function cursorFor(input: BackfillInput, report: BackfillReport, window: BackfillWindow): PlasticEntry<"plastic.backfill.cursor.recorded"> {
  const historical = report.safeWindows.length > 0 ? report.safeWindows : [window];
  const allIds = historical.flatMap((item) => item.sourceEntryIds);
  const nextIndex = allIds.indexOf(window.sourceEntryIds.at(-1) ?? "") + 1;
  const nextEntryId = allIds[nextIndex];
  const data: BackfillCursorData = {
    schemaVersion: SCHEMA_VERSION, ...input.binding,
    cursorId: recordDigest(input.binding.sessionId, { generation: input.binding.generation, branchId: input.binding.branchId }, { sourceDigest: report.sourceDigest, nextEntryId: nextEntryId ?? null }),
    ...(nextEntryId ? { nextEntryId } : {}), sourceDigest: report.sourceDigest,
  };
  return makePlasticEntry(PLASTIC_BACKFILL_CURSOR_RECORDED, data);
}

/** Publish one exact completed window. It advances only after an explicit successful result. */
export function publishBackfill(input: BackfillInput, report: BackfillReport, window: BackfillWindow, result: BackfillProcessResult): BackfillExecutionResult {
  if (report.status === "conflict" || report.safeWindows[0]?.windowId !== window.windowId || window.status !== "ready") return { status: "stale", report, window, reason: "backfill report or window is stale or not publishable" };
  if (result.outcome !== "complete") return { status: result.outcome, report, window, runState: { windowId: window.windowId, attempts: (input.priorRun?.windowId === window.windowId ? input.priorRun.attempts : 0) + 1, outcome: result.outcome === "paused" ? "failed" : result.outcome }, reason: result.reason };
  if (!input.append) return { status: "failed", report, window, reason: "explicit publication requires an injected append sink" };
  const cursor = cursorFor(input, report, window);
  const existing = report.cursor !== undefined && report.cursor.nextEntryId === cursor.data.nextEntryId;
  if (!existing) input.append(cursor);
  return { status: existing ? "complete" : "complete", report, window, cursor, reason: existing ? "already-published" : undefined };
}

/** Explicit execution seam. Reporting never calls this processor; each call processes at most one window. */
export async function startBackfill(input: BackfillInput, processor: BackfillProcessor, options: { explicitRetry?: boolean } = {}): Promise<BackfillExecutionResult> {
  const report = reportBackfill(input);
  if (report.status === "conflict") return { status: "unavailable", report, reason: report.conflicts.join("; ") };
  const window = report.safeWindows[0];
  if (!window) return { status: "complete", report, reason: "no safe historical completed-turn window remains" };
  if (window.status === "oversized") return { status: "oversized", report, window, runState: { windowId: window.windowId, attempts: input.priorRun?.windowId === window.windowId ? input.priorRun.attempts : 0, outcome: "oversized" }, reason: "safe window exceeds the one-window source or token bound" };
  if (window.status === "partial") return { status: "partial", report, window, runState: { windowId: window.windowId, attempts: input.priorRun?.windowId === window.windowId ? input.priorRun.attempts : 0, outcome: "partial" }, reason: "bounded scan found no terminal assistant; cursor did not advance" };
  if (input.priorRun?.windowId === window.windowId && input.priorRun.attempts >= 2 && options.explicitRetry !== true) return { status: "suppressed", report, window, runState: input.priorRun, reason: "unchanged failed window is retry-suppressed; explicit retry is required" };
  const snapshot = createCompletedTurnSnapshot({ binding: input.binding, sourceEntries: input.branchEntries.filter((entry) => window.sourceEntryIds.includes(entry.id ?? "")), activeEntryIds: window.sourceEntryIds, maxTokens: MAX_WINDOW_TOKENS });
  let result: BackfillProcessResult;
  try { result = await processor(window, snapshot); } catch (error) { result = { outcome: "failed", reason: error instanceof Error ? error.message : String(error) }; }
  return publishBackfill(input, report, window, result);
}
export const executeBackfill = startBackfill;
export const resumeBackfill = startBackfill;
export async function retryBackfill(input: BackfillInput, processor: BackfillProcessor): Promise<BackfillExecutionResult> {
  return startBackfill(input, processor, { explicitRetry: true });
}

/** A pause is an explicit no-advance result; resume rereads the same durable cursor/window. */
export function pauseBackfill(input: BackfillInput): BackfillExecutionResult {
  const report = reportBackfill(input);
  const window = report.safeWindows[0];
  return { status: "paused", report, ...(window ? { window } : {}), reason: "backfill paused before publication" };
}
export function backfillCostShape(report: BackfillReport): string { return digestParts(report.cost).slice(0, 24); }

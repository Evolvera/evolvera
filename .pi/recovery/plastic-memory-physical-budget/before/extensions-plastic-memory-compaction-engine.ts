import { digestParts } from "../common/safety.ts";
import { foldLedger, hasOrderedContextTail, sourceDigest } from "../session/ledger.ts";
import { makePlasticEntry } from "../session/ledger.ts";
import { isTerminalAssistantEntry } from "../session/cycles.ts";
import { PLASTIC_COMPACTION_APPLIED, type CompactionAppliedData, type CycleClosedData, type SessionBinding, type SessionEntry } from "../session/types.ts";
import { renderSessionSummary } from "../session/render-summary.ts";
import { extractCycleSourceFacts, verifyCycleSourceDigest, type CycleSourceFacts } from "./extract.ts";
import { isPendingIdentityCurrent, makePendingCompaction, PendingStore, type PendingBranch, type PendingCompaction } from "./pending.ts";
import { projectSnapshot, renderVerifiedCompaction, verifyRenderedCompaction, type CumulativeState, type LunaRequest, type ProjectSnapshot, type RenderedCompaction } from "./render.ts";

export type CycleInput = CycleClosedData | { type: "custom"; customType: "plastic.cycle.closed"; data: CycleClosedData };
export type CompactionEntry = SessionEntry & { type: "compaction"; id: string; firstKeptEntryId?: string; summary?: string; details?: unknown };
export type PhysicalBudget = Readonly<{
  /** The public model context window, not a private host setting. */
  contextWindow: number;
  /** Effective system prompt + bounded Plastic summary + host reserve. */
  fixedTokens: number;
  /** Conservative token estimate for each closed cycle that may remain current. */
  retainedCycleTokens: Readonly<Record<string, number>>;
  /** Conservative token estimate for the incomplete suffix after the last closed cycle. */
  incompleteSuffixTokens: number;
}>;
export type EngineInput = Readonly<{
  binding: SessionBinding;
  branchEntries: SessionEntry[];
  cycles: CycleInput[];
  priorState?: CumulativeState;
  activeMemoryIds?: string[];
  projectSnapshot: ProjectSnapshot | unknown;
  /** Optional public physical context proof. Omitted keeps the established four-cycle policy for pure callers; null fails closed. */
  physicalBudget?: PhysicalBudget | null;
  /** Optional host-selected cut; it must equal the deterministically verified whole-cycle boundary. */
  firstKeptEntryId?: string;
  runtimeToken?: string;
  now?: number;
  pendingStore?: PendingStore;
  compact: (request: LunaRequest) => { summary?: unknown; state?: unknown; details?: unknown };
}>;
export type EngineWindowInput = Omit<EngineInput, "compact">;
export type CutValidation = Readonly<{
  branchIds: string[];
  cutIndex: number;
  firstKeptEntryId: string;
  latestCompactionIdentity?: string;
  previousCompactions: string[];
}>;
export type PreparedCompaction = Readonly<{
  rendered: RenderedCompaction;
  cut: CutValidation;
  pending: PendingCompaction;
}>;
export type EngineResult = Readonly<{
  eligible: true;
  prepared: PreparedCompaction;
}> | Readonly<{
  eligible: false;
  reason: string;
}>;

function asCycleData(input: CycleInput): CycleClosedData | undefined {
  if (input && typeof input === "object" && "customType" in input) return input.customType === "plastic.cycle.closed" ? input.data : undefined;
  return input as CycleClosedData;
}
function hasId(entry: SessionEntry): entry is SessionEntry & { id: string } { return typeof entry.id === "string" && entry.id.length > 0; }
function message(entry: SessionEntry): Record<string, unknown> | undefined {
  return entry.message !== null && typeof entry.message === "object" ? entry.message as Record<string, unknown> : undefined;
}
function isSourceEntry(entry: SessionEntry): boolean { return entry.type === "message" || entry.type === "custom_message" || entry.type === "branch_summary"; }
function compactionIdentity(entry: CompactionEntry): string {
  return digestParts({ id: entry.id, firstKeptEntryId: entry.firstKeptEntryId, summary: entry.summary, details: entry.details }).slice(0, 32);
}
function plasticCompaction(entry: CompactionEntry): boolean {
  const details = entry.details && typeof entry.details === "object" ? entry.details as Record<string, unknown> : undefined;
  const plastic = details?.plastic && typeof details.plastic === "object" ? details.plastic as Record<string, unknown> : undefined;
  const range = plastic?.range && typeof plastic.range === "object" ? plastic.range as Record<string, unknown> : undefined;
  return plastic?.kind === "cumulative" && typeof plastic.state === "string"
    && ((typeof plastic.cycleRange === "string" && typeof plastic.stateDigest === "string" && typeof plastic.header === "string")
      || (typeof range?.fromEntryId === "string" && typeof range.throughEntryId === "string"));
}
/** The custom cut starts a whole retained cycle, never a turn in progress. */
function safeCutEntry(entry: SessionEntry | undefined): boolean {
  return entry?.type === "message" && message(entry)?.role === "user";
}
/** Eligibility stride and retained raw suffix. Temporarily lowered for live diagnosis. */
const MIN_CLOSED_CYCLES = 2;
const MAX_RETAINED_CYCLES = 1;

function validPhysicalBudget(budget: PhysicalBudget | null | undefined, retained: CycleClosedData[]): boolean {
  if (budget === undefined) return retained.length === MAX_RETAINED_CYCLES;
  if (budget === null || !Number.isSafeInteger(budget.contextWindow) || budget.contextWindow <= 0
    || !Number.isSafeInteger(budget.fixedTokens) || budget.fixedTokens < 0
    || !Number.isSafeInteger(budget.incompleteSuffixTokens) || budget.incompleteSuffixTokens < 0) return false;
  let total = budget.fixedTokens + budget.incompleteSuffixTokens;
  for (const cycle of retained) {
    const tokens = budget.retainedCycleTokens[cycle.cycleId];
    if (!Number.isSafeInteger(tokens) || tokens < 0) return false;
    total += tokens;
  }
  return total <= budget.contextWindow;
}
function exactCycleSpan(cycle: CycleClosedData, branch: SessionEntry[], branchPositions: Map<string, number>, sourcePositions: Map<string, number>): boolean {
  if (cycle.status !== "complete" && cycle.status !== "empty-valid") return false;
  if (!cycle.sourceEntryIds.length || cycle.sourceStartId !== cycle.sourceEntryIds[0] || cycle.sourceEndId !== cycle.sourceEntryIds.at(-1) || cycle.completedTurnEndId !== cycle.sourceEntryIds.at(-1)) return false;
  const indexes = cycle.sourceEntryIds.map((id) => sourcePositions.get(id));
  if (indexes.some((index) => index === undefined)) return false;
  for (let index = 1; index < indexes.length; index += 1) if (indexes[index]! !== indexes[index - 1]! + 1) return false;
  const sourceEntries = cycle.sourceEntryIds.map((id) => branch[branchPositions.get(id)!]);
  if (sourceEntries.some((entry) => !isSourceEntry(entry))) return false;
  if (sourceDigest(sourceEntries) !== cycle.sourceDigest) return false;
  return isTerminalAssistantEntry(sourceEntries.at(-1)!);
}
type WindowTrace = { code?: string };
function eligibleWindow(input: EngineWindowInput, trace: WindowTrace = {}): { cycles: CycleClosedData[]; cut: CutValidation } | undefined {
  const reject = (code: string): undefined => { trace.code = code; return undefined; };
  if (!hasOrderedContextTail(input.branchEntries)) return reject("branch-order");
  const branchIds = input.branchEntries.map((entry) => entry.id!);
  const positions = new Map(branchIds.map((id, index) => [id, index]));
  const sourcePositions = new Map(input.branchEntries.filter(isSourceEntry).map((entry, index) => [entry.id!, index]));
  const normalized = input.cycles.map(asCycleData);
  if (normalized.some((cycle) => !cycle || cycle.sessionId !== input.binding.sessionId || cycle.generation !== input.binding.generation || cycle.branchId !== input.binding.branchId)) return reject("binding-mismatch");
  const complete = normalized.filter((cycle): cycle is CycleClosedData => Boolean(cycle && (cycle.status === "complete" || cycle.status === "empty-valid")));
  const ordered = [...complete].sort((a, b) => (sourcePositions.get(a.sourceStartId) ?? Number.MAX_SAFE_INTEGER) - (sourcePositions.get(b.sourceStartId) ?? Number.MAX_SAFE_INTEGER));
  if (ordered.length < MIN_CLOSED_CYCLES || new Set(ordered.map((cycle) => cycle.cycleId)).size !== ordered.length) return reject("stride-too-small");
  const boundary = ordered;
  if (!boundary.every((cycle) => exactCycleSpan(cycle, input.branchEntries, positions, sourcePositions))) return reject("cycle-span-invalid");
  for (let index = 1; index < boundary.length; index += 1) {
    const previous = boundary[index - 1];
    const current = boundary[index];
    const previousEnd = sourcePositions.get(previous.sourceEndId);
    const currentStart = sourcePositions.get(current.sourceStartId);
    if (previousEnd === undefined || currentStart === undefined || currentStart !== previousEnd + 1) return reject("cycles-not-contiguous");
  }
  let retainedCount: number | undefined;
  let firstKept: SessionEntry | undefined;
  for (let candidate = MAX_RETAINED_CYCLES; candidate >= 0; candidate -= 1) {
    const candidateRetained = candidate === 0 ? [] : boundary.slice(-candidate);
    const candidateFirstKept = candidate === 0
      ? (() => {
        const lastEnd = positions.get(boundary.at(-1)!.sourceEndId);
        return lastEnd === undefined ? undefined : input.branchEntries[lastEnd + 1];
      })()
      : input.branchEntries.find((entry) => entry.id === candidateRetained[0].sourceStartId);
    // A zero-raw-cycle cut is representable only when the first incomplete suffix
    // entry is itself a safe user boundary. A branch ending at a closed cycle has
    // no host firstKeptEntryId to represent that cut, so retain at least one cycle.
    if (!safeCutEntry(candidateFirstKept) || !validPhysicalBudget(input.physicalBudget, candidateRetained)) continue;
    retainedCount = candidate;
    firstKept = candidateFirstKept;
    break;
  }
  if (retainedCount === undefined || !firstKept) return reject("no-safe-retained-cut");
  const retained = retainedCount === 0 ? [] : boundary.slice(-retainedCount);
  const acknowledged = new Set(input.priorState?.cycleIds ?? []);
  const older = retainedCount === 0 ? boundary : boundary.slice(0, -retainedCount);
  let sawUnacknowledged = false;
  for (const cycle of older) {
    if (acknowledged.has(cycle.cycleId)) {
      if (sawUnacknowledged) return undefined;
    } else {
      sawUnacknowledged = true;
    }
  }
  const compacted = older.filter((cycle) => !acknowledged.has(cycle.cycleId));
  if (compacted.length === 0) return reject("nothing-unacknowledged");
  if (input.firstKeptEntryId !== undefined && input.firstKeptEntryId !== firstKept.id) return reject("host-cut-mismatch");
  const cutIndex = positions.get(firstKept!.id!);
  if (cutIndex === undefined) return reject("cut-not-on-branch");
  const compactions = input.branchEntries.filter((entry): entry is CompactionEntry => entry.type === "compaction" && hasId(entry));
  const previousCompactions: string[] = [];
  for (const compaction of compactions) {
    const position = positions.get(compaction.id)!;
    if (position < cutIndex) {
      if (!plasticCompaction(compaction)) return reject("foreign-prior-compaction");
      previousCompactions.push(compactionIdentity(compaction));
    }
  }
  const latest = compactions.at(-1);
  const latestCompactionIdentity = latest ? compactionIdentity(latest) : undefined;
  const cut: CutValidation = { branchIds, cutIndex, firstKeptEntryId: firstKept!.id!, latestCompactionIdentity, previousCompactions };
  return { cycles: compacted, cut };
}
/** Select every unacknowledged closed cycle before the largest safe, physically fitting retained suffix. */
export function selectEligibleStride(input: EngineWindowInput): CycleClosedData[] | undefined {
  return eligibleWindow(input)?.cycles;
}
/** Fixed rejection category for live diagnosis; never includes payload or ids. */
export function diagnoseEligibleWindow(input: EngineWindowInput): string {
  const trace: WindowTrace = {};
  return eligibleWindow(input, trace) ? "eligible" : trace.code ?? "unknown";
}
function detailsDigest(rendered: RenderedCompaction): string { return digestParts(rendered.details).slice(0, 32); }
const consumedAcknowledgements = new WeakSet<object>();

export function prepareSemanticCompaction(input: EngineInput): EngineResult {
  const window = eligibleWindow(input);
  if (!window) return { eligible: false, reason: "no strict six-cycle safe current window" };
  const project = projectSnapshot(input.projectSnapshot);
  const cycleFacts: CycleSourceFacts[] = window.cycles.map((cycle) => extractCycleSourceFacts(cycle, input.branchEntries, input.activeMemoryIds ?? []));
  if (cycleFacts.some((cycle, index) => cycle.sourceDigest !== window.cycles[index].sourceDigest || !verifyCycleSourceDigest(window.cycles[index], input.branchEntries))) {
    return { eligible: false, reason: "cycle source digest or ancestry changed" };
  }
  let rendered: RenderedCompaction;
  try {
    const currentBranch = foldLedger(input.branchEntries, { leafId: input.branchEntries.at(-1)?.id, context: input.binding }).branch;
    const sessionIndex = renderSessionSummary(currentBranch, { leafId: currentBranch.at(-1)?.id, binding: input.binding });
    rendered = renderVerifiedCompaction(cycleFacts, input.priorState, project, input.compact, sessionIndex);
  } catch (error) {
    return { eligible: false, reason: error instanceof Error ? error.message : String(error) };
  }
  if (!verifyRenderedCompaction(rendered)) return { eligible: false, reason: "rendered compaction identity failed verification" };
  const cutDigest = digestParts({ preparedPrefixIds: window.cut.branchIds, firstKeptEntryId: window.cut.firstKeptEntryId, latestCompactionIdentity: window.cut.latestCompactionIdentity, stateDigest: rendered.stateDigest, cycleRange: rendered.cycleRange }).slice(0, 32);
  const boundDetails = {
    ...rendered.details,
    plastic: {
      ...(rendered.details.plastic as Record<string, unknown>),
      cutDigest,
      preparedPrefixDigest: digestParts(window.cut.branchIds).slice(0, 32),
      latestCompactionIdentity: window.cut.latestCompactionIdentity,
    },
  };
  const boundRendered: RenderedCompaction = { ...rendered, details: boundDetails };
  const pending = makePendingCompaction({
    slotId: digestParts(input.binding, window.cut.branchIds, rendered.stateDigest).slice(0, 32),
    binding: input.binding,
    runtimeToken: input.runtimeToken ?? "runtime:default",
    preparedPrefixIds: window.cut.branchIds,
    latestCompactionIdentity: window.cut.latestCompactionIdentity,
    cut: { firstKeptEntryId: window.cut.firstKeptEntryId, cutDigest, detailsDigest: detailsDigest(boundRendered), summaryHeader: rendered.summary.split("\n", 1)[0] },
    stateDigest: rendered.stateDigest,
    now: input.now,
  });
  (input.pendingStore ?? undefined)?.stage(pending);
  return { eligible: true, prepared: { rendered: boundRendered, cut: window.cut, pending } };
}

export function acknowledgeCompaction(
  pending: PendingCompaction,
  hostCompaction: SessionEntry,
  current: PendingBranch,
  activeEntryIds: string[] = current.branchIds,
  now = Date.now(),
): { record: ReturnType<typeof makePlasticEntry<typeof PLASTIC_COMPACTION_APPLIED>>; consumed: PendingCompaction } | undefined {
  if (consumedAcknowledgements.has(pending)) return undefined;
  if (hostCompaction.type !== "compaction" || typeof hostCompaction.id !== "string") return undefined;
  if (hostCompaction.firstKeptEntryId !== pending.cut.firstKeptEntryId) return undefined;
  if (typeof hostCompaction.summary !== "string" || !hostCompaction.summary.startsWith(pending.cut.summaryHeader)) return undefined;
  const details = hostCompaction.details && typeof hostCompaction.details === "object" ? hostCompaction.details as Record<string, unknown> : undefined;
  const plastic = details?.plastic && typeof details.plastic === "object" ? details.plastic as Record<string, unknown> : undefined;
  if (plastic?.stateDigest !== pending.stateDigest || plastic.header !== pending.cut.summaryHeader || plastic.cutDigest !== pending.cut.cutDigest
    || plastic.preparedPrefixDigest !== pending.preparedPrefixDigest || plastic.latestCompactionIdentity !== pending.latestCompactionIdentity) return undefined;
  if (digestParts(details).slice(0, 32) !== pending.cut.detailsDigest) return undefined;
  // Two-stage lifecycle: the pending was consumed on purpose at `session_before_compact`,
  // so acknowledgement re-validates identity only — the `consumed` flag is expected here.
  if (!isPendingIdentityCurrent(pending, current, now)) return undefined;
  const consumed: PendingCompaction = pending.consumed ? pending : Object.freeze({ ...pending, consumed: true });
  const data: CompactionAppliedData = {
    schemaVersion: 1,
    ...pending.binding,
    compactionEntryId: hostCompaction.id,
    firstKeptEntryId: pending.cut.firstKeptEntryId,
    activeEntryIds: [...activeEntryIds],
    activeDigest: digestParts(activeEntryIds).slice(0, 32),
  };
  consumedAcknowledgements.add(pending);
  return { record: makePlasticEntry(PLASTIC_COMPACTION_APPLIED, data), consumed };
}

export const buildSemanticCompaction = prepareSemanticCompaction;
export const prepareCompaction = prepareSemanticCompaction;

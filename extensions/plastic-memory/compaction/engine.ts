import { digestParts } from "../common/safety.ts";
import { foldLedger, hasOrderedContextTail, sourceDigest } from "../session/ledger.ts";
import { makePlasticEntry } from "../session/ledger.ts";
import { estimateSourceTokens, isTerminalAssistantEntry, QUEUED_CYCLE_MIN_TOKENS } from "../session/cycles.ts";
import { PLASTIC_COMPACTION_APPLIED, type CompactionAppliedData, type CycleClosedData, type Observation, type Reflection, type SessionBinding, type SessionEntry } from "../session/types.ts";
import { renderSessionSummary } from "../session/render-summary.ts";
import { extractCycleSourceFacts, verifyCycleSourceDigest, type CycleSourceFacts } from "./extract.ts";
import { isPendingIdentityCurrent, makePendingCompaction, PendingStore, type PendingBranch, type PendingCompaction } from "./pending.ts";
import { buildLunaRequest, projectSnapshot, renderVerifiedCompaction, verifyRenderedCompaction, type CumulativeState, type LunaRequest, type ProjectSnapshot, type RenderedCompaction } from "./render.ts";

export type CycleInput = CycleClosedData | { type: "custom"; customType: "plastic.cycle.closed"; data: CycleClosedData };
export type CompactionEntry = SessionEntry & { type: "compaction"; id: string; firstKeptEntryId?: string; summary?: string; details?: unknown };
export type PhysicalBudget = Readonly<{
  /** The public model context window, not a private host setting. */
  contextWindow: number;
  /** Effective system prompt + bounded Plastic summary + host reserve. */
  fixedTokens: number;
  /** Conservative token estimate for each branch entry in the candidate retained tail. */
  entryTokens: Readonly<Record<string, number>>;
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
export type EmergencyFinalizationInput = Readonly<{
  binding: SessionBinding;
  branchEntries: SessionEntry[];
  firstKeptEntryId: string;
  sourceFacts: CycleSourceFacts[];
  observations?: Observation[];
  reflections?: Reflection[];
  priorState?: CumulativeState;
  projectSnapshot: ProjectSnapshot | unknown;
  runtimeToken?: string;
  now?: number;
  compact: (request: LunaRequest) => { summary?: unknown; state?: unknown; details?: unknown };
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
/** Eligibility stride and retained raw suffix. */
const MIN_CLOSED_CYCLES = 6;
const MAX_RETAINED_CYCLES = 4;

export function physicalBudgetFits(
  budget: PhysicalBudget | null | undefined,
  branchEntries: readonly SessionEntry[],
  firstKept: SessionEntry | undefined,
  retainedCount: number,
): boolean {
  if (budget === undefined) return retainedCount === MAX_RETAINED_CYCLES;
  if (budget === null || !Number.isSafeInteger(budget.contextWindow) || budget.contextWindow <= 0
    || !Number.isSafeInteger(budget.fixedTokens) || budget.fixedTokens < 0
    || !budget.entryTokens || typeof budget.entryTokens !== "object"
    || !firstKept || typeof firstKept.id !== "string") return false;
  const firstKeptIndex = branchEntries.findIndex((entry) => entry.id === firstKept.id);
  if (firstKeptIndex < 0) return false;
  let total = budget.fixedTokens;
  for (const entry of branchEntries.slice(firstKeptIndex)) {
    if (typeof entry.id !== "string") return false;
    if (!Object.hasOwn(budget.entryTokens, entry.id)) return false;
    const tokens = budget.entryTokens[entry.id];
    if (!Number.isSafeInteger(tokens) || tokens < 0) return false;
    total += tokens;
  }
  return total <= budget.contextWindow;
}
export function exactCycleSpan(cycle: CycleClosedData, branch: SessionEntry[], branchPositions: Map<string, number>, sourcePositions: Map<string, number>): boolean {
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
export type ValidatedCycleSet = Readonly<{
  branchIds: string[];
  branchPositions: Map<string, number>;
  sourcePositions: Map<string, number>;
  cycles: CycleClosedData[];
}>;
/** Validate current-branch cycle identity, exact source spans, digest, and contiguity once for all selectors. */
export function validateClosedCycleSet(input: Pick<EngineWindowInput, "binding" | "branchEntries" | "cycles">): ValidatedCycleSet | undefined {
  if (!hasOrderedContextTail(input.branchEntries)) return undefined;
  const branchIds = input.branchEntries.map((entry) => entry.id!);
  const branchPositions = new Map(branchIds.map((id, index) => [id, index]));
  const sourcePositions = new Map(input.branchEntries.filter(isSourceEntry).map((entry, index) => [entry.id!, index]));
  const normalized = input.cycles.map(asCycleData);
  if (normalized.some((cycle) => !cycle || cycle.sessionId !== input.binding.sessionId || cycle.generation !== input.binding.generation || cycle.branchId !== input.binding.branchId
    || (cycle.status !== "complete" && cycle.status !== "empty-valid"))) return undefined;
  const complete = normalized.filter((cycle): cycle is CycleClosedData => Boolean(cycle && (cycle.status === "complete" || cycle.status === "empty-valid")));
  const cycles = [...complete].sort((a, b) => (sourcePositions.get(a.sourceStartId) ?? Number.MAX_SAFE_INTEGER) - (sourcePositions.get(b.sourceStartId) ?? Number.MAX_SAFE_INTEGER));
  if (new Set(cycles.map((cycle) => cycle.cycleId)).size !== cycles.length) return undefined;
  if (!cycles.every((cycle) => exactCycleSpan(cycle, input.branchEntries, branchPositions, sourcePositions))) return undefined;
  // A normal compaction is never allowed to reopen a below-threshold close. Recompute
  // from the exact current-branch source entries instead of trusting persisted metadata.
  if (!cycles.every((cycle) => {
    const sourceEntries = cycle.sourceEntryIds.map((id) => input.branchEntries[branchPositions.get(id)!]);
    const tokenEstimate = estimateSourceTokens(sourceEntries);
    return Number.isSafeInteger(tokenEstimate) && tokenEstimate >= QUEUED_CYCLE_MIN_TOKENS;
  })) return undefined;
  for (let index = 1; index < cycles.length; index += 1) {
    const previousEnd = sourcePositions.get(cycles[index - 1].sourceEndId);
    const currentStart = sourcePositions.get(cycles[index].sourceStartId);
    if (previousEnd === undefined || currentStart === undefined || currentStart !== previousEnd + 1) return undefined;
  }
  return { branchIds, branchPositions, sourcePositions, cycles };
}
function eligibleWindow(input: EngineWindowInput, trace: WindowTrace = {}): { cycles: CycleClosedData[]; cut: CutValidation } | undefined {
  const reject = (code: string): undefined => { trace.code = code; return undefined; };
  const validated = validateClosedCycleSet(input);
  if (!validated) return reject("cycle-span-invalid");
  const { branchIds, branchPositions: positions, cycles: boundary } = validated;
  if (boundary.length < MIN_CLOSED_CYCLES) return reject("stride-too-small");
  const retainedCount = MAX_RETAINED_CYCLES;
  const retained = boundary.slice(-retainedCount);
  const firstKept = input.branchEntries.find((entry) => entry.id === retained[0].sourceStartId);
  // Normal selection never shrinks the retained suffix under physical pressure.
  if (!safeCutEntry(firstKept) || !physicalBudgetFits(input.physicalBudget, input.branchEntries, firstKept, retainedCount)) return reject("no-strict-four-cycle-fit");
  if (input.firstKeptEntryId !== undefined && input.firstKeptEntryId !== firstKept.id) return reject("host-cut-mismatch");
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
function mergeStructuredFacts(cycles: CycleSourceFacts[]): CycleSourceFacts["facts"] {
  const keys: (keyof CycleSourceFacts["facts"])[] = ["activeMemoryIds", "files", "commands", "errors", "decisions", "constraints", "goals", "openLoops"];
  const merged = Object.fromEntries(keys.map((key) => [key, [] as string[]])) as Record<keyof CycleSourceFacts["facts"], string[]>;
  for (const cycle of cycles) for (const key of keys) for (const value of cycle.facts[key]) if (!merged[key].includes(value)) merged[key].push(value);
  return merged;
}
const consumedAcknowledgements = new WeakSet<object>();

/**
 * Finalize a previously selected emergency span without consulting normal six/four
 * eligibility. The caller must supply an immutable, worker-verified source fact
 * span; unlike the normal path this function never stages the pending slot.
 */
export function finalizeEmergencyCompaction(input: EmergencyFinalizationInput): EngineResult {
  try {
    if (!hasOrderedContextTail(input.branchEntries) || input.sourceFacts.length === 0 || !safeCutEntry(input.branchEntries.find((entry) => entry.id === input.firstKeptEntryId))) {
      return { eligible: false, reason: "emergency cut is not a safe current-branch boundary" };
    }
    const branchIds = input.branchEntries.map((entry) => entry.id);
    if (branchIds.some((id): id is undefined => id === undefined) || new Set(branchIds).size !== branchIds.length) {
      return { eligible: false, reason: "emergency branch identity is malformed" };
    }
    const cutIndex = branchIds.indexOf(input.firstKeptEntryId);
    if (cutIndex <= 0) return { eligible: false, reason: "emergency cut has no removable prefix" };
    const sourcePositions = new Map(input.branchEntries.filter(isSourceEntry).map((entry, index) => [entry.id!, index]));
    const sourceEntries = input.sourceFacts.flatMap((cycle) => cycle.sourceEntryIds.map((id) => input.branchEntries.find((entry) => entry.id === id)));
    if (sourceEntries.length === 0 || sourceEntries.some((entry): entry is undefined => entry === undefined)) {
      return { eligible: false, reason: "emergency source span is not on the current branch" };
    }
    const sourceIds = input.sourceFacts.flatMap((cycle) => cycle.sourceEntryIds);
    const sourcePrefixIds = input.branchEntries.slice(0, cutIndex).filter(isSourceEntry).map((entry) => entry.id!);
    if (new Set(sourceIds).size !== sourceIds.length || sourceIds.some((id) => !sourcePositions.has(id))
      || sourceIds.length !== sourcePrefixIds.length || sourceIds.some((id, index) => id !== sourcePrefixIds[index])) {
      return { eligible: false, reason: "emergency source span crosses the selected cut" };
    }
    for (const [index, cycle] of input.sourceFacts.entries()) {
      const cycleEntries = cycle.sourceEntryIds.map((id) => input.branchEntries.find((entry) => entry.id === id)!);
      if (sourceDigest(cycleEntries) !== cycle.sourceDigest || cycle.sourceStartId !== cycle.sourceEntryIds[0]
        || cycle.sourceEndId !== cycle.sourceEntryIds.at(-1) || cycle.completedTurnEndId !== cycle.sourceEntryIds.at(-1)
        || !isTerminalAssistantEntry(cycleEntries.at(-1)!)) {
        return { eligible: false, reason: `emergency source fact ${index + 1} failed verification` };
      }
    }
    const project = projectSnapshot(input.projectSnapshot);
    const currentBranch = foldLedger(input.branchEntries, { leafId: input.branchEntries.at(-1)?.id, context: input.binding }).branch;
    const sessionIndex = renderSessionSummary(currentBranch, {
      leafId: currentBranch.at(-1)?.id,
      binding: input.binding,
      overlay: { observations: input.observations ?? [], reflections: input.reflections ?? [] },
    });
    const request = buildLunaRequest(input.sourceFacts, input.priorState, project, mergeStructuredFacts(input.sourceFacts));
    const response = input.compact(request);
    if (!response || typeof response.summary !== "string" || response.summary.trim().length === 0) {
      return { eligible: false, reason: "emergency compactor did not return a non-empty semantic summary" };
    }
    const rendered = renderVerifiedCompaction(input.sourceFacts, input.priorState, project, () => response, sessionIndex);
    if (!verifyRenderedCompaction(rendered)) return { eligible: false, reason: "rendered emergency compaction identity failed verification" };
    const compactions = input.branchEntries.filter((entry): entry is CompactionEntry => entry.type === "compaction" && hasId(entry));
    const previousCompactions: string[] = [];
    for (const compaction of compactions) {
      const position = branchIds.indexOf(compaction.id);
      if (position < cutIndex) {
        if (!plasticCompaction(compaction)) return { eligible: false, reason: "foreign prior compaction before emergency cut" };
        previousCompactions.push(compactionIdentity(compaction));
      }
    }
    const latest = compactions.at(-1);
    const cut: CutValidation = {
      branchIds,
      cutIndex,
      firstKeptEntryId: input.firstKeptEntryId,
      latestCompactionIdentity: latest ? compactionIdentity(latest) : undefined,
      previousCompactions,
    };
    const cutDigest = digestParts({ preparedPrefixIds: cut.branchIds, firstKeptEntryId: cut.firstKeptEntryId, latestCompactionIdentity: cut.latestCompactionIdentity, stateDigest: rendered.stateDigest, cycleRange: rendered.cycleRange }).slice(0, 32);
    const boundDetails = {
      ...rendered.details,
      plastic: {
        ...(rendered.details.plastic as Record<string, unknown>),
        cutDigest,
        preparedPrefixDigest: digestParts(cut.branchIds).slice(0, 32),
        latestCompactionIdentity: cut.latestCompactionIdentity,
      },
    };
    const boundRendered: RenderedCompaction = { ...rendered, details: boundDetails };
    if (!verifyRenderedCompaction(boundRendered)) return { eligible: false, reason: "bound emergency compaction identity failed verification" };
    const pending = makePendingCompaction({
      slotId: digestParts(input.binding, cut.branchIds, rendered.stateDigest).slice(0, 32),
      binding: input.binding,
      runtimeToken: input.runtimeToken ?? "runtime:default",
      preparedPrefixIds: cut.branchIds,
      latestCompactionIdentity: cut.latestCompactionIdentity,
      cut: { firstKeptEntryId: cut.firstKeptEntryId, cutDigest, detailsDigest: detailsDigest(boundRendered), summaryHeader: rendered.summary.split("\n", 1)[0] },
      stateDigest: rendered.stateDigest,
      now: input.now,
    });
    return { eligible: true, prepared: { rendered: boundRendered, cut, pending } };
  } catch (error) {
    return { eligible: false, reason: error instanceof Error ? error.message : "emergency finalization failed" };
  }
}

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

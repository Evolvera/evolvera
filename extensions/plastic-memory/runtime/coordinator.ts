import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { defaultConfig, type PlasticMemoryConfig } from "../config.ts";
import { sessionDigest } from "../common/ids.ts";
import { digestParts, scrubSensitiveText } from "../common/safety.ts";
import { acknowledgeCompaction, type CompactionEntry, type PhysicalBudget } from "../compaction/engine.ts";
import { prepareEmergencyCompaction, selectEmergencyWindow } from "../compaction/emergency.ts";
import { projectPlasticContext } from "../compaction/projection.ts";
import { createPendingStore, isPendingUsable, type PendingCompaction } from "../compaction/pending.ts";
import { bootstrapSession } from "../session/bootstrap.ts";
import { foldLedger, hasOrderedContextTail } from "../session/ledger.ts";
import {
  isPlasticRecord,
  PLASTIC_CYCLE_CLOSED,
  PLASTIC_OBSERVATIONS_RECORDED,
  PLASTIC_REFLECTIONS_RECORDED,
  type BootstrapData,
  type CycleClosedData,
  type SessionBinding,
  type SessionEntry,
} from "../session/types.ts";
import { createCycleScheduler, type SchedulerIdentity, type SchedulerLifecycleEvent } from "../workers/scheduler.ts";
import type { LunaModel, RunnerRuntime } from "../workers/runner.ts";
import type { CumulativeState, ProjectSnapshot } from "../compaction/render.ts";

export type CoordinatorRuntime = RunnerRuntime | (() => RunnerRuntime | undefined);
export type CoordinatorOptions = Readonly<{
  config?: PlasticMemoryConfig;
  enabled?: boolean;
  runtime?: CoordinatorRuntime;
  runtimeToken?: string;
  projectSnapshot?: ProjectSnapshot | unknown | (() => ProjectSnapshot | unknown);
  now?: () => number;
}>;

type InternalIntent = {
  readonly id: string;
  readonly binding: SessionBinding;
  readonly generation: number;
  consumed: boolean;
  pending?: PendingCompaction;
};

type ApplyLatch = {
  readonly id: string;
  readonly generation: number;
  consumed: boolean;
};

type EmergencySnapshot = Readonly<{
  binding: SessionBinding;
  branchEntries: SessionEntry[];
  branchDigest: string;
  activeContextDigest: string;
  activeEntryIds: string[];
  cycles: CycleClosedData[];
  activeMemoryIds: string[];
  priorState?: CumulativeState;
  physicalBudget: PhysicalBudget;
  projectSnapshot: ProjectSnapshot | unknown;
  runtime: RunnerRuntime;
  visibleModel?: LunaModel;
  tokensBefore: number;
}>;

const SESSION_DIGEST_PROVENANCE = "plastic-memory:session";
const INTERNAL_COMPACTION_INSTRUCTIONS_PREFIX = "\u0000plastic-memory:internal-compaction:";
function internalCompactionInstructions(id: string): string {
  return `${INTERNAL_COMPACTION_INSTRUCTIONS_PREFIX}${id}`;
}

function entryIds(entries: readonly SessionEntry[]): string[] {
  return entries.flatMap((entry) => typeof entry.id === "string" && entry.id.length > 0 ? [entry.id] : []);
}
function sameBinding(left: SessionBinding, right: SessionBinding): boolean {
  return left.sessionId === right.sessionId && left.generation === right.generation && left.branchId === right.branchId;
}
function messageRole(entry: SessionEntry | undefined): string | undefined {
  const message = entry?.message;
  return message && typeof message === "object" && !Array.isArray(message) ? (message as Record<string, unknown>).role as string | undefined : undefined;
}
function latestCompactionIdentity(branch: readonly SessionEntry[]): string | undefined {
  const latest = [...branch].reverse().find((entry) => entry.type === "compaction" && typeof entry.id === "string") as CompactionEntry | undefined;
  return latest ? digestParts({ id: latest.id, firstKeptEntryId: latest.firstKeptEntryId, summary: latest.summary, details: latest.details }).slice(0, 32) : undefined;
}
function cyclesFor(branch: readonly SessionEntry[], binding: SessionBinding): CycleClosedData[] {
  return branch.flatMap((entry) => {
    if (!isPlasticRecord(entry) || entry.customType !== PLASTIC_CYCLE_CLOSED) return [];
    return sameBinding(entry.data, binding) ? [entry.data] : [];
  });
}
function bootstrapFor(branch: SessionEntry[], binding: SessionBinding): BootstrapData | undefined {
  const folded = foldLedger(branch, { context: binding });
  return folded.latestBootstrap;
}
function safeNoticeReason(value: unknown): string {
  const source = typeof value === "string" ? value : String(value ?? "worker did not complete");
  return scrubSensitiveText(source).replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 120) || "worker did not complete";
}
const PLASTIC_SUMMARY_TOKENS = 12_000; // SUMMARY_CAP_CHARS / conservative chars-per-token
const COMPACTION_RESERVE_TOKENS = 16_384; // host default reserve, kept local because settings are out of scope
const TOKEN_ROLES = new Set(["user", "assistant", "toolResult", "custom", "bashExecution", "branchSummary", "compactionSummary"]);
type PublicContextUsage = { tokens?: number | null; contextWindow?: number };
function estimatePublicMessage(value: unknown): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const message = value as Record<string, unknown>;
  if (typeof message.role !== "string" || !TOKEN_ROLES.has(message.role)) return undefined;
  // The public host estimator is chars/4 and conservative. Keep the adapter local so
  // direct in-process extension smokes do not need a package-resolution side channel.
  try {
    const serialized = JSON.stringify(message);
    return typeof serialized === "string" ? Math.ceil(serialized.length / 4) : undefined;
  } catch {
    return undefined;
  }
}
function estimateEntryTokens(entry: SessionEntry): number | undefined {
  if (entry.message !== undefined) return estimatePublicMessage(entry.message);
  if (entry.type === "branch_summary" && typeof entry.summary === "string") return estimatePublicMessage({ role: "branchSummary", summary: entry.summary });
  if (entry.type === "compaction" && typeof entry.summary === "string") return estimatePublicMessage({ role: "compactionSummary", summary: entry.summary });
  return entry.type === "custom" || entry.type === "model_change" || entry.type === "thinking_level_change" ? 0 : undefined;
}
function fixedPhysicalBudgetFor(ctx: ExtensionContext): Pick<PhysicalBudget, "contextWindow" | "fixedTokens"> | null {
  try {
    const usage = (ctx as unknown as { getContextUsage?: () => PublicContextUsage | undefined }).getContextUsage?.();
    const contextWindow = usage?.contextWindow;
    const getSystemPrompt = (ctx as unknown as { getSystemPrompt?: () => string }).getSystemPrompt;
    const systemPrompt = getSystemPrompt?.();
    if (!Number.isSafeInteger(contextWindow) || contextWindow <= 0 || typeof systemPrompt !== "string") return null;
    const systemPromptTokens = estimatePublicMessage({ role: "user", content: [{ type: "text", text: systemPrompt }] });
    if (systemPromptTokens === undefined) return null;
    return { contextWindow, fixedTokens: systemPromptTokens + PLASTIC_SUMMARY_TOKENS + COMPACTION_RESERVE_TOKENS };
  } catch {
    return null;
  }
}
function physicalBudgetFor(ctx: ExtensionContext, branch: readonly SessionEntry[]): PhysicalBudget | null {
  const fixed = fixedPhysicalBudgetFor(ctx);
  if (!fixed) return null;
  const entryTokens: Record<string, number> = {};
  for (const entry of branch) {
    if (typeof entry.id !== "string") continue;
    const tokens = estimateEntryTokens(entry);
    if (tokens !== undefined) entryTokens[entry.id] = tokens;
  }
  return { ...fixed, entryTokens };
}
function physicalTailFits(ctx: ExtensionContext, branch: readonly SessionEntry[], cutId: string): boolean {
  const budget = fixedPhysicalBudgetFor(ctx);
  if (!budget) return false;
  const index = branch.findIndex((entry) => entry.id === cutId);
  if (index < 0) return false;
  let tailTokens = 0;
  for (const entry of branch.slice(index)) {
    const tokens = estimateEntryTokens(entry);
    if (tokens === undefined) return false;
    tailTokens += tokens;
  }
  return budget.fixedTokens + tailTokens <= budget.contextWindow;
}
function exactNothingToCompact(error: unknown): boolean {
  return (error instanceof Error ? error.message : String(error)) === "Nothing to compact (session too small)";
}
function exactCompactionCancellation(error: unknown): boolean {
  return (error instanceof Error ? error.message : String(error)) === "Compaction cancelled";
}
function eventSignal(value: unknown): AbortSignal | undefined {
  return value && typeof value === "object" && "aborted" in value && "addEventListener" in value
    ? value as AbortSignal
    : undefined;
}
function usableVisibleModel(ctx: ExtensionContext): LunaModel | undefined {
  const candidate = (ctx as unknown as { model?: unknown }).model;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as LunaModel : undefined;
}
function edgeBootstrap(bootstrap: BootstrapData, cycles: readonly CycleClosedData[]): BootstrapData {
  const latest = cycles.at(-1);
  if (!latest || latest.sourceEntryIds.length === 0) return bootstrap;
  // The persisted bootstrap describes the initial host window. Once one cycle
  // closes, the scheduler must advance past that cycle rather than reopening
  // the whole prefix on every later turn.
  const historicalPrefixIds = [...new Set([
    ...bootstrap.historicalPrefixIds,
    ...bootstrap.activeEntryIds,
    ...latest.sourceEntryIds,
  ])];
  return {
    ...bootstrap,
    activeEntryIds: [],
    activeStartId: undefined,
    activeEndId: undefined,
    historicalPrefixIds,
  };
}

/**
 * The one host owner for plastic-memory compaction and context projection.
 * Registration is explicit; the inert extension root does not import this
 * module until the later cutover task.
 */
export class PlasticMemoryCoordinator {
  private readonly config: PlasticMemoryConfig;
  private readonly runtime?: CoordinatorRuntime;
  private readonly projectSnapshot?: CoordinatorOptions["projectSnapshot"];
  private readonly now: () => number;
  private readonly runtimeToken: string;
  private readonly scheduler = createCycleScheduler();
  private readonly pendingStore = createPendingStore();
  private readonly preparedViews = new WeakMap<object, { summary: string; details: unknown; state: CumulativeState }>();
  private readonly reportedPreparations = new WeakSet<object>();
  private generation = 0;
  private branchId = "";
  private settled = false;
  private bootstrapAttempted = false;
  private internalIntent?: InternalIntent;
  private applyLatch?: ApplyLatch;
  private inFlightPending?: PendingCompaction;
  private emergencyInFlight?: PendingCompaction;
  private emergencyAbort?: AbortController;
  private priorState?: CumulativeState;
  private active = true;

  constructor(private readonly pi: ExtensionAPI, options: CoordinatorOptions = {}) {
    this.config = options.config ?? { ...defaultConfig(), enabled: options.enabled === true };
    this.runtime = options.runtime;
    this.projectSnapshot = options.projectSnapshot;
    this.now = options.now ?? (() => Date.now());
    this.runtimeToken = options.runtimeToken ?? `plastic-memory:${randomUUID()}`;
    this.register();
  }

  private enabled(): boolean { return this.active && (this.config.enabled === true); }

  private invalidate(reason: string): void {
    this.emergencyAbort?.abort(new Error(reason));
    this.emergencyAbort = undefined;
    this.generation += 1;
    this.branchId = `branch:${randomUUID()}`;
    this.scheduler.invalidate(reason);
    this.pendingStore.clear();
    this.internalIntent = undefined;
    this.applyLatch = undefined;
    this.inFlightPending = undefined;
    this.emergencyInFlight = undefined;
    this.priorState = undefined;
    this.settled = false;
    this.bootstrapAttempted = false;
  }

  private binding(ctx: ExtensionContext): SessionBinding {
    return { sessionId: sessionDigest(ctx.sessionManager.getSessionId(), SESSION_DIGEST_PROVENANCE), generation: this.generation, branchId: this.branchId };
  }

  private runtimeFor(): RunnerRuntime | undefined {
    if (!this.runtime) return undefined;
    return typeof this.runtime === "function" ? this.runtime() : this.runtime;
  }

  private snapshotFor(): ProjectSnapshot | unknown {
    return typeof this.projectSnapshot === "function" ? this.projectSnapshot() : this.projectSnapshot ?? {};
  }

  private append(record: { customType: string; data: unknown }): void {
    if (this.enabled()) this.pi.appendEntry(record.customType, record.data);
  }

  private ensureBootstrap(ctx: ExtensionContext): BootstrapData | undefined {
    if (!this.enabled() || this.bootstrapAttempted) return undefined;
    const entries = ctx.sessionManager.getEntries() as SessionEntry[];
    if (entries.length === 0) return undefined;
    const binding = this.binding(ctx);
    try {
      const result = bootstrapSession({
        entries,
        binding,
        leafId: ctx.sessionManager.getLeafId(),
        activeEntries: ctx.sessionManager.buildContextEntries() as SessionEntry[],
        existingRecords: entries,
      });
      this.bootstrapAttempted = true;
      if (result.appended) this.append(result.record);
      const branch = ctx.sessionManager.getBranch() as SessionEntry[];
      return bootstrapFor(branch, binding) ?? result.state as unknown as BootstrapData;
    } catch {
      // Empty, malformed, or changing host branches fail closed. A later edge
      // event can retry without making a partial bootstrap record.
      return undefined;
    }
  }

  private currentIdentity(ctx: ExtensionContext): SchedulerIdentity {
    const binding = this.binding(ctx);
    return { binding, branchIds: entryIds(ctx.sessionManager.getBranch() as SessionEntry[]) };
  }

  private appendWorkerRecord(ctx: ExtensionContext, record: { customType?: string; data?: unknown }): void {
    if (!record.customType || !this.enabled()) return;
    const current = this.binding(ctx);
    if (current.generation !== this.generation || current.branchId !== this.branchId) return;
    this.append({ customType: record.customType, data: record.data });
  }

  private reportLifecycle(ctx: ExtensionContext, event: SchedulerLifecycleEvent): void {
    if (!ctx.hasUI || typeof ctx.ui?.notify !== "function") return;
    const reason = event.reason === undefined ? "" : ` — ${safeNoticeReason(event.reason)}`;
    let message: string;
    if (event.phase === "observer" && event.status === "started") {
      const tokens = Math.max(0, Math.round(event.tokenCount ?? 0)).toLocaleString();
      message = `Plastic memory: observer running on ~${tokens}-token snapshot`;
    } else if (event.phase === "observer" && event.status === "no-observations") {
      message = "Plastic memory: observer returned no observations";
    } else if (event.status === "failed") {
      message = `Plastic memory: ${event.phase} failed${reason}`;
    } else if (event.status === "skipped") {
      message = `Plastic memory: ${event.phase} skipped${reason}`;
    } else if (event.status === "prepared") {
      message = "Plastic memory: compaction prepared";
    } else if (event.status === "applied") {
      message = "Plastic memory: compaction applied";
    } else {
      return;
    }
    try {
      // Only a real failure warns; every waiting or progress state is informational.
      ctx.ui.notify(message, event.status === "failed" ? "warning" : "info");
    } catch {
      // UI observability must never change worker or compaction behavior.
    }
  }

  private schedule(ctx: ExtensionContext): void {
    if (!this.enabled()) return;
    const runtime = this.runtimeFor();
    if (!runtime) return;
    const binding = this.binding(ctx);
    const branchEntries = ctx.sessionManager.getBranch() as SessionEntry[];
    const bootstrap = bootstrapFor(branchEntries, binding) ?? this.ensureBootstrap(ctx);
    if (!bootstrap) return;
    const cycles = cyclesFor(branchEntries, binding);
    const physicalBudget = physicalBudgetFor(ctx, branchEntries);
    const folded = foldLedger(branchEntries, { context: binding });
    const projectSnapshot = this.snapshotFor();
    const input = {
      binding,
      branchEntries,
      bootstrap: edgeBootstrap(bootstrap, cycles),
      records: ctx.sessionManager.getEntries() as SessionEntry[],
      runtime,
      append: (record: { customType: string; data: unknown }) => this.appendWorkerRecord(ctx, record),
      currentIdentity: () => this.currentIdentity(ctx),
      lifecycleReporter: (event: SchedulerLifecycleEvent) => this.reportLifecycle(ctx, event),
      reschedule: () => this.schedule(ctx),
      compaction: {
        engine: {
          branchEntries,
          cycles,
          activeMemoryIds: folded.activeObservations.map((observation) => observation.id),
          priorState: this.priorState,
          runtimeToken: this.runtimeToken,
          pendingStore: this.pendingStore,
          physicalBudget,
          projectSnapshot,
        },
        cycles,
        eligibleCycles: cycles,
        priorState: this.priorState,
        runtimeToken: this.runtimeToken,
        pendingStore: this.pendingStore,
        physicalBudget,
        projectSnapshot,
      },
    } as const;
    void this.scheduler.trigger(input).then((result) => {
      if (!result.compactorJob) return;
      return result.compactorJob.then((compacted) => {
        if (!compacted.ok || !compacted.prepared) return;
        if (this.generation !== binding.generation || this.branchId !== binding.branchId) return;
        if (!this.reportedPreparations.has(compacted.prepared.pending as object)) {
          this.reportedPreparations.add(compacted.prepared.pending as object);
          this.reportLifecycle(ctx, { phase: "compaction", status: "prepared" });
        }
        this.preparedViews.set(compacted.prepared.pending as object, {
          summary: compacted.prepared.rendered.summary,
          details: compacted.prepared.rendered.details,
          state: compacted.prepared.rendered.state,
        });
        this.maybeApply(ctx);
      });
    }).catch(() => { /* worker failures are detached and fail closed */ });
  }

  private preparationMatches(event: { preparation: { firstKeptEntryId?: string }; branchEntries: SessionEntry[] }, pending: PendingCompaction, ctx: ExtensionContext, internal: boolean): boolean {
    const branch = event.branchEntries;
    const current = ctx.sessionManager.getBranch() as SessionEntry[];
    if (!hasOrderedContextTail(branch) || !hasOrderedContextTail(current) || entryIds(branch).join("\u0000") !== entryIds(current).join("\u0000")) return false;
    const binding = this.binding(ctx);
    if (!sameBinding(pending.binding, binding) || pending.runtimeToken !== this.runtimeToken) return false;
    const branchIds = entryIds(branch);
    if (pending.preparedPrefixIds.some((id, index) => branchIds[index] !== id)) return false;
    const cutIndex = branchIds.indexOf(pending.cut.firstKeptEntryId);
    if (cutIndex < 0) return false;
    // The host cut is advisory. Pi applies the extension result verbatim, so a valid
    // Plastic cut owns the boundary regardless of whether host advice is earlier or later.
    // An ordinary host event must still carry a branch-local advisory cut; only its ordering
    // is ignored. Re-prove the whole retained tail against the current public context budget: descendants
    // may have arrived since preparation, but a budget overflow must fall back natively.
    if (!internal) {
      const hostCut = event.preparation.firstKeptEntryId;
      if (typeof hostCut !== "string" || !branchIds.includes(hostCut)) return false;
    }
    if (!physicalTailFits(ctx, branch, pending.cut.firstKeptEntryId)) return false;
    const kept = branch.find((entry) => entry.id === pending.cut.firstKeptEntryId);
    if (messageRole(kept) !== "user") return false;
    if (latestCompactionIdentity(branch) !== pending.latestCompactionIdentity) return false;
    return isPendingUsable(pending, { binding, runtimeToken: this.runtimeToken, branchIds, latestCompactionIdentity: latestCompactionIdentity(branch) }, this.now());
  }

  private captureEmergencySnapshot(ctx: ExtensionContext, event: { preparation?: { tokensBefore?: unknown } }): EmergencySnapshot | undefined {
    try {
      const runtime = this.runtimeFor();
      const branch = ctx.sessionManager.getBranch() as SessionEntry[];
      const activeContext = ctx.sessionManager.buildContextEntries() as SessionEntry[];
      const tokensBefore = event.preparation?.tokensBefore;
      if (!runtime || !hasOrderedContextTail(branch) || !Number.isFinite(tokensBefore) || typeof tokensBefore !== "number" || tokensBefore < 0) return undefined;
      const activeEntryIds = entryIds(activeContext);
      if (activeEntryIds.length !== activeContext.length || new Set(activeEntryIds).size !== activeEntryIds.length) return undefined;
      const binding = this.binding(ctx);
      const physicalBudget = physicalBudgetFor(ctx, branch);
      if (!physicalBudget) return undefined;
      const branchEntries = structuredClone(branch) as SessionEntry[];
      const projectSnapshot = structuredClone(this.snapshotFor()) as ProjectSnapshot | unknown;
      const folded = foldLedger(branchEntries, { context: binding });
      const visible = usableVisibleModel(ctx);
      const visibleModel = typeof visible?.provider === "string" && visible.provider.length > 0
        && typeof visible.id === "string" && visible.id.length > 0
        ? { provider: visible.provider, id: visible.id }
        : undefined;
      return {
        binding,
        branchEntries,
        branchDigest: digestParts(branchEntries),
        activeContextDigest: digestParts(activeContext),
        activeEntryIds,
        cycles: cyclesFor(branchEntries, binding),
        activeMemoryIds: folded.activeObservations.map((observation) => observation.id),
        ...(this.priorState ? { priorState: structuredClone(this.priorState) as CumulativeState } : {}),
        physicalBudget: structuredClone(physicalBudget),
        projectSnapshot,
        runtime,
        ...(visibleModel ? { visibleModel } : {}),
        tokensBefore,
      };
    } catch {
      return undefined;
    }
  }

  private validEmergencyRecord(record: SessionEntry, snapshot: EmergencySnapshot): boolean {
    if (!isPlasticRecord(record) || (record.customType !== PLASTIC_OBSERVATIONS_RECORDED && record.customType !== PLASTIC_REFLECTIONS_RECORDED)) return false;
    const data = record.data as SessionBinding & { span?: { sourceEntryIds?: unknown } };
    return sameBinding(data, snapshot.binding)
      && Array.isArray(data.span?.sourceEntryIds)
      && data.span.sourceEntryIds.every((id) => typeof id === "string" && snapshot.branchEntries.some((entry) => entry.id === id));
  }

  /** Prove that no model input or semantic append was raced by a branch/context change. */
  private emergencySnapshotCurrent(ctx: ExtensionContext, snapshot: EmergencySnapshot, appended: readonly SessionEntry[] = []): boolean {
    try {
      if (!this.enabled() || !sameBinding(this.binding(ctx), snapshot.binding)) return false;
      const branch = ctx.sessionManager.getBranch() as SessionEntry[];
      if (branch.length !== snapshot.branchEntries.length + appended.length
        || digestParts(branch.slice(0, snapshot.branchEntries.length)) !== snapshot.branchDigest) return false;
      if (appended.length === 0 && digestParts(ctx.sessionManager.buildContextEntries() as SessionEntry[]) !== snapshot.activeContextDigest) return false;
      return appended.every((expected, index) => {
        const actual = branch[snapshot.branchEntries.length + index];
        return this.validEmergencyRecord(actual, snapshot)
          && actual.customType === expected.customType
          && digestParts(actual.data) === digestParts(expected.data);
      });
    } catch {
      return false;
    }
  }

  private beginEmergencyAbort(parent?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
    const controller = new AbortController();
    const abort = () => controller.abort(parent?.reason);
    if (parent?.aborted) abort();
    else parent?.addEventListener("abort", abort, { once: true });
    this.emergencyAbort = controller;
    return {
      signal: controller.signal,
      dispose: () => {
        parent?.removeEventListener("abort", abort);
        if (this.emergencyAbort === controller) this.emergencyAbort = undefined;
      },
    };
  }

  private stageEmergencyPending(ctx: ExtensionContext, snapshot: EmergencySnapshot, appended: readonly SessionEntry[], pending: PendingCompaction, view: { summary: string; details: unknown; state: CumulativeState }): PendingCompaction | undefined {
    if (!this.emergencySnapshotCurrent(ctx, snapshot, appended) || pending.consumed || !sameBinding(pending.binding, snapshot.binding)
      || pending.runtimeToken !== this.runtimeToken || pending.preparedPrefixIds.join("\u0000") !== entryIds(snapshot.branchEntries).join("\u0000")) return undefined;
    const branch = ctx.sessionManager.getBranch() as SessionEntry[];
    if (!physicalTailFits(ctx, branch, pending.cut.firstKeptEntryId)) return undefined;
    this.pendingStore.stage(pending);
    const consumed = this.pendingStore.consume({
      binding: snapshot.binding,
      runtimeToken: this.runtimeToken,
      branchIds: entryIds(branch),
      latestCompactionIdentity: latestCompactionIdentity(branch),
    }, this.now());
    if (!consumed) return undefined;
    this.preparedViews.set(consumed as object, view);
    this.inFlightPending = consumed;
    this.emergencyInFlight = consumed;
    return consumed;
  }

  private consumeInternalIntent(event: { preparation: { firstKeptEntryId?: string }; branchEntries: SessionEntry[] }, ctx: ExtensionContext): { cancel: true } | { compaction: { summary: string; firstKeptEntryId: string; tokensBefore: number; details: unknown } } {
    const intent = this.internalIntent;
    if (!intent || intent.consumed || intent.generation !== this.generation || !sameBinding(intent.binding, this.binding(ctx))) return { cancel: true };
    // This mutation is deliberately synchronous: an overlapping host compact
    // sees the consumed nonce and is cancelled before Pi can append twice.
    intent.consumed = true;
    if (this.applyLatch) this.applyLatch.consumed = true;
    const pending = this.pendingStore.peek(this.now());
    // The nonce is already spent above, so every cancel below must release the apply state
    // locally instead of trusting the host to deliver `onError` for the cancellation.
    if (!pending || !this.preparedViews.has(pending as object) || !this.preparationMatches(event, pending, ctx, true)) {
      this.resetApplyState();
      return { cancel: true };
    }
    const consumed = this.pendingStore.consume({
      binding: this.binding(ctx),
      runtimeToken: this.runtimeToken,
      branchIds: entryIds(event.branchEntries),
      latestCompactionIdentity: latestCompactionIdentity(event.branchEntries),
    }, this.now());
    if (!consumed) {
      this.resetApplyState();
      return { cancel: true };
    }
    const view = this.preparedViews.get(pending as object);
    if (view) this.preparedViews.set(consumed as object, view);
    intent.pending = consumed;
    this.inFlightPending = consumed;
    return {
      compaction: {
        summary: this.pendingRenderedSummary(consumed),
        firstKeptEntryId: consumed.cut.firstKeptEntryId,
        tokensBefore: Number((event.preparation as Record<string, unknown>).tokensBefore ?? 0),
        details: this.pendingRenderedDetails(consumed),
      },
    };
  }

  private pendingRenderedSummary(pending: PendingCompaction): string {
    return this.preparedViews.get(pending as object)?.summary ?? pending.cut.summaryHeader;
  }
  private pendingRenderedDetails(pending: PendingCompaction): unknown {
    return this.preparedViews.get(pending as object)?.details ?? { plastic: { kind: "cumulative", state: "verified", stateDigest: pending.stateDigest, header: pending.cut.summaryHeader } };
  }

  /**
   * A failed acknowledgement must not be sticky: the pending was already consumed at
   * `session_before_compact`, so the apply state is reset here to let a later cycle
   * prepare and apply again. No record is appended on failure.
   */
  /**
   * Clear the apply latch, the internal nonce and any in-flight pending. A cancelled or
   * rejected apply must never latch the coordinator: `maybeApply` refuses to run while
   * `applyLatch` or `inFlightPending` is set, so without this reset one bad attempt would
   * block every later compaction for the rest of the session.
   */
  private resetApplyState(): void {
    this.inFlightPending = undefined;
    this.emergencyInFlight = undefined;
    this.applyLatch = undefined;
    this.internalIntent = undefined;
  }

  private rebaseAfterBoundary(ctx: ExtensionContext, reason: string): void {
    // The host has already appended the actual boundary. Start a new generation from
    // its active context; old Plastic records remain history but cannot be current.
    this.invalidate(reason);
    this.ensureBootstrap(ctx);
  }

  private failApply(ctx: ExtensionContext, reason: string): void {
    this.resetApplyState();
    this.rebaseAfterBoundary(ctx, reason);
    this.reportLifecycle(ctx, { phase: "compaction", status: "failed", reason });
  }

  /** An emergency boundary cannot establish a new generation until its applied record is visible. */
  private failEmergencyApply(ctx: ExtensionContext, reason: string): void {
    this.resetApplyState();
    this.reportLifecycle(ctx, { phase: "compaction", status: "failed", reason });
  }

  private emergencyAppliedVisible(ctx: ExtensionContext, pending: PendingCompaction, record: { data: unknown }): boolean {
    try {
      const expected = digestParts(record.data);
      const folded = foldLedger(ctx.sessionManager.getBranch() as SessionEntry[], { context: pending.binding });
      return folded.compactionAcknowledgements.filter((applied) => digestParts(applied) === expected
        && applied.compactionEntryId.length > 0 && applied.firstKeptEntryId === pending.cut.firstKeptEntryId).length === 1;
    } catch {
      return false;
    }
  }

  private maybeApply(ctx: ExtensionContext): void {
    if (!this.enabled() || !this.settled || this.applyLatch || this.inFlightPending) return;
    let idle = false;
    let pendingMessages = true;
    try {
      idle = ctx.isIdle();
      pendingMessages = ctx.hasPendingMessages();
    } catch { return; }
    if (!idle || pendingMessages) return;
    const pending = this.pendingStore.peek(this.now());
    if (!pending || !this.preparedViews.has(pending as object) || pending.binding.generation !== this.generation || pending.binding.branchId !== this.branchId) return;
    let usage: ReturnType<ExtensionContext["getContextUsage"]>;
    try { usage = ctx.getContextUsage(); } catch { return; }
    if (!usage || usage.tokens === null || !Number.isFinite(usage.tokens) || usage.tokens <= 20_000) {
      this.reportLifecycle(ctx, { phase: "compaction", status: "skipped", reason: "context usage is not above the application threshold" });
      return;
    }
    const id = randomUUID();
    this.applyLatch = { id, generation: this.generation, consumed: false };
    this.internalIntent = { id, binding: this.binding(ctx), generation: this.generation, consumed: false };
    try {
      ctx.compact({
        customInstructions: internalCompactionInstructions(id),
        onComplete: () => {
          if (this.generation === pending.binding.generation) this.applyLatch = undefined;
        },
        onError: (error: unknown) => {
          if (this.generation === pending.binding.generation) {
            this.resetApplyState();
            if (exactNothingToCompact(error)) {
              // Pi rejects before session_before_compact when its own preparation has no
              // cut. This is benign deferral: retain the prepared slot and wait for a
              // later settled high-usage edge; never retry from the callback.
              this.reportLifecycle(ctx, { phase: "compaction", status: "skipped", reason: "Nothing to compact (session too small)" });
            } else if (!exactCompactionCancellation(error)) {
              this.reportLifecycle(ctx, { phase: "compaction", status: "failed", reason: error instanceof Error ? error.message : String(error) });
            }
          }
        },
      });
    } catch (error) {
      this.resetApplyState();
      if (exactNothingToCompact(error)) {
        this.reportLifecycle(ctx, { phase: "compaction", status: "skipped", reason: "Nothing to compact (session too small)" });
      } else if (!exactCompactionCancellation(error)) {
        this.reportLifecycle(ctx, { phase: "compaction", status: "failed", reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  private register(): void {
    this.pi.on("session_start", (_event, ctx) => {
      if (this.generation > 0) this.invalidate("session-start");
      this.generation += 1;
      this.branchId = `branch:${randomUUID()}`;
      this.bootstrapAttempted = false;
      this.settled = false;
      this.ensureBootstrap(ctx);
    });
    this.pi.on("agent_start", () => { this.settled = false; });
    this.pi.on("turn_end", (_event, ctx) => { this.ensureBootstrap(ctx); this.schedule(ctx); });
    this.pi.on("agent_settled", (_event, ctx) => {
      this.settled = true;
      this.maybeApply(ctx);
    });
    this.pi.on("session_before_compact", async (event, ctx) => {
      const intent = this.internalIntent;
      const hasInternalPrefix = typeof event.customInstructions === "string" && event.customInstructions.startsWith(INTERNAL_COMPACTION_INSTRUCTIONS_PREFIX);
      const isInternalCall = intent !== undefined && event.customInstructions === internalCompactionInstructions(intent.id);
      if (hasInternalPrefix) {
        if (!isInternalCall || !this.enabled()) return { cancel: true };
        if (this.applyLatch && !this.internalIntent) return { cancel: true };
        return this.consumeInternalIntent(event, ctx);
      }
      if (!this.enabled()) return undefined;

      // A usable normal six/four pending keeps its established ownership and does
      // not contend with emergency observer work.
      const pending = this.pendingStore.peek(this.now());
      if (pending && this.preparedViews.has(pending as object) && this.preparationMatches(event, pending, ctx, false)) {
        const consumed = this.pendingStore.consume({
          binding: this.binding(ctx),
          runtimeToken: this.runtimeToken,
          branchIds: entryIds(event.branchEntries),
          latestCompactionIdentity: latestCompactionIdentity(event.branchEntries),
        }, this.now());
        if (consumed) {
          const view = this.preparedViews.get(pending as object);
          if (view) this.preparedViews.set(consumed as object, view);
          this.inFlightPending = consumed;
          return {
            compaction: {
              summary: this.pendingRenderedSummary(consumed),
              firstKeptEntryId: consumed.cut.firstKeptEntryId,
              tokensBefore: event.preparation.tokensBefore,
              details: this.pendingRenderedDetails(consumed),
            },
          };
        }
      }

      const signal = eventSignal((event as unknown as { signal?: unknown }).signal);
      const acquired = await this.scheduler.acquireExclusiveLease(signal);
      if (!acquired.ok) return { cancel: true };
      const abort = this.beginEmergencyAbort(signal);
      try {
        if (abort.signal.aborted) return { cancel: true };
        const snapshot = this.captureEmergencySnapshot(ctx, event);
        if (!snapshot || !this.emergencySnapshotCurrent(ctx, snapshot)) return { cancel: true };
        const startedAt = Date.now();
        const selection = selectEmergencyWindow({
          binding: snapshot.binding,
          branchEntries: snapshot.branchEntries,
          activeEntryIds: snapshot.activeEntryIds,
          cycles: snapshot.cycles,
          physicalBudget: snapshot.physicalBudget,
          activeMemoryIds: snapshot.activeMemoryIds,
        });
        const remainingMs = 60_000 - (Date.now() - startedAt);
        if (!selection || remainingMs <= 0 || abort.signal.aborted) return { cancel: true };
        const prepared = await prepareEmergencyCompaction({
          selection,
          binding: snapshot.binding,
          branchEntries: snapshot.branchEntries,
          runtime: snapshot.runtime,
          ...(snapshot.visibleModel ? { visibleModel: snapshot.visibleModel } : {}),
          ...(snapshot.priorState ? { priorState: snapshot.priorState } : {}),
          projectSnapshot: snapshot.projectSnapshot,
          runtimeToken: this.runtimeToken,
          now: this.now(),
          signal: abort.signal,
          deadlineMs: remainingMs,
        });
        if (!prepared.ok || !this.emergencySnapshotCurrent(ctx, snapshot)) return { cancel: true };

        const appended: SessionEntry[] = [];
        for (const record of prepared.records) {
          if (!this.validEmergencyRecord(record, snapshot) || !this.emergencySnapshotCurrent(ctx, snapshot, appended)) return { cancel: true };
          this.append(record);
          appended.push(record);
          if (!this.emergencySnapshotCurrent(ctx, snapshot, appended)) return { cancel: true };
        }
        const consumed = this.stageEmergencyPending(ctx, snapshot, appended, prepared.pending, {
          summary: prepared.rendered.summary,
          details: prepared.rendered.details,
          state: prepared.rendered.state,
        });
        if (!consumed) return { cancel: true };
        return {
          compaction: {
            summary: prepared.rendered.summary,
            firstKeptEntryId: consumed.cut.firstKeptEntryId,
            tokensBefore: snapshot.tokensBefore,
            details: prepared.rendered.details,
          },
        };
      } catch {
        return { cancel: true };
      } finally {
        abort.dispose();
        acquired.lease.release();
      }
    });
    this.pi.on("session_compact", (event, ctx) => {
      if (!this.enabled()) return;
      const pending = this.inFlightPending;
      if (!pending) {
        this.rebaseAfterBoundary(ctx, "native or unmatched compaction boundary");
        return;
      }
      const emergency = this.emergencyInFlight === pending;
      const fail = (reason: string): void => {
        if (emergency) this.failEmergencyApply(ctx, reason);
        else this.failApply(ctx, reason);
      };
      const branch = ctx.sessionManager.getBranch() as SessionEntry[];
      const matches = branch.filter((entry) => entry.type === "compaction" && entry.id === event.compactionEntry.id);
      if (matches.length !== 1) { fail("host compaction entry not found once on the branch"); return; }
      const activeEntryIds = entryIds(ctx.sessionManager.buildContextEntries() as SessionEntry[]);
      const acknowledged = acknowledgeCompaction(pending, event.compactionEntry as SessionEntry, {
        binding: this.binding(ctx),
        runtimeToken: this.runtimeToken,
        branchIds: entryIds(branch),
        latestCompactionIdentity: latestCompactionIdentity(branch.slice(0, -1)),
      }, activeEntryIds, this.now());
      if (!acknowledged) { fail("host compaction did not match the prepared cut"); return; }
      const view = this.preparedViews.get(pending as object);
      try {
        this.append(acknowledged.record);
      } catch {
        fail("plastic compaction acknowledgement could not be appended");
        return;
      }
      if (emergency) {
        if (!this.emergencyAppliedVisible(ctx, pending, acknowledged.record)) {
          fail("plastic compaction acknowledgement was not visible and valid on the current branch");
          return;
        }
        this.reportLifecycle(ctx, { phase: "compaction", status: "applied" });
        this.rebaseAfterBoundary(ctx, "acknowledged emergency compaction boundary");
        return;
      }
      if (view) this.priorState = view.state;
      this.reportLifecycle(ctx, { phase: "compaction", status: "applied" });
      this.resetApplyState();
    });
    this.pi.on("context", (event, ctx) => {
      if (!this.enabled()) return { messages: event.messages };
      return projectPlasticContext({
        messages: event.messages as unknown as Array<Record<string, unknown>>,
        branchEntries: ctx.sessionManager.getBranch() as SessionEntry[],
        contextEntries: ctx.sessionManager.buildContextEntries() as SessionEntry[],
      });
    });
    const invalidate = (reason: string) => { this.invalidate(reason); };
    this.pi.on("session_before_switch", () => { invalidate("session-switch"); });
    this.pi.on("session_before_fork", () => { invalidate("fork"); });
    this.pi.on("session_before_tree", () => { invalidate("tree"); });
    this.pi.on("session_tree", () => { invalidate("tree-complete"); });
    this.pi.on("session_shutdown", (event) => { invalidate(event.reason); this.active = false; });
  }

  /** Explicit lifecycle invalidation for direct embedders without Pi events. */
  shutdown(reason = "shutdown"): void { this.invalidate(reason); this.active = false; }
  getGeneration(): number { return this.generation; }
  getBinding(ctx: ExtensionContext): SessionBinding { return this.binding(ctx); }
  getPending(): PendingCompaction | undefined { return this.pendingStore.peek(this.now()); }
}

export function registerPlasticMemoryCoordinator(pi: ExtensionAPI, options: CoordinatorOptions = {}): PlasticMemoryCoordinator {
  return new PlasticMemoryCoordinator(pi, options);
}

export const createPlasticMemoryCoordinator = registerPlasticMemoryCoordinator;
export const registerCoordinator = registerPlasticMemoryCoordinator;
export default registerPlasticMemoryCoordinator;

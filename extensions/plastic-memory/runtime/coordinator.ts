import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { defaultConfig, type PlasticMemoryConfig } from "../config.ts";
import { sessionDigest } from "../common/ids.ts";
import { digestParts, scrubSensitiveText } from "../common/safety.ts";
import { acknowledgeCompaction, selectEligibleStride, type CompactionEntry, type PhysicalBudget } from "../compaction/engine.ts";
import { projectPlasticContext } from "../compaction/projection.ts";
import { createPendingStore, isPendingUsable, type PendingCompaction } from "../compaction/pending.ts";
import { bootstrapSession } from "../session/bootstrap.ts";
import { createQueuedCycleRecords, reconstructCycleQueue, type QueueReconstruction } from "../session/cycles.ts";
import { foldLedger, hasOrderedContextTail, isSourceEntry, normalSourceEntries } from "../session/ledger.ts";
import {
  isPlasticRecord,
  PLASTIC_CYCLE_ATTEMPTED,
  PLASTIC_CYCLE_CLOSED,
  PLASTIC_CYCLE_QUEUED,
  type BootstrapData,
  type CycleClosedData,
  type SessionBinding,
  type SessionEntry,
} from "../session/types.ts";
import { createCycleScheduler, type SchedulerIdentity, type SchedulerLifecycleEvent } from "../workers/scheduler.ts";
import { buildModelTargets, type LunaModel, type RunnerRuntime } from "../workers/runner.ts";
import { runCompactor } from "../workers/compactor.ts";
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

const SESSION_DIGEST_PROVENANCE = "plastic-memory:session";
const AUTO_APPLY_MIN_CONTEXT_TOKENS = 120_000;
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
function usableVisibleModel(ctx: ExtensionContext): LunaModel | undefined {
  const candidate = (ctx as unknown as { model?: unknown }).model;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as LunaModel : undefined;
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
  /** The one pending already handed to Pi and awaiting host acknowledgement. */
  private inFlightPending?: PendingCompaction;
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
    this.generation += 1;
    this.branchId = `branch:${randomUUID()}`;
    this.scheduler.invalidate(reason);
    this.pendingStore.clear();
    this.internalIntent = undefined;
    this.applyLatch = undefined;
    this.inFlightPending = undefined;
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

  /** Keep prior-generation queue history out of a new generation while retaining malformed evidence. */
  private queueRecordsFor(binding: SessionBinding, branchEntries: SessionEntry[]): SessionEntry[] {
    return branchEntries.filter((entry) => {
      if (entry.type !== "custom" || (entry.customType !== PLASTIC_CYCLE_QUEUED && entry.customType !== PLASTIC_CYCLE_ATTEMPTED && entry.customType !== PLASTIC_CYCLE_CLOSED)) return true;
      return !isPlasticRecord(entry) || sameBinding(entry.data, binding);
    });
  }

  /** Reconstruct only the current binding's exact durable queue against its bootstrap window. */
  private queueState(ctx: ExtensionContext, binding: SessionBinding, bootstrap: BootstrapData): QueueReconstruction | undefined {
    const branchEntries = ctx.sessionManager.getBranch() as SessionEntry[];
    const sourceEntries = normalSourceEntries(branchEntries, bootstrap);
    const state = reconstructCycleQueue({
      binding,
      branchEntries,
      leafId: ctx.sessionManager.getLeafId(),
      sourceEntries,
      records: this.queueRecordsFor(binding, branchEntries),
    });
    return state.valid ? state : undefined;
  }

  /** Append every newly crossed completed-turn batch, and prove each append is current before work starts. */
  private captureQueuedCycles(ctx: ExtensionContext, binding: SessionBinding, bootstrap: BootstrapData): QueueReconstruction | undefined {
    let state = this.queueState(ctx, binding, bootstrap);
    if (!state) return undefined;
    const branchEntries = ctx.sessionManager.getBranch() as SessionEntry[];
    const candidates = createQueuedCycleRecords({ binding, sourceEntries: normalSourceEntries(branchEntries, bootstrap) });
    for (const candidate of candidates) {
      if (state.queued.some((record) => record.data.cycleId === candidate.data.cycleId && record.data.snapshotId === candidate.data.snapshotId)) continue;
      try {
        this.append(candidate);
      } catch {
        return undefined;
      }
      const refreshed = this.queueState(ctx, binding, bootstrap);
      if (!refreshed || !refreshed.queued.some((record) => record.data.cycleId === candidate.data.cycleId && record.data.snapshotId === candidate.data.snapshotId)) return undefined;
      state = refreshed;
    }
    return state;
  }

  /** Restart only an unambiguous, valid current-branch queue lineage for this stable session. */
  private recoverQueueBinding(ctx: ExtensionContext): SessionBinding | undefined {
    const sessionId = sessionDigest(ctx.sessionManager.getSessionId(), SESSION_DIGEST_PROVENANCE);
    const branchEntries = ctx.sessionManager.getBranch() as SessionEntry[];
    const candidates = new Map<string, SessionBinding>();
    for (const entry of branchEntries) {
      if (!isPlasticRecord(entry) || entry.customType !== PLASTIC_CYCLE_QUEUED || entry.data.sessionId !== sessionId) continue;
      const binding = { sessionId: entry.data.sessionId, generation: entry.data.generation, branchId: entry.data.branchId };
      candidates.set(`${binding.generation}\u0000${binding.branchId}`, binding);
    }
    const resumable: SessionBinding[] = [];
    for (const binding of candidates.values()) {
      const bootstrap = bootstrapFor(branchEntries, binding);
      const state = bootstrap ? this.queueState(ctx, binding, bootstrap) : undefined;
      if (state?.restartCandidate) resumable.push(binding);
    }
    return resumable.length === 1 ? resumable[0] : undefined;
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
    const binding = this.binding(ctx);
    const initialBranch = ctx.sessionManager.getBranch() as SessionEntry[];
    const bootstrap = bootstrapFor(initialBranch, binding) ?? this.ensureBootstrap(ctx);
    if (!bootstrap) return;
    // Capture and prove the durable FIFO state before resolving a runtime or starting
    // any asynchronous worker. Runtime absence and a busy observer therefore cannot lose a turn.
    const capturedQueue = this.captureQueuedCycles(ctx, binding, bootstrap);
    if (!capturedQueue) return;
    const branchEntries = ctx.sessionManager.getBranch() as SessionEntry[];
    const queueState = this.queueState(ctx, binding, bootstrap);
    if (!queueState) return;
    const runtime = this.runtimeFor();
    if (!runtime) return;
    const visibleModel = usableVisibleModel(ctx);
    const schedulerRuntime = visibleModel ? { ...runtime, visibleModel } : runtime;
    const cycles = cyclesFor(branchEntries, binding);
    const physicalBudget = physicalBudgetFor(ctx, branchEntries);
    const folded = foldLedger(branchEntries, { context: binding });
    const projectSnapshot = this.snapshotFor();
    const input = {
      binding,
      branchEntries,
      bootstrap,
      queueState,
      records: this.queueRecordsFor(binding, branchEntries),
      runtime: schedulerRuntime,
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
    // The host cut is advisory, but it must be branch-local for normal calls. The
    // internal nonce already owns its independently verified six/four boundary.
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

  private pendingRenderedSummary(pending: PendingCompaction): string {
    return this.preparedViews.get(pending as object)?.summary ?? pending.cut.summaryHeader;
  }
  private pendingRenderedDetails(pending: PendingCompaction): unknown {
    return this.preparedViews.get(pending as object)?.details ?? { plastic: { kind: "cumulative", state: "verified", stateDigest: pending.stateDigest, header: pending.cut.summaryHeader } };
  }

  /** Refresh only from an immutable, queue-validated normal six/four window while idle. */
  private async refreshPendingFromClosedCycles(event: { preparation: { firstKeptEntryId?: string }; branchEntries: SessionEntry[] }, ctx: ExtensionContext): Promise<PendingCompaction | undefined> {
    if (this.scheduler.isBusy()) return undefined;
    try {
      const current = ctx.sessionManager.getBranch() as SessionEntry[];
      if (!hasOrderedContextTail(event.branchEntries) || !hasOrderedContextTail(current)
        || entryIds(event.branchEntries).join("\u0000") !== entryIds(current).join("\u0000")) return undefined;
      const binding = this.binding(ctx);
      const bootstrap = bootstrapFor(current, binding);
      if (!bootstrap || !this.queueState(ctx, binding, bootstrap)) return undefined;
      const runtime = this.runtimeFor();
      const physicalBudget = physicalBudgetFor(ctx, current);
      if (!runtime || !physicalBudget) return undefined;
      const branchEntries = structuredClone(current) as SessionEntry[];
      const projectSnapshot = structuredClone(this.snapshotFor()) as ProjectSnapshot | unknown;
      const folded = foldLedger(branchEntries, { context: binding });
      const engine = {
        binding,
        branchEntries,
        cycles: cyclesFor(branchEntries, binding),
        activeMemoryIds: folded.activeObservations.map((observation) => observation.id),
        priorState: this.priorState,
        projectSnapshot,
        runtimeToken: this.runtimeToken,
        physicalBudget: structuredClone(physicalBudget),
      } as const;
      const eligibleCycles = selectEligibleStride(engine);
      if (!eligibleCycles || this.scheduler.isBusy()) return undefined;
      for (const model of buildModelTargets(usableVisibleModel(ctx))) {
        if (this.scheduler.isBusy()) return undefined;
        const result = await runCompactor({
          engine,
          eligibleCycles,
          priorState: this.priorState,
          projectSnapshot,
          runtime,
          model,
        });
        if (this.scheduler.isBusy()) return undefined;
        if (!result.ok || !result.prepared) continue;
        const pending = result.prepared.pending;
        if (!this.preparationMatches(event, pending, ctx, false)) return undefined;
        this.pendingStore.stage(pending);
        this.preparedViews.set(pending as object, {
          summary: result.prepared.rendered.summary,
          details: result.prepared.rendered.details,
          state: result.prepared.rendered.state,
        });
        this.reportLifecycle(ctx, { phase: "compaction", status: "prepared" });
        return pending;
      }
    } catch {
      // The host hook is fail-closed and never exposes a partial worker result.
    }
    return undefined;
  }

  private consumeInternalIntent(event: { preparation: { firstKeptEntryId?: string }; branchEntries: SessionEntry[] }, ctx: ExtensionContext): { cancel: true } | { compaction: { summary: string; firstKeptEntryId: string; tokensBefore: number; details: unknown } } {
    const intent = this.internalIntent;
    if (!intent || intent.consumed || intent.generation !== this.generation || !sameBinding(intent.binding, this.binding(ctx))) return { cancel: true };
    // Spend the nonce synchronously so an overlapping host compact cannot append twice.
    intent.consumed = true;
    if (this.applyLatch) this.applyLatch.consumed = true;
    const pending = this.pendingStore.peek(this.now());
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

  /** A new normal source entry must have started after the newest verified closed cycle. */
  private hasStartedIncompleteCycle(ctx: ExtensionContext): boolean {
    try {
      const branch = ctx.sessionManager.getBranch() as SessionEntry[];
      if (!hasOrderedContextTail(branch)) return false;
      const closed = cyclesFor(branch, this.binding(ctx));
      const newestEnd = Math.max(...closed.map((cycle) => branch.findIndex((entry) => entry.id === cycle.sourceEndId)));
      return newestEnd >= 0 && branch.slice(newestEnd + 1).some(isSourceEntry);
    } catch {
      return false;
    }
  }

  /** Clear the internal nonce, apply latch, and any host in-flight compaction. */
  private resetApplyState(): void {
    this.inFlightPending = undefined;
    this.applyLatch = undefined;
    this.internalIntent = undefined;
  }

  private rebaseAfterBoundary(ctx: ExtensionContext, reason: string, priorState?: CumulativeState): void {
    // The host boundary is durable. Carry only the verified prepared state into the new generation.
    this.invalidate(reason);
    this.priorState = priorState;
    this.ensureBootstrap(ctx);
  }

  private failApply(ctx: ExtensionContext, reason: string): void {
    this.resetApplyState();
    this.rebaseAfterBoundary(ctx, reason);
    this.reportLifecycle(ctx, { phase: "compaction", status: "failed", reason });
  }

  private appliedVisible(ctx: ExtensionContext, pending: PendingCompaction, record: { data: unknown }): boolean {
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
    } catch {
      return;
    }
    if (!idle || pendingMessages) return;
    const pending = this.pendingStore.peek(this.now());
    if (!pending || !this.preparedViews.has(pending as object) || pending.binding.generation !== this.generation || pending.binding.branchId !== this.branchId) return;
    if (!this.hasStartedIncompleteCycle(ctx)) return;
    let usage: ReturnType<ExtensionContext["getContextUsage"]>;
    try {
      usage = ctx.getContextUsage();
    } catch {
      return;
    }
    // Waiting below the application threshold is the normal steady state, not an event.
    // Reporting it would repeat on every settled turn and reproduce prior UI noise.
    if (!usage || usage.tokens === null || !Number.isFinite(usage.tokens) || usage.tokens <= AUTO_APPLY_MIN_CONTEXT_TOKENS) return;
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
      const recovered = this.recoverQueueBinding(ctx);
      if (recovered) {
        this.generation = recovered.generation;
        this.branchId = recovered.branchId;
        this.bootstrapAttempted = true;
      } else {
        this.generation += 1;
        this.branchId = `branch:${randomUUID()}`;
        this.bootstrapAttempted = false;
      }
      this.ensureBootstrap(ctx);
    });
    this.pi.on("agent_start", () => { this.settled = false; });
    this.pi.on("turn_end", (_event, ctx) => { this.ensureBootstrap(ctx); this.schedule(ctx); });
    this.pi.on("agent_settled", (_event, ctx) => {
      this.settled = true;
      this.schedule(ctx);
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

      // A pending must match exactly. A present but stale/mismatched slot is never
      // replaced by hook-time work; only an absent slot can be refreshed while idle.
      let pending = this.pendingStore.peek(this.now());
      if (pending) {
        if (!this.preparedViews.has(pending as object) || !this.preparationMatches(event, pending, ctx, false)) return { cancel: true };
      } else {
        pending = await this.refreshPendingFromClosedCycles(event, ctx);
        if (!pending) return { cancel: true };
      }
      const consumed = this.pendingStore.consume({
        binding: this.binding(ctx),
        runtimeToken: this.runtimeToken,
        branchIds: entryIds(event.branchEntries),
        latestCompactionIdentity: latestCompactionIdentity(event.branchEntries),
      }, this.now());
      if (!consumed) return { cancel: true };
      const view = this.preparedViews.get(pending as object);
      if (!view) return { cancel: true };
      this.preparedViews.set(consumed as object, view);
      this.inFlightPending = consumed;
      return {
        compaction: {
          summary: this.pendingRenderedSummary(consumed),
          firstKeptEntryId: consumed.cut.firstKeptEntryId,
          tokensBefore: event.preparation.tokensBefore,
          details: this.pendingRenderedDetails(consumed),
        },
      };
    });
    this.pi.on("session_compact", (event, ctx) => {
      if (!this.enabled()) return;
      const pending = this.inFlightPending;
      if (!pending) {
        this.rebaseAfterBoundary(ctx, "native or unmatched compaction boundary");
        return;
      }
      const fail = (reason: string): void => { this.failApply(ctx, reason); };
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
      if (!view) { fail("prepared cumulative state was unavailable for acknowledgement"); return; }
      try {
        this.append(acknowledged.record);
      } catch {
        fail("plastic compaction acknowledgement could not be appended");
        return;
      }
      if (!this.appliedVisible(ctx, pending, acknowledged.record)) {
        fail("plastic compaction acknowledgement was not visible and valid on the current branch");
        return;
      }
      this.reportLifecycle(ctx, { phase: "compaction", status: "applied" });
      this.rebaseAfterBoundary(ctx, "acknowledged plastic compaction boundary", view.state);
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

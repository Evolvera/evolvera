import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { defaultConfig, type PlasticMemoryConfig } from "../config.ts";
import { digestParts } from "../common/safety.ts";
import { acknowledgeCompaction, type CompactionEntry } from "../compaction/engine.ts";
import { projectPlasticContext } from "../compaction/projection.ts";
import { createPendingStore, isPendingUsable, type PendingCompaction } from "../compaction/pending.ts";
import { bootstrapSession } from "../session/bootstrap.ts";
import { foldLedger } from "../session/ledger.ts";
import {
  isPlasticRecord,
  PLASTIC_CYCLE_CLOSED,
  type BootstrapData,
  type CycleClosedData,
  type SessionBinding,
  type SessionEntry,
} from "../session/types.ts";
import { createCycleScheduler, type SchedulerIdentity } from "../workers/scheduler.ts";
import type { RunnerRuntime } from "../workers/runner.ts";
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
function orderedBranch(entries: readonly SessionEntry[]): boolean {
  const seen = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (typeof entry.id !== "string" || entry.id.length === 0 || seen.has(entry.id)) return false;
    seen.add(entry.id);
    if (index > 0 && entry.parentId !== entries[index - 1]?.id) return false;
  }
  return true;
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
  private readonly preparedViews = new WeakMap<object, { summary: string; details: unknown }>();
  private generation = 0;
  private branchId = "";
  private settled = false;
  private bootstrapAttempted = false;
  private internalIntent?: InternalIntent;
  private applyLatch?: ApplyLatch;
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
    return { sessionId: ctx.sessionManager.getSessionId(), generation: this.generation, branchId: this.branchId };
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

  private schedule(ctx: ExtensionContext): void {
    if (!this.enabled()) return;
    const runtime = this.runtimeFor();
    if (!runtime) return;
    const binding = this.binding(ctx);
    const branchEntries = ctx.sessionManager.getBranch() as SessionEntry[];
    const bootstrap = bootstrapFor(branchEntries, binding) ?? this.ensureBootstrap(ctx);
    if (!bootstrap) return;
    const cycles = cyclesFor(branchEntries, binding);
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
      compaction: {
        engine: {
          branchEntries,
          cycles,
          activeMemoryIds: folded.activeObservations.map((observation) => observation.id),
          runtimeToken: this.runtimeToken,
          pendingStore: this.pendingStore,
          projectSnapshot,
        },
        cycles,
        eligibleCycles: cycles,
        priorState: this.priorState,
        runtimeToken: this.runtimeToken,
        pendingStore: this.pendingStore,
        projectSnapshot,
      },
    } as const;
    void this.scheduler.trigger(input).then((result) => {
      if (!result.compactorJob) return;
      return result.compactorJob.then((compacted) => {
        if (!compacted.ok || !compacted.prepared) return;
        if (this.generation !== binding.generation || this.branchId !== binding.branchId) return;
        this.priorState = compacted.prepared.rendered.state;
        this.preparedViews.set(compacted.prepared.pending as object, {
          summary: compacted.prepared.rendered.summary,
          details: compacted.prepared.rendered.details,
        });
        this.maybeApply(ctx);
      });
    }).catch(() => { /* worker failures are detached and fail closed */ });
  }

  private preparationMatches(event: { preparation: { firstKeptEntryId?: string }; branchEntries: SessionEntry[] }, pending: PendingCompaction, ctx: ExtensionContext): boolean {
    const branch = event.branchEntries;
    const current = ctx.sessionManager.getBranch() as SessionEntry[];
    if (!orderedBranch(branch) || !orderedBranch(current) || entryIds(branch).join("\u0000") !== entryIds(current).join("\u0000")) return false;
    const binding = this.binding(ctx);
    if (!sameBinding(pending.binding, binding) || pending.runtimeToken !== this.runtimeToken) return false;
    const branchIds = entryIds(branch);
    if (pending.preparedPrefixIds.some((id, index) => branchIds[index] !== id)) return false;
    if (typeof event.preparation.firstKeptEntryId !== "string" || event.preparation.firstKeptEntryId !== pending.cut.firstKeptEntryId) return false;
    const kept = branch.find((entry) => entry.id === pending.cut.firstKeptEntryId);
    if (messageRole(kept) !== "user") return false;
    if (latestCompactionIdentity(branch) !== pending.latestCompactionIdentity) return false;
    return isPendingUsable(pending, { binding, runtimeToken: this.runtimeToken, branchIds, latestCompactionIdentity: latestCompactionIdentity(branch) }, this.now());
  }

  private consumeInternalIntent(event: { preparation: { firstKeptEntryId?: string }; branchEntries: SessionEntry[] }, ctx: ExtensionContext): { cancel: true } | { compaction: { summary: string; firstKeptEntryId: string; tokensBefore: number; details: unknown } } {
    const intent = this.internalIntent;
    if (!intent || intent.consumed || intent.generation !== this.generation || !sameBinding(intent.binding, this.binding(ctx))) return { cancel: true };
    // This mutation is deliberately synchronous: an overlapping host compact
    // sees the consumed nonce and is cancelled before Pi can append twice.
    intent.consumed = true;
    if (this.applyLatch) this.applyLatch.consumed = true;
    const pending = this.pendingStore.peek(this.now());
    if (!pending || !this.preparedViews.has(pending as object) || !this.preparationMatches(event, pending, ctx)) return { cancel: true };
    const consumed = this.pendingStore.consume({
      binding: this.binding(ctx),
      runtimeToken: this.runtimeToken,
      branchIds: entryIds(event.branchEntries),
      latestCompactionIdentity: latestCompactionIdentity(event.branchEntries),
    }, this.now());
    if (!consumed || typeof event.preparation.firstKeptEntryId !== "string") return { cancel: true };
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
    const id = randomUUID();
    this.applyLatch = { id, generation: this.generation, consumed: false };
    this.internalIntent = { id, binding: this.binding(ctx), generation: this.generation, consumed: false };
    try {
      ctx.compact({
        customInstructions: internalCompactionInstructions(id),
        onComplete: () => {
          if (this.generation === pending.binding.generation) this.applyLatch = undefined;
        },
        onError: () => {
          if (this.generation === pending.binding.generation) {
            this.applyLatch = undefined;
            this.internalIntent = undefined;
          }
        },
      });
    } catch {
      this.applyLatch = undefined;
      this.internalIntent = undefined;
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
    this.pi.on("session_before_compact", (event, ctx) => {
      const intent = this.internalIntent;
      const hasInternalPrefix = typeof event.customInstructions === "string" && event.customInstructions.startsWith(INTERNAL_COMPACTION_INSTRUCTIONS_PREFIX);
      const isInternalCall = intent !== undefined && event.customInstructions === internalCompactionInstructions(intent.id);
      if (hasInternalPrefix) {
        if (!isInternalCall || !this.enabled()) return { cancel: true };
        if (this.applyLatch && !this.internalIntent) return { cancel: true };
        return this.consumeInternalIntent(event, ctx);
      }
      if (!this.enabled()) return undefined;
      const pending = this.pendingStore.peek(this.now());
      if (!pending || !this.preparedViews.has(pending as object) || event.reason === "manual" && !this.preparationMatches(event, pending, ctx)) return undefined;
      if (!this.preparationMatches(event, pending, ctx)) return undefined;
      const consumed = this.pendingStore.consume({
        binding: this.binding(ctx),
        runtimeToken: this.runtimeToken,
        branchIds: entryIds(event.branchEntries),
        latestCompactionIdentity: latestCompactionIdentity(event.branchEntries),
      }, this.now());
      if (!consumed) return undefined;
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
    });
    this.pi.on("session_compact", (event, ctx) => {
      const pending = this.inFlightPending;
      if (!pending || !this.enabled()) return;
      const branch = ctx.sessionManager.getBranch() as SessionEntry[];
      const matches = branch.filter((entry) => entry.type === "compaction" && entry.id === event.compactionEntry.id);
      if (matches.length !== 1) return;
      const activeEntryIds = entryIds(ctx.sessionManager.buildContextEntries() as SessionEntry[]);
      const acknowledged = acknowledgeCompaction(pending, event.compactionEntry as SessionEntry, {
        binding: this.binding(ctx),
        runtimeToken: this.runtimeToken,
        branchIds: entryIds(branch),
        latestCompactionIdentity: latestCompactionIdentity(branch.slice(0, -1)),
      }, activeEntryIds, this.now());
      if (!acknowledged) return;
      this.append(acknowledged.record);
      this.inFlightPending = undefined;
      this.applyLatch = undefined;
      this.internalIntent = undefined;
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

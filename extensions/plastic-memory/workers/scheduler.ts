import { digestParts, scrubSensitiveText } from "../common/safety.ts";
import { beginQueuedCycleAttempt, closeCycle, finishCycleAttempt, partitionCompletedTurnSnapshot, reconstructCycleQueue, selectOldestUnresolvedQueuedCycle, snapshotFromQueuedCycle, type CompletedTurnSnapshot, type QueueReconstruction, type SnapshotChunk } from "../session/cycles.ts";
import { makePlasticEntry, normalSourceEntries } from "../session/ledger.ts";
import { PLASTIC_OBSERVATIONS_RECORDED, type BootstrapData, type PlasticEntry, type SessionBinding, type SessionEntry } from "../session/types.ts";
import { observerRequestFits, runObserver, type ObserverResult } from "./observer.ts";
import { runReflector, type ReflectorResult } from "./reflector.ts";
import { runCompactor, type CompactorInput, type CompactorResult } from "./compactor.ts";
import { runPromoter, type PromoterInput, type PromoterResult } from "./promoter.ts";
import { buildModelTargets, type ModelTarget, type RunnerRuntime } from "./runner.ts";
import { diagnoseEligibleWindow, selectEligibleStride, type EngineInput } from "../compaction/engine.ts";
import type { CumulativeState, ProjectSnapshot } from "../compaction/render.ts";
import type { PendingStore } from "../compaction/pending.ts";

export type SchedulerIdentity = Readonly<{ binding: SessionBinding; branchIds: string[]; snapshotId?: string; sourceDigest?: string }>;
export type SchedulerLifecycleEvent = Readonly<{
  phase: "observer" | "reflector" | "compactor" | "compaction";
  status: "started" | "no-observations" | "failed" | "skipped" | "prepared" | "applied";
  tokenCount?: number;
  reason?: string;
}>;
export type SchedulerLifecycleReporter = (event: SchedulerLifecycleEvent) => void;
export type SchedulerInput = Readonly<{
  binding: SessionBinding;
  branchEntries: SessionEntry[];
  bootstrap: BootstrapData | { activeEntryIds: string[]; historicalPrefixIds: string[]; historicalGap: "historical-unindexed" };
  /** Coordinator-proven current queue state; scheduler independently revalidates it below. */
  queueState?: QueueReconstruction;
  records?: SessionEntry[];
  explicitRetry?: boolean;
  runtime: RunnerRuntime;
  append?: (entry: PlasticEntry) => void;
  currentIdentity?: () => SchedulerIdentity;
  lifecycleReporter?: SchedulerLifecycleReporter;
  reschedule?: () => void;
  projectSnapshot?: ProjectSnapshot | unknown;
  compaction?: {
    engine: Omit<EngineInput, "compact" | "cycles" | "projectSnapshot" | "binding">;
    cycles: EngineInput["cycles"];
    eligibleCycles: EngineInput["cycles"];
    priorState?: CumulativeState;
    runtimeToken?: string;
    pendingStore?: PendingStore;
    projectSnapshot: ProjectSnapshot | unknown;
  };
  now?: number;
  leafId?: string | null;
}>;
export type SchedulerResult = Readonly<{
  status: "closed" | "empty-valid" | "failed" | "suppressed" | "stale" | "skipped";
  snapshot?: CompletedTurnSnapshot;
  cycle?: PlasticEntry<"plastic.cycle.closed">;
  attempt?: PlasticEntry<"plastic.cycle.attempted">;
  reason?: string;
  compactorJob?: Promise<CompactorResult>;
}>;
export type SchedulerExclusiveLease = Readonly<{ release: () => void }>;
export type SchedulerExclusiveLeaseResult =
  | Readonly<{ ok: true; lease: SchedulerExclusiveLease }>
  | Readonly<{ ok: false; reason: "exclusive-lease-held" | "aborted" | "invalidated" }>;

type Job = { controller: AbortController; epoch: number; snapshotId: string; promise: Promise<SchedulerResult> };
type ExclusiveLease = { epoch: number };
type QueueSelection = Readonly<{
  record: PlasticEntry<"plastic.cycle.queued">;
  snapshot: CompletedTurnSnapshot;
  source: SessionEntry[];
}>;

function sameBinding(left: SessionBinding, right: SessionBinding): boolean {
  return left.sessionId === right.sessionId && left.generation === right.generation && left.branchId === right.branchId;
}
function samePrefix(expected: readonly string[], actual: readonly string[]): boolean {
  return actual.length >= expected.length && expected.every((id, index) => actual[index] === id);
}
function entryIds(entries: readonly SessionEntry[]): string[] { return entries.flatMap((entry) => typeof entry.id === "string" ? [entry.id] : []); }
function serializer(entries: SessionEntry[]): string {
  return entries.map((entry) => JSON.stringify({ id: entry.id, parentId: entry.parentId ?? null, type: entry.type, message: entry.message, content: entry.content, tokenCount: entry.tokenCount })).join("\n");
}
function mergeRecords(left: SessionEntry[], right: SessionEntry[]): SessionEntry[] {
  const result = [...left];
  for (const entry of right) if (!result.includes(entry) && !result.some((candidate) => JSON.stringify(candidate) === JSON.stringify(entry))) result.push(entry);
  return result;
}
function safeReason(reason: unknown): string {
  const value = typeof reason === "string" ? reason : String(reason ?? "worker did not complete");
  return scrubSensitiveText(value).replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 120) || "worker did not complete";
}
/** Benign "not yet" outcomes are waiting states, not failures. */
const COMPACTOR_WAITING_REASONS = new Set(["no eligible cycles", "no strict six-cycle safe current window"]);
function compactorWaiting(reason: unknown): boolean { return typeof reason === "string" && COMPACTOR_WAITING_REASONS.has(reason); }
function report(input: SchedulerInput, event: Omit<SchedulerLifecycleEvent, "reason"> & { reason?: unknown }): void {
  input.lifecycleReporter?.({ ...event, ...(event.reason === undefined ? {} : { reason: safeReason(event.reason) }) });
}

type QueueLookup =
  | Readonly<{ kind: "idle"; reason?: string }>
  | Readonly<{ kind: "invalid"; reason: string }>
  | Readonly<{ kind: "ready"; selection: QueueSelection; unresolvedCount: number }>;

function sameQueueLineage(left: QueueReconstruction, right: QueueReconstruction): boolean {
  return left.valid === right.valid
    && left.queued.length === right.queued.length
    && left.queued.every((record, index) => record.data.cycleId === right.queued[index]?.data.cycleId
      && record.data.snapshotId === right.queued[index]?.data.snapshotId);
}

/** Re-read durable queue state; queued records are the sole worker input source. */
function queuedLookup(input: SchedulerInput, source: SessionEntry[], records: SessionEntry[]): QueueLookup {
  const state = reconstructCycleQueue({
    binding: input.binding,
    branchEntries: input.branchEntries,
    leafId: input.leafId,
    sourceEntries: source,
    records,
  });
  if (!state.valid || input.queueState !== undefined && !sameQueueLineage(input.queueState, state)) {
    return { kind: "invalid", reason: state.reason ?? "invalid durable queue state" };
  }
  const record = selectOldestUnresolvedQueuedCycle(state);
  if (!record) return { kind: "idle", reason: "no unresolved queued cycle" };
  const snapshot = snapshotFromQueuedCycle(record);
  if (!snapshot) return { kind: "invalid", reason: "queued record is below the durable token invariant" };
  const byId = new Map(source.flatMap((entry) => typeof entry.id === "string" ? [[entry.id, entry] as const] : []));
  const exactSource = snapshot.span.sourceEntryIds.map((id) => byId.get(id));
  if (exactSource.some((entry) => entry === undefined)) return { kind: "invalid", reason: "queued source manifest is unavailable" };
  return { kind: "ready", selection: { record, snapshot, source: exactSource as SessionEntry[] }, unresolvedCount: state.unresolved.length };
}

/** One edge-triggered, generation-safe worker pipeline. */
export class CycleScheduler {
  private epoch = 0;
  private activeJob?: Job;
  private exclusiveLease?: ExclusiveLease;
  private rescheduleQueued = false;
  private rescheduleCallback?: () => void;
  private readonly controllers = new Set<AbortController>();
  private readonly localRecords: SessionEntry[] = [];
  private readonly terminalSnapshots = new Set<string>();
  private readonly compactorResults: Promise<CompactorResult>[] = [];

  trigger(input: SchedulerInput): Promise<SchedulerResult> {
    const source = normalSourceEntries(input.branchEntries, input.bootstrap as BootstrapData);
    const queue = queuedLookup(input, source, this.records(input));
    if (queue.kind === "invalid") return Promise.resolve({ status: "skipped", reason: safeReason(queue.reason) });
    if (queue.kind === "idle") return Promise.resolve({ status: "skipped", reason: queue.reason });
    const { selection, unresolvedCount } = queue;
    const preview = selection.snapshot;
    if (this.exclusiveLease) {
      // Keep only the newest caller-owned reschedule path. A trigger without a
      // callback cannot revoke a previously deferred caller's opportunity.
      this.rescheduleQueued = true;
      if (input.reschedule) this.rescheduleCallback = input.reschedule;
      return Promise.resolve({ status: "skipped", snapshot: preview, reason: "scheduler exclusively leased" });
    }
    const active = this.activeJob;
    if (active) {
      if (unresolvedCount > 1) {
        this.rescheduleQueued = true;
        if (input.reschedule) this.rescheduleCallback = input.reschedule;
      }
      if (active.snapshotId === preview.snapshotId) return active.promise;
      this.rescheduleQueued = true;
      if (input.reschedule) this.rescheduleCallback = input.reschedule;
      return Promise.resolve({ status: "skipped", snapshot: preview, reason: "snapshot queued behind active cycle" });
    }
    if (this.terminalSnapshots.has(preview.snapshotId)) return Promise.resolve({ status: "skipped", snapshot: preview, reason: "snapshot already closed" });
    if (unresolvedCount > 1) {
      this.rescheduleQueued = true;
      if (input.reschedule) this.rescheduleCallback = input.reschedule;
    }
    const controller = new AbortController();
    this.controllers.add(controller);
    const job: Job = { controller, epoch: this.epoch, snapshotId: preview.snapshotId, promise: Promise.resolve({ status: "skipped" as const }) };
    job.promise = this.run(input, preview, controller, selection.source).finally(() => {
      if (this.activeJob !== job) return;
      this.activeJob = undefined;
      this.controllers.delete(controller);
      // An exclusive lease owns the queued callback until it has an awaited
      // idle boundary. Normal scheduling retains the original eager drain.
      if (this.exclusiveLease) return;
      const callback = this.rescheduleQueued ? this.rescheduleCallback : undefined;
      this.rescheduleQueued = false;
      this.rescheduleCallback = undefined;
      if (callback && this.epoch === job.epoch) {
        try { callback(); } catch { /* rescheduling must not change the settled worker result */ }
      }
    });
    this.activeJob = job;
    return job.promise;
  }

  /**
   * Reserve an in-process emergency interval before awaiting the current worker.
   * The reservation is synchronous; an aborted caller still waits for the active
   * worker to settle, then receives a failure rather than a racing snapshot.
   */
  async acquireExclusiveLease(signal?: AbortSignal): Promise<SchedulerExclusiveLeaseResult> {
    if (this.exclusiveLease) return { ok: false, reason: "exclusive-lease-held" };
    if (signal?.aborted) return { ok: false, reason: "aborted" };
    const lease: ExclusiveLease = { epoch: this.epoch };
    this.exclusiveLease = lease;
    const active = this.activeJob;
    if (active) {
      active.controller.abort(new Error("exclusive scheduler lease"));
      try { await active.promise; } catch { /* a settled worker error is still a stable boundary */ }
    }
    if (this.exclusiveLease !== lease || this.epoch !== lease.epoch) return { ok: false, reason: "invalidated" };
    if (signal?.aborted) {
      this.releaseExclusiveLease(lease);
      return { ok: false, reason: "aborted" };
    }
    return { ok: true, lease: { release: () => this.releaseExclusiveLease(lease) } };
  }

  private releaseExclusiveLease(lease: ExclusiveLease): void {
    if (this.exclusiveLease !== lease || this.epoch !== lease.epoch) return;
    this.exclusiveLease = undefined;
    const callback = this.rescheduleQueued ? this.rescheduleCallback : undefined;
    this.rescheduleQueued = false;
    this.rescheduleCallback = undefined;
    if (!callback) return;
    // Release must never start an observer on the emergency call stack. The
    // existing callback remains the sole normal scheduling path.
    queueMicrotask(() => {
      if (this.epoch !== lease.epoch) return;
      try { callback(); } catch { /* rescheduling must not change lease release */ }
    });
  }

  private records(input: SchedulerInput): SessionEntry[] { return mergeRecords(input.records ?? [], this.localRecords); }
  private append(input: SchedulerInput, entry: PlasticEntry): void {
    this.localRecords.push(entry);
    input.append?.(entry);
  }
  private current(input: SchedulerInput, captured: SchedulerIdentity, snapshot: CompletedTurnSnapshot, controller: AbortController, epoch: number): boolean {
    if (controller.signal.aborted || epoch !== this.epoch) return false;
    const identity = input.currentIdentity?.();
    if (!identity) return true;
    return sameBinding(identity.binding, captured.binding)
      && samePrefix(captured.branchIds, identity.branchIds)
      && (identity.snapshotId === undefined || identity.snapshotId === snapshot.snapshotId)
      && (identity.sourceDigest === undefined || identity.sourceDigest === snapshot.span.sourceDigest)
      && snapshot.span.sourceEntryIds.every((id) => identity.branchIds.includes(id));
  }
  private failAttempt(input: SchedulerInput, snapshot: CompletedTurnSnapshot, attempt: PlasticEntry<"plastic.cycle.attempted">, outcome: "failed" | "partial" | "stale" | "oversized", records: SessionEntry[], captured: SchedulerIdentity, controller: AbortController, epoch: number, reason: string): SchedulerResult {
    if (!this.current(input, captured, snapshot, controller, epoch)) return { status: "stale", snapshot, attempt, reason: "stale-generation" };
    const failed = finishCycleAttempt(snapshot, attempt, outcome);
    if (failed) this.append(input, failed);
    return { status: outcome === "stale" ? "stale" : "failed", snapshot, attempt: failed ?? attempt, reason };
  }
  private async run(input: SchedulerInput, snapshot: CompletedTurnSnapshot, controller: AbortController, source: SessionEntry[]): Promise<SchedulerResult> {
    const captured: SchedulerIdentity = { binding: { ...input.binding }, branchIds: entryIds(input.branchEntries) };
    const epoch = this.epoch;
    const observerInputFor = (chunk: SnapshotChunk, model?: ModelTarget) => ({
      binding: input.binding,
      snapshot,
      sourceEntries: chunk.entries,
      sourceEntryIds: chunk.sourceEntryIds,
      runtime: input.runtime,
      signal: controller.signal,
      ...(model ? { model } : {}),
    });
    const partition = partitionCompletedTurnSnapshot(snapshot, source, 160_000, (chunk) => observerRequestFits(observerInputFor(chunk)));
    if (!partition.ok) {
      report(input, { phase: "observer", status: "skipped", reason: partition.reason });
      return { status: "skipped", snapshot, reason: partition.reason };
    }
    const selected = beginQueuedCycleAttempt(snapshot, this.records(input));
    if (!selected.allowed) {
      if (selected.record && selected.reason !== "pending") this.append(input, selected.record);
      return { status: selected.reason === "automatic-retry-exhausted" ? "suppressed" : "skipped", snapshot, attempt: selected.record, reason: selected.reason };
    }
    let attempt = selected.record;
    if (!attempt) return { status: "failed", snapshot, reason: "cycle attempt did not produce an identity" };
    if (selected.reason !== "pending") this.append(input, attempt);
    // Keep the queued source manifest and chunk list immutable across retries. A later
    // branch cannot replace an input that the durable FIFO record already selected.
    const chunks = partition.chunks;
    let observations: ObserverResult["observations"] = [];
    let observer: ObserverResult | undefined;
    const modelTargets: (ModelTarget | undefined)[] = buildModelTargets(input.runtime.visibleModel ?? input.runtime.model);
    for (let observerAttempt = 0; observerAttempt < modelTargets.length; observerAttempt += 1) {
      const model = modelTargets[observerAttempt];
      report(input, { phase: "observer", status: "started", tokenCount: Math.round(snapshot.tokenCount) });
      const chunkObservations: ObserverResult["observations"] = [];
      let failure: ObserverResult | undefined;
      for (const chunk of chunks) {
        const result = await runObserver(observerInputFor(chunk, model));
        if (!this.current(input, captured, snapshot, controller, epoch)) return { status: "stale", snapshot, attempt, reason: "stale-generation" };
        if (!result.ok || !result.manifestValid) { failure = result; break; }
        chunkObservations.push(...result.observations);
      }
      if (!failure) {
        observations = [...chunkObservations];
        observer = { ok: true, status: observations.length === 0 ? "empty-valid" : "complete", manifestValid: true, observations };
        break;
      }
      report(input, { phase: "observer", status: "failed", reason: failure.reason ?? "observer did not return semantic observations" });
      if (failure.status === "stale") return { status: "stale", snapshot, attempt, reason: "stale-generation" };
      if (observerAttempt === modelTargets.length - 1) {
        const failed = finishCycleAttempt(snapshot, attempt, "failed", "observer");
        if (failed) this.append(input, failed);
        return { status: "failed", snapshot, attempt: failed ?? attempt, reason: failure.reason ?? "observer did not return semantic observations" };
      }
    }
    if (!observer) return { status: "failed", snapshot, attempt, reason: "observer did not complete" };
    if (observations.length === 0) report(input, { phase: "observer", status: "no-observations" });
    if (observations.length > 0) this.append(input, makePlasticEntry(PLASTIC_OBSERVATIONS_RECORDED, { schemaVersion: 1, ...input.binding, observations, span: snapshot.span }));

    let reflector: ReflectorResult | undefined;
    for (let reflectorAttempt = 0; reflectorAttempt < modelTargets.length; reflectorAttempt += 1) {
      const model = modelTargets[reflectorAttempt];
      const result = await runReflector({ binding: input.binding, snapshot, observations, runtime: input.runtime, signal: controller.signal, ...(model ? { model } : {}) });
      if (!this.current(input, captured, snapshot, controller, epoch)) return { status: "stale", snapshot, attempt, reason: "stale-generation" };
      if (result.ok && result.manifestValid) { reflector = result; break; }
      report(input, { phase: "reflector", status: "failed", reason: result.reason ?? "reflector did not return semantic reflections" });
      if (result.status === "stale") return { status: "stale", snapshot, attempt, reason: "stale-generation" };
      if (reflectorAttempt === modelTargets.length - 1) {
        const failed = finishCycleAttempt(snapshot, attempt, "failed", "reflector");
        if (failed) this.append(input, failed);
        return { status: "failed", snapshot, attempt: failed ?? attempt, reason: result.reason ?? "reflector did not return semantic reflections" };
      }
    }
    if (!reflector) return { status: "failed", snapshot, attempt, reason: "reflector did not complete" };
    if (reflector.record) this.append(input, reflector.record);
    const closed = closeCycle(snapshot, attempt, {
      outcome: observations.length === 0 ? "empty-valid" : "complete",
      sourceEntryIds: snapshot.span.sourceEntryIds,
      sourceStartId: snapshot.span.sourceStartId,
      sourceEndId: snapshot.span.sourceEndId,
      sourceDigest: snapshot.span.sourceDigest,
      completedTurnEndId: snapshot.span.completedTurnEndId,
      observationIds: observations.map((observation) => observation.id),
      reflectionIds: reflector.reflections.map((reflection) => reflection.id),
    }, this.records(input));
    if (!closed) return this.failAttempt(input, snapshot, attempt, "failed", this.records(input), captured, controller, epoch, "deterministic cycle closer rejected semantic result");
    if (!this.current(input, captured, snapshot, controller, epoch)) return { status: "stale", snapshot, attempt, reason: "stale-generation" };
    this.append(input, closed);
    this.terminalSnapshots.add(snapshot.snapshotId);
    const compactorJob = this.startCompactor(input, closed, captured, controller, epoch);
    return { status: observations.length === 0 ? "empty-valid" : "closed", snapshot, attempt, cycle: closed, ...(compactorJob ? { compactorJob } : {}) };
  }

  private startCompactor(input: SchedulerInput, closed: PlasticEntry<"plastic.cycle.closed">, captured: SchedulerIdentity, controller: AbortController, epoch: number): Promise<CompactorResult> | undefined {
    const config = input.compaction;
    if (!config) return undefined;
    const cycles = [...config.cycles, closed.data];
    const engine = { ...config.engine, binding: input.binding, branchEntries: input.branchEntries, cycles, projectSnapshot: config.projectSnapshot, runtimeToken: config.runtimeToken, pendingStore: config.pendingStore };
    // The compactor only ever sees the stride the engine would compact, so no model call is spent before a valid 6/4 window exists.
    const eligibleCycles = selectEligibleStride(engine);
    if (!eligibleCycles) {
      report(input, { phase: "compactor", status: "skipped", reason: `stride not eligible (${diagnoseEligibleWindow(engine)})` });
      return undefined;
    }
    const jobInput: CompactorInput = {
      engine,
      eligibleCycles,
      priorState: config.priorState,
      projectSnapshot: config.projectSnapshot,
      runtime: input.runtime,
      signal: controller.signal,
      isCurrent: () => this.current(input, captured, { span: closed.data } as unknown as CompletedTurnSnapshot, controller, epoch),
    };
    const targets: (ModelTarget | undefined)[] = buildModelTargets(input.runtime.visibleModel ?? input.runtime.model);
    const job = (async (): Promise<CompactorResult> => {
      let result: CompactorResult = { ok: false, detached: true, reason: "compactor did not prepare compaction" };
      for (const model of targets) {
        result = await runCompactor({ ...jobInput, ...(model ? { model } : {}) });
        if (result.ok || result.reason === "stale-generation" || compactorWaiting(result.reason)) break;
      }
      if (!result.ok) report(input, { phase: "compactor", status: compactorWaiting(result.reason) ? "skipped" : "failed", reason: result.reason ?? "compactor did not prepare compaction" });
      return result;
    })().catch((error) => {
      const result = { ok: false, detached: true as const, reason: error instanceof Error ? error.message : String(error) };
      report(input, { phase: "compactor", status: "failed", reason: result.reason });
      return result;
    });
    this.compactorResults.push(job);
    return job;
  }

  /** Read-only observation for host hooks; it never aborts, leases, drains, or exposes payload. */
  isBusy(): boolean { return this.activeJob !== undefined; }
  get busy(): boolean { return this.isBusy(); }
  hasActiveWorker(): boolean { return this.isBusy(); }

  /** Abort and invalidate all work on shutdown, reload, switch, or fork. */
  invalidate(_reason = "invalidated"): void {
    this.epoch += 1;
    this.exclusiveLease = undefined;
    for (const controller of this.controllers) controller.abort(new Error(_reason));
    this.controllers.clear();
    this.activeJob = undefined;
    this.rescheduleQueued = false;
    this.rescheduleCallback = undefined;
  }
  abort(reason = "aborted"): void { this.invalidate(reason); }
  shutdown(): void { this.invalidate("shutdown"); }
  switchSession(): void { this.invalidate("session-switch"); }
  fork(): void { this.invalidate("fork"); }
  reload(): void { this.invalidate("reload"); }
  getDetachedCompactorJobs(): readonly Promise<CompactorResult>[] { return [...this.compactorResults]; }
}

export function createCycleScheduler(): CycleScheduler { return new CycleScheduler(); }
export const GenerationSafeScheduler = CycleScheduler;
export const scheduleCycle = (scheduler: CycleScheduler, input: SchedulerInput): Promise<SchedulerResult> => scheduler.trigger(input);
export function snapshotKey(snapshot: CompletedTurnSnapshot): string { return digestParts(snapshot.binding, snapshot.span).slice(0, 32); }
export function serializeWorkerSnapshot(entries: SessionEntry[]): string { return serializer(entries); }

export async function requestPromotion(input: PromoterInput): Promise<PromoterResult> {
  return runPromoter(input);
}

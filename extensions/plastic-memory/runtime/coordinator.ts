import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { defaultConfig, type PlasticMemoryConfig } from "../config.ts";
import { recordDigest, sessionDigest } from "../common/ids.ts";
import { digestParts, scrubSensitiveText } from "../common/safety.ts";
import { acknowledgeCompaction, selectEligibleStride, type CompactionEntry, type PhysicalBudget } from "../compaction/engine.ts";
import { prepareEmergencyCompaction, selectEmergencyWindow } from "../compaction/emergency.ts";
import { projectPlasticContext } from "../compaction/projection.ts";
import { createPendingStore, isPendingUsable, type PendingCompaction } from "../compaction/pending.ts";
import { bootstrapSession } from "../session/bootstrap.ts";
import { isProjectId } from "../project/schema.ts";
import { closedCyclesForBinding, createQueuedCycleRecords, reconstructCycleQueue, type QueueReconstruction } from "../session/cycles.ts";
import { foldLedger, hasOrderedContextTail, isSourceEntry, normalSourceEntries, proposalQueueHead, reconstructProposalQueue } from "../session/ledger.ts";
import {
  isPlasticRecord,
  PLASTIC_CYCLE_ATTEMPTED,
  PLASTIC_CYCLE_CLOSED,
  PLASTIC_CYCLE_QUEUED,
  PLASTIC_OBSERVATIONS_RECORDED,
  PLASTIC_REFLECTIONS_RECORDED,
  isCompactionAppliedRecord,
  isStructuredProjectProposalRecord,
  type BootstrapData,
  type CompactionAppliedData,
  type CycleClosedData,
  type SessionBinding,
  type SessionEntry,
  type StructuredProjectProposalData,
} from "../session/types.ts";
import { createCycleScheduler, type SchedulerIdentity, type SchedulerLifecycleEvent } from "../workers/scheduler.ts";
import { buildModelTargets, type LunaModel, type RunnerRuntime } from "../workers/runner.ts";
import { runCompactor } from "../workers/compactor.ts";
import { runProjectPromoter } from "../workers/promoter.ts";
import { verifyCumulativeState, type CumulativeState, type ProjectSnapshot } from "../compaction/render.ts";

export type CoordinatorRuntime = RunnerRuntime | (() => RunnerRuntime | undefined);
export type CoordinatorOptions = Readonly<{
  config?: PlasticMemoryConfig;
  enabled?: boolean;
  runtime?: CoordinatorRuntime;
  runtimeToken?: string;
  projectSnapshot?: ProjectSnapshot | unknown | (() => ProjectSnapshot | unknown);
  projectId?: (ctx?: ExtensionContext) => string | undefined;
  now?: () => number;
}>;

export type PlasticCompactionDiagnostic = Readonly<{
  phase: "normal-refresh" | "emergency-fallback" | "pending-validation" | "pending-consume" | "pending-view" | "internal-apply" | "compaction";
  outcome: "cancelled" | "failed" | "skipped" | "prepared" | "applied";
  code: string;
  reason: string;
}>;
export type PlasticCompactionInvocation = Readonly<{
  invoked: boolean;
  outcome: "not-invoked" | "observed" | "cancelled" | "failed" | "skipped" | "prepared" | "applied";
  code: string;
}>;
export type PlasticLifecycleDiagnostic = Readonly<{
  phase: SchedulerLifecycleEvent["phase"];
  outcome: "failed" | "skipped";
  code: string;
  reason: string;
}>;
export type EmergencyAvailabilityReason =
  | "available"
  | "disabled"
  | "binding-invalid"
  | "scheduler-busy"
  | "pending-compaction"
  | "queue-invalid"
  | "runtime-unavailable"
  | "context-invalid"
  | "budget-unavailable"
  | "no-safe-window";
export type PlasticMemoryStatus = Readonly<{
  status: "ready" | "disabled";
  context: Readonly<{ tokens: number | null; window: number | null }>;
  thresholds: Readonly<{ normal: number; automatic: number }>;
  binding: Readonly<{ generation: number }>;
  cycles: Readonly<{ closed: number; queued: number; unresolved: number; processed: number }>;
  scheduler: Readonly<{ busy: boolean }>;
  pending: Readonly<{ present: boolean; prepared: boolean; consumed: boolean }>;
  compaction: Readonly<{ handlerRegistered: boolean; lastInvocation: PlasticCompactionInvocation }>;
  lastCompactionDiagnostic: PlasticCompactionDiagnostic | null;
  lastLifecycleDiagnostic: PlasticLifecycleDiagnostic | null;
  emergency: Readonly<{ available: boolean; reason: EmergencyAvailabilityReason; lastAttempted: boolean }>;
}>;

type DiagnosticSpec = Readonly<{
  phase: PlasticCompactionDiagnostic["phase"];
  outcome: PlasticCompactionDiagnostic["outcome"];
  code: string;
  reason: unknown;
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
type PromotionSnapshot = Readonly<{
  acknowledgement: CompactionAppliedData;
  state: CumulativeState;
}>;
type NormalRefreshResult = Readonly<{
  pending?: PendingCompaction;
  allowEmergency: boolean;
  failure?: DiagnosticSpec;
}>;
type EmergencyRefreshResult = Readonly<{
  pending?: PendingCompaction;
  failure?: DiagnosticSpec;
}>;
type EmergencyAvailability = Readonly<{
  available: boolean;
  reason: EmergencyAvailabilityReason;
}>;
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
const NORMAL_COMPACTION_MIN_CYCLES = 6;
const AUTO_APPLY_MIN_CONTEXT_TOKENS = 120_000;
const INTERNAL_COMPACTION_INSTRUCTIONS_PREFIX = "\u0000plastic-memory:internal-compaction:";
const PROPOSAL_WIDGET_KEY = "plastic-memory-learning-queue";
const WIDGET_TITLE_LIMIT = 160;
const WIDGET_BODY_LIMIT = 400;
const WIDGET_EVIDENCE_LIMIT = 480;
const NOT_INVOKED_COMPACTION: PlasticCompactionInvocation = Object.freeze({
  invoked: false,
  outcome: "not-invoked",
  code: "handler-not-invoked",
});
function internalCompactionInstructions(id: string): string {
  return `${INTERNAL_COMPACTION_INSTRUCTIONS_PREFIX}${id}`;
}

function entryIds(entries: readonly SessionEntry[]): string[] {
  return entries.flatMap((entry) => typeof entry.id === "string" && entry.id.length > 0 ? [entry.id] : []);
}
function sameBinding(left: SessionBinding, right: SessionBinding): boolean {
  return left.sessionId === right.sessionId && left.generation === right.generation && left.branchId === right.branchId;
}
function samePrefix(expected: readonly string[], actual: readonly string[]): boolean {
  return actual.length >= expected.length && expected.every((id, index) => actual[index] === id);
}
function cloneFrozen<T>(value: T): T | undefined {
  try {
    const clone = structuredClone(value);
    const freeze = (current: unknown): void => {
      if (!current || typeof current !== "object" || Object.isFrozen(current)) return;
      Object.freeze(current);
      for (const child of Object.values(current)) freeze(child);
    };
    freeze(clone);
    return clone;
  } catch {
    return undefined;
  }
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
  return closedCyclesForBinding(branch, binding);
}
function bootstrapFor(branch: SessionEntry[], binding: SessionBinding): BootstrapData | undefined {
  const folded = foldLedger(branch, { context: binding });
  return folded.latestBootstrap;
}
function safeNoticeReason(value: unknown): string {
  const source = typeof value === "string" ? value : String(value ?? "worker did not complete");
  return scrubSensitiveText(source).replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 120) || "worker did not complete";
}
function safeDiagnosticReason(value: unknown): string {
  return safeNoticeReason(value)
    .replace(/\b(?:session|branch|source|snapshot|cycle|entry|attempt|proposal|compaction)[ _-]?ids?\b\s*(?:[:=]\s*)?[A-Za-z0-9:_./-]+/giu, "[REDACTED_ID]")
    .replace(/\b(?:pm:[a-z]+:[A-Za-z0-9_-]+|[0-9a-f]{24,64}|[0-9a-f]{8}-[0-9a-f-]{27,})\b/giu, "[REDACTED_ID]")
    .replace(/(^|[\s("'`])(?:~\/|\.\.?\/|\/)[^\s("'`]+/gu, "$1[REDACTED_PATH]")
    .trim().slice(0, 120) || "worker did not complete";
}
function widgetText(value: unknown, fallback: string, limit: number): string {
  const source = typeof value === "string" && value.trim() ? value : fallback;
  return scrubSensitiveText(source).replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, limit) || fallback;
}
const PLASTIC_SUMMARY_TOKENS = 12_000; // SUMMARY_CAP_CHARS / conservative chars-per-token
const COMPACTION_RESERVE_TOKENS = 16_384; // real host reserve, not an estimate; never scale it
const CALIBRATION_MIN_SAMPLE_TOKENS = 2_000;
const CALIBRATION_MAX_FACTOR = 3;
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
export function calibrationFactorFor(ctx: ExtensionContext): number {
  try {
    const usage = (ctx as unknown as { getContextUsage?: () => PublicContextUsage | undefined }).getContextUsage?.();
    if (!usage || !Number.isFinite(usage.tokens) || usage.tokens <= 0) return 1;
    const getSystemPrompt = (ctx as unknown as { getSystemPrompt?: () => string }).getSystemPrompt;
    const systemPrompt = getSystemPrompt?.();
    if (typeof systemPrompt !== "string") return 1;
    const systemPromptTokens = estimatePublicMessage({ role: "user", content: [{ type: "text", text: systemPrompt }] });
    if (systemPromptTokens === undefined) return 1;
    let ourEstimate = systemPromptTokens;
    for (const entry of ctx.sessionManager.buildContextEntries() as SessionEntry[]) {
      const tokens = estimateEntryTokens(entry);
      if (tokens === undefined) return 1;
      ourEstimate += tokens;
    }
    const factor = usage.tokens / ourEstimate;
    // Provider usage and this estimate describe the same current context, so their
    // ratio is runtime evidence. Only ratios above one are honored (never loosen
    // the budget), and the host reserve below is real capacity, not estimated text.
    if (ourEstimate < CALIBRATION_MIN_SAMPLE_TOKENS || !Number.isFinite(factor) || factor <= 1) return 1;
    return Math.min(factor, CALIBRATION_MAX_FACTOR);
  } catch {
    return 1;
  }
}
function fixedPhysicalBudgetFor(ctx: ExtensionContext): (Pick<PhysicalBudget, "contextWindow" | "fixedTokens"> & { factor: number }) | null {
  try {
    const usage = (ctx as unknown as { getContextUsage?: () => PublicContextUsage | undefined }).getContextUsage?.();
    const contextWindow = usage?.contextWindow;
    const getSystemPrompt = (ctx as unknown as { getSystemPrompt?: () => string }).getSystemPrompt;
    const systemPrompt = getSystemPrompt?.();
    if (!Number.isSafeInteger(contextWindow) || contextWindow <= 0 || typeof systemPrompt !== "string") return null;
    const systemPromptTokens = estimatePublicMessage({ role: "user", content: [{ type: "text", text: systemPrompt }] });
    if (systemPromptTokens === undefined) return null;
    const factor = calibrationFactorFor(ctx);
    return {
      contextWindow,
      fixedTokens: Math.ceil((systemPromptTokens + PLASTIC_SUMMARY_TOKENS) * factor) + COMPACTION_RESERVE_TOKENS,
      factor,
    };
  } catch {
    return null;
  }
}
function scaledEntryTokens(entry: SessionEntry, factor: number): number | undefined {
  const tokens = estimateEntryTokens(entry);
  return tokens === undefined ? undefined : Math.ceil(tokens * factor);
}
export function physicalBudgetFor(ctx: ExtensionContext, branch: readonly SessionEntry[]): PhysicalBudget | null {
  const fixed = fixedPhysicalBudgetFor(ctx);
  if (!fixed) return null;
  const entryTokens: Record<string, number> = {};
  for (const entry of branch) {
    if (typeof entry.id !== "string") continue;
    const tokens = scaledEntryTokens(entry, fixed.factor);
    if (tokens !== undefined) entryTokens[entry.id] = tokens;
  }
  return { contextWindow: fixed.contextWindow, fixedTokens: fixed.fixedTokens, entryTokens };
}
export function physicalTailFits(ctx: ExtensionContext, branch: readonly SessionEntry[], cutId: string): boolean {
  const budget = fixedPhysicalBudgetFor(ctx);
  if (!budget) return false;
  const index = branch.findIndex((entry) => entry.id === cutId);
  if (index < 0) return false;
  let tailTokens = 0;
  for (const entry of branch.slice(index)) {
    const tokens = scaledEntryTokens(entry, budget.factor);
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

/**
 * The one host owner for plastic-memory compaction and context projection.
 * Registration is explicit; the inert extension root does not import this
 * module until the later cutover task.
 */
export class PlasticMemoryCoordinator {
  private readonly config: PlasticMemoryConfig;
  private readonly runtime?: CoordinatorRuntime;
  private readonly projectSnapshot?: CoordinatorOptions["projectSnapshot"];
  private readonly projectId?: CoordinatorOptions["projectId"];
  private readonly now: () => number;
  private readonly runtimeToken: string;
  private readonly scheduler = createCycleScheduler();
  private readonly pendingStore = createPendingStore();
  private readonly preparedViews = new WeakMap<object, { summary: string; details: unknown; state: CumulativeState }>();
  private readonly reportedPreparations = new WeakSet<object>();
  private readonly promotionControllers = new Set<AbortController>();
  private widgetContext?: ExtensionContext;
  private generation = 0;
  private branchId = "";
  private settled = false;
  private bootstrapAttempted = false;
  private internalIntent?: InternalIntent;
  private applyLatch?: ApplyLatch;
  /** The one pending already handed to Pi and awaiting host acknowledgement. */
  private inFlightPending?: PendingCompaction;
  private priorState?: CumulativeState;
  private lastCompactionDiagnostic?: PlasticCompactionDiagnostic;
  private lastLifecycleDiagnostic?: PlasticLifecycleDiagnostic;
  private compactionHandlerRegistered = false;
  private lastCompactionInvocation: PlasticCompactionInvocation = NOT_INVOKED_COMPACTION;
  private emergencyAttempted = false;
  private active = true;

  constructor(private readonly pi: ExtensionAPI, options: CoordinatorOptions = {}) {
    this.config = options.config ?? { ...defaultConfig(), enabled: options.enabled === true };
    this.runtime = options.runtime;
    this.projectSnapshot = options.projectSnapshot;
    this.projectId = options.projectId;
    this.now = options.now ?? (() => Date.now());
    this.runtimeToken = options.runtimeToken ?? `plastic-memory:${randomUUID()}`;
    this.register();
  }

  private enabled(): boolean { return this.active && (this.config.enabled === true); }

  private recordDiagnostic(spec: DiagnosticSpec): void {
    this.lastCompactionDiagnostic = Object.freeze({
      phase: spec.phase,
      outcome: spec.outcome,
      code: spec.code,
      reason: safeDiagnosticReason(spec.reason),
    });
  }

  private markCompactionInvocation(outcome: Exclude<PlasticCompactionInvocation["outcome"], "not-invoked">, code: string): void {
    this.lastCompactionInvocation = Object.freeze({ invoked: true, outcome, code });
  }

  private notifyCompactionDecision(ctx: ExtensionContext, label: string, spec: DiagnosticSpec, level: "warning" | "info"): void {
    if (!ctx.hasUI || typeof ctx.ui?.notify !== "function") return;
    try {
      ctx.ui.notify(`Plastic memory: ${label} — ${spec.code}: ${safeDiagnosticReason(spec.reason)}`, level);
    } catch {
      // UI observability must never change compaction behavior.
    }
  }

  private cancelCompaction(spec: DiagnosticSpec, ctx: ExtensionContext): { cancel: true } {
    this.recordDiagnostic(spec);
    this.markCompactionInvocation("cancelled", spec.code);
    this.lastLifecycleDiagnostic = Object.freeze({
      phase: "compaction",
      outcome: "failed",
      code: spec.code,
      reason: safeDiagnosticReason(spec.reason),
    });
    this.notifyCompactionDecision(ctx, "internal compaction cancelled", spec, "warning");
    return { cancel: true };
  }

  private yieldToNativeCompaction(spec: DiagnosticSpec, ctx: ExtensionContext): undefined {
    const outcome: PlasticLifecycleDiagnostic["outcome"] = spec.outcome === "failed" ? "failed" : "skipped";
    const diagnostic: DiagnosticSpec = { ...spec, outcome };
    this.recordDiagnostic(diagnostic);
    this.markCompactionInvocation("skipped", "native-fallback");
    this.lastLifecycleDiagnostic = Object.freeze({
      phase: "compaction",
      outcome,
      code: diagnostic.code,
      reason: safeDiagnosticReason(diagnostic.reason),
    });
    this.notifyCompactionDecision(ctx, "using native compaction", diagnostic, outcome === "failed" ? "warning" : "info");
    return undefined;
  }

  private watchHostCompactionAbort(event: { signal?: unknown }, ctx: ExtensionContext): void {
    const signal = eventSignal(event.signal);
    if (!signal) return;
    const report = (): void => {
      const spec: DiagnosticSpec = { phase: "compaction", outcome: "cancelled", code: "host-aborted", reason: "the host aborted compaction after the Plastic hook ran" };
      this.recordDiagnostic(spec);
      this.markCompactionInvocation("cancelled", spec.code);
      this.lastLifecycleDiagnostic = Object.freeze({ phase: "compaction", outcome: "failed", code: spec.code, reason: safeDiagnosticReason(spec.reason) });
      this.notifyCompactionDecision(ctx, "host compaction aborted", spec, "warning");
    };
    if (signal.aborted) report();
    else signal.addEventListener("abort", report, { once: true });
  }

  private invalidate(reason: string, ctx?: ExtensionContext): void {
    this.clearProposalWidget(ctx);
    this.generation += 1;
    this.branchId = `branch:${randomUUID()}`;
    this.scheduler.invalidate(reason);
    for (const controller of this.promotionControllers) controller.abort(new Error(reason));
    this.promotionControllers.clear();
    this.pendingStore.clear();
    this.internalIntent = undefined;
    this.applyLatch = undefined;
    this.inFlightPending = undefined;
    this.priorState = undefined;
    this.lastCompactionDiagnostic = undefined;
    this.lastCompactionInvocation = NOT_INVOKED_COMPACTION;
    this.emergencyAttempted = false;
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

  private projectIdFor(ctx?: ExtensionContext): string | undefined {
    try {
      const projectId = this.projectId?.(ctx);
      return isProjectId(projectId) ? projectId : undefined;
    } catch {
      return undefined;
    }
  }

  private append(record: { customType: string; data: unknown }): void {
    if (this.enabled()) this.pi.appendEntry(record.customType, record.data);
  }

  private clearProposalWidget(ctx?: ExtensionContext): void {
    const target = ctx ?? this.widgetContext;
    if (!target || !target.hasUI || typeof target.ui?.setWidget !== "function") return;
    try {
      target.ui.setWidget(PROPOSAL_WIDGET_KEY, undefined, { placement: "aboveEditor" });
    } catch {
      // Widget cleanup is best-effort and must never affect lifecycle state.
    }
  }

  private proposalWidgetLines(head: { data: StructuredProjectProposalData }): string[] {
    const candidate = head.data.candidate;
    const evidence = Array.isArray(candidate.evidence)
      ? candidate.evidence.map((item) => `${widgetText(item.path, "unknown path", 120)}: ${widgetText(item.claim, "no claim", 220)}`).join("; ")
      : "no evidence recorded";
    return [
      "Plastic memory proposal",
      `Title: ${widgetText(candidate.title, "untitled proposal", WIDGET_TITLE_LIMIT)}`,
      `Target: ${widgetText(candidate.target, "unknown target", 180)}`,
      `Rule: ${widgetText(candidate.body, "no synopsis recorded", WIDGET_BODY_LIMIT)}`,
      `Evidence: ${widgetText(evidence, "no evidence recorded", WIDGET_EVIDENCE_LIMIT)}`,
      `Proposal: ${head.data.proposalId}`,
      `Accept: /memory:accept ${head.data.proposalId}`,
      `Reject: /memory:reject ${head.data.proposalId}`,
    ];
  }

  /** Project only the strict current-branch FIFO head into the non-modal editor widget. */
  refreshProposalWidget(ctx: ExtensionContext): void {
    this.widgetContext = ctx;
    if (!ctx.hasUI || typeof ctx.ui?.setWidget !== "function") return;
    try {
      const branch = ctx.sessionManager.getBranch() as SessionEntry[];
      const binding = this.binding(ctx);
      const queue = reconstructProposalQueue({ branchEntries: branch, binding, leafId: ctx.sessionManager.getLeafId() });
      const head = proposalQueueHead(queue);
      const projectId = this.projectIdFor(ctx);
      if (!head || !sameBinding(head.data, binding) || !projectId || head.data.projectId !== projectId) {
        this.clearProposalWidget(ctx);
        return;
      }
      ctx.ui.setWidget(PROPOSAL_WIDGET_KEY, this.proposalWidgetLines(head), { placement: "aboveEditor" });
    } catch {
      this.clearProposalWidget(ctx);
    }
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

  private contextUsageForStatus(ctx: ExtensionContext): { tokens: number | null; window: number | null } {
    try {
      const usage = ctx.getContextUsage();
      const tokens = usage && typeof usage.tokens === "number" && Number.isFinite(usage.tokens) && usage.tokens >= 0 ? usage.tokens : null;
      const window = usage && typeof usage.contextWindow === "number" && Number.isFinite(usage.contextWindow) && usage.contextWindow > 0 ? usage.contextWindow : null;
      return { tokens, window };
    } catch {
      return { tokens: null, window: null };
    }
  }

  private emergencyAvailableForStatus(
    ctx: ExtensionContext,
    binding: SessionBinding,
    branch: SessionEntry[],
    cycles: CycleClosedData[],
    queue: QueueReconstruction | undefined,
    pending: PendingCompaction | undefined,
  ): EmergencyAvailability {
    if (!this.enabled()) return { available: false, reason: "disabled" };
    if (!binding.sessionId || !Number.isSafeInteger(binding.generation) || binding.generation < 0 || !binding.branchId) {
      return { available: false, reason: "binding-invalid" };
    }
    if (this.scheduler.isBusy()) return { available: false, reason: "scheduler-busy" };
    if (pending) return { available: false, reason: "pending-compaction" };
    if (!queue?.valid) return { available: false, reason: "queue-invalid" };
    let runtime: RunnerRuntime | undefined;
    try {
      runtime = this.runtimeFor();
    } catch {
      return { available: false, reason: "runtime-unavailable" };
    }
    if (!runtime) return { available: false, reason: "runtime-unavailable" };
    try {
      const activeContext = ctx.sessionManager.buildContextEntries() as SessionEntry[];
      const activeEntryIds = entryIds(activeContext);
      if (activeEntryIds.length !== activeContext.length || new Set(activeEntryIds).size !== activeEntryIds.length) {
        return { available: false, reason: "context-invalid" };
      }
      const physicalBudget = physicalBudgetFor(ctx, branch);
      if (!physicalBudget) return { available: false, reason: "budget-unavailable" };
      const folded = foldLedger(branch, { context: binding });
      const available = Boolean(selectEmergencyWindow({
        binding,
        branchEntries: branch,
        activeEntryIds,
        cycles,
        physicalBudget,
        activeMemoryIds: folded.activeObservations.map((observation) => observation.id),
      }));
      return available ? { available: true, reason: "available" } : { available: false, reason: "no-safe-window" };
    } catch {
      return { available: false, reason: "context-invalid" };
    }
  }

  /** Append every newly crossed completed-turn batch, and prove each append is current before work starts. */
  private captureQueuedCycles(ctx: ExtensionContext, binding: SessionBinding, bootstrap: BootstrapData): QueueReconstruction | undefined {
    let state = this.queueState(ctx, binding, bootstrap);
    if (!state) return undefined;
    const branchEntries = ctx.sessionManager.getBranch() as SessionEntry[];
    const closedSourceIds = new Set(cyclesFor(branchEntries, binding).flatMap((cycle) => cycle.sourceEntryIds));
    const sourceEntries = normalSourceEntries(branchEntries, bootstrap).filter((entry) => !closedSourceIds.has(entry.id as string));
    const candidates = createQueuedCycleRecords({ binding, sourceEntries });
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
      if (!isPlasticRecord(entry)
        || (entry.customType !== PLASTIC_CYCLE_QUEUED && !isStructuredProjectProposalRecord(entry))
        || entry.data.sessionId !== sessionId) continue;
      const binding = { sessionId: entry.data.sessionId, generation: entry.data.generation, branchId: entry.data.branchId };
      candidates.set(`${binding.generation}\u0000${binding.branchId}`, binding);
    }
    const resumable: SessionBinding[] = [];
    for (const binding of candidates.values()) {
      const bootstrap = bootstrapFor(branchEntries, binding);
      const state = bootstrap ? this.queueState(ctx, binding, bootstrap) : undefined;
      const proposals = reconstructProposalQueue({ branchEntries, binding, leafId: ctx.sessionManager.getLeafId() });
      const proposalHead = proposalQueueHead(proposals);
      const proposalMatches = proposalHead !== undefined && sameBinding(proposalHead.data, binding);
      if (state?.restartCandidate || proposalMatches) resumable.push(binding);
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
    if (event.phase === "compactor" && event.status === "failed") {
      this.recordDiagnostic({ phase: "normal-refresh", outcome: "failed", code: "compactor-failed", reason: event.reason ?? "normal compactor failed" });
    } else if (event.phase === "compactor" && event.status === "skipped") {
      this.recordDiagnostic({ phase: "normal-refresh", outcome: "skipped", code: "normal-stride-unavailable", reason: event.reason ?? "normal compaction stride is not currently available" });
    }
    const lifecycleOutcome = event.status === "failed" || event.status === "skipped" ? event.status : undefined;
    const lifecycleDiagnostic = lifecycleOutcome ? Object.freeze({
      phase: event.phase,
      outcome: lifecycleOutcome,
      code: `${event.phase}-${lifecycleOutcome}`,
      reason: safeDiagnosticReason(event.reason ?? `${event.phase} ${lifecycleOutcome} did not provide a reason`),
    }) : undefined;
    if (lifecycleDiagnostic) this.lastLifecycleDiagnostic = lifecycleDiagnostic;
    if (!ctx.hasUI || typeof ctx.ui?.notify !== "function") return;
    const reason = lifecycleDiagnostic
      ? ` — ${lifecycleDiagnostic.code}: ${lifecycleDiagnostic.reason}`
      : event.reason === undefined ? "" : ` — ${safeNoticeReason(event.reason)}`;
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
          this.recordDiagnostic({ phase: "normal-refresh", outcome: "prepared", code: "prepared", reason: "normal compaction prepared" });
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
  private async refreshPendingFromClosedCycles(event: { preparation: { firstKeptEntryId?: string }; branchEntries: SessionEntry[] }, ctx: ExtensionContext): Promise<NormalRefreshResult> {
    if (this.scheduler.isBusy()) {
      return {
        allowEmergency: false,
        failure: { phase: "normal-refresh", outcome: "cancelled", code: "scheduler-busy", reason: "normal refresh was skipped while a worker was active" },
      };
    }
    try {
      const current = ctx.sessionManager.getBranch() as SessionEntry[];
      if (!hasOrderedContextTail(event.branchEntries) || !hasOrderedContextTail(current)
        || entryIds(event.branchEntries).join("\u0000") !== entryIds(current).join("\u0000")) {
        return {
          allowEmergency: false,
          failure: { phase: "normal-refresh", outcome: "cancelled", code: "branch-changed", reason: "normal refresh saw a changed current branch" },
        };
      }
      const binding = this.binding(ctx);
      const bootstrap = bootstrapFor(current, binding);
      if (!bootstrap || !this.queueState(ctx, binding, bootstrap)) {
        return {
          allowEmergency: false,
          failure: { phase: "normal-refresh", outcome: "cancelled", code: "queue-unavailable", reason: "normal cycle queue was unavailable" },
        };
      }
      const runtime = this.runtimeFor();
      const physicalBudget = physicalBudgetFor(ctx, current);
      if (!runtime || !physicalBudget) {
        return {
          allowEmergency: false,
          failure: { phase: "normal-refresh", outcome: "cancelled", code: "runtime-or-budget-unavailable", reason: "normal compaction prerequisites were unavailable" },
        };
      }
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
      if (!eligibleCycles) {
        return this.scheduler.isBusy()
          ? {
            allowEmergency: false,
            failure: { phase: "normal-refresh", outcome: "cancelled", code: "scheduler-busy", reason: "normal refresh was skipped while a worker was active" },
          }
          : { allowEmergency: true };
      }
      if (this.scheduler.isBusy()) {
        return {
          allowEmergency: false,
          failure: { phase: "normal-refresh", outcome: "cancelled", code: "scheduler-busy", reason: "normal refresh was skipped while a worker was active" },
        };
      }
      let finalFailureReason: unknown;
      for (const model of buildModelTargets(usableVisibleModel(ctx))) {
        if (this.scheduler.isBusy()) {
          return {
            allowEmergency: false,
            failure: { phase: "normal-refresh", outcome: "cancelled", code: "scheduler-busy", reason: "normal refresh was skipped while a worker was active" },
          };
        }
        const result = await runCompactor({
          engine,
          eligibleCycles,
          priorState: this.priorState,
          projectSnapshot,
          runtime,
          model,
        });
        if (this.scheduler.isBusy()) {
          return {
            allowEmergency: false,
            failure: { phase: "normal-refresh", outcome: "cancelled", code: "scheduler-busy", reason: "normal refresh was skipped while a worker was active" },
          };
        }
        if (!result.ok || !result.prepared) {
          finalFailureReason = result.reason;
          continue;
        }
        const pending = result.prepared.pending;
        if (!this.preparationMatches(event, pending, ctx, false)) {
          return {
            allowEmergency: false,
            failure: { phase: "normal-refresh", outcome: "cancelled", code: "prepared-cut-stale", reason: "normal prepared compaction was stale before host consumption" },
          };
        }
        this.pendingStore.stage(pending);
        this.preparedViews.set(pending as object, {
          summary: result.prepared.rendered.summary,
          details: result.prepared.rendered.details,
          state: result.prepared.rendered.state,
        });
        this.recordDiagnostic({ phase: "normal-refresh", outcome: "prepared", code: "prepared", reason: "normal compaction prepared" });
        this.markCompactionInvocation("prepared", "prepared");
        this.reportLifecycle(ctx, { phase: "compaction", status: "prepared" });
        return { pending, allowEmergency: false };
      }
      const reason = finalFailureReason ?? "compactor did not prepare compaction";
      this.reportLifecycle(ctx, {
        phase: "compaction",
        status: "failed",
        reason,
      });
      return {
        allowEmergency: false,
        failure: { phase: "normal-refresh", outcome: "failed", code: "compactor-failed", reason },
      };
    } catch (error) {
      // The host hook is fail-closed and never exposes a partial worker result.
      return {
        allowEmergency: false,
        failure: { phase: "normal-refresh", outcome: "failed", code: "refresh-failed-closed", reason: error instanceof Error ? error.message : "normal refresh failed closed" },
      };
    }
  }

  private reportEmergencyOutcome(ctx: ExtensionContext, status: "failed" | "skipped", reason: string): void {
    this.reportLifecycle(ctx, { phase: "compaction", status, reason });
  }

  private captureEmergencySnapshot(
    event: { preparation?: { tokensBefore?: unknown }; branchEntries: SessionEntry[] },
    ctx: ExtensionContext,
  ): EmergencySnapshot | undefined {
    try {
      const runtime = this.runtimeFor();
      const branch = ctx.sessionManager.getBranch() as SessionEntry[];
      const activeContext = ctx.sessionManager.buildContextEntries() as SessionEntry[];
      const tokensBefore = event.preparation?.tokensBefore;
      if (!runtime || !hasOrderedContextTail(branch) || !hasOrderedContextTail(event.branchEntries)
        || entryIds(event.branchEntries).join("\u0000") !== entryIds(branch).join("\u0000")
        || typeof tokensBefore !== "number" || !Number.isFinite(tokensBefore) || tokensBefore < 0) return undefined;
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
      const priorState = this.priorState ? structuredClone(this.priorState) as CumulativeState : undefined;
      return {
        binding,
        branchEntries,
        branchDigest: digestParts(branchEntries),
        activeContextDigest: digestParts(activeContext),
        activeEntryIds,
        cycles: cyclesFor(branchEntries, binding),
        activeMemoryIds: folded.activeObservations.map((observation) => observation.id),
        ...(priorState ? { priorState } : {}),
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
      && data.span.sourceEntryIds.length > 0
      && data.span.sourceEntryIds.every((id) => typeof id === "string" && snapshot.branchEntries.some((entry) => entry.id === id));
  }

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

  /** Prepare the existing transient emergency window only after normal six/four selection failed. */
  private async refreshPendingFromEmergency(
    event: { preparation?: { tokensBefore?: unknown }; branchEntries: SessionEntry[] },
    ctx: ExtensionContext,
  ): Promise<EmergencyRefreshResult> {
    this.emergencyAttempted = true;
    const reject = (status: "failed" | "skipped", code: string, reason: unknown): EmergencyRefreshResult => {
      this.reportEmergencyOutcome(ctx, status, safeNoticeReason(reason));
      return {
        failure: {
          phase: "emergency-fallback",
          outcome: status === "failed" ? "failed" : "cancelled",
          code,
          reason,
        },
      };
    };
    if (this.scheduler.isBusy()) return reject("skipped", "scheduler-busy", "emergency fallback skipped while normal worker was active");
    const signal = eventSignal((event as unknown as { signal?: unknown }).signal);
    const acquired = await this.scheduler.acquireExclusiveLease(signal);
    if (!acquired.ok) {
      return reject("skipped", signal?.aborted ? "aborted-before-lease" : "exclusive-window-unavailable", signal?.aborted
        ? "emergency fallback was cancelled before acquiring its exclusive window"
        : "emergency fallback could not acquire its exclusive window");
    }
    try {
      if (signal?.aborted) return reject("skipped", "aborted-before-selection", "emergency fallback was cancelled before selection");
      const snapshot = this.captureEmergencySnapshot(event, ctx);
      if (!snapshot || !this.emergencySnapshotCurrent(ctx, snapshot)) return reject("skipped", "stale-snapshot", "emergency snapshot was not current");
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
      if (!selection || remainingMs <= 0) return reject("skipped", "no-safe-window", "emergency selector found no safe current window");
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
        signal,
        deadlineMs: remainingMs,
      });
      if (!prepared.ok) {
        return reject(prepared.reason === "emergency semantic pipeline aborted" ? "skipped" : "failed",
          prepared.reason === "emergency semantic pipeline aborted" ? "semantic-pipeline-aborted" : "semantic-pipeline-failed", prepared.reason);
      }
      if (signal?.aborted) return reject("skipped", "aborted-before-append", "emergency fallback was cancelled before append");
      if (!this.emergencySnapshotCurrent(ctx, snapshot)) return reject("skipped", "stale-before-append", "emergency result was stale before append");

      const appended: SessionEntry[] = [];
      for (const record of prepared.records) {
        if (signal?.aborted) return reject("skipped", "aborted-while-appending", "emergency fallback was cancelled while appending");
        if (!this.validEmergencyRecord(record, snapshot) || !this.emergencySnapshotCurrent(ctx, snapshot, appended)) {
          return reject("skipped", "stale-semantic-record", "emergency semantic record was stale or invalid");
        }
        try {
          this.append(record);
        } catch {
          return reject("failed", "semantic-record-append-failed", "emergency semantic record could not be appended");
        }
        appended.push(record);
        if (!this.emergencySnapshotCurrent(ctx, snapshot, appended)) {
          return reject("skipped", "branch-changed-during-append", "emergency branch changed while appending semantic records");
        }
      }

      const branch = ctx.sessionManager.getBranch() as SessionEntry[];
      const branchIds = entryIds(branch);
      const current = {
        binding: this.binding(ctx),
        runtimeToken: this.runtimeToken,
        branchIds,
        latestCompactionIdentity: latestCompactionIdentity(branch),
      };
      const pending = prepared.pending;
      if (pending.consumed || !sameBinding(pending.binding, snapshot.binding)
        || pending.runtimeToken !== this.runtimeToken
        || pending.preparedPrefixIds.join("\u0000") !== entryIds(snapshot.branchEntries).join("\u0000")
        || !physicalTailFits(ctx, branch, pending.cut.firstKeptEntryId)
        || !isPendingUsable(pending, current, this.now())) {
        return reject("skipped", "pending-validation-failed", "emergency pending failed current-branch validation");
      }
      this.pendingStore.stage(pending);
      const consumed = this.pendingStore.consume(current, this.now());
      if (!consumed) return reject("skipped", "pending-consume-failed", "emergency pending could not be consumed on the current branch");
      this.preparedViews.set(consumed as object, {
        summary: prepared.rendered.summary,
        details: prepared.rendered.details,
        state: prepared.rendered.state,
      });
      this.inFlightPending = consumed;
      this.recordDiagnostic({ phase: "emergency-fallback", outcome: "prepared", code: "prepared", reason: "emergency compaction prepared" });
      this.markCompactionInvocation("prepared", "prepared");
      this.reportLifecycle(ctx, { phase: "compaction", status: "prepared" });
      return { pending: consumed };
    } catch (error) {
      return reject("failed", "fallback-failed-closed", error instanceof Error ? error.message : "emergency fallback failed closed");
    } finally {
      acquired.lease.release();
    }
  }

  private consumeInternalIntent(event: { preparation: { firstKeptEntryId?: string }; branchEntries: SessionEntry[] }, ctx: ExtensionContext): { cancel: true } | { compaction: { summary: string; firstKeptEntryId: string; tokensBefore: number; details: unknown } } {
    const intent = this.internalIntent;
    if (!intent || intent.consumed || intent.generation !== this.generation || !sameBinding(intent.binding, this.binding(ctx))) {
      return this.cancelCompaction({ phase: "internal-apply", outcome: "cancelled", code: "internal-intent-stale", reason: "internal compaction intent was missing or stale" }, ctx);
    }
    // Spend the nonce synchronously so an overlapping host compact cannot append twice.
    intent.consumed = true;
    if (this.applyLatch) this.applyLatch.consumed = true;
    const pending = this.pendingStore.peek(this.now());
    if (!pending) {
      this.resetApplyState();
      return this.cancelCompaction({ phase: "internal-apply", outcome: "cancelled", code: "pending-missing", reason: "prepared compaction was unavailable for internal application" }, ctx);
    }
    if (!this.preparedViews.has(pending as object)) {
      this.resetApplyState();
      return this.cancelCompaction({ phase: "pending-view", outcome: "cancelled", code: "prepared-view-missing", reason: "prepared compaction view was unavailable" }, ctx);
    }
    if (!this.preparationMatches(event, pending, ctx, true)) {
      this.resetApplyState();
      return this.cancelCompaction({ phase: "pending-validation", outcome: "cancelled", code: "pending-validation-failed", reason: "prepared compaction did not match the current branch" }, ctx);
    }
    const consumed = this.pendingStore.consume({
      binding: this.binding(ctx),
      runtimeToken: this.runtimeToken,
      branchIds: entryIds(event.branchEntries),
      latestCompactionIdentity: latestCompactionIdentity(event.branchEntries),
    }, this.now());
    if (!consumed) {
      this.resetApplyState();
      return this.cancelCompaction({ phase: "pending-consume", outcome: "cancelled", code: "pending-consume-failed", reason: "prepared compaction could not be consumed" }, ctx);
    }
    const view = this.preparedViews.get(pending as object);
    if (view) this.preparedViews.set(consumed as object, view);
    intent.pending = consumed;
    this.inFlightPending = consumed;
    this.recordDiagnostic({ phase: "internal-apply", outcome: "prepared", code: "pending-consumed", reason: "prepared compaction was handed to the host" });
    this.markCompactionInvocation("prepared", "pending-consumed");
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
    // Diagnostics describe the current session, not just the pre-boundary generation.
    const diagnostic = this.lastCompactionDiagnostic;
    const invocation = this.lastCompactionInvocation;
    const emergencyAttempted = this.emergencyAttempted;
    this.invalidate(reason);
    this.lastCompactionDiagnostic = diagnostic;
    this.lastCompactionInvocation = invocation;
    this.emergencyAttempted = emergencyAttempted;
    this.priorState = priorState;
    this.ensureBootstrap(ctx);
  }

  private failApply(ctx: ExtensionContext, reason: string): void {
    this.resetApplyState();
    this.rebaseAfterBoundary(ctx, reason);
    this.recordDiagnostic({ phase: "internal-apply", outcome: "failed", code: "apply-failed", reason });
    this.markCompactionInvocation("failed", "apply-failed");
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

  private promotionSnapshot(acknowledgement: CompactionAppliedData, state: CumulativeState): PromotionSnapshot | undefined {
    const frozenAcknowledgement = cloneFrozen(acknowledgement);
    const frozenState = cloneFrozen(state);
    if (!frozenAcknowledgement || !frozenState || !verifyCumulativeState(frozenState)) return undefined;
    return { acknowledgement: frozenAcknowledgement, state: frozenState };
  }

  /** Re-check the durable source after the detached worker has settled. */
  private promotionSourceVisible(
    branch: SessionEntry[],
    destination: SessionBinding,
    snapshot: PromotionSnapshot,
    proposal: StructuredProjectProposalData,
  ): boolean {
    try {
      const source = proposal.source;
      if (snapshot.acknowledgement.sessionId !== destination.sessionId
        || source.compactionEntryId !== snapshot.acknowledgement.compactionEntryId
        || source.stateDigest !== snapshot.state.stateDigest) return false;
      const acknowledgementDigest = recordDigest(destination.sessionId, { kind: "plastic-compaction-acknowledgement" }, snapshot.acknowledgement);
      if (source.acknowledgementDigest !== acknowledgementDigest) return false;
      const compactions = branch.map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.type === "compaction" && entry.id === source.compactionEntryId);
      if (compactions.length !== 1) return false;
      const host = compactions[0];
      const details = host.entry.details;
      if (!details || typeof details !== "object" || Array.isArray(details)) return false;
      const state = (details as Record<string, unknown>).structuredState;
      if (!state || typeof state !== "object" || Array.isArray(state) || !verifyCumulativeState(state as CumulativeState)) return false;
      const verifiedState = state as CumulativeState;
      if (verifiedState.stateDigest !== source.stateDigest) return false;
      const acknowledgements = branch.map((entry, index) => ({ entry, index })).filter(({ entry, index }) => index > host.index
        && isCompactionAppliedRecord(entry)
        && entry.data.compactionEntryId === source.compactionEntryId
        && recordDigest(destination.sessionId, { kind: "plastic-compaction-acknowledgement" }, entry.data) === acknowledgementDigest);
      if (acknowledgements.length !== 1) return false;
      const sourceDigest = recordDigest(destination.sessionId, {
        compactionEntryId: source.compactionEntryId,
        acknowledgementDigest,
        stateDigest: source.stateDigest,
      }, verifiedState.projectSnapshot);
      return proposal.sourceDigest === sourceDigest;
    } catch {
      return false;
    }
  }

  private promotionCurrent(
    ctx: ExtensionContext,
    destination: SessionBinding,
    branchIds: readonly string[],
    snapshot: PromotionSnapshot,
    controller: AbortController,
    proposal: StructuredProjectProposalData,
  ): boolean {
    if (controller.signal.aborted || !this.enabled() || !sameBinding(this.binding(ctx), destination)) return false;
    try {
      const branch = ctx.sessionManager.getBranch() as SessionEntry[];
      if (!samePrefix(branchIds, entryIds(branch)) || !bootstrapFor(branch, destination)) return false;
      return this.promotionSourceVisible(branch, destination, snapshot, proposal);
    } catch {
      return false;
    }
  }

  /** Start only from the post-rebase binding; completion is deliberately detached from Pi's hook. */
  private launchPromotion(ctx: ExtensionContext, snapshot: PromotionSnapshot): void {
    const runtime = this.runtimeFor();
    const projectId = this.projectIdFor(ctx);
    const destination = cloneFrozen(this.binding(ctx));
    if (!runtime || !projectId || !destination
      || snapshot.acknowledgement.sessionId !== destination.sessionId
      || sameBinding(snapshot.acknowledgement, destination)) return;
    let branchIds: string[];
    try {
      const branch = ctx.sessionManager.getBranch() as SessionEntry[];
      if (!bootstrapFor(branch, destination)) return;
      branchIds = entryIds(branch);
    } catch {
      return;
    }
    const controller = new AbortController();
    this.promotionControllers.add(controller);
    void runProjectPromoter({
      binding: destination,
      projectId,
      sourceDigest: "",
      projectSnapshot: snapshot.state.projectSnapshot,
      acknowledgement: snapshot.acknowledgement,
      verifiedState: snapshot.state,
      runtime,
      signal: controller.signal,
    }).then((result) => {
      if (!result.ok || !result.record || !isStructuredProjectProposalRecord(result.record)) return;
      const proposal = result.record.data;
      if (!sameBinding(proposal, destination) || proposal.projectId !== projectId) return;
      if (!this.promotionCurrent(ctx, destination, branchIds, snapshot, controller, proposal)) return;
      this.append({ customType: result.record.customType, data: proposal });
      this.refreshProposalWidget(ctx);
    }).catch(() => { /* detached promoter failures never alter compaction flow */ }).finally(() => {
      this.promotionControllers.delete(controller);
    });
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
    const reportApplyError = (error: unknown): void => {
      this.resetApplyState();
      if (exactNothingToCompact(error)) {
        this.recordDiagnostic({ phase: "internal-apply", outcome: "skipped", code: "nothing-to-compact", reason: "Nothing to compact (session too small)" });
        this.markCompactionInvocation("skipped", "nothing-to-compact");
        this.reportLifecycle(ctx, { phase: "compaction", status: "skipped", reason: "Nothing to compact (session too small)" });
      } else if (exactCompactionCancellation(error)) {
        this.recordDiagnostic({ phase: "internal-apply", outcome: "cancelled", code: "host-cancellation", reason: "host compaction was cancelled" });
        this.markCompactionInvocation("cancelled", "host-cancellation");
      } else {
        const reason = error instanceof Error ? error.message : String(error);
        this.recordDiagnostic({ phase: "internal-apply", outcome: "failed", code: "host-error", reason });
        this.markCompactionInvocation("failed", "host-error");
        this.reportLifecycle(ctx, { phase: "compaction", status: "failed", reason });
      }
    };
    try {
      ctx.compact({
        customInstructions: internalCompactionInstructions(id),
        onComplete: () => {
          if (this.generation === pending.binding.generation) this.applyLatch = undefined;
        },
        onError: (error: unknown) => {
          if (this.generation === pending.binding.generation) reportApplyError(error);
        },
      });
    } catch (error) {
      reportApplyError(error);
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
      this.refreshProposalWidget(ctx);
    });
    this.pi.on("agent_start", () => { this.settled = false; });
    this.pi.on("turn_end", (_event, ctx) => { this.ensureBootstrap(ctx); this.schedule(ctx); });
    this.pi.on("agent_settled", (_event, ctx) => {
      this.settled = true;
      this.schedule(ctx);
      this.maybeApply(ctx);
    });
    this.compactionHandlerRegistered = true;
    this.pi.on("session_before_compact", async (event, ctx) => {
      this.markCompactionInvocation("observed", "handler-invoked");
      const intent = this.internalIntent;
      const hasInternalPrefix = typeof event.customInstructions === "string" && event.customInstructions.startsWith(INTERNAL_COMPACTION_INSTRUCTIONS_PREFIX);
      const isInternalCall = intent !== undefined && event.customInstructions === internalCompactionInstructions(intent.id);
      if (hasInternalPrefix) {
        if (!isInternalCall) return this.cancelCompaction({ phase: "internal-apply", outcome: "cancelled", code: "internal-intent-stale", reason: "internal compaction intent was missing or stale" }, ctx);
        if (!this.enabled()) return this.cancelCompaction({ phase: "internal-apply", outcome: "cancelled", code: "coordinator-disabled", reason: "internal compaction was rejected because Plastic Memory is disabled" }, ctx);
        if (this.applyLatch && !this.internalIntent) return this.cancelCompaction({ phase: "internal-apply", outcome: "cancelled", code: "internal-intent-missing", reason: "internal compaction intent was unavailable" }, ctx);
        return this.consumeInternalIntent(event, ctx);
      }
      if (!this.enabled()) {
        this.recordDiagnostic({ phase: "compaction", outcome: "skipped", code: "coordinator-disabled", reason: "Plastic Memory compaction handler was invoked while disabled" });
        this.markCompactionInvocation("skipped", "coordinator-disabled");
        return undefined;
      }
      this.watchHostCompactionAbort(event, ctx);

      // A pending must match exactly. A present but stale/mismatched slot is never
      // replaced by hook-time work; only an absent slot can be refreshed while idle.
      let pending = this.pendingStore.peek(this.now());
      if (pending) {
        if (!this.preparedViews.has(pending as object)) {
          return this.yieldToNativeCompaction({ phase: "pending-view", outcome: "skipped", code: "prepared-view-missing", reason: "prepared compaction view was unavailable" }, ctx);
        }
        if (!this.preparationMatches(event, pending, ctx, false)) {
          return this.yieldToNativeCompaction({ phase: "pending-validation", outcome: "skipped", code: "pending-validation-failed", reason: "pending compaction did not match the current branch" }, ctx);
        }
      } else {
        const refreshed = await this.refreshPendingFromClosedCycles(event, ctx);
        pending = refreshed.pending;
        if (!pending && refreshed.allowEmergency) {
          const emergency = await this.refreshPendingFromEmergency(event, ctx);
          pending = emergency.pending;
          if (!pending) {
            return this.yieldToNativeCompaction(emergency.failure ?? { phase: "emergency-fallback", outcome: "skipped", code: "fallback-unavailable", reason: "emergency fallback did not prepare compaction" }, ctx);
          }
        }
        if (!pending) {
          return this.yieldToNativeCompaction(refreshed.failure ?? { phase: "normal-refresh", outcome: "skipped", code: "no-prepared-compaction", reason: "no safe compaction was prepared" }, ctx);
        }
      }
      const consumed = pending.consumed ? pending : this.pendingStore.consume({
        binding: this.binding(ctx),
        runtimeToken: this.runtimeToken,
        branchIds: entryIds(event.branchEntries),
        latestCompactionIdentity: latestCompactionIdentity(event.branchEntries),
      }, this.now());
      if (!consumed) return this.yieldToNativeCompaction({ phase: "pending-consume", outcome: "skipped", code: "pending-consume-failed", reason: "pending compaction could not be consumed" }, ctx);
      const view = this.preparedViews.get(pending as object);
      if (!view) return this.yieldToNativeCompaction({ phase: "pending-view", outcome: "skipped", code: "prepared-view-missing", reason: "prepared compaction view was unavailable" }, ctx);
      this.preparedViews.set(consumed as object, view);
      this.inFlightPending = consumed;
      this.markCompactionInvocation("prepared", "prepared");
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
        this.recordDiagnostic({ phase: "internal-apply", outcome: "skipped", code: "unmatched-boundary", reason: "compaction boundary was not prepared by Plastic Memory" });
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
      const promotion = this.promotionSnapshot(acknowledged.record.data, view.state);
      this.reportLifecycle(ctx, { phase: "compaction", status: "applied" });
      this.rebaseAfterBoundary(ctx, "acknowledged plastic compaction boundary", promotion?.state ?? view.state);
      this.recordDiagnostic({ phase: "compaction", outcome: "applied", code: "applied", reason: "Plastic compaction was acknowledged and applied" });
      this.markCompactionInvocation("applied", "applied");
      if (promotion) this.launchPromotion(ctx, promotion);
    });
    this.pi.on("context", (event, ctx) => {
      if (!this.enabled()) return { messages: event.messages };
      return projectPlasticContext({
        messages: event.messages as unknown as Array<Record<string, unknown>>,
        branchEntries: ctx.sessionManager.getBranch() as SessionEntry[],
        contextEntries: ctx.sessionManager.buildContextEntries() as SessionEntry[],
      });
    });
    const invalidate = (reason: string, ctx?: ExtensionContext) => { this.invalidate(reason, ctx); };
    this.pi.on("session_before_switch", (_event, ctx) => { invalidate("session-switch", ctx); });
    this.pi.on("session_before_fork", (_event, ctx) => { invalidate("fork", ctx); });
    this.pi.on("session_before_tree", (_event, ctx) => { invalidate("tree", ctx); });
    this.pi.on("session_tree", (_event, ctx) => { invalidate("tree-complete", ctx); });
    this.pi.on("session_shutdown", (event, ctx) => { invalidate(event.reason, ctx); this.active = false; });
  }

  /** Explicit lifecycle invalidation for direct embedders without Pi events. */
  shutdown(reason = "shutdown"): void { this.invalidate(reason, this.widgetContext); this.active = false; }
  getGeneration(): number { return this.generation; }
  getBinding(ctx: ExtensionContext): SessionBinding { return this.binding(ctx); }
  getPending(): PendingCompaction | undefined { return this.pendingStore.peek(this.now()); }

  /** Read-only scalar projection for `/plastic:status`; it never bootstraps, stages, consumes, or applies. */
  getStatus(ctx: ExtensionContext): PlasticMemoryStatus {
    let branch: SessionEntry[] = [];
    let binding: SessionBinding | undefined;
    let queue: QueueReconstruction | undefined;
    try {
      branch = ctx.sessionManager.getBranch() as SessionEntry[];
      binding = this.binding(ctx);
      const bootstrap = bootstrapFor(branch, binding);
      queue = bootstrap ? this.queueState(ctx, binding, bootstrap) : undefined;
    } catch {
      branch = [];
      binding = undefined;
      queue = undefined;
    }
    let pending: PendingCompaction | undefined;
    try {
      pending = this.pendingStore.peek(this.now()) ?? this.inFlightPending;
    } catch {
      pending = this.inFlightPending;
    }
    const prepared = pending !== undefined && this.preparedViews.has(pending as object);
    const cycles = binding ? cyclesFor(branch, binding) : [];
    const closed = cycles.length;
    const queued = queue?.valid ? queue.queued.length : 0;
    const unresolved = queue?.valid ? queue.unresolved.length : 0;
    const processed = queue?.valid ? Math.max(0, queued - unresolved) : closed;
    const emergency = binding
      ? this.emergencyAvailableForStatus(ctx, binding, branch, cycles, queue, pending)
      : { available: false, reason: (this.enabled() ? "binding-invalid" : "disabled") as EmergencyAvailabilityReason };
    const context = this.contextUsageForStatus(ctx);
    return Object.freeze({
      status: this.enabled() ? "ready" : "disabled",
      context: Object.freeze(context),
      thresholds: Object.freeze({ normal: NORMAL_COMPACTION_MIN_CYCLES, automatic: AUTO_APPLY_MIN_CONTEXT_TOKENS }),
      binding: Object.freeze({ generation: this.generation }),
      cycles: Object.freeze({ closed, queued, unresolved, processed }),
      scheduler: Object.freeze({ busy: this.scheduler.isBusy() }),
      pending: Object.freeze({ present: pending !== undefined, prepared, consumed: pending?.consumed === true }),
      compaction: Object.freeze({ handlerRegistered: this.compactionHandlerRegistered, lastInvocation: this.lastCompactionInvocation }),
      lastCompactionDiagnostic: this.lastCompactionDiagnostic ?? null,
      lastLifecycleDiagnostic: this.lastLifecycleDiagnostic ?? null,
      emergency: Object.freeze({ available: emergency.available, reason: emergency.reason, lastAttempted: this.emergencyAttempted }),
    });
  }
}

export function registerPlasticMemoryCoordinator(pi: ExtensionAPI, options: CoordinatorOptions = {}): PlasticMemoryCoordinator {
  return new PlasticMemoryCoordinator(pi, options);
}

export const createPlasticMemoryCoordinator = registerPlasticMemoryCoordinator;
export const registerCoordinator = registerPlasticMemoryCoordinator;
export default registerPlasticMemoryCoordinator;

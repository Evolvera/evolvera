import { DEFAULT_COMPACTION_SETTINGS, findCutPoint, getAgentDir, sessionEntryToContextMessages, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";

const PRIMARY_PROMPT = "# PI Coding Agent";
export const MIDRUN_RESUME_TYPE = "midrun-compaction-resume";
export const MIDRUN_COMPACTION_INSTRUCTIONS = "Preserve the active task, the user's latest request, the plan and progress, files changed, last commands and their results, and the exact next step.";
export const MIDRUN_RESUME_MESSAGE = "Context was compacted in the middle of your task to stay within the context window. Continue the same task from where you left off using the summary and recent messages. Do not restart completed steps, do not ask for permission to continue, and keep every approval gate.";

export type CompactionSettings = { enabled: boolean; reserveTokens: number; keepRecentTokens?: number };
type Context = {
  mode?: string;
  cwd: string;
  model: { provider: string; id: string };
  getContextUsage(): { tokens: number | null; contextWindow: number } | undefined;
  compact(options: { customInstructions: string; onComplete: () => void; onError: (error: Error) => void }): void;
  hasPendingMessages(): boolean;
  isIdle(): boolean;
  signal?: AbortSignal;
  sessionManager?: { getSessionId(): string; getBranch(): SessionEntry[] };
  ui: { notify(message: string, type: "warning"): void };
};
type TurnMessage = { provider?: string; model?: string; content?: Array<{ type?: string }> };
type Deps = { readCompactionSettings?: (ctx: Context) => CompactionSettings; env?: Record<string, string | undefined>; getManager?: () => { hasRunning?: () => boolean } | null | undefined };

function effectiveSettings(ctx: Context): CompactionSettings {
  try { return SettingsManager.create(ctx.cwd, getAgentDir()).getCompactionSettings(); }
  catch { return DEFAULT_COMPACTION_SETTINGS; }
}

function compactionCanDiscard(branch: SessionEntry[], keepRecentTokens: number): boolean {
  if (!branch.length || branch[branch.length - 1]?.type === "compaction") return false;
  let previous = -1;
  for (let i = branch.length - 1; i >= 0; i--) if (branch[i]?.type === "compaction") { previous = i; break; }
  let boundaryStart = 0;
  const previousCompaction = branch[previous];
  if (previousCompaction?.type === "compaction") {
    const kept = branch.findIndex((entry) => entry.id === previousCompaction.firstKeptEntryId);
    boundaryStart = kept >= 0 ? kept : previous + 1;
  }
  const cut = findCutPoint(branch, boundaryStart, branch.length, keepRecentTokens);
  if (!branch[cut.firstKeptEntryIndex]?.id) return false;
  for (let i = boundaryStart; i < cut.firstKeptEntryIndex; i++) {
    const entry = branch[i];
    if (entry?.type === "compaction") continue;
    if (sessionEntryToContextMessages(entry).length > 0) return true;
  }
  return false;
}
const lastUserId = (branch: SessionEntry[]) => [...branch].reverse().find((entry) => entry.type === "message" && entry.message.role === "user")?.id;
const currentRequestClosed = (branch: SessionEntry[]) => {
  const lastUser = lastUserId(branch);
  if (!lastUser) return true;
  const userIndex = branch.findIndex((entry) => entry.id === lastUser);
  return branch.slice(userIndex + 1).some((entry) => entry.type === "message" && entry.message.role === "assistant"
    && (entry.message.stopReason === "aborted" || (entry.message.stopReason === "stop" && !entry.message.content.some((part) => part.type === "toolCall"))));
};
const branchHasFinishedTask = (branch: SessionEntry[], baselineIds: Set<string>) => {
  const lastUser = lastUserId(branch);
  if (!lastUser) return true;
  const userIndex = branch.findIndex((entry) => entry.id === lastUser);
  // A later compaction must not hide work that completed after this attempt began.
  return branch.slice(userIndex + 1).some((entry) => entry.type === "message"
    && entry.message?.role === "assistant" && !baselineIds.has(entry.id)
    && ["stop", "aborted", "toolUse"].includes(String(entry.message.stopReason)));
};

export function shouldCompactMidrun(message: TurnMessage, model: Context["model"], usage: ReturnType<Context["getContextUsage"]>, settings: CompactionSettings): boolean {
  return settings.enabled && !!usage && usage.tokens !== null
    && message.provider === model.provider && message.model === model.id
    && Array.isArray(message.content) && message.content.some((part) => part?.type === "toolCall")
    && usage.tokens > usage.contextWindow - settings.reserveTokens;
}

export const COMPACTION_STALL_TYPE = "compaction-resume";
export const COMPACTION_STALL_MESSAGE = "The conversation was compacted while your task was still in progress, and nothing ran after it. Continue the same task from where you left off using the summary and recent messages. Do not restart completed steps, do not ask for permission to continue, and keep every approval gate.";

type StallEntry = { type?: string; message?: { role?: string; stopReason?: string; content?: unknown } };
const isFinalReply = (m: StallEntry["message"]) => m?.role === "assistant" && m.stopReason === "stop"
  && !(Array.isArray(m.content) && m.content.some((part) => (part as { type?: unknown })?.type === "toolCall"));

/**
 * True when the latest compaction happened during the current user request while the task was
 * still in progress (the last reply before it was not a normal final answer) and no assistant
 * turn ran after it. A user abort (Esc) is never a stall.
 */
export function isCompactionStall(branch: Iterable<unknown>): boolean {
  const entries = Array.from(branch, (entry) => entry as StallEntry);
  let compaction = -1;
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i]?.type === "compaction") { compaction = i; break; }
  if (compaction < 0) return false;
  const after = entries.slice(compaction + 1).filter((entry) => entry?.type === "message");
  if (after.some((entry) => entry.message?.role === "assistant" && ["stop", "toolUse", "aborted"].includes(String(entry.message.stopReason)))) return false;
  if (after.some((entry) => entry.message?.role === "user")) return false;
  let before: StallEntry["message"];
  for (let i = compaction - 1; i >= 0; i--) {
    const message = entries[i]?.type === "message" ? entries[i].message : undefined;
    if (message?.role === "user") return false; // Compaction ran right after a user message, before any work.
    if (message?.role === "assistant") { before = message; break; }
  }
  if (!before || before.stopReason === "aborted" || isFinalReply(before)) return false;
  return true;
}

export function registerMidrunCompaction(pi: ExtensionAPI, deps: Deps = {}): void {
  let primary = false;
  let attempt: object | undefined;
  let stallBudget = false;
  let failedRequest: string | undefined;
  const env = deps.env ?? process.env;
  const reset = () => { attempt = undefined; stallBudget = false; failedRequest = undefined; };
  const manager = () => deps.getManager ? deps.getManager()
    : (globalThis as Record<PropertyKey, unknown>)[Symbol.for("pi-subagents:manager")] as { hasRunning?: () => boolean } | undefined;
  pi.on("input", async (event) => {
    if (event.source !== "extension" && typeof event.text === "string" && event.text.trim()) {
      attempt = undefined; failedRequest = undefined; stallBudget = true;
    }
  });
  // A compaction that left the task stopped (PI's own threshold/overflow path) resumes once per user message.
  pi.on("agent_settled", async (_event, rawCtx) => {
    const ctx = rawCtx as Context & { isIdle(): boolean; sessionManager: { getBranch(): Iterable<unknown> } };
    if (!primary || ctx.mode !== "tui" || env.PI_MIDRUN_COMPACTION === "off" || attempt || !stallBudget) return;
    try {
      if (!ctx.isIdle() || ctx.hasPendingMessages() || manager()?.hasRunning?.()) return;
      if (!isCompactionStall(ctx.sessionManager.getBranch())) return;
    } catch { return; }
    stallBudget = false;
    await pi.sendMessage({ customType: COMPACTION_STALL_TYPE, content: COMPACTION_STALL_MESSAGE, display: true }, { triggerTurn: true, deliverAs: "followUp" });
  });
  pi.on("before_agent_start", async (event) => {
    primary = typeof event.systemPromptOptions.customPrompt === "string"
      && event.systemPromptOptions.customPrompt.trimStart().startsWith(PRIMARY_PROMPT);
  });
  pi.on("turn_end", async (event, rawCtx) => {
    const ctx = rawCtx as Context;
    if (!primary || ctx.mode !== "tui" || env.PI_MIDRUN_COMPACTION === "off" || attempt) return;
    let settings: CompactionSettings;
    try { settings = (deps.readCompactionSettings ?? effectiveSettings)(ctx); }
    catch { settings = DEFAULT_COMPACTION_SETTINGS; }
    let usage: ReturnType<Context["getContextUsage"]>;
    try { usage = ctx.getContextUsage(); } catch { return; }
    if (!shouldCompactMidrun(event.message, ctx.model, usage, settings)) return;
    const keepRecentTokens = settings.keepRecentTokens ?? DEFAULT_COMPACTION_SETTINGS.keepRecentTokens;
    let sessionId: string | undefined; let branch: SessionEntry[];
    try {
      if (ctx.signal?.aborted || !ctx.sessionManager) return;
      sessionId = ctx.sessionManager.getSessionId();
      branch = ctx.sessionManager.getBranch();
      if (!sessionId || !lastUserId(branch) || currentRequestClosed(branch) || !compactionCanDiscard(branch, keepRecentTokens)) return;
    } catch { return; }
    const requestId = lastUserId(branch);
    if (!requestId || failedRequest === requestId) return;
    const baselineIds = new Set(branch.map((entry) => entry.id));
    const beforeCompactions = new Set(branch.filter((entry) => entry.type === "compaction").map((entry) => entry.id));
    const owned = {};
    attempt = owned;
    const current = (): { branch: SessionEntry[]; ownsRequest: boolean; valid: boolean } => {
      if (attempt !== owned) return { branch: [], ownsRequest: false, valid: false };
      try {
        const currentBranch = ctx.sessionManager!.getBranch();
        const ownsRequest = ctx.sessionManager!.getSessionId() === sessionId && lastUserId(currentBranch) === requestId;
        const valid = ownsRequest && ctx.isIdle() && !ctx.hasPendingMessages() && !branchHasFinishedTask(currentBranch, baselineIds);
        return { branch: currentBranch, ownsRequest, valid };
      } catch { return { branch: [], ownsRequest: false, valid: false }; }
    };
    const deliver = (failed: boolean) => {
      if (attempt !== owned) return;
      const state = current();
      attempt = undefined;
      if (!state.valid) return;
      if (failed) failedRequest = requestId;
      stallBudget = false;
      const text = failed
        ? "Mid-run compaction did not complete. Continue only the unfinished current request from the available context; do not repeat completed work or widen approvals."
        : MIDRUN_RESUME_MESSAGE;
      try {
        const sent = pi.sendMessage({ customType: MIDRUN_RESUME_TYPE, content: text, display: true }, { triggerTurn: true, deliverAs: "followUp" });
        void Promise.resolve(sent).catch(() => {});
        if (failed) ctx.ui.notify("Mid-run compaction did not complete; continuing only the unfinished current request.", "warning");
      } catch { /* UI or session may have closed. */ }
    };
    const completed = () => {
      const state = current();
      if (!state.valid) { if (attempt === owned) attempt = undefined; return; }
      const compacted = state.branch.some((entry) => entry.type === "compaction" && !beforeCompactions.has(entry.id));
      if (compacted) deliver(false);
      else deliver(true);
    };
    const errored = (error: Error) => {
      if (attempt !== owned) return;
      const state = current();
      if (error?.name === "AbortError" || /cancel|abort/i.test(String(error?.message ?? error))) {
        attempt = undefined;
        if (state.ownsRequest) { failedRequest = requestId; stallBudget = false; }
        return;
      }
      if (!state.valid) { attempt = undefined; return; }
      const already = /already compacted/i.test(String(error?.message ?? error));
      const compacted = state.branch.some((entry) => entry.type === "compaction" && !beforeCompactions.has(entry.id));
      deliver(!(already && compacted));
    };
    try { ctx.compact({ customInstructions: MIDRUN_COMPACTION_INSTRUCTIONS, onComplete: completed, onError: errored }); }
    catch (error) { errored(error instanceof Error ? error : new Error(String(error))); }
  });
  pi.on("session_start", async () => reset());
  pi.on("session_shutdown", async () => { primary = false; reset(); });
  pi.on("session_tree", async () => reset());
  pi.on("session_before_switch", async () => reset());
  pi.on("session_before_tree", async () => reset());
}

export default function midrunCompaction(pi: ExtensionAPI): void { registerMidrunCompaction(pi); }

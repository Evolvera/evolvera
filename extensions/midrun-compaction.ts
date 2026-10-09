import { getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PRIMARY_PROMPT = "# PI Coding Agent";
export const MIDRUN_RESUME_TYPE = "midrun-compaction-resume";
export const MIDRUN_COMPACTION_INSTRUCTIONS = "Preserve the active task, the user's latest request, the plan and progress, files changed, last commands and their results, and the exact next step.";
export const MIDRUN_RESUME_MESSAGE = "Context was compacted in the middle of your task to stay within the context window. Continue the same task from where you left off using the summary and recent messages. Do not restart completed steps, do not ask for permission to continue, and keep every approval gate.";

export type CompactionSettings = { enabled: boolean; reserveTokens: number };
type Context = {
  mode?: string;
  isIdle(): boolean;
  abort(): void;
  cwd: string;
  model: { provider: string; id: string };
  getContextUsage(): { tokens: number | null; contextWindow: number } | undefined;
  compact(options: { customInstructions: string; onComplete: () => void; onError: (error: Error) => void }): void;
  hasPendingMessages(): boolean;
  sessionManager: { getBranch(): Iterable<unknown> };
  ui: { notify(message: string, type: "warning"): void };
};
type BranchEntry = { type?: string; id?: string };
type TurnMessage = { provider?: string; model?: string; content?: Array<{ type?: string }> };
type Deps = { readCompactionSettings?: (ctx: Context) => CompactionSettings; env?: Record<string, string | undefined>; getManager?: () => { hasRunning?: () => boolean } | null | undefined };

function effectiveSettings(ctx: Context): CompactionSettings {
  try { return SettingsManager.create(ctx.cwd, getAgentDir()).getCompactionSettings(); }
  catch { return { enabled: true, reserveTokens: 16_384 }; }
}

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
  if (after.some((entry) => entry.message?.role === "assistant" && ["stop", "toolUse"].includes(String(entry.message.stopReason)))) return false;
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
  let inFlight = false;
  let waitingForNativeCompaction = false;
  let stallBudget = false;
  let resumedCompactionId: string | undefined;
  const env = deps.env ?? process.env;
  const reset = () => { inFlight = false; waitingForNativeCompaction = false; stallBudget = false; };
  const resumeMidrun = (ctx: Context, failed = false) => {
    inFlight = false;
    waitingForNativeCompaction = false;
    if (failed) {
      try { ctx.ui.notify("Mid-run compaction failed; resuming the task and leaving PI's overflow recovery as fallback.", "warning"); } catch { /* UI may have closed. */ }
    }
    try { if (ctx.hasPendingMessages()) return; } catch { return; }
    stallBudget = false;
    void pi.sendMessage({
      customType: MIDRUN_RESUME_TYPE,
      content: `${MIDRUN_RESUME_MESSAGE}${failed ? " Compaction failed; continue the task from the available context." : ""}`,
      display: true,
    }, { triggerTurn: true, deliverAs: "followUp" });
  };
  const resumeAfterNativeCompaction = (ctx: Context) => {
    waitingForNativeCompaction = false;
    stallBudget = false;
    try { if (ctx.hasPendingMessages()) return; } catch { return; }
    void pi.sendMessage({ customType: COMPACTION_STALL_TYPE, content: COMPACTION_STALL_MESSAGE, display: true }, { triggerTurn: true, deliverAs: "followUp" });
  };
  const compactAfterNativeSkip = (ctx: Context) => {
    inFlight = true;
    try {
      ctx.compact({ customInstructions: MIDRUN_COMPACTION_INSTRUCTIONS, onComplete: () => resumeMidrun(ctx), onError: (error) => resumeMidrun(ctx, error?.message !== "Already compacted") });
    } catch {
      resumeMidrun(ctx, true);
    }
  };
  const manager = () => deps.getManager ? deps.getManager()
    : (globalThis as Record<PropertyKey, unknown>)[Symbol.for("pi-subagents:manager")] as { hasRunning?: () => boolean } | undefined;
  pi.on("input", async (event) => {
    if (event.source !== "extension" && typeof event.text === "string" && event.text.trim()) stallBudget = true;
  });
  pi.on("session_compact", async (_event, rawCtx) => {
    const ctx = rawCtx as Context;
    if (waitingForNativeCompaction) resumeAfterNativeCompaction(ctx);
  });
  // A compaction that left the task stopped (PI's own threshold/overflow path) resumes once per user message.
  pi.on("agent_settled", async (_event, rawCtx) => {
    const ctx = rawCtx as Context;
    if (!primary || ctx.mode !== "tui" || env.PI_MIDRUN_COMPACTION === "off" || inFlight || (!stallBudget && !waitingForNativeCompaction)) return;
    let branch: unknown[];
    try {
      if (!ctx.isIdle() || ctx.hasPendingMessages() || manager()?.hasRunning?.()) return;
      branch = Array.from(ctx.sessionManager.getBranch());
    } catch { return; }
    if (waitingForNativeCompaction) {
      waitingForNativeCompaction = false;
      let latest: BranchEntry | undefined;
      try { for (const entry of branch) latest = entry as BranchEntry; } catch { return; }
      if (latest?.type !== "compaction") {
        compactAfterNativeSkip(ctx);
        return;
      }
    }
    if (!stallBudget || !isCompactionStall(branch)) return;
    resumeAfterNativeCompaction(ctx);
  });
  pi.on("before_agent_start", async (event) => {
    primary = typeof event.systemPromptOptions.customPrompt === "string"
      && event.systemPromptOptions.customPrompt.trimStart().startsWith(PRIMARY_PROMPT);
  });
  pi.on("turn_end", async (event, rawCtx) => {
    const ctx = rawCtx as Context;
    if (!primary || ctx.mode !== "tui" || env.PI_MIDRUN_COMPACTION === "off" || inFlight || waitingForNativeCompaction) return;
    let settings: CompactionSettings;
    try { settings = (deps.readCompactionSettings ?? effectiveSettings)(ctx); }
    catch { settings = { enabled: true, reserveTokens: 16_384 }; }
    let usage: ReturnType<Context["getContextUsage"]>;
    try { usage = ctx.getContextUsage(); } catch { return; }
    if (!shouldCompactMidrun(event.message, ctx.model, usage, settings)) return;
    let latest: BranchEntry | undefined;
    try { for (const entry of ctx.sessionManager.getBranch()) latest = entry as BranchEntry; }
    catch { return; } // Keep the native compaction path if branch inspection is unavailable.
    if (latest?.type === "compaction") {
      if (latest.id && latest.id === resumedCompactionId) return;
      if (latest.id) resumedCompactionId = latest.id;
      // PI already compacted this branch; resume without asking the core to compact it again.
      resumeMidrun(ctx);
      return;
    }
    // Stop before the next tool turn. The aborted message skips native threshold compaction;
    // agent_settled then runs the manual fallback at idle, without racing the active run.
    waitingForNativeCompaction = true;
    ctx.abort();
  });
  pi.on("session_start", async () => { resumedCompactionId = undefined; reset(); });
  pi.on("session_shutdown", async () => { primary = false; resumedCompactionId = undefined; reset(); });
  pi.on("session_tree", async () => { resumedCompactionId = undefined; reset(); });
}

export default function midrunCompaction(pi: ExtensionAPI): void { registerMidrunCompaction(pi); }

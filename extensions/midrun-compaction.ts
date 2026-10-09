import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Resume a task that PI's own compaction left stopped mid-flight.
 *
 * This extension never compacts by itself. It used to call ctx.compact() at
 * turn_end to compact before the context wall, but AgentSession.compact()
 * disconnects the session from agent events, aborts the run, and waits for
 * idle before compacting. Anything that starts a run in that window (the Goal
 * continuation on agent_settled, a queued follow-up) runs unpersisted and
 * invisible, and the compaction then replaces the context with the persisted
 * history, erasing that work. PI already compacts natively after a run and on
 * context overflow (compact, then retry), so mid-run compaction is left to it.
 */

const PRIMARY_PROMPT = "# PI Coding Agent";

type Manager = { hasRunning?: () => boolean } | null | undefined;
type Deps = { env?: Record<string, string | undefined>; getManager?: () => Manager };
type Context = {
  mode?: string;
  isIdle(): boolean;
  hasPendingMessages(): boolean;
  sessionManager: { getBranch(): Iterable<unknown> };
};

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
  let stallBudget = false;
  const env = deps.env ?? process.env;
  const manager = () => deps.getManager ? deps.getManager()
    : (globalThis as Record<PropertyKey, unknown>)[Symbol.for("pi-subagents:manager")] as Manager;
  pi.on("input", async (event) => {
    if (event.source !== "extension" && typeof event.text === "string" && event.text.trim()) stallBudget = true;
  });
  // A compaction that left the task stopped (PI's threshold/overflow path) resumes once per user message.
  pi.on("agent_settled", async (_event, rawCtx) => {
    const ctx = rawCtx as unknown as Context;
    if (!primary || ctx.mode !== "tui" || env.PI_MIDRUN_COMPACTION === "off" || !stallBudget) return;
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
  const reset = () => { stallBudget = false; };
  pi.on("session_start", async () => reset());
  pi.on("session_shutdown", async () => { primary = false; reset(); });
  pi.on("session_tree", async () => reset());
  pi.on("session_before_switch", async () => reset());
  pi.on("session_before_tree", async () => reset());
}

export default function midrunCompaction(pi: ExtensionAPI): void { registerMidrunCompaction(pi); }

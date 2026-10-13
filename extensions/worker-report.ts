import { execFile as nodeExecFile } from "node:child_process";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Runner = (file: string, args: string[], options: { cwd?: string; timeout: number; encoding: "utf8" }) => Promise<{ stdout: string }>;
type GoalArgs = { goal_id?: unknown; summary?: unknown; reason?: unknown; evidence?: unknown };
type SessionEntry = { type?: unknown; customType?: unknown; data?: unknown };

const RUN_ID_PATTERN = /^run_[A-Za-z0-9]+$/;
const GOAL_STATE_ENTRY_TYPE = "goal-state";
const WORKER_DONE_RECEIPT_TYPE = "worker-report-native-done";

function execFile(file: string, args: string[], options: { cwd?: string; timeout: number; encoding: "utf8" }): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    nodeExecFile(file, args, options, (error, stdout) => {
      if (error) reject(error);
      else resolve({ stdout: String(stdout) });
    });
  });
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

type SessionContext = { sessionManager?: { getBranch?: () => Iterable<SessionEntry> } };
type ReceiptExtension = { appendEntry(customType: string, data: unknown): unknown };

function branch(ctx: SessionContext): SessionEntry[] | undefined {
  try {
    const entries = ctx.sessionManager?.getBranch?.();
    return entries ? Array.from(entries) : undefined;
  } catch { return undefined; }
}

function activeCanonicalGoalId(ctx: SessionContext): string | undefined {
  const entries = branch(ctx);
  if (!entries) return undefined;
  const latest = entries.filter((entry) => entry.type === "custom" && entry.customType === GOAL_STATE_ENTRY_TYPE).at(-1);
  if (!latest || !latest.data || typeof latest.data !== "object") return undefined;
  const goal = (latest.data as { goal?: unknown }).goal;
  if (!goal || typeof goal !== "object") return undefined;
  const id = (goal as { id?: unknown }).id;
  return typeof id === "string" && id ? id : undefined;
}

function hasNativeDoneReceipt(ctx: SessionContext, goalId: unknown): boolean {
  if (typeof goalId !== "string") return false;
  return Boolean(branch(ctx)?.some((entry) => entry.type === "custom"
    && entry.customType === WORKER_DONE_RECEIPT_TYPE
    && entry.data && typeof entry.data === "object"
    && (entry.data as { goal_id?: unknown }).goal_id === goalId));
}

function isCanonicalWorkerDoneCommand(command: unknown): boolean {
  if (typeof command !== "string") return false;
  return command.split(/&&|\|\||[;|]/).some((part) =>
    /(?:^|\s)orca\s+orchestration\s+send(?:\s|$)/.test(part)
      && /(?:^|\s)--type(?:=|\s+)["']?worker_done["']?(?=\s|$)/.test(part));
}

function recordAcceptedNativeDone(event: { result?: { content?: unknown } | null }, ctx: SessionContext, pi: ReceiptExtension, goalId: string | undefined): void {
  if (!goalId) return;
  const content = event.result?.content;
  if (!Array.isArray(content) || content.length !== 1 || !content[0] || typeof content[0] !== "object"
    || typeof (content[0] as { text?: unknown }).text !== "string") return;
  const output = ((content[0] as { text: string }).text).trim();
  let accepted = /^Sent msg_[A-Za-z0-9]+$/.test(output);
  if (!accepted) {
    let receipt: unknown;
    try { receipt = JSON.parse(output); } catch { return; }
    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return;
    const value = receipt as { ok?: unknown; result?: { message?: { type?: unknown } } };
    accepted = value.ok === true && value.result?.message?.type === "worker_done";
  }
  if (!accepted) return;
  if (hasNativeDoneReceipt(ctx, goalId)) return;
  try { pi.appendEntry(WORKER_DONE_RECEIPT_TYPE, { goal_id: goalId }); } catch { /* Reporting fallback remains enabled. */ }
}

export function createWorkerReportExtension(run: Runner = execFile) {
  return function workerReport(pi: ExtensionAPI) {
    const runId = process.env.PI_REPORT_RUN;
    if (!runId || !RUN_ID_PATTERN.test(runId)) return;

    const pending = new Map<string, { toolName: string; args: GoalArgs }>();
    const pendingBash = new Map<string, string | undefined>();
    const reported = new Set<string>();
    let warned = false;

    pi.on("tool_call", (event, ctx) => {
      if (event.toolName === "bash") {
        const input = event.input as { command?: unknown } | undefined;
        // Capture ownership before execution: a new Goal may arrive while the CLI runs.
        pendingBash.set(event.toolCallId, isCanonicalWorkerDoneCommand(input?.command) ? activeCanonicalGoalId(ctx) : undefined);
        return;
      }
      if (event.toolName !== "goal_complete" && event.toolName !== "goal_blocked") return;
      pending.set(event.toolCallId, { toolName: event.toolName, args: event.input as GoalArgs });
    });

    pi.on("tool_execution_end", async (event, ctx) => {
      if (event.toolName === "bash") {
        const goalId = pendingBash.get(event.toolCallId);
        pendingBash.delete(event.toolCallId);
        if (!event.isError) recordAcceptedNativeDone(event, ctx, pi, goalId);
        return;
      }
      if (event.toolName !== "goal_complete" && event.toolName !== "goal_blocked") return;
      const call = pending.get(event.toolCallId);
      pending.delete(event.toolCallId);
      if (!call || event.isError || typeof call.args.goal_id !== "string") return;
      // pi-goal reports rejected calls (stale goal_id, no active goal, empty summary…) as normal results.
      const resultText = Array.isArray(event.result?.content)
        ? event.result.content.map((part: { text?: unknown }) => text(part?.text)).join(" ")
        : "";
      if (/^\s*(goal completion rejected|goal_blocked rejected)/i.test(resultText)) return;

      const outcome = call.toolName === "goal_complete" ? "finished" : "blocked";
      if (hasNativeDoneReceipt(ctx, call.args.goal_id)) return;
      const key = `${call.args.goal_id}\0${outcome}`;
      if (reported.has(key)) return;
      reported.add(key);

      try {
        let branch = "";
        try {
          branch = (await run("git", ["-C", ctx.cwd, "rev-parse", "--abbrev-ref", "HEAD"], { cwd: ctx.cwd, timeout: 10_000, encoding: "utf8" })).stdout.trim();
        } catch {
          // Branch information is optional; report even outside a Git worktree.
        }
        const description = outcome === "finished"
          ? `Summary: ${text(call.args.summary)}`
          : `Reason: ${text(call.args.reason)}\nEvidence: ${text(call.args.evidence)}`;
        const body = [`cwd: ${ctx.cwd}`, ...(branch ? [`branch: ${branch}`] : []), description].join("\n").slice(0, 1500);
        await run("orca", [
          "orchestration", "send", "--to", `run:${runId}`,
          "--subject", `${outcome}: ${path.basename(ctx.cwd)}`,
          "--body", body,
          "--type", "status", "--json",
        ], { timeout: 10_000, encoding: "utf8" });
      } catch (error) {
        if (!warned) {
          warned = true;
          try { ctx.ui.notify(`Worker report could not be sent: ${error instanceof Error ? error.message : String(error)}`, "warning"); } catch { /* Never affect goal completion. */ }
        }
      }
    });
  };
}

export default function workerReport(pi: ExtensionAPI) {
  createWorkerReportExtension()(pi);
}

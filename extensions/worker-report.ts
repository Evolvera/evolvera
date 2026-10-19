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

function goalStates(ctx: SessionContext): SessionEntry[] | undefined {
  return branch(ctx)?.filter((entry) => entry.type === "custom" && entry.customType === GOAL_STATE_ENTRY_TYPE);
}

/**
 * Only canonical state persisted during this tool call proves acceptance. pi-goal
 * persists the terminal Goal and then clears it (`goal: null`), so a cleared latest
 * entry is accepted only when it directly follows this call's matching terminal entry.
 * Older terminal entries, malformed data, or another Goal never authorize a report.
 */
function canonicalGoalStatus(ctx: SessionContext, goalId: unknown, statesBeforeCall: number): string | undefined {
  if (typeof goalId !== "string" || !goalId) return undefined;
  const fresh = goalStates(ctx)?.slice(statesBeforeCall);
  if (!fresh?.length) return undefined;
  const goalOf = (entry: SessionEntry | undefined) => entry && entry.data && typeof entry.data === "object" && "goal" in entry.data
    ? (entry.data as { goal?: unknown }).goal
    : undefined;
  let candidate = goalOf(fresh.at(-1));
  if (candidate === null && fresh.length >= 2) candidate = goalOf(fresh.at(-2));
  if (!candidate || typeof candidate !== "object") return undefined;
  const state = candidate as { id?: unknown; status?: unknown };
  return state.id === goalId && typeof state.status === "string" ? state.status : undefined;
}

function activeCanonicalGoalId(ctx: SessionContext): string | undefined {
  const entries = branch(ctx);
  if (!entries) return undefined;
  const latest = entries.filter((entry) => entry.type === "custom" && entry.customType === GOAL_STATE_ENTRY_TYPE).at(-1);
  if (!latest || !latest.data || typeof latest.data !== "object") return undefined;
  const goal = (latest.data as { goal?: unknown }).goal;
  if (!goal || typeof goal !== "object") return undefined;
  const state = goal as { id?: unknown; status?: unknown };
  return typeof state.id === "string" && state.id && state.status === "active" ? state.id : undefined;
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

    const pending = new Map<string, { toolName: string; args: GoalArgs; statesBeforeCall: number }>();
    const pendingBash = new Map<string, string | undefined>();
    const retryAtAgentEnd = new Map<string, { goalId: string; outcome: string; body: string; cwd: string }>();
    const reported = new Set<string>();
    const warned = new Set<string>();

    const send = async (report: { goalId: string; outcome: string; body: string; cwd: string }) => {
      try {
        let branch = "";
        try {
          branch = (await run("git", ["-C", report.cwd, "rev-parse", "--abbrev-ref", "HEAD"], { cwd: report.cwd, timeout: 10_000, encoding: "utf8" })).stdout.trim();
        } catch {
          // Branch information is optional; report even outside a Git worktree.
        }
        // The Run records the conductor terminal that launched this worker; type the
        // report there so the conductor wakes like on a user prompt (Orca's mailbox wake is unreliable).
        const shown: unknown = JSON.parse((await run("orca", ["orchestration", "run-show", "--id", runId, "--json"], { timeout: 10_000, encoding: "utf8" })).stdout);
        const handle = (shown as { result?: { run?: { coordinator_handle?: unknown } } })?.result?.run?.coordinator_handle;
        if (typeof handle !== "string" || !handle.startsWith("term_")) return false;
        const line = [`[child ${path.basename(report.cwd)}] goal ${report.outcome}`, `goal_id=${report.goalId}`, ...(branch ? [`branch=${branch}`] : []), report.body]
          .join(" | ").replace(/\s+/g, " ").trim().slice(0, 1500);
        const result = await run("orca", ["terminal", "send", "--terminal", handle, "--text", line, "--enter", "--json"], { timeout: 10_000, encoding: "utf8" });
        const receipt: unknown = JSON.parse(result.stdout);
        return Boolean(receipt && typeof receipt === "object" && !Array.isArray(receipt) && (receipt as { ok?: unknown }).ok === true);
      } catch {
        return false;
      }
    };

    const warn = (ctx: { ui?: { notify?: (message: string, type: string) => void } }, key: string, goalId: string) => {
      if (warned.has(key)) return;
      warned.add(key);
      try { ctx.ui?.notify?.(`Worker report for goal ${goalId} was not delivered after one retry; the accepted Goal remains unchanged.`, "warning"); } catch { /* Never affect goal completion. */ }
    };

    const makeReport = (call: { toolName: string; args: GoalArgs; statesBeforeCall: number }, cwd: string, outcome: "finished" | "blocked") => {
      const description = outcome === "finished"
        ? `Summary: ${text(call.args.summary)}`
        : `Reason: ${text(call.args.reason)}\nEvidence: ${text(call.args.evidence)}`;
      return { goalId: call.args.goal_id as string, outcome, cwd, body: description };
    };

    pi.on("tool_call", (event, ctx) => {
      if (event.toolName === "bash") {
        const input = event.input as { command?: unknown } | undefined;
        // Capture ownership before execution: a new Goal may arrive while the CLI runs.
        pendingBash.set(event.toolCallId, isCanonicalWorkerDoneCommand(input?.command) ? activeCanonicalGoalId(ctx) : undefined);
        return;
      }
      if (event.toolName !== "goal_complete" && event.toolName !== "goal_blocked") return;
      pending.set(event.toolCallId, { toolName: event.toolName, args: event.input as GoalArgs, statesBeforeCall: goalStates(ctx)?.length ?? 0 });
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
      const terminalStatus = outcome === "finished" ? "complete" : "blocked";
      if (canonicalGoalStatus(ctx, call.args.goal_id, call.statesBeforeCall) !== terminalStatus) return;
      if (hasNativeDoneReceipt(ctx, call.args.goal_id)) return;
      const key = `${call.args.goal_id}\0${outcome}`;
      if (reported.has(key) || retryAtAgentEnd.has(key)) return;
      const report = makeReport(call, ctx.cwd, outcome);
      if (await send(report)) {
        reported.add(key);
      } else {
        retryAtAgentEnd.set(key, report);
      }
    });

    /**
     * pi-goal can also stop a Goal on its own (agent error after retries, provider failure,
     * ENOSPC, usage limit) without any goal tool call. Report that stop once per Goal/status so
     * the conductor learns the worker went idle. Deferred so pi-goal's own agent_end persists first.
     */
    const reportSelfStoppedGoal = async (event: { messages?: unknown[] }, ctx: { cwd: string; sessionManager?: SessionContext["sessionManager"]; ui?: { notify?: (message: string, type: string) => void } }) => {
      const latest = goalStates(ctx)?.at(-1)?.data as { goal?: { id?: unknown; status?: unknown; updatedAt?: unknown } | null } | undefined;
      const goal = latest?.goal;
      if (!goal || typeof goal.id !== "string" || typeof goal.status !== "string") return;
      if (!["blocked", "paused", "usage_limited"].includes(goal.status)) return;
      const outcome = goal.status === "blocked" ? "blocked" : goal.status;
      // updatedAt distinguishes a later stop after `/goal resume` of the same Goal.
      const key = `${goal.id}\0${outcome}\0${String(goal.updatedAt ?? "")}`;
      if (reported.has(key) || reported.has(`${goal.id}\0${outcome}`)) return;
      const errorMessage = [...(event.messages ?? [])].reverse()
        .map((message) => (message as { role?: unknown; errorMessage?: unknown }))
        .find((message) => message.role === "assistant" && typeof message.errorMessage === "string")?.errorMessage as string | undefined;
      const report = { goalId: goal.id, outcome, cwd: ctx.cwd, body: `Reason: Goal stopped by the runtime without goal_complete/goal_blocked${errorMessage ? ` (${errorMessage})` : ""}. Worker is idle.` };
      if (await send(report)) reported.add(key);
      else warn(ctx, key, goal.id);
    };

    pi.on("agent_end", async (event, ctx) => {
      for (const [key, report] of retryAtAgentEnd) {
        retryAtAgentEnd.delete(key);
        if (await send(report)) reported.add(key);
        else warn(ctx, key, report.goalId);
      }
      setTimeout(() => { void reportSelfStoppedGoal(event as { messages?: unknown[] }, ctx).catch(() => {}); }, 1_000);
    });
  };
}

export default function workerReport(pi: ExtensionAPI) {
  createWorkerReportExtension()(pi);
}

import { execFile as nodeExecFile } from "node:child_process";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Runner = (file: string, args: string[], options: { cwd?: string; timeout: number; encoding: "utf8" }) => Promise<{ stdout: string }>;
type GoalArgs = { goal_id?: unknown; summary?: unknown; reason?: unknown; evidence?: unknown };

const RUN_ID_PATTERN = /^run_[A-Za-z0-9]+$/;

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

export function createWorkerReportExtension(run: Runner = execFile) {
  return function workerReport(pi: ExtensionAPI) {
    const runId = process.env.PI_REPORT_RUN;
    if (!runId || !RUN_ID_PATTERN.test(runId)) return;

    const pending = new Map<string, { toolName: string; args: GoalArgs }>();
    const reported = new Set<string>();
    let warned = false;

    pi.on("tool_call", (event) => {
      if (event.toolName !== "goal_complete" && event.toolName !== "goal_blocked") return;
      pending.set(event.toolCallId, { toolName: event.toolName, args: event.input as GoalArgs });
    });

    pi.on("tool_execution_end", async (event, ctx) => {
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

import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const DEFAULT_PLANNER_HEAVY_TIMEOUT_MS = 45 * 60_000;
const MIN_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 6 * 60 * 60_000;
const TARGET_AGENT = "planner-heavy";

type AgentEvent = {
  id?: unknown;
  type?: unknown;
  description?: unknown;
};

type Guard = {
  warningTimer: ReturnType<typeof setTimeout>;
  stopTimer: ReturnType<typeof setTimeout>;
};

type SubagentManagerFacade = {
  getRecord?: (agentId: string) => { type?: string } | undefined;
};

type AgentToolInput = {
  resume?: unknown;
  subagent_type?: unknown;
};

function plannerHeavyTimeoutMs(): number {
  const configured = Number(process.env.PI_PLANNER_HEAVY_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_PLANNER_HEAVY_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(configured)));
}

function formatMinutes(ms: number): string {
  return `${Math.round(ms / 60_000)}m`;
}

export default function subagentWatchdog(pi: ExtensionAPI) {
  const guards = new Map<string, Guard>();
  const pendingRpcCleanups = new Set<() => void>();
  const timeoutMs = plannerHeavyTimeoutMs();
  const warningMs = Math.min(30 * 60_000, Math.max(60_000, Math.floor(timeoutMs * 2 / 3)));
  let currentCtx: ExtensionContext | undefined;

  const notify = (message: string, level: "info" | "warning" | "error" = "warning") => {
    if (currentCtx?.hasUI) currentCtx.ui.notify(message, level);
  };

  const clearGuard = (agentId: string) => {
    const guard = guards.get(agentId);
    if (!guard) return;
    clearTimeout(guard.warningTimer);
    clearTimeout(guard.stopTimer);
    guards.delete(agentId);
  };

  const stopAgent = (agentId: string, description?: string) => {
    clearGuard(agentId);
    const requestId = randomUUID();
    const replyEvent = `subagents:rpc:stop:reply:${requestId}`;
    let unsubscribe = () => {};
    let replyDeadline: ReturnType<typeof setTimeout>;
    let settled = false;

    const cleanupRpc = () => {
      if (settled) return;
      settled = true;
      clearTimeout(replyDeadline);
      unsubscribe();
      pendingRpcCleanups.delete(cleanupRpc);
    };

    replyDeadline = setTimeout(() => {
      cleanupRpc();
      notify(`Planner Heavy watchdog could not confirm stop for ${agentId}.`, "error");
    }, 5_000);
    replyDeadline.unref?.();

    unsubscribe = pi.events.on(replyEvent, (raw: unknown) => {
      cleanupRpc();
      const reply = raw as { success?: boolean; error?: string };
      if (reply?.success) {
        notify(`Planner Heavy stopped after hard wall-clock limit (${formatMinutes(timeoutMs)}).`, "error");
      } else {
        notify(`Planner Heavy watchdog stop failed: ${reply?.error ?? "unknown error"}.`, "error");
      }
    });
    pendingRpcCleanups.add(cleanupRpc);

    pi.appendEntry("subagent-watchdog", {
      agentId,
      agentType: TARGET_AGENT,
      description: description ?? "",
      action: "stop",
      reason: "wall-clock-timeout",
      timeoutMs,
      at: new Date().toISOString(),
    });

    pi.events.emit("subagents:rpc:stop", { requestId, agentId });
  };

  const onStarted = pi.events.on("subagents:started", (raw: unknown) => {
    const event = raw as AgentEvent;
    if (event.type !== TARGET_AGENT || typeof event.id !== "string") return;

    clearGuard(event.id);
    const warningTimer = setTimeout(() => {
      notify(
        `Planner Heavy ${event.id} is still running after ${formatMinutes(warningMs)}; hard stop at ${formatMinutes(timeoutMs)}.`,
        "warning",
      );
    }, warningMs);
    warningTimer.unref?.();

    const stopTimer = setTimeout(() => {
      stopAgent(event.id as string, typeof event.description === "string" ? event.description : undefined);
    }, timeoutMs);
    stopTimer.unref?.();

    guards.set(event.id, { warningTimer, stopTimer });
  });

  const onCompleted = pi.events.on("subagents:completed", (raw: unknown) => {
    const event = raw as AgentEvent;
    if (typeof event.id === "string") clearGuard(event.id);
  });

  const onFailed = pi.events.on("subagents:failed", (raw: unknown) => {
    const event = raw as AgentEvent;
    if (typeof event.id === "string") clearGuard(event.id);
  });

  pi.on("tool_call", async (event) => {
    if (event.toolName !== "Agent") return;
    const input = event.input as AgentToolInput;
    if (typeof input.resume !== "string") return;

    const manager = (globalThis as Record<PropertyKey, unknown>)[
      Symbol.for("pi-subagents:manager")
    ] as SubagentManagerFacade | undefined;
    const resumedType = manager?.getRecord?.(input.resume)?.type;
    if (resumedType === TARGET_AGENT || input.subagent_type === TARGET_AGENT) {
      return {
        block: true,
        reason:
          "planner-heavy resume is disabled because resumed pi-subagents cannot be safely wall-clock-aborted. Start a fresh planner-heavy run from the existing HANDOFF/brief artifacts.",
      };
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
  });

  pi.on("session_shutdown", async () => {
    currentCtx = undefined;
    for (const agentId of [...guards.keys()]) clearGuard(agentId);
    for (const cleanup of [...pendingRpcCleanups]) cleanup();
    onStarted();
    onCompleted();
    onFailed();
  });
}

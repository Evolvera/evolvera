import { randomUUID } from "node:crypto";
import {
  isToolCallEventType,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const DEFAULT_PLAN_HEAVY_TIMEOUT_MS = 45 * 60_000;
const MIN_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 6 * 60 * 60_000;
const TARGET_AGENT = "planner";
const PLAN_HEAVY_DESCRIPTION = "Plan-heavy final synthesis";

type AgentEvent = {
  id?: unknown;
  type?: unknown;
  description?: unknown;
};

type Guard = {
  warningTimer: ReturnType<typeof setTimeout>;
  stopTimer: ReturnType<typeof setTimeout>;
  timeoutMs: number;
  type: string;
  description: string;
};

type SubagentManagerFacade = {
  getRecord?: (agentId: string) => { type?: string; description?: string } | undefined;
};

type AgentToolInput = Record<string, unknown> & {
  resume?: unknown;
};

export function isPlanHeavyPlanner(type: unknown, description: unknown): boolean {
  return type === TARGET_AGENT && description === PLAN_HEAVY_DESCRIPTION;
}

export function planHeavyTimeoutMs(): number {
  const configured = Number(process.env.PI_PLANNER_HEAVY_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_PLAN_HEAVY_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(configured)));
}

export function subagentTimeoutMs(value: string | undefined = process.env.PI_SUBAGENT_MAX_MINUTES): number {
  if (!value || !/^\d+$/.test(value)) return 120 * 60_000;
  const minutes = Number(value);
  return Number.isSafeInteger(minutes) && minutes >= 5 && minutes <= 360 ? minutes * 60_000 : 120 * 60_000;
}

function formatMinutes(ms: number): string {
  return `${Math.round(ms / 60_000)}m`;
}

export default function subagentWatchdog(pi: ExtensionAPI) {
  const guards = new Map<string, Guard>();
  const pendingRpcCleanups = new Set<() => void>();
  const timeoutMs = planHeavyTimeoutMs();
  const ordinaryTimeoutMs = subagentTimeoutMs();
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
    const guard = guards.get(agentId);
    const isPlanner = guard?.type === TARGET_AGENT && guard.description === PLAN_HEAVY_DESCRIPTION;
    const limit = guard?.timeoutMs ?? timeoutMs;
    clearGuard(agentId);
    const label = isPlanner ? "Plan-heavy planner" : `Subagente ${description ?? agentId}`;
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
      notify(`${label} watchdog não conseguiu confirmar a interrupção do agente ${agentId} após ${formatMinutes(limit)}.`, "error");
    }, 5_000);
    replyDeadline.unref?.();

    unsubscribe = pi.events.on(replyEvent, (raw: unknown) => {
      cleanupRpc();
      const reply = raw as { success?: boolean; error?: string };
      if (reply?.success) {
        notify(isPlanner
          ? `Plan-heavy planner stopped after hard wall-clock limit (${formatMinutes(limit)}).`
          : `Subagente ${description ?? agentId} (${agentId}) foi interrompido após o limite de ${formatMinutes(limit)}.`, "error");
      } else {
        notify(isPlanner
          ? `Plan-heavy planner watchdog stop failed: ${reply?.error ?? "unknown error"}.`
          : `Falha ao interromper subagente ${description ?? agentId} (${agentId}) após ${formatMinutes(limit)}: ${reply?.error ?? "erro desconhecido"}.`, "error");
      }
    });
    pendingRpcCleanups.add(cleanupRpc);

    pi.appendEntry("subagent-watchdog", {
      agentId,
      agentType: guard?.type ?? TARGET_AGENT,
      mode: isPlanner ? "plan-heavy" : "all-subagents",
      description: description ?? "",
      action: "stop",
      reason: "wall-clock-timeout",
      timeoutMs: limit,
      at: new Date().toISOString(),
    });

    pi.events.emit("subagents:rpc:stop", { requestId, agentId });
  };

  const onStarted = pi.events.on("subagents:started", (raw: unknown) => {
    const event = raw as AgentEvent;
    if (typeof event.id !== "string") return;
    const planner = isPlanHeavyPlanner(event.type, event.description);
    const limit = planner ? timeoutMs : ordinaryTimeoutMs;
    const description = typeof event.description === "string" ? event.description : String(event.type ?? "subagente");
    clearGuard(event.id);
    const warningMs = planner
      ? Math.min(30 * 60_000, Math.max(60_000, Math.floor(limit * 2 / 3)))
      : Math.floor(limit * 2 / 3);
    const warningTimer = setTimeout(() => {
      notify(planner
        ? `Plan-heavy planner ${event.id} is still running after ${formatMinutes(warningMs)}; hard stop at ${formatMinutes(limit)}.`
        : `Subagente ${description} (${event.id}) continua ativo; limite de ${formatMinutes(limit)}.`, "warning");
    }, warningMs);
    warningTimer.unref?.();
    const stopTimer = setTimeout(() => stopAgent(event.id as string, description), limit);
    stopTimer.unref?.();
    guards.set(event.id, { warningTimer, stopTimer, timeoutMs: limit, type: String(event.type ?? ""), description });
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
    if (!isToolCallEventType<"Agent", AgentToolInput>("Agent", event)) return;
    const input = event.input;
    if (typeof input.resume !== "string") return;

    const manager = (globalThis as Record<PropertyKey, unknown>)[
      Symbol.for("pi-subagents:manager")
    ] as SubagentManagerFacade | undefined;
    const resumed = manager?.getRecord?.(input.resume);
    if (isPlanHeavyPlanner(resumed?.type, resumed?.description)) {
      return {
        block: true,
        reason:
          "Plan-heavy planner resume is disabled because resumed pi-subagents cannot be safely wall-clock-aborted. Start a fresh planner run from the existing HANDOFF/brief artifacts.",
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
  return { guards };
}

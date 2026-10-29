import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const UPDATE_INTERVAL_MS = 1_000;

type TimerHandle = ReturnType<typeof setInterval>;

type WorkingTimeRuntime = {
  now(): number;
  setInterval(callback: () => void, intervalMs: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
};

const defaultRuntime: WorkingTimeRuntime = {
  now: () => Date.now(),
  setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
  clearInterval: (handle) => clearInterval(handle),
};

export function formatWorkingDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours}h`);
  if (hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(" ");
}

type Task = { id?: unknown; status?: unknown };
const DONE = new Set(["completed", "done"]);

/**
 * Request progress from the session's own todo list: items done/total and, once one item is done, a time
 * estimate from the average time per finished item so far. No model call; honest "≈" because items differ.
 */
export function progressSuffix(tasks: Task[], requestStartedAt: number | undefined, completions: number[], now: number): string {
  if (!tasks.length || requestStartedAt === undefined) return "";
  const done = tasks.filter((t) => DONE.has(String(t.status ?? "").toLowerCase())).length;
  const remaining = tasks.length - done;
  const parts = [`pedido ${formatWorkingDuration(now - requestStartedAt)}`, `${done}/${tasks.length} itens`];
  if (remaining === 0) parts.push("lista concluída");
  else if (done > 0 && completions.length) {
    const perItem = (Math.max(...completions) - requestStartedAt) / done;
    const minutes = Math.max(1, Math.round((perItem * remaining) / 60_000));
    parts.push(`faltam ≈ ${minutes} min`);
  }
  return ` · ${parts.join(" · ")}`;
}

export function registerWorkingTime(
  pi: ExtensionAPI,
  runtime: WorkingTimeRuntime = defaultRuntime,
): void {
  let startedAt: number | undefined;
  let interval: TimerHandle | undefined;
  let activeContext: ExtensionContext | undefined;
  // Request-level progress (a request spans many turns): reset on each real user message.
  let requestStartedAt: number | undefined;
  let tasks: Task[] = [];
  let completed = new Set<string>();
  let completions: number[] = [];

  const render = () => {
    if (startedAt === undefined || !activeContext) return;
    const now = runtime.now();
    activeContext.ui.setWorkingMessage(`Working for ${formatWorkingDuration(now - startedAt)}${progressSuffix(tasks, requestStartedAt, completions, now)}`);
  };

  pi.on("input", async (event) => {
    if (event.source === "extension") return;
    requestStartedAt = undefined;
    tasks = [];
    completed = new Set();
    completions = [];
  });
  pi.on("agent_start", async () => {
    requestStartedAt ??= runtime.now();
  });
  pi.on("tool_result", async (event) => {
    const details = (event as { toolName?: string; details?: { tasks?: unknown } }).details;
    if ((event as { toolName?: string }).toolName !== "todo" || !Array.isArray(details?.tasks)) return;
    tasks = details.tasks as Task[];
    for (const task of tasks) {
      const key = String(task.id ?? "");
      if (DONE.has(String(task.status ?? "").toLowerCase()) && !completed.has(key)) {
        completed.add(key);
        completions.push(runtime.now());
      }
    }
  });

  const stop = (ctx?: ExtensionContext) => {
    if (interval !== undefined) runtime.clearInterval(interval);
    interval = undefined;
    startedAt = undefined;
    const targetContext = ctx ?? activeContext;
    activeContext = undefined;
    targetContext?.ui.setWorkingMessage();
  };

  const startTurn = (ctx: ExtensionContext) => {
    if (ctx.mode !== "tui" || !ctx.hasUI) return;

    stop(ctx);
    startedAt = runtime.now();
    activeContext = ctx;
    render();
    interval = runtime.setInterval(render, UPDATE_INTERVAL_MS);
    interval.unref?.();
  };

  pi.on("turn_start", async (_event, ctx) => {
    startTurn(ctx);
  });

  pi.on("turn_end", async (_event, ctx) => {
    stop(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    stop(ctx);
  });
}

export default function workingTimeExtension(pi: ExtensionAPI): void {
  registerWorkingTime(pi);
}

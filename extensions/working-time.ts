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

export function registerWorkingTime(
  pi: ExtensionAPI,
  runtime: WorkingTimeRuntime = defaultRuntime,
): void {
  let startedAt: number | undefined;
  let interval: TimerHandle | undefined;
  let activeContext: ExtensionContext | undefined;

  const render = () => {
    if (startedAt === undefined || !activeContext) return;
    activeContext.ui.setWorkingMessage(`Working for ${formatWorkingDuration(runtime.now() - startedAt)}`);
  };

  const stop = (ctx?: ExtensionContext) => {
    if (interval !== undefined) runtime.clearInterval(interval);
    interval = undefined;
    startedAt = undefined;
    activeContext = undefined;
    ctx?.ui.setWorkingMessage();
  };

  pi.on("agent_start", async (_event, ctx) => {
    if (ctx.mode !== "tui" || !ctx.hasUI || startedAt !== undefined) return;

    startedAt = runtime.now();
    activeContext = ctx;
    render();
    interval = runtime.setInterval(render, UPDATE_INTERVAL_MS);
    interval.unref?.();
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (!ctx.isIdle()) return;
    stop(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    stop(ctx);
  });
}

export default function workingTimeExtension(pi: ExtensionAPI): void {
  registerWorkingTime(pi);
}

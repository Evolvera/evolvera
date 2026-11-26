import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const RUN_ID_PATTERN = /^run_[A-Za-z0-9_-]+$/;
export const TERMINAL_HANDLE_PATTERN = /^term_[A-Za-z0-9_-]+$/;

type ChildEvent = { runId: string; kind: string; cwd: string; text: string };
type Registry = { pid: number; startTime: string; runId: string; cwd: string; child: string; clean: boolean };
type RouteTable = Record<string, string>;

export function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
}

function childEventsDir(): string {
  return path.join(agentDir(), "child-events");
}

function processStartTime(pid: number): string | undefined {
  if (process.platform !== "linux") return undefined;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const end = stat.lastIndexOf(") ");
    if (end < 0) return undefined;
    const fields = stat.slice(end + 2).trim().split(/\s+/);
    const startTime = fields[19];
    return startTime && /^\d+$/.test(startTime) ? startTime : undefined;
  } catch { return undefined; }
}

function atomicJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(value));
    renameSync(temporary, file);
  } catch (error) {
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}

export function spoolChildEvent(event: ChildEvent): boolean {
  if (!RUN_ID_PATTERN.test(event.runId) || typeof event.kind !== "string" || typeof event.cwd !== "string" || typeof event.text !== "string") return false;
  const id = randomUUID();
  const body = {
    id,
    pid: process.pid,
    ts: new Date().toISOString(),
    runId: event.runId,
    cwd: event.cwd,
    child: path.basename(event.cwd),
    kind: event.kind,
    text: event.text,
  };
  try {
    atomicJson(path.join(childEventsDir(), "queue", `${id}.json`), body);
    return true;
  } catch { return false; }
}

function readRoutes(): RouteTable {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(agentDir(), "report-routes.json"), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([runId, handle]) => RUN_ID_PATTERN.test(runId) && typeof handle === "string" && TERMINAL_HANDLE_PATTERN.test(handle)));
  } catch { return {}; }
}

function lockIsStale(lockDir: string): boolean {
  try {
    const lock = JSON.parse(readFileSync(path.join(lockDir, "owner.json"), "utf8")) as { pid?: unknown; startTime?: unknown };
    if (typeof lock.pid === "number" && Number.isInteger(lock.pid) && typeof lock.startTime === "string" && lock.startTime !== "unsupported") {
      return processStartTime(lock.pid) !== lock.startTime;
    }
    return Date.now() - statSync(lockDir).birthtimeMs > 30_000;
  } catch {
    try { return Date.now() - statSync(lockDir).birthtimeMs > 2_000; } catch { return false; }
  }
}

function withRouteLock<T>(operation: () => T): T | undefined {
  const lockDir = path.join(agentDir(), ".report-routes.lock");
  mkdirSync(agentDir(), { recursive: true });
  let acquired = false;
  for (let attempt = 0; attempt < 64; attempt++) {
    try {
      mkdirSync(lockDir);
      acquired = true;
      atomicJson(path.join(lockDir, "owner.json"), { pid: process.pid, startTime: processStartTime(process.pid) ?? "unsupported" });
      break;
    } catch {
      if (lockIsStale(lockDir)) {
        const reaper = path.join(lockDir, "reaper");
        try { mkdirSync(reaper); } catch { continue; }
        try {
          if (lockIsStale(lockDir)) {
            const stalePath = `${lockDir}.stale.${process.pid}.${randomUUID()}`;
            renameSync(lockDir, stalePath);
            rmSync(stalePath, { recursive: true, force: true });
          }
        } catch {}
      }
    }
  }
  if (!acquired) return undefined;
  try { return operation(); }
  finally {
    try { unlinkSync(path.join(lockDir, "owner.json")); } catch {}
    try { rmdirSync(lockDir); } catch {}
  }
}

export function readReportRoute(runId: string): string | undefined {
  if (!RUN_ID_PATTERN.test(runId)) return undefined;
  return readRoutes()[runId];
}

export function writeReportRoute(runId: string, handle: string): boolean {
  if (!RUN_ID_PATTERN.test(runId) || !TERMINAL_HANDLE_PATTERN.test(handle)) return false;
  try {
    return withRouteLock(() => {
      const routes = readRoutes();
      routes[runId] = handle;
      atomicJson(path.join(agentDir(), "report-routes.json"), routes);
      return true;
    }) === true;
  } catch { return false; }
}

export function isChildEventRelayRunning(): boolean {
  if (process.platform !== "linux") return false;
  try {
    const ready = JSON.parse(readFileSync(path.join(childEventsDir(), "relay.pid.json"), "utf8")) as { pid?: unknown; startTime?: unknown };
    return typeof ready.pid === "number" && Number.isInteger(ready.pid) && ready.pid > 0
      && typeof ready.startTime === "string" && processStartTime(ready.pid) === ready.startTime;
  } catch { return false; }
}

function registry(runId: string, cwd: string, clean: boolean): Registry {
  return { pid: process.pid, startTime: processStartTime(process.pid) ?? "unsupported", runId, cwd, child: path.basename(cwd), clean };
}

function recordChild(runId: string, cwd: string, clean: boolean): void {
  try { atomicJson(path.join(childEventsDir(), "children", `${process.pid}.json`), registry(runId, cwd, clean)); } catch {}
}

function hasActiveGoal(ctx: any): boolean {
  try {
    const entries = Array.from(ctx.sessionManager?.getBranch?.() ?? []) as Array<{ type?: unknown; customType?: unknown; data?: any }>;
    const latest = entries.filter((entry) => entry.type === "custom" && entry.customType === "goal-state").at(-1);
    return latest?.data?.goal?.status === "active";
  } catch { return false; }
}

function safeDescription(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) : fallback;
}

type Timer = ReturnType<typeof setTimeout>;

export default function childEvents(pi: ExtensionAPI): void {
  const runId = process.env.PI_REPORT_RUN;
  if (process.platform !== "linux" || !runId || !RUN_ID_PATTERN.test(runId)) return;
  let cwd = process.cwd();
  let terminalSignal: "SIGTERM" | undefined;
  let idleTimer: Timer | undefined;
  const promptTimers = new Map<string, Timer>();
  const signalListeners = new Map<NodeJS.Signals, () => void>();
  let closed = false;

  const clearIdle = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = undefined; };
  const removeSignalListeners = () => {
    for (const [signal, listener] of signalListeners) process.removeListener(signal, listener);
    signalListeners.clear();
  };
  const installSignalObserver = () => {
    if (process.listenerCount("SIGTERM") === 0 || signalListeners.has("SIGTERM")) return;
    const listener = () => { terminalSignal = "SIGTERM"; };
    process.prependListener("SIGTERM", listener);
    signalListeners.set("SIGTERM", listener);
  };
  const clearTimers = () => {
    clearIdle();
    for (const timer of promptTimers.values()) clearTimeout(timer);
    promptTimers.clear();
  };

  pi.on("session_start", (_event: any, ctx: any) => {
    cwd = typeof ctx?.cwd === "string" ? ctx.cwd : cwd;
    closed = false;
    installSignalObserver();
    recordChild(runId, cwd, false);
  });
  pi.on("agent_start", () => { installSignalObserver(); clearIdle(); });
  pi.on("agent_settled", (event: any, ctx: any) => {
    installSignalObserver();
    clearIdle();
    idleTimer = setTimeout(() => {
      idleTimer = undefined;
      try {
        if (closed || !ctx.isIdle?.() || ctx.hasPendingMessages?.() || hasActiveGoal(ctx)) return;
        spoolChildEvent({ runId, kind: "idle", cwd: ctx.cwd, text: event?.aborted ? "Worker stopped; session is idle." : "Worker is idle with no active Goal." });
      } catch {}
    }, 4_000);
  });
  pi.on("ui_prompt_start", (event: any, ctx: any) => {
    const key = String(event?.kind ?? "prompt");
    if (promptTimers.has(key)) return;
    promptTimers.set(key, setTimeout(() => {
      promptTimers.delete(key);
      if (!closed) spoolChildEvent({ runId, kind: "prompt", cwd: ctx.cwd, text: `Blocking ${safeDescription(event?.kind, "user")} prompt remains open.` });
    }, 15_000));
  });
  pi.on("ui_prompt_end", (event: any) => {
    const key = String(event?.kind ?? "prompt");
    const timer = promptTimers.get(key);
    if (timer) clearTimeout(timer);
    promptTimers.delete(key);
  });
  pi.on("session_shutdown", (event: any, ctx: any) => {
    closed = true;
    clearTimers();
    removeSignalListeners();
    cwd = typeof ctx?.cwd === "string" ? ctx.cwd : cwd;
    if (event?.reason === "quit") {
      const kind = terminalSignal ? "killed" : "quit";
      const text = terminalSignal ? "Worker terminated by SIGTERM; session was saved." : "Worker exited with /quit; session was saved.";
      if (spoolChildEvent({ runId, kind, cwd, text })) recordChild(runId, cwd, true);
    }
  });
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const run = promisify(execFile);
const GRACE_MS = 2000;
const POLL_MS = 100;

export type ProcessRow = { pid: number; ppid: number };

export function descendantsOf(root: number, rows: ProcessRow[]): number[] {
  const children = new Map<number, number[]>();
  for (const { pid, ppid } of rows) children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  const found: number[] = [];
  const queue = [root];
  while (queue.length) {
    for (const pid of children.get(queue.shift()!) ?? []) {
      if (pid === root || found.includes(pid)) continue;
      found.push(pid);
      queue.push(pid);
    }
  }
  return found;
}

export function parseProcessTable(text: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(\d+)[\s,]+(\d+)\s*$/.exec(line);
    if (match) rows.push({ pid: Number(match[1]), ppid: Number(match[2]) });
  }
  return rows;
}

async function processTable(): Promise<ProcessRow[]> {
  if (process.platform === "win32") {
    const script = "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId)\" }";
    return parseProcessTable((await run("powershell", ["-NoProfile", "-Command", script], { windowsHide: true })).stdout);
  }
  return parseProcessTable((await run("ps", ["-A", "-o", "pid=,ppid="])).stdout);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function signal(pids: number[], name: "SIGTERM" | "SIGKILL"): void {
  for (const pid of pids) {
    try {
      process.kill(pid, name);
    } catch {
      continue;
    }
  }
}

export async function reapDescendants(root: number = process.pid): Promise<number[]> {
  const targets = descendantsOf(root, await processTable()).filter((pid) => pid !== root && pid !== process.ppid);
  if (targets.length === 0) return [];
  if (process.platform === "win32") {
    await Promise.all(targets.map((pid) => run("taskkill", ["/T", "/F", "/PID", String(pid)], { windowsHide: true }).catch(() => undefined)));
    return targets;
  }
  signal(targets, "SIGTERM");
  for (let waited = 0; waited < GRACE_MS && targets.some(alive); waited += POLL_MS) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  signal(targets.filter(alive), "SIGKILL");
  return targets;
}

/**
 * Non-interactive runs (`pi -p`, `--mode json`, `--mode rpc`) must not leave processes started by the run
 * (bash tool children, background runners, waiters) alive: they leak and can keep Pi itself from exiting.
 * On final shutdown, kills only the descendants of this Pi process: SIGTERM, then SIGKILL after 2 s
 * (taskkill /T /F on Windows). Interactive sessions are never touched: a dev server may be on purpose.
 */
export default function (pi: ExtensionAPI) {
  pi.on("session_shutdown", async (event, ctx) => {
    if (event.reason !== "quit" || ctx.mode === "tui") return;
    await reapDescendants().catch(() => undefined);
  });
}

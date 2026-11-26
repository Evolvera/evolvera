import { execFile as nodeExecFile, spawn as nodeSpawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { agentDir, isChildEventRelayRunning, RUN_ID_PATTERN, TERMINAL_HANDLE_PATTERN, writeReportRoute } from "./child-events.ts";

type Runner = (file: string, args: string[], options: { cwd: string; timeout: number; encoding: "utf8"; env: NodeJS.ProcessEnv }) => Promise<{ stdout: string }>;
type Spawn = typeof nodeSpawn;
type ConductorEventsOptions = { runner?: Runner; spawn?: Spawn; platform?: string };

function execFile(file: string, args: string[], options: { cwd: string; timeout: number; encoding: "utf8"; env: NodeJS.ProcessEnv }): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    nodeExecFile(file, args, options, (error, stdout) => {
      if (error) reject(error);
      else resolve({ stdout: String(stdout) });
    });
  });
}

function ownRunId(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const receipt = value as { ok?: unknown; result?: { runId?: unknown; run?: { id?: unknown } } };
  if (receipt.ok !== true) return undefined;
  const id = receipt.result?.runId ?? receipt.result?.run?.id;
  return typeof id === "string" && RUN_ID_PATTERN.test(id) ? id : undefined;
}

function successfulBashCommand(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const event = value as { toolName?: unknown; isError?: unknown; command?: unknown; input?: { command?: unknown } };
  if (event.isError === true || (event.toolName !== undefined && event.toolName !== "bash")) return undefined;
  const command = event.input?.command ?? event.command;
  return typeof command === "string" ? command : undefined;
}

function isRunBindingCommand(command: string): boolean {
  return command.split(/(?:&&|\|\||[;|\n])+/).some((part) =>
    /^\s*(?:orca|orca-ide)\s+orchestration\s+(?:run-create|run-use|run-current|worker-start)(?:\s|$)/.test(part));
}

async function installedRelay(): Promise<string | undefined> {
  const relay = path.join(agentDir(), "bin", "child-events-relay.py");
  try { await access(relay); return relay; }
  catch { return undefined; }
}

export function createConductorEvents(options: ConductorEventsOptions = {}) {
  const runner = options.runner ?? execFile;
  const spawn = options.spawn ?? nodeSpawn;
  const platform = options.platform ?? process.platform;
  let relayStart: Promise<void> | undefined;
  let relayProcess: ReturnType<Spawn> | undefined;

  async function ensureRelay(): Promise<void> {
    if (platform !== "linux" || relayProcess || isChildEventRelayRunning()) return;
    if (!relayStart) {
      relayStart = (async () => {
        const relay = await installedRelay();
        if (!relay || isChildEventRelayRunning()) return;
        const child = spawn("python3", [relay], { detached: true, stdio: "ignore" });
        relayProcess = child;
        const forget = () => { if (relayProcess === child) relayProcess = undefined; };
        child.once("error", forget);
        child.once("exit", forget);
        child.unref();
      })().finally(() => { relayStart = undefined; });
    }
    await relayStart;
  }

  async function sync(cwd: string): Promise<void> {
    const handle = process.env.ORCA_TERMINAL_HANDLE;
    if (!handle || !TERMINAL_HANDLE_PATTERN.test(handle)) return;
    try {
      const response = await runner("orca", ["orchestration", "run-current", "--from", handle, "--json"], {
        cwd, timeout: 5_000, encoding: "utf8", env: process.env,
      });
      let receipt: unknown;
      try { receipt = JSON.parse(response.stdout); } catch { receipt = undefined; }
      const runId = ownRunId(receipt);
      if (runId) writeReportRoute(runId, handle);
    } catch { }
    await ensureRelay();
  }

  async function syncAfterRunCommand(command: unknown, cwd: string): Promise<void> {
    const value = successfulBashCommand(command);
    if (!value || !isRunBindingCommand(value)) return;
    await sync(cwd);
  }

  return { sync, syncAfterRunCommand };
}

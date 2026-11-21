import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { commandWords, programName, shellSegments } from "./bash-timeout";

/**
 * Refuses untracked detached processes in non-interactive runs on Windows.
 *
 * A process started through WMI (Win32_Process.Create), Start-Process, `cmd /c start` or schtasks is
 * not a descendant of the Pi: process-reaper cannot end it and nobody tracks it. On the dense server a
 * waiter created that way (hidden in an -EncodedCommand) survived its Pi and ran an old test 2 h later.
 * run-job.ps1 (windows-jobs skill) is the tracked way to outlive the run: Job Object, commit cap,
 * status file, stop-job. Interactive sessions are untouched: a human may start a dev server on purpose.
 */

export const DETACH_REASON =
  "[detach-guard] Non-interactive run on Windows: a process started this way (WMI Win32_Process.Create, Start-Process without -Wait, cmd start without /wait, schtasks, or an -EncodedCommand that hides what runs) is not tracked and outlives the run's cleanup. Run it in the foreground, or start it with the windows-jobs skill: powershell -NoProfile -ExecutionPolicy Bypass -File ~/.pi/agent/skills/windows-jobs/scripts/run-job.ps1 -Name <name> -CommitLimitGB <gb> -- <program.exe> [args] (tracked, commit-capped, stopped with stop-job.ps1).";

const SANCTIONED = new Set(["run-job.ps1", "stop-job.ps1"]);
const ENCODED = /^-(e|ec|enc\w*)$/i;
const WMI_CREATE = /win32_process['")\]\s]*\.create\s*\(/i;
const MAX_DEPTH = 3;

const lower = (words: string[]) => words.map((word) => word.toLowerCase());
const hasFlag = (args: string[], flag: string) => lower(args).some((arg) => arg === flag || arg.startsWith(`${flag}:`));

function scriptName(word: string | undefined): string {
  return (word ?? "").replace(/\\/g, "/").split("/").pop()!.toLowerCase();
}

/** Inner command of `powershell -Command ...`, `bash -c ...` or `cmd /c ...`, if any. */
function innerCommand(args: string[], flags: string[]): string | undefined {
  const index = lower(args).findIndex((arg) => flags.includes(arg));
  return index === -1 ? undefined : args.slice(index + 1).join(" ");
}

function segmentDetaches(words: string[], tool: string, depth: number): boolean {
  const [first, ...args] = commandWords(words);
  const name = programName(first);
  const text = lower(args);
  if (name === "powershell" || name === "pwsh") {
    if (args.some((arg) => ENCODED.test(arg))) return true;
    const file = innerCommand(args, ["-file", "-f"]);
    if (file !== undefined) return false;
    const inner = innerCommand(args, ["-command", "-c"]) ?? (args.length && !args[0].startsWith("-") ? args.join(" ") : undefined);
    return inner !== undefined && commandDetaches(inner, "powershell", depth + 1);
  }
  if (name === "bash" || name === "sh") {
    const inner = innerCommand(args, ["-c"]);
    return inner !== undefined && commandDetaches(inner, "bash", depth + 1);
  }
  if (name === "cmd") {
    const inner = innerCommand(args, ["/c", "/k"]);
    return inner !== undefined && commandDetaches(inner, "cmd", depth + 1);
  }
  if (name === "start-process" || name === "saps") return !hasFlag(args, "-wait");
  if (name === "start") return tool === "powershell" ? !hasFlag(args, "-wait") : !hasFlag(args, "/wait");
  if (name === "invoke-cimmethod" || name === "invoke-wmimethod") return text.some((arg) => arg.includes("win32_process")) && text.some((arg) => arg.includes("create"));
  if (name === "wmic") return text.includes("process") && text.includes("create");
  if (name === "schtasks") return text.includes("/create");
  return false;
}

function commandDetaches(command: string, tool: string, depth: number): boolean {
  if (depth > MAX_DEPTH) return false;
  if (WMI_CREATE.test(command)) return true;
  for (const { words } of shellSegments(command)) {
    const [first, ...args] = commandWords(words);
    const name = programName(first);
    const file = (name === "powershell" || name === "pwsh") ? innerCommand(args, ["-file", "-f"]) : undefined;
    if (file !== undefined && SANCTIONED.has(scriptName(file.split(" ")[0]))) continue;
    if (segmentDetaches(words, tool, depth)) return true;
  }
  return false;
}

/** Refusal text when the command starts an untracked detached process, otherwise null. */
export function detachReason(command: unknown, tool: string): string | null {
  if (typeof command !== "string" || !command.trim()) return null;
  return commandDetaches(command, tool, 0) ? DETACH_REASON : null;
}

export function registerDetachGuard(pi: Pick<ExtensionAPI, "on">, platform: string = process.platform): void {
  if (platform !== "win32") return;
  pi.on("tool_call", async (event, ctx) => {
    if (ctx.mode === "tui" || (event.toolName !== "bash" && event.toolName !== "powershell")) return;
    const reason = detachReason((event.input as { command?: unknown }).command, event.toolName);
    if (reason) return { block: true, reason };
  });
}

export default function detachGuard(pi: ExtensionAPI): void {
  registerDetachGuard(pi);
}

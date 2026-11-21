import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Gives every `bash` tool call a sane timeout.
 *
 * PI's bash tool has no default timeout, and models often pick a short one (120 s) for work that
 * needs more: a `git worktree add` on a slow disk was cut at 23 %, `npm ci` and full test suites die
 * the same way. Missing timeout -> default (900 s); explicit timeout -> clamped to the max (7200 s);
 * slow-by-nature commands (git network ops, installs, full test suites) are raised to a floor (600 s).
 *
 * Env (seconds): PI_BASH_TIMEOUT_DEFAULT, PI_BASH_TIMEOUT_MAX.
 */

export const DEFAULT_TIMEOUT_S = 900;
export const MAX_TIMEOUT_S = 7200;
export const FLOOR_TIMEOUT_S = 600;
const TIMED_OUT_PATTERN = /Command timed out after (\d+(?:\.\d+)?) seconds/;

export type Limits = { defaultS: number; maxS: number; floorS: number };

function positiveSeconds(raw: unknown): number | undefined {
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function timeoutLimits(env: Record<string, string | undefined> = process.env): Limits {
  const maxS = positiveSeconds(env.PI_BASH_TIMEOUT_MAX) ?? MAX_TIMEOUT_S;
  return {
    maxS,
    defaultS: Math.min(positiveSeconds(env.PI_BASH_TIMEOUT_DEFAULT) ?? DEFAULT_TIMEOUT_S, maxS),
    floorS: Math.min(FLOOR_TIMEOUT_S, maxS),
  };
}

export type ShellSegment = { words: string[]; writes: string[] };

/**
 * Light shell splitter shared by the bash guards: splits on ; | & && || newlines and parentheses,
 * honours quotes, and separates output-redirect targets (`> f`, `>> f`, `2> f`, `&> f`) from words.
 * Backslashes are literal so Windows paths survive. Not a full shell parser.
 */
export function shellSegments(command: string): ShellSegment[] {
  const segments: ShellSegment[] = [];
  let words: string[] = [];
  let writes: string[] = [];
  let buf = "";
  let has = false;
  let quote: string | null = null;
  let pending: "write" | "read" | null = null;
  const pushWord = () => {
    if (!has) return;
    if (pending === "write") writes.push(buf);
    else if (pending !== "read") words.push(buf);
    pending = null;
    buf = "";
    has = false;
  };
  const endSegment = () => {
    pushWord();
    pending = null;
    if (words.length || writes.length) segments.push({ words, writes });
    words = [];
    writes = [];
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else buf += c;
      continue;
    }
    if (c === "\"" || c === "'") { quote = c; has = true; continue; }
    if (c === " " || c === "\t" || c === "\r") { pushWord(); continue; }
    if (c === "\n" || c === ";" || c === "|" || c === "(" || c === ")" || c === "`") {
      endSegment();
      if (c === "|" && command[i + 1] === "|") i++;
      continue;
    }
    if (c === "&") {
      if (command[i + 1] === ">") { pushWord(); continue; }
      endSegment();
      if (command[i + 1] === "&") i++;
      continue;
    }
    if (c === ">" || c === "<") {
      if (has && /^\d+$/.test(buf)) { buf = ""; has = false; } else pushWord();
      let j = i + 1;
      if (command[j] === ">" || command[j] === "|") j++;
      if (command[j] === "&") {
        j++;
        while (/[\d-]/.test(command[j] ?? "")) j++;
        i = j - 1;
        continue;
      }
      pending = c === ">" ? "write" : "read";
      i = j - 1;
      continue;
    }
    buf += c;
    has = true;
  }
  endSegment();
  return segments;
}

const PREFIXES = new Set(["sudo", "time", "nice", "nohup", "command", "exec", "env", "builtin", "stdbuf", "ionice"]);

/** Drops leading `VAR=value` assignments and wrappers like sudo/time/nohup. */
export function commandWords(words: string[]): string[] {
  let i = 0;
  while (i < words.length) {
    const word = words[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) || PREFIXES.has(word) || (i > 0 && PREFIXES.has(words[i - 1]) && word.startsWith("-"))) i++;
    else break;
  }
  return words.slice(i);
}

/** Lowercased program name without directory or .exe/.cmd suffix. */
export function programName(word: string | undefined): string {
  if (!word) return "";
  return path.basename(word.replace(/\\/g, "/")).toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "");
}

const positional = (args: string[]) => args.filter((arg) => !arg.startsWith("-"));
const TEST_FILE = /\.(?:[cm]?[jt]sx?|py)(?:::|$)|::/;

function gitSubcommand(args: string[]): string[] {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) i += args[i] === "-C" || args[i] === "-c" ? 2 : 1;
  return args.slice(i);
}

function segmentNeedsFloor(words: string[]): boolean {
  let [name, ...args] = [programName(words[0]), ...words.slice(1)];
  if (["npx", "pnpx", "bunx"].includes(name) && args.length) [name, ...args] = [programName(args[0]), ...args.slice(1)];
  if (["python", "python3", "py"].includes(name) && args[0] === "-m" && args[1]) [name, ...args] = [args[1].toLowerCase(), ...args.slice(2)];
  if (name === "git") {
    const [sub, next] = positional(gitSubcommand(args));
    return ["clone", "fetch", "pull", "push"].includes(sub) || (sub === "worktree" && next === "add") || (sub === "submodule" && next === "update");
  }
  if (name === "npm" || name === "pnpm" || name === "yarn") {
    const [sub, next] = positional(args);
    if (sub === undefined) return name === "yarn";
    if (["install", "i", "ci", "add", "test", "t"].includes(sub)) return true;
    if ((sub === "run" || sub === "exec") && (next === "test" || next === "jest" || next === "vitest")) return true;
    return false;
  }
  if (name === "jest" || name === "vitest" || name === "pytest") return !positional(args).some((arg) => TEST_FILE.test(arg));
  if (name === "go" && args[0] === "test") {
    const pkgs = positional(args.slice(1));
    return pkgs.length === 0 || pkgs.some((pkg) => pkg.includes("..."));
  }
  if (name === "cargo" && args[0] === "test") return true;
  return false;
}

/** True when the command contains a slow-by-nature step that should never get a tiny timeout. */
export function needsFloor(command: unknown): boolean {
  if (typeof command !== "string") return false;
  return shellSegments(command).some((segment) => segmentNeedsFloor(commandWords(segment.words)));
}

/** Missing/invalid -> default; explicit -> clamped to max; slow commands raised to the floor. */
export function resolveBashTimeout(requested: unknown, command: unknown, limits: Limits = timeoutLimits()): number {
  const explicit = positiveSeconds(requested);
  const value = explicit === undefined ? limits.defaultS : Math.min(explicit, limits.maxS);
  return needsFloor(command) ? Math.max(value, limits.floorS) : value;
}

export function guidanceNote(limits: Limits = timeoutLimits()): string {
  return `Bash timeouts: calls without a timeout get ${limits.defaultS}s (max ${limits.maxS}s). For work that may exceed ~10 minutes (training, long runners, big builds or suites), start it in the background with output to a log file (e.g. nohup cmd > run.log 2>&1 &; on Windows Start-Process with redirected output) and poll the log with short commands, instead of one blocking call that dies with its timeout.`;
}

export function timeoutHint(seconds: string): string {
  return `[bash-timeout] The command was killed after ${seconds}s without finishing. If it was hung (test runner kept alive by open handles, watch/dev-server mode, a prompt waiting for stdin), make it terminate (CI/non-interactive flags, --forceExit, run instead of watch) and do not rerun it unchanged. If it is genuinely long, do not rerun it as one blocking call: start it in the background with output to a log file and poll the log, resuming from any checkpoint it left.`;
}

type TextContent = { type: string; text?: string };

export default function bashTimeout(pi: ExtensionAPI): void {
  const raised = new Map<string, { from: number; to: number }>();

  pi.on("before_agent_start", async (event) => ({ systemPrompt: `${event.systemPrompt}\n\n${guidanceNote()}` }));

  pi.on("tool_call", async (event) => {
    if (event.toolName !== "bash") return;
    const input = event.input as { command?: unknown; timeout?: unknown };
    const requested = positiveSeconds(input.timeout);
    const resolved = resolveBashTimeout(input.timeout, input.command);
    input.timeout = resolved;
    if (requested !== undefined && resolved > requested) raised.set(event.toolCallId, { from: requested, to: resolved });
  });

  pi.on("tool_result", async (event) => {
    if (event.toolName !== "bash") return;
    const raise = raised.get(event.toolCallId);
    raised.delete(event.toolCallId);
    const content = event.content as TextContent[];
    const notes: string[] = [];
    if (raise) notes.push(`[bash-timeout] Timeout raised from ${raise.from}s to ${raise.to}s: network, install and full test-suite commands need time.`);
    if (event.isError) {
      const match = content.map((part) => part.text ?? "").join("\n").match(TIMED_OUT_PATTERN);
      if (match) notes.push(timeoutHint(match[1]));
    }
    if (!notes.length) return;
    return { content: [...content, ...notes.map((text) => ({ type: "text", text }))] };
  });
}

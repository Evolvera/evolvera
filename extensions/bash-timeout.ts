import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Bounds every `bash` tool call with a timeout.
 *
 * Observed failure: PI's built-in bash tool has no default timeout. A builder ran
 * `npx jest <file>` that never exited (open handles), the tool waited for hours on
 * "running command…", and the orchestrator blocked on `get_subagent_result(wait)` for
 * the whole time. With a timeout the tool kills the process tree and the agent gets an
 * error it can act on; the hint below tells it why the command most likely hung.
 *
 * Config (seconds): PI_BASH_DEFAULT_TIMEOUT_S (default 900), PI_BASH_MAX_TIMEOUT_S (default 7200).
 * An explicit larger `timeout` from the agent is honored up to the max.
 */

export const DEFAULT_TIMEOUT_S = 900;
export const MAX_TIMEOUT_S = 7200;
export const INTERACTIVE_MAX_TIMEOUT_S = 600;
const TIMED_OUT_PATTERN = /Command timed out after (\d+(?:\.\d+)?) seconds/;

function positiveSeconds(raw: unknown): number | undefined {
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function timeoutLimits(env: Record<string, string | undefined> = process.env): { defaultS: number; maxS: number } {
  const maxS = positiveSeconds(env.PI_BASH_MAX_TIMEOUT_S) ?? MAX_TIMEOUT_S;
  const defaultS = Math.min(positiveSeconds(env.PI_BASH_DEFAULT_TIMEOUT_S) ?? DEFAULT_TIMEOUT_S, maxS);
  return { defaultS, maxS };
}

export function interactiveTimeoutLimits(env: Record<string, string | undefined> = process.env): { defaultS: number; maxS: number } {
  const limits = timeoutLimits(env);
  const interactiveMaxS = positiveSeconds(env.PI_BASH_INTERACTIVE_MAX_TIMEOUT_S) ?? INTERACTIVE_MAX_TIMEOUT_S;
  return { defaultS: Math.min(limits.defaultS, interactiveMaxS), maxS: Math.min(limits.maxS, interactiveMaxS) };
}

/** Missing/invalid timeout → default; explicit timeout → clamped to the max. */
export function resolveBashTimeout(requested: unknown, limits = timeoutLimits(), interactiveMaxS?: number): number {
  const explicit = positiveSeconds(requested);
  const value = explicit === undefined ? limits.defaultS : Math.min(explicit, limits.maxS);
  return interactiveMaxS === undefined ? value : Math.min(value, interactiveMaxS);
}

export function interactiveTimeoutHint(seconds: string): string {
  return `[bash-timeout] The command was killed after ${seconds}s by the interactive-session limit. In the interactive session, do not wait in the foreground on long jobs. Start them in the background, writing to a log or result file. Check them with short status commands at checkpoints, or delegate the wait to a background subagent. Do not rerun the same blocking wait.`;
}

export function timeoutHint(seconds: string): string {
  return `[bash-timeout] The command was killed after ${seconds}s without finishing. It was most likely hung, not slow: `
    + "a test runner kept alive by open handles (e.g. jest without --forceExit), a watch/dev-server mode, "
    + "or a prompt waiting for stdin. Do not rerun it unchanged. Make it terminate (CI/non-interactive flags, "
    + "--forceExit/--detectOpenHandles, run instead of watch, start servers in the background and stop them), "
    + "or pass a larger `timeout` only if the command is genuinely long-running.";
}

type TextContent = { type: string; text?: string };

export default function bashTimeout(pi: ExtensionAPI): void {
  const interactiveClamps = new Map<string, boolean>();
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const input = event.input as { timeout?: unknown };
    const requested = positiveSeconds(input.timeout);
    const interactive = ctx.hasUI;
    const env = process.env;
    const interactiveMaxS = positiveSeconds(env.PI_BASH_INTERACTIVE_MAX_TIMEOUT_S) ?? INTERACTIVE_MAX_TIMEOUT_S;
    const limit = interactive ? interactiveTimeoutLimits(env) : timeoutLimits(env);
    const resolved = resolveBashTimeout(input.timeout, limit);
    input.timeout = resolved;
    interactiveClamps.set(event.toolCallId, Boolean(interactive && requested !== undefined && requested > interactiveMaxS));
  });

  pi.on("tool_result", async (event) => {
    if (event.toolName !== "bash") return;
    const wasInteractiveClamp = interactiveClamps.get(event.toolCallId) ?? false;
    interactiveClamps.delete(event.toolCallId);
    const content = event.content as TextContent[];
    if (event.isError) {
      const match = content.map((part) => part.text ?? "").join("\n").match(TIMED_OUT_PATTERN);
      if (!match) return;
      return { content: [...content, { type: "text", text: wasInteractiveClamp ? interactiveTimeoutHint(match[1]) : timeoutHint(match[1]) }] };
    }
    if (wasInteractiveClamp) return { content: [...content, { type: "text", text: "[bash-timeout] Explicit timeout was clamped for the interactive session. In the interactive session, do not wait in the foreground on long jobs. Start them in the background, writing to a log or result file. Check them with short status commands at checkpoints, or delegate the wait to a background subagent. Do not rerun the same blocking wait." }] };
  });
}

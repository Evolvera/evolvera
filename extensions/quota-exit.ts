import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const EXIT_QUOTA = 75;

const QUOTA_PATTERN =
  /insufficient[_ ]quota|insufficient[_ ](credits?|funds|balance)|exceeded your (current )?quota|quota (exceeded|exhausted)|out of credits|credit balance is too low|payment required|\b402\b|usage limit|resource[_ ]exhausted|\b429\b[^]*\b(quota|billing|usage)\b|\b(quota|billing|usage)\b[^]*\b429\b/i;

export function isQuotaExhausted(errorMessage: unknown): boolean {
  return typeof errorMessage === "string" && QUOTA_PATTERN.test(errorMessage);
}

/**
 * Non-interactive runs that end because the provider quota or credits are exhausted exit with 75
 * (EX_TEMPFAIL) instead of the generic status, so a supervisor does not relaunch in a loop.
 * A plain transient rate limit (429 without quota/usage text) keeps the normal status.
 * Interactive sessions are untouched.
 */
export default function (pi: ExtensionAPI) {
  let exhausted = false;
  let armed = false;
  pi.on("agent_end", (event, ctx) => {
    if (ctx.mode === "tui") return;
    const last = [...event.messages].reverse().find((message) => message.role === "assistant") as
      | { stopReason?: string; errorMessage?: string }
      | undefined;
    exhausted = last?.stopReason === "error" && isQuotaExhausted(last.errorMessage);
    if (exhausted && !armed) {
      armed = true;
      process.on("exit", () => {
        if (exhausted) process.exitCode = EXIT_QUOTA;
      });
    }
  });
}

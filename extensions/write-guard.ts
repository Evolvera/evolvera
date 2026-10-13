import { statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Blocks a `write` that would replace a non-empty existing file with empty content.
 * Observed failure: a builder emitted write(content: "") over the file it was editing,
 * zeroing hours of work. That call is almost always malformed, never a real intent:
 * genuine edits use `edit` or write the complete content.
 */
export function emptyOverwriteReason(path: unknown, content: unknown, cwd: string): string | undefined {
  if (typeof path !== "string" || !path || typeof content !== "string" || content.trim() !== "") return undefined;
  const target = isAbsolute(path) ? path : resolve(cwd, path.replace(/^@/, ""));
  let size = 0;
  try {
    const stat = statSync(target);
    if (!stat.isFile()) return undefined;
    size = stat.size;
  } catch {
    return undefined; // New file: creating an empty file is legitimate.
  }
  if (size === 0) return undefined;
  return `Blocked: this write would replace the existing ${size}-byte file ${target} with empty content, destroying it. `
    + "This is almost always a malformed call. Use edit for partial changes, or write the file's complete intended content. "
    + "The file is unchanged; continue the task.";
}

export default function writeGuard(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "write") return;
    const input = event.input as { path?: unknown; content?: unknown };
    const reason = emptyOverwriteReason(input.path, input.content, ctx.cwd);
    return reason ? { block: true, reason } : undefined;
  });
}

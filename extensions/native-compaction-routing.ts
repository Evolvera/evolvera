import { compact } from "@earendil-works/pi-coding-agent";
import type {
  CompactionResult,
  ExtensionAPI,
  ExtensionContext,
  SessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";

export const NATIVE_COMPACTION_PROVIDER = "openai-codex";
export const NATIVE_COMPACTION_MODEL = "gpt-5.6-luna";
export const NATIVE_COMPACTION_THINKING_LEVEL = "xhigh" as const;

function notifyFailure(ctx: ExtensionContext): void {
  try {
    ctx.ui.notify("Native compaction was not completed; conversation history was preserved.", "warning");
  } catch {
    // A notification failure must not turn a safe compaction cancellation into a runner error.
  }
}

function isValidCompactionResult(value: unknown): value is CompactionResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<CompactionResult>;
  return typeof result.summary === "string"
    && result.summary.trim().length > 0
    && typeof result.firstKeptEntryId === "string"
    && result.firstKeptEntryId.length > 0
    && typeof result.tokensBefore === "number"
    && Number.isFinite(result.tokensBefore)
    && result.tokensBefore >= 0;
}

async function routeNativeCompaction(event: SessionBeforeCompactEvent, ctx: ExtensionContext) {
  try {
    if (event.signal.aborted) {
      notifyFailure(ctx);
      return { cancel: true };
    }

    const model = ctx.modelRegistry.find(NATIVE_COMPACTION_PROVIDER, NATIVE_COMPACTION_MODEL);
    if (!model) {
      notifyFailure(ctx);
      return { cancel: true };
    }

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok || !auth.apiKey) {
      notifyFailure(ctx);
      return { cancel: true };
    }

    // The public extension context does not expose the session stream function,
    // retry policy, or retry callbacks. Leave those optional compact() arguments
    // unset rather than mutating SDK globals or reaching into private session state.
    const result = await compact(
      event.preparation,
      model,
      auth.apiKey,
      auth.headers,
      event.customInstructions,
      event.signal,
      NATIVE_COMPACTION_THINKING_LEVEL,
      undefined,
      auth.env,
    );

    if (event.signal.aborted || !isValidCompactionResult(result)) {
      notifyFailure(ctx);
      return { cancel: true };
    }

    return { compaction: result };
  } catch {
    notifyFailure(ctx);
    return { cancel: true };
  }
}

export default function nativeCompactionRoutingExtension(pi: ExtensionAPI): void {
  pi.on("session_before_compact", routeNativeCompaction);
}

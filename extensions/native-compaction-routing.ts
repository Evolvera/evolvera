import { compact } from "@earendil-works/pi-coding-agent";
import type {
  CompactionResult,
  ExtensionAPI,
  ExtensionContext,
  SessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";

export const NATIVE_COMPACTION_PROVIDER = "openai";
export const NATIVE_COMPACTION_MODEL = "gpt-6-luna";
export const NATIVE_COMPACTION_THINKING_LEVEL = "medium" as const;

/**
 * Cross-tokenizer guard. PI's threshold check compares the last assistant
 * usage against the CURRENT model's window, even when that usage was counted
 * by another provider (its overflow check already skips other models). Right
 * after switching from Claude 4.8+ (450k window) to a GPT model (300k),
 * the Anthropic count is ~1.5x the GPT count for the same context, so a
 * 350k Claude context falsely crosses the GPT threshold (300k - reserve). Until
 * the new model produces its own usage, threshold compaction runs only above
 * this Anthropic-token bound. Manual and overflow compaction are unaffected,
 * so a real overflow on the new model still recovers normally.
 */
export const ANTHROPIC_TO_OPENAI_THRESHOLD = 450_000;
const ROUTED_MODEL_EVENT = "model-fallback:routed";
const VIRTUAL_ROUTER_PROVIDER = "fallback";
type RoutedPhysicalModel = { provider: string; modelId: string };

function readRoutedModel(payload: unknown): RoutedPhysicalModel | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const { provider, modelId } = payload as { provider?: unknown; modelId?: unknown };
  if (typeof provider !== "string" || !provider || typeof modelId !== "string" || !modelId) return undefined;
  return { provider, modelId };
}

function effectiveDispatchModel(selected: { provider: string; id: string } | undefined, routed: RoutedPhysicalModel | undefined) {
  if (selected?.provider !== VIRTUAL_ROUTER_PROVIDER || !routed) return selected;
  return { provider: routed.provider, id: routed.modelId };
}

type BranchEntry = { type?: string; message?: { role?: string; provider?: string; model?: string; stopReason?: string; usage?: Record<string, number> } };

/** Identity of the last assistant message with usable usage (same rule PI uses for its estimate). */
export function lastUsageSource(entries: unknown[]): { provider?: string; model?: string } | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const message = (entries[i] as BranchEntry)?.message;
    if ((entries[i] as BranchEntry)?.type !== "message" || message?.role !== "assistant") continue;
    if (message.stopReason === "aborted" || message.stopReason === "error") continue;
    const u = message.usage;
    const total = u ? (u.totalTokens || (u.input ?? 0) + (u.output ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0)) : 0;
    if (total > 0) return { provider: message.provider, model: message.model };
  }
  return undefined;
}

export function isStaleCrossProviderThreshold(event: SessionBeforeCompactEvent, ctx: ExtensionContext, routedModel?: RoutedPhysicalModel): boolean {
  const source = lastUsageSource(event.branchEntries ?? []);
  const dispatchModel = effectiveDispatchModel(ctx.model, routedModel);
  const claudeVersion = source?.provider === "anthropic"
    ? /^claude-[a-z]+-(\d+)-(\d+)(?:-|$)/.exec(source.model ?? "")
    : null;
  const major = claudeVersion ? Number(claudeVersion[1]) : 0;
  const minor = claudeVersion ? Number(claudeVersion[2]) : 0;
  return event.reason === "threshold"
    && (dispatchModel?.provider === "openai" || dispatchModel?.provider === "openai")
    && /^gpt-\d+(?:[.-]|$)/.test(dispatchModel.id)
    && claudeVersion !== null
    && (major > 4 || (major === 4 && minor >= 8))
    && (event.preparation?.tokensBefore ?? 0) <= ANTHROPIC_TO_OPENAI_THRESHOLD;
}

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

type CompactionModel = NonNullable<ExtensionContext["model"]>;
type ThinkingLevel = Parameters<typeof compact>[6];

/** One summarization attempt; undefined on any failure so the caller can fall back. */
async function tryCompact(event: SessionBeforeCompactEvent, ctx: ExtensionContext, model: CompactionModel, thinking: ThinkingLevel): Promise<CompactionResult | undefined> {
  try {
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok || !auth.apiKey || event.signal.aborted) return undefined;
    // The public extension context does not expose the session stream function,
    // retry policy, or retry callbacks. Leave those optional compact() arguments
    // unset rather than mutating SDK globals or reaching into private session state.
    const result = await compact(event.preparation, model, auth.apiKey, auth.headers, event.customInstructions, event.signal, thinking, undefined, auth.env);
    return !event.signal.aborted && isValidCompactionResult(result) ? result : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Luna summarizes first. If Luna is unavailable or fails (for example an
 * OpenAI outage), the conversation's own model summarizes instead with the
 * session's thinking level; only when both fail is compaction cancelled.
 */
async function routeNativeCompaction(event: SessionBeforeCompactEvent, ctx: ExtensionContext, sessionThinking: () => ThinkingLevel | undefined = () => undefined, routedModel?: RoutedPhysicalModel) {
  try {
    if (isStaleCrossProviderThreshold(event, ctx, routedModel)) return { cancel: true };
    if (event.signal.aborted) {
      notifyFailure(ctx);
      return { cancel: true };
    }

    const luna = ctx.modelRegistry.find(NATIVE_COMPACTION_PROVIDER, NATIVE_COMPACTION_MODEL);
    const primary = luna ? await tryCompact(event, ctx, luna, NATIVE_COMPACTION_THINKING_LEVEL) : undefined;
    if (primary) return { compaction: primary };

    const main = ctx.model;
    const mainIsLuna = main?.provider === NATIVE_COMPACTION_PROVIDER && main?.id === NATIVE_COMPACTION_MODEL;
    if (main && !mainIsLuna && !event.signal.aborted) {
      const fallback = await tryCompact(event, ctx, main, sessionThinking() ?? NATIVE_COMPACTION_THINKING_LEVEL);
      if (fallback) {
        try { ctx.ui.notify(`Luna indisponível; compactação feita com ${main.id}.`, "info"); } catch { /* notice is best effort */ }
        return { compaction: fallback };
      }
    }

    notifyFailure(ctx);
    return { cancel: true };
  } catch {
    notifyFailure(ctx);
    return { cancel: true };
  }
}

export default function nativeCompactionRoutingExtension(pi: ExtensionAPI): void {
  let routedModel: RoutedPhysicalModel | undefined;
  pi.events?.on?.(ROUTED_MODEL_EVENT, (data: unknown) => { routedModel = readRoutedModel(data); });
  const getThinking = (pi as { getThinkingLevel?: () => ThinkingLevel }).getThinkingLevel;
  pi.on("session_before_compact", (event, ctx) => routeNativeCompaction(event, ctx, () => getThinking?.call(pi), routedModel));
}

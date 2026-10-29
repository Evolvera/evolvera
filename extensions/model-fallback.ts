import { randomUUID } from "node:crypto";
import { clampThinkingLevel } from "@earendil-works/pi-ai/models";
import { VIRTUAL_MODEL_STATE_ENTRY, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Level = "inherit" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
type Step = { provider: string; model: string; level: Level };
type ChainState = { step: number; runId: string };
type FallbackChain = readonly Step[];

// Current chain primaries share limits and input modalities in the configured physical registry.
const PRIMARY_MODEL_METADATA: Record<string, { name: string; contextWindow: number; maxTokens: number; input: string[] }> = {
  "gpt-6-luna": { name: "GPT-6 Luna", contextWindow: 300_000, maxTokens: 128_000, input: ["text", "image"] },
  "gpt-6.1-terra": { name: "GPT-6.1 Terra", contextWindow: 300_000, maxTokens: 128_000, input: ["text", "image"] },
  "gpt-6.1-sol": { name: "GPT-6.1 Sol", contextWindow: 300_000, maxTokens: 128_000, input: ["text", "image"] },
  "deepseek-v4.1-flash-fast": { name: "DeepSeek V4.1 Flash 1017", contextWindow: 1_048_576, maxTokens: 262_144, input: ["text", "image"] },
};

// Extensions that gate behaviour on the provider/model (codex-fast-mode gates its service tier)
// cannot read through a virtual selection: they only see provider "fallback". Publishing the
// physical model the router picked keeps that gating correct. The channel name is duplicated in
// codex-fast-mode.ts instead of imported, so each extension still loads on its own.
export const ROUTED_MODEL_EVENT = "model-fallback:routed";
export type RoutedModel = { provider: string; modelId: string };

export const FALLBACK_CHAINS: Readonly<Record<string, FallbackChain>> = {
  builder: [
    { provider: "openai-codex", model: "gpt-6-luna", level: "inherit" },
    { provider: "refuseless", model: "deepseek-v4.1-flash-fast", level: "high" },
    { provider: "anthropic", model: "claude-haiku-5-5", level: "inherit" },
  ],
  heavy: [
    { provider: "openai-codex", model: "gpt-6.1-terra", level: "inherit" },
    { provider: "refuseless", model: "deepseek-v4.1-flash-fast", level: "high" },
    { provider: "anthropic", model: "claude-haiku-5-5", level: "inherit" },
  ],
  sol: [
    { provider: "openai-codex", model: "gpt-6.1-sol", level: "inherit" },
    { provider: "anthropic", model: "claude-opus-5-5", level: "inherit" },
  ],
  terra: [
    { provider: "openai-codex", model: "gpt-6.1-terra", level: "inherit" },
    { provider: "refuseless", model: "deepseek-v4.1-flash-fast", level: "high" },
    { provider: "anthropic", model: "claude-sonnet-5-5", level: "inherit" },
  ],
  luna: [
    { provider: "openai-codex", model: "gpt-6-luna", level: "inherit" },
    { provider: "refuseless", model: "deepseek-v4.1-flash-fast", level: "high" },
  ],
  conductor: [
    { provider: "refuseless", model: "deepseek-v4.1-flash-fast", level: "high" },
    { provider: "openai-codex", model: "gpt-6.1-sol", level: "inherit" },
  ],
};

const QUOTA_ERROR = /insufficient[_ ]quota|quota exceeded|out of budget|billing|monthly usage limit|subscription[_ ]sharing[_ ]usage[_ ]limit|(?:go|free)usagelimiterror|usage limit/i;
const CONTEXT_OVERFLOW = /context (?:window )?(?:overflow|too large|exceeded)|maximum context length|prompt is too long/i;
const RETRYABLE_ERROR = /(?:\b429\b|\b5\d\d\b|overload|rate.?limit|timeout|timed out|temporar|connection reset|network|stream.{0,20}(?:closed|drop|fail)|service unavailable|internal server error)/i;

export function classifyFallbackError(message: { stopReason?: string; errorMessage?: string } | undefined): "fallback" | "none" {
  if (!message || message.stopReason !== "error" || !message.errorMessage) return "none";
  if (/abort|cancel/i.test(message.errorMessage) || CONTEXT_OVERFLOW.test(message.errorMessage)) return "none";
  return QUOTA_ERROR.test(message.errorMessage) || RETRYABLE_ERROR.test(message.errorMessage) ? "fallback" : "none";
}

export function nextFallbackStep(chain: FallbackChain, step: number): number {
  return Math.min(Math.max(step, 0) + 1, chain.length - 1);
}

export function decideFallbackRoute(
  chain: FallbackChain,
  request: { reason: string; thinkingLevel: string; state?: ChainState; failed?: { model: { provider: string; id: string }; message: { stopReason?: string; errorMessage?: string } }; previous?: { model: { provider: string; id: string } } },
  runId: string,
): { step: number; runId: string } {
  if (request.reason === "user") return { step: Math.min(Math.max(request.state?.step ?? 0, 0), chain.length - 1), runId: request.state?.runId ?? runId };
  const prior = request.state?.step ?? 0;
  if (request.reason === "retry" && request.failed && classifyFallbackError(request.failed.message) === "fallback") {
    return { step: nextFallbackStep(chain, prior), runId: request.state?.runId ?? runId };
  }
  return { step: Math.min(Math.max(prior, 0), chain.length - 1), runId: request.state?.runId ?? runId };
}

function lastUserId(messages: readonly any[]): string {
  const user = [...messages].reverse().find((message) => message?.role === "user");
  return typeof user?.id === "string" ? user.id : "unknown-run";
}

function entryState(entries: readonly any[], chainId: string): ChainState | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    const data = entry?.data;
    if (entry?.customType === VIRTUAL_MODEL_STATE_ENTRY && data?.provider === "fallback" && data?.modelId === chainId) {
      const state = data.state;
      if (Number.isInteger(state?.step) && typeof state?.runId === "string") return state;
    }
  }
}

function isAssistantEntry(entry: any): any | undefined {
  const message = entry?.message;
  return entry?.type === "message" && message?.role === "assistant" ? message : undefined;
}

export default function modelFallbackExtension(pi: ExtensionAPI): void {
  pi.on("model_select", (event) => {
    if (event.model.provider !== "fallback" || !FALLBACK_CHAINS[event.model.id]) return;
    pi.appendEntry(VIRTUAL_MODEL_STATE_ENTRY, {
      provider: "fallback",
      modelId: event.model.id,
      state: { step: 0, runId: randomUUID() },
    });
  });

  for (const [id, chain] of Object.entries(FALLBACK_CHAINS)) {
    pi.registerVirtualModel<ChainState>({
      provider: "fallback",
      id,
      ...PRIMARY_MODEL_METADATA[chain[0].model],
      thinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
      route(request, ctx) {
        const runId = request.reason === "user" ? randomUUID() : request.state?.runId ?? lastUserId(request.messages);
        const state = decideFallbackRoute(chain, request, runId);
        const step = chain[state.step];
        const model = ctx.modelRegistry.find(step.provider, step.model);
        if (!model) throw new Error(`Fallback model is unavailable: ${step.provider}/${step.model}`);
        // Routing runs before every request, so listeners hold the model serving the current one.
        // Only provider and model id travel: no message, session or account data.
        const routed: RoutedModel = { provider: model.provider, modelId: model.id };
        pi.events?.emit?.(ROUTED_MODEL_EVENT, routed);
        const desiredLevel = step.level === "inherit" ? request.thinkingLevel : step.level;
        return { model, thinkingLevel: clampThinkingLevel(model, desiredLevel as any), state };
      },
    });
  }

  pi.on("agent_before_settle", (event, ctx) => {
    if (event.outcome === "aborted" || !ctx.model || ctx.model.provider !== "fallback") return;
    const chainId = ctx.model.id;
    const chain = FALLBACK_CHAINS[chainId];
    if (!chain) return;

    let branch: any[];
    try {
      branch = ctx.sessionManager.getBranch();
    } catch {
      return;
    }
    const state = entryState(branch, chainId);
    if (!state || state.step >= chain.length - 1) return;
    const lastAssistant = branch.map(isAssistantEntry).filter(Boolean).at(-1);
    const activeStep = chain[state.step];
    if (event.outcome !== "error" || lastAssistant?.provider !== activeStep.provider || lastAssistant?.model !== activeStep.model) return;
    if (classifyFallbackError(lastAssistant) !== "fallback") return;

    const count = branch.filter((entry) => {
      const data = entry?.data;
      return entry?.customType === "fallback.advance" && data?.chainId === chainId && data?.runId === state.runId && data?.fromStep === state.step;
    }).length;
    if (count > 0) return;

    const advanced = { step: nextFallbackStep(chain, state.step), runId: state.runId };
    try {
      pi.appendEntry("fallback.advance", { chainId, runId: state.runId, fromStep: state.step });
      pi.appendEntry(VIRTUAL_MODEL_STATE_ENTRY, { provider: "fallback", modelId: chainId, state: advanced });
    } catch {
      return;
    }
    return { continue: true };
  });
}

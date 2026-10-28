import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

const PROVIDER = "opengateway";
const BASE_URL = "https://apis.opengateway.ai/v1";
const CATALOG_URL = `${BASE_URL}/models`;
const REQUEST_TIMEOUT_MS = 10_000;

const fallbackModels: ProviderModelConfig[] = [
  {
    type: "chat",
    id: "openai/o4-mini",
    name: "openai/o4-mini",
    api: "openai-responses",
    baseUrl: BASE_URL,
    input: ["text"],
    reasoning: true,
    cost: { input: 1.1, output: 4.4, cacheRead: 0.275, cacheWrite: 1.1 },
    contextWindow: 200_000,
    maxTokens: 8_192,
  },
];

type CatalogEntry = {
  id?: unknown;
  modalities?: { input?: unknown };
  endpoints?: unknown;
  context_window?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown; input_cache_read?: unknown };
};

function price(value: unknown): number | undefined {
  if (typeof value === "string" && value.trim() === "") return undefined;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  const perMillion = parsed * 1_000_000;
  return Number.isFinite(perMillion) ? perMillion : undefined;
}

function catalogModel(value: unknown): ProviderModelConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entry = value as CatalogEntry;
  if (typeof entry.id !== "string" || !entry.id || entry.id.length > 256) return undefined;
  const endpoints = Array.isArray(entry.endpoints) ? entry.endpoints : [];
  const api = endpoints.includes("messages") ? "anthropic-messages"
    : endpoints.includes("responses") ? "openai-responses"
      : endpoints.includes("chat_completions") ? "openai-completions" : undefined;
  if (!api) return undefined;
  const prompt = price(entry.pricing?.prompt);
  const completion = price(entry.pricing?.completion);
  const contextWindow = entry.context_window;
  if (prompt === undefined || completion === undefined || typeof contextWindow !== "number" || !Number.isSafeInteger(contextWindow) || contextWindow <= 0) return undefined;
  const modalities = Array.isArray(entry.modalities?.input) ? entry.modalities.input : [];
  if (!modalities.includes("text")) return undefined;
  const input: ("text" | "image")[] = ["text"];
  if (modalities.includes("image")) input.push("image");
  return {
    type: "chat",
    id: entry.id,
    name: entry.id,
    api,
    baseUrl: api === "anthropic-messages" ? "https://apis.opengateway.ai" : BASE_URL,
    input,
    reasoning: entry.id === "openai/o4-mini",
    cost: { input: prompt, output: completion, cacheRead: price(entry.pricing?.input_cache_read) ?? prompt, cacheWrite: prompt },
    contextWindow,
    maxTokens: Math.min(contextWindow, 8_192),
  };
}

function cachedModels(stored: { models: readonly unknown[] } | undefined): ProviderModelConfig[] {
  return (stored?.models ?? []).filter((model): model is ProviderModelConfig & { provider?: string; type?: string } =>
    !!model && typeof model === "object" && (model as { provider?: unknown }).provider === PROVIDER && (model as { type?: unknown }).type === "chat");
}

async function fetchModels(signal: AbortSignal, hasCachedModels: boolean): Promise<ProviderModelConfig[]> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const requestSignal = AbortSignal.any([signal, timeout]);
  let response: Response;
  try {
    response = await fetch(CATALOG_URL, { signal: requestSignal, headers: { Accept: "application/json" } });
  } catch (error) {
    if (signal.aborted || hasCachedModels) throw error;
    return fallbackModels;
  }
  if (!response.ok) {
    const error = new Error(`OpenGateway model catalog returned HTTP ${response.status}`);
    const temporarilyUnavailable = response.status === 429 || response.status >= 500;
    if (hasCachedModels || !temporarilyUnavailable) throw error;
    return fallbackModels;
  }
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new Error("OpenGateway model catalog response was invalid");
  }
  const models = ((payload as { data: unknown[] }).data)
    .map(catalogModel)
    .filter((model): model is ProviderModelConfig => model !== undefined);
  if (!models.length) throw new Error("OpenGateway model catalog contained no usable text chat models");
  return models;
}

export default function (pi: ExtensionAPI): void {
  // SDK refresh recomposes this seed before checking cancellation. Keep its
  // projection aligned with the native store, without sharing mutable seeds.
  const seedModels = [...fallbackModels];
  const updateSeedModels = (models: readonly ProviderModelConfig[]): void => {
    seedModels.splice(0, seedModels.length, ...models);
  };
  pi.registerProvider(PROVIDER, {
    name: "OpenGateway",
    baseUrl: BASE_URL,
    authHeader: true,
    models: seedModels,
    refreshModels: async (context) => {
      const stored = cachedModels(context.stored);
      if (!context.allowNetwork || context.signal.aborted) {
        if (stored.length) updateSeedModels(stored);
        return stored.length ? stored : fallbackModels;
      }
      const models = await fetchModels(context.signal, stored.length > 0);
      await context.publish({
        persist: {
          models: models.map((model) => ({ ...model, provider: PROVIDER })),
          checkedAt: Date.now(),
        },
      });
      updateSeedModels(models);
      return models;
    },
  });
}

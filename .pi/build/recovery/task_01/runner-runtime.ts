import { randomUUID } from "node:crypto";
import {
  LUNA_MODEL,
  LUNA_PROVIDER,
  type LunaModel,
  type RoleRegistry,
  type RunnerRuntime,
} from "../workers/runner.ts";

const MAX_WORKER_TOKENS = 16_384;

type WorkerMessage = { role: string; content: unknown; timestamp?: number };
type WorkerContext = { systemPrompt?: string; messages: WorkerMessage[]; tools?: unknown[] };
type CompleteOptions = {
  apiKey?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  maxTokens: number;
  signal: AbortSignal;
  cacheRetention: "none";
  sessionId: string;
};
export type CompleteInvoker = (model: LunaModel, context: WorkerContext, options: CompleteOptions) => Promise<unknown>;
export type PiModelRegistry = {
  find: NonNullable<RoleRegistry["find"]>;
  getApiKeyAndHeaders: NonNullable<RoleRegistry["getApiKeyAndHeaders"]>;
};

async function defaultComplete(model: LunaModel, context: WorkerContext, options: CompleteOptions): Promise<unknown> {
  const { complete } = await import("@earendil-works/pi-ai/compat");
  return complete(model as never, context as never, options as never);
}

function isRegistry(value: unknown): value is PiModelRegistry {
  return value !== null && typeof value === "object"
    && typeof (value as PiModelRegistry).find === "function"
    && typeof (value as PiModelRegistry).getApiKeyAndHeaders === "function";
}
function boundedMaxTokens(value: unknown): number {
  const maximum = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : MAX_WORKER_TOKENS;
  return Math.max(1, Math.min(maximum, MAX_WORKER_TOKENS));
}
function textualContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const content = (value as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type?: unknown; text?: unknown } => part !== null && typeof part === "object")
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n");
}

/**
 * Adapt the current Pi model registry to the worker runner without touching
 * the visible session model or entering the visible agent loop.
 */
export function createPiRunnerRuntime(value: unknown, invoke: CompleteInvoker = defaultComplete): RunnerRuntime | undefined {
  if (!isRegistry(value)) return undefined;
  const registry = value;
  const modelRegistry: RoleRegistry = {
    find: registry.find.bind(registry),
    getApiKeyAndHeaders: registry.getApiKeyAndHeaders.bind(registry),
  };
  return {
    modelRegistry,
    agentLoop: async (prompts, context, config, signal) => {
      const model = registry.find(LUNA_PROVIDER, LUNA_MODEL);
      if (!model) throw new Error("worker Luna model is unavailable");
      const response = await invoke(model, {
        systemPrompt: typeof context.systemPrompt === "string" ? context.systemPrompt : undefined,
        messages: prompts as WorkerMessage[],
      }, {
        apiKey: typeof config.apiKey === "string" ? config.apiKey : undefined,
        headers: config.headers as Record<string, string> | undefined,
        env: config.env as Record<string, string> | undefined,
        maxTokens: boundedMaxTokens(config.maxTokens),
        signal,
        cacheRetention: "none",
        sessionId: randomUUID(),
      });
      return textualContent(response);
    },
  };
}

export const createRunnerRuntime = createPiRunnerRuntime;

import { scrubSensitiveText } from "../common/safety.ts";
import type { PlasticMemoryRole, RoleConfig } from "../config.ts";

export const LUNA_PROVIDER = "openai-codex" as const;
export const LUNA_MODEL = "gpt-5.6-luna" as const;
export const LUNA_MODEL_REF = `${LUNA_PROVIDER}/${LUNA_MODEL}` as const;
export const LUNA_ROLE_CONFIG: RoleConfig = Object.freeze({
  model: LUNA_MODEL_REF,
  thinking: "medium",
  maxTurns: 8,
  maxToolCalls: 4,
  maxRuntimeMs: 60_000,
});
export const ROLE_CONFIGS: Readonly<Record<PlasticMemoryRole, RoleConfig>> = Object.freeze({
  observer: { ...LUNA_ROLE_CONFIG },
  reflector: { ...LUNA_ROLE_CONFIG },
  compactor: { ...LUNA_ROLE_CONFIG },
  "project-promoter": { ...LUNA_ROLE_CONFIG },
});

export type LunaModel = { provider?: string; id?: string; contextWindow?: number; maxTokens?: number; [key: string]: unknown };
export type RoleAuth = { apiKey?: string; headers?: Record<string, string>; env?: Record<string, string>; [key: string]: unknown };
export type RoleRegistry = {
  find?: (provider: string, model: string) => LunaModel | undefined;
  getModel?: (provider: string, model: string) => LunaModel | undefined;
  getProviderAuth?: (provider: string) => Promise<RoleAuth | undefined> | RoleAuth | undefined;
  getApiKeyAndHeaders?: (model: LunaModel) => Promise<{ ok: true; apiKey?: string; headers?: Record<string, string>; env?: Record<string, string> } | { ok: false; error: string }>;
};
export type AgentLoop = (prompts: unknown[], context: Record<string, unknown>, config: Record<string, unknown>, signal: AbortSignal) => unknown;
export type RunnerRuntime = {
  modelRegistry: RoleRegistry;
  agentLoop: AgentLoop;
  auth?: (provider: string, model: LunaModel) => Promise<RoleAuth | undefined> | RoleAuth | undefined;
};
export type ResolvedRole = {
  role: PlasticMemoryRole;
  config: RoleConfig;
  model: LunaModel;
  auth: RoleAuth;
  contextWindow: number;
};
export type RunnerSuccess = { ok: true; response: unknown; resolved: ResolvedRole; diagnostics: { role: PlasticMemoryRole; contextWindow: number; promptChars: number } };
export type RunnerFailure = { ok: false; reason: "model-unavailable" | "auth-unavailable" | "invalid-model" | "timeout" | "aborted" | "agent-error" | "oversized"; diagnostics: { role: PlasticMemoryRole; message: string } };
export type RunnerResult = RunnerSuccess | RunnerFailure;

const ROLE_PROMPT_CAP = 600_000;
const ROLE_RESULT_CAP = 200_000;
const CONTEXT_OVERHEAD_TOKENS = 4_096;

function boundedText(value: unknown, maximum: number): string {
  const source = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  return scrubSensitiveText(source).replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, maximum);
}
/**
 * Transport normalization for structured worker payloads: strip control characters, but never
 * scrub or truncate. Identity fields (snapshot/cycle/session/branch ids, digests, ISO timestamps)
 * must survive transport untouched, otherwise the coverage manifest can never match. Free-text
 * fields are scrubbed by their own adapters (observer/reflector/promoter clean(), compaction/render
 * clean() + assertNoSensitiveText, coordinator safeNoticeReason) before anything is persisted.
 */
function normalizedTransport(value: unknown): string {
  const source = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  return source.replace(/[\u0000-\u001f\u007f]/gu, " ");
}
function boundedTransport(value: unknown, maximum: number): string {
  return normalizedTransport(value).slice(0, maximum);
}
type PreparedRolePrompt = Readonly<{ ok: true; prompt: string }> | Readonly<{ ok: false }>;
export function prepareRolePrompt(value: string): PreparedRolePrompt {
  const prompt = normalizedTransport(value);
  return prompt.length <= ROLE_PROMPT_CAP ? { ok: true, prompt } : { ok: false };
}
function safeDiagnostic(error: unknown): string {
  return boundedText(error instanceof Error ? error.message : String(error), 500) || "agent error";
}
function modelFor(registry: RoleRegistry, role: PlasticMemoryRole): LunaModel | undefined {
  const config = ROLE_CONFIGS[role];
  return registry.find?.(LUNA_PROVIDER, LUNA_MODEL) ?? registry.getModel?.(LUNA_PROVIDER, LUNA_MODEL);
}
function normalizeAuth(value: unknown): RoleAuth | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  if (source.auth && typeof source.auth === "object") return source.auth as RoleAuth;
  return source as RoleAuth;
}
async function authFor(runtime: RunnerRuntime, model: LunaModel): Promise<RoleAuth | undefined> {
  if (runtime.auth) return normalizeAuth(await runtime.auth(LUNA_PROVIDER, model));
  if (runtime.modelRegistry.getProviderAuth) {
    const result = await runtime.modelRegistry.getProviderAuth(LUNA_PROVIDER);
    return normalizeAuth(result);
  }
  if (runtime.modelRegistry.getApiKeyAndHeaders) {
    const result = await runtime.modelRegistry.getApiKeyAndHeaders(model);
    return result.ok ? { apiKey: result.apiKey, headers: result.headers, env: result.env } : undefined;
  }
  return undefined;
}
function extractResponse(value: unknown): unknown {
  if (value && typeof value === "object" && "response" in value) return (value as { response: unknown }).response;
  return value;
}
async function consumeLoop(value: unknown): Promise<unknown> {
  const awaited = await value;
  if (awaited && typeof awaited === "object" && Symbol.asyncIterator in awaited) {
    const stream = awaited as AsyncIterable<unknown> & { result?: () => Promise<unknown> };
    for await (const _event of stream) { /* Drain tool/model events; results are returned below. */ }
    return stream.result ? await stream.result() : undefined;
  }
  if (awaited && typeof awaited === "object" && typeof (awaited as { result?: unknown }).result === "function") {
    return await (awaited as { result: () => Promise<unknown> }).result();
  }
  return awaited;
}
function combineSignals(parent: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; abort: (reason?: unknown) => void; dispose: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(parent?.reason);
  if (parent?.aborted) onAbort();
  else parent?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(new Error("worker timeout")); }, timeoutMs);
  return {
    signal: controller.signal,
    abort: (reason?: unknown) => controller.abort(reason),
    dispose: () => { clearTimeout(timer); parent?.removeEventListener("abort", onAbort); },
    timedOut: () => timedOut,
  };
}
function validateModel(model: LunaModel | undefined): model is LunaModel & { contextWindow: number } {
  return Boolean(model && (model.provider === undefined || model.provider === LUNA_PROVIDER)
    && (model.id === undefined || model.id === LUNA_MODEL)
    && typeof model.contextWindow === "number" && Number.isFinite(model.contextWindow) && model.contextWindow > CONTEXT_OVERHEAD_TOKENS);
}

/** Resolve a worker model without consulting the visible model or mutating Pi session state. */
export async function resolveLunaRole(role: PlasticMemoryRole, runtime: RunnerRuntime): Promise<ResolvedRole | RunnerFailure> {
  try {
    const model = modelFor(runtime.modelRegistry, role);
    if (!model) return { ok: false, reason: "model-unavailable", diagnostics: { role, message: LUNA_MODEL_REF } };
    if (!validateModel(model)) return { ok: false, reason: "invalid-model", diagnostics: { role, message: "resolved Luna model has no usable contextWindow" } };
    const auth = await authFor(runtime, model);
    if (!auth) return { ok: false, reason: "auth-unavailable", diagnostics: { role, message: LUNA_PROVIDER } };
    return { role, config: { ...ROLE_CONFIGS[role] }, model, auth, contextWindow: model.contextWindow };
  } catch (error) {
    return { ok: false, reason: "auth-unavailable", diagnostics: { role, message: safeDiagnostic(error) } };
  }
}

/** Execute one role through the injected Pi-shaped loop with a hard abortable deadline. */
export async function runBoundedRole(input: {
  role: PlasticMemoryRole;
  prompt: string;
  systemPrompt?: string;
  runtime: RunnerRuntime;
  signal?: AbortSignal;
  inputTokens?: number;
}): Promise<RunnerResult> {
  const resolved = await resolveLunaRole(input.role, input.runtime);
  if (!("contextWindow" in resolved)) return resolved;
  const preparedPrompt = prepareRolePrompt(input.prompt);
  if (!preparedPrompt.ok) {
    return { ok: false, reason: "oversized", diagnostics: { role: input.role, message: "structured worker prompt exceeds transport cap" } };
  }
  const prompt = preparedPrompt.prompt;
  const inputTokens = input.inputTokens ?? Math.ceil(prompt.length / 4);
  if (inputTokens + CONTEXT_OVERHEAD_TOKENS > resolved.contextWindow) {
    return { ok: false, reason: "oversized", diagnostics: { role: input.role, message: `input exceeds contextWindow ${resolved.contextWindow}` } };
  }
  const combined = combineSignals(input.signal, resolved.config.maxRuntimeMs);
  try {
    if (combined.signal.aborted) return { ok: false, reason: "aborted", diagnostics: { role: input.role, message: "aborted before agent loop" } };
    const context = {
      systemPrompt: boundedText(input.systemPrompt ?? "Return only the requested structured result.", 16_000),
      messages: [],
      tools: [],
      role: input.role,
      contextWindow: resolved.contextWindow,
    };
    const config = {
      model: resolved.model,
      apiKey: resolved.auth.apiKey,
      headers: resolved.auth.headers,
      env: resolved.auth.env,
      maxTurns: resolved.config.maxTurns,
      maxToolCalls: resolved.config.maxToolCalls,
      maxTokens: Math.min(resolved.model.maxTokens ?? 16_384, 16_384),
      thinking: resolved.config.thinking,
      reasoning: resolved.config.thinking,
      contextWindow: resolved.contextWindow,
      toolExecution: "sequential",
    };
    const rawPromise = consumeLoop(input.runtime.agentLoop(
      [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
      context,
      config,
      combined.signal,
    ));
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      deadlineTimer = setTimeout(() => { combined.abort(new Error("worker timeout")); reject(new Error("__worker_timeout__")); }, resolved.config.maxRuntimeMs);
    });
    let raw: unknown;
    try { raw = await Promise.race([rawPromise, deadline]); }
    finally { if (deadlineTimer) clearTimeout(deadlineTimer); }
    if (combined.signal.aborted) {
      return { ok: false, reason: combined.timedOut() ? "timeout" : "aborted", diagnostics: { role: input.role, message: combined.timedOut() ? "worker deadline exceeded" : "worker aborted" } };
    }
    const transported = boundedTransport(extractResponse(raw), ROLE_RESULT_CAP);
    let parsed: unknown;
    // Prose that is not structured transport keeps the pre-parse scrubbing of the fallback path.
    try { parsed = JSON.parse(transported); } catch { parsed = boundedText(extractResponse(raw), ROLE_RESULT_CAP); }
    return { ok: true, response: parsed, resolved, diagnostics: { role: input.role, contextWindow: resolved.contextWindow, promptChars: prompt.length } };
  } catch (error) {
    const timeout = combined.timedOut() || error instanceof Error && error.message === "__worker_timeout__";
    return { ok: false, reason: timeout ? "timeout" : combined.signal.aborted ? "aborted" : "agent-error", diagnostics: { role: input.role, message: timeout ? "worker deadline exceeded" : safeDiagnostic(error) } };
  } finally {
    combined.dispose();
  }
}

export const runWorkerAgent = runBoundedRole;
export const resolveRole = resolveLunaRole;
export const runRole = runBoundedRole;

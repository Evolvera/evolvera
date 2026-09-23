import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Maestro: before each user prompt, picks the main session's model tier and
 * reasoning effort for that whole turn.
 *
 * - A pure continuation ("continua", "ok pode fazer") keeps the current pair.
 * - Otherwise one Jev (TypeSafe AI) `choice` call classifies the message and
 *   the highest-probability tier wins. Effort follows the tier: Luna and Sol
 *   start at medium, Opus at high. Measured on 217 labeled prompts (80 of them
 *   unseen when the question was written): 99% model accuracy on the unseen
 *   set, 1 under-powered pick, 0 over-powered. Per-class biases and a doubt
 *   threshold were tried and generalized worse, so plain argmax is used.
 * - A frustrated/cursing user (same request, noul >= 0.9) gets Astra 6 high.
 * - Only the first 480 chars of the message are sent (<= ~128 state tokens).
 * - Transient failures (network/timeout, 429, 5xx) are retried up to 3 times
 *   within 6 s; after that, or on any other failure, model/effort stay as they are.
 * - Subagents keep their frontmatter routes (pi-subagents gives frontmatter
 *   precedence over caller parameters), so only the main session is routed.
 * - Within a run, effort adapts per step without API calls: tool errors or a
 *   repeated identical tool call raise it one level; three clean steps lower
 *   it one level, never below one level under the prompt's base. The model
 *   never changes mid-run. At agent_end the base is restored, because
 *   setThinkingLevel also persists defaultThinkingLevel.
 * - Key: JEV_API_KEY / TYPESAFE_API_KEY, else ~/.config/jev/api_key (installed
 *   by install.sh / install.ps1, mode 600). Never logged.
 */

export const MAESTRO_ENTRY_TYPE = "maestro";
const ENDPOINT = process.env.JEV_BASE_URL
  ? `${process.env.JEV_BASE_URL.replace(/\/$/, "")}/systemone`
  : "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = process.env.JEV_MODEL ?? "jev-latest";
const TIMEOUT_MS = 2_500;
export const STATE_MAX_CHARS = 480;

export type RetryPolicy = { retries: number; backoffMs: number[]; deadlineMs: number };
export const RETRY: RetryPolicy = { retries: 3, backoffMs: [200, 400, 800], deadlineMs: 6_000 };
export function isRetryable(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

export const KEY_FILE = join(homedir(), ".config", "jev", "api_key");
export function readApiKey(file = KEY_FILE): string | undefined {
  const fromEnv = (process.env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY)?.trim();
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(file, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

export const MODEL_TARGETS = {
  luna: { provider: "openai-codex", id: "gpt-6-luna", label: "Luna 6" },
  sol: { provider: "openai-codex", id: "gpt-6-sol", label: "Sol 6" },
  opus: { provider: "anthropic", id: "claude-opus-5-5", label: "Opus 5.5" },
  astra: { provider: "openai-codex", id: "gpt-6-astra", label: "Astra 6" },
} as const;
export type ModelChoice = keyof typeof MODEL_TARGETS;
/** Tiers the route question chooses between; astra is reached only through frustration. */
export const TIERS = ["luna", "sol", "opus"] as const;
export const EFFORTS = ["low", "medium", "high", "xhigh"] as const;
export type EffortChoice = (typeof EFFORTS)[number];
export const EFFORT_FOR: Record<ModelChoice, EffortChoice> = { luna: "medium", sol: "medium", opus: "high", astra: "high" };

/**
 * A frustrated/angry user gets Astra 6 high regardless of task tier. Asked in
 * the same Jev request as the route question. On the 230-message benchmark,
 * >= 0.9 caught all 9 cursing/insulting/sarcastic messages with no false
 * positive; 0.84-0.89 held urgent or stressed but not hostile messages.
 */
export const FRUSTRATION_QUESTION = {
  type: "noul",
  instructions: "The user is frustrated, angry or annoyed with the assistant or the situation (cursing, insults, sarcasm, complaining that something broke again, shouting).",
};
export const FRUSTRATION_THRESHOLD = 0.9;

export const ROUTE_QUESTION = {
  type: "choice",
  instructions: "A developer sent this message to a coding assistant. Pick the model tier for the hardest task it actually asks for; ignore tone, context and words used in another sense.",
  criteria: {
    luna: "Mechanical or quick: run/commit/revert/rename/bump, small config, text or style edit, a quick factual question, a status check.",
    sol: "Normal implementation with a known approach: add a feature, field, validation or endpoint, write tests, refactor, fix an error whose cause is visible in the message.",
    opus: "Needs judgment: find an unknown cause (outage, slowness, intermittent or prod-only failure), architecture, UX or visual design, prose for people (emails, copy, articles), explaining a system, recommending between options, reviewing for subtle bugs, rewriting prompts.",
  },
};

export function cutState(text: string, maxChars = STATE_MAX_CHARS): string {
  return Array.from(text.replace(/\s+/g, " ").trim()).slice(0, maxChars).join("");
}

/** Highest-probability tier; falls back to `choice` when probabilities are absent. */
export function pickTier(answer: { choice?: unknown; probabilities?: Record<string, unknown> } | undefined): ModelChoice | undefined {
  const probs = answer?.probabilities;
  if (probs) {
    let best: ModelChoice | undefined;
    for (const tier of TIERS) {
      const p = probs[tier];
      if (typeof p === "number" && (best === undefined || p > (probs[best] as number))) best = tier;
    }
    if (best) return best;
  }
  return typeof answer?.choice === "string" && (TIERS as readonly string[]).includes(answer.choice) ? (answer.choice as ModelChoice) : undefined;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** One Jev call with bounded retries; undefined on any non-recoverable failure. */
export async function classify(prompt: string, apiKey: string, fetchImpl: FetchLike = fetch, retry: RetryPolicy = RETRY): Promise<ModelChoice | undefined> {
  const deadline = Date.now() + retry.deadlineMs;
  let retriesLeft = retry.retries;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return undefined;
    let status = 0;
    let response: Response | undefined;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ state: cutState(prompt), model: JEV_MODEL, questions: { q: ROUTE_QUESTION, f: FRUSTRATION_QUESTION } }),
        signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, remaining)),
      });
      status = response.status;
    } catch {
      status = 0;
    }
    if (response?.ok) {
      try {
        const body = (await response.json()) as {
          answers?: { q?: { choice?: unknown; probabilities?: Record<string, unknown> }; f?: { noul?: unknown } };
        };
        const frustration = body.answers?.f?.noul;
        if (typeof frustration === "number" && frustration >= FRUSTRATION_THRESHOLD) return "astra";
        return pickTier(body.answers?.q);
      } catch {
        return undefined;
      }
    }
    if (!isRetryable(status) || retriesLeft <= 0) return undefined;
    const delay = retry.backoffMs[retry.retries - retriesLeft] ?? retry.backoffMs.at(-1) ?? 0;
    retriesLeft -= 1;
    if (Date.now() + delay >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

// Order is priority. Patterns are general PT/EN intent classes over folded
// (lowercase, accent-free) text, not phrase lists.
/**
 * Pure continuation: a short message made only of go-ahead / retry words, with
 * no content word. "ok, agora faz o mesmo pro endpoint" has content, so it is
 * classified normally.
 */
const CONTINUATION_WORDS = new Set(("continua continue continuar segue seguir prossegue prossiga proceed ok okay blz beleza sim yes yep yeah sure " +
  "pode podes pf pfv por favor please pls manda ver vai ir bora go ahead keep going sounds good isso ai la faz fazer faca do it " +
  "tenta tentar try de novo again denovo entao entao melhora melhore ele ela isso mesmo certo perfeito show top valeu thanks").split(" "));
export function isContinuation(text: string): boolean {
  const words = fold(text).replace(/[^a-z0-9 ]/g, " ").split(" ").filter(Boolean);
  return words.length > 0 && words.length <= 6 && words.every((word) => CONTINUATION_WORDS.has(word));
}

export type AdaptState = { base: EffortChoice; current: EffortChoice; okStreak: number; seen: Set<string> };
export type StepSignal = { toolCalls: string[]; errored: boolean };
const CLEAN_STEPS_TO_LOWER = 3;

export function newAdaptState(base: EffortChoice): AdaptState {
  return { base, current: base, okStreak: 0, seen: new Set() };
}

/** Pure per-step rule. Steps with no tool call (final answer) change nothing. */
export function adaptEffort(state: AdaptState, step: StepSignal): EffortChoice {
  if (step.toolCalls.length === 0) return state.current;
  const repeated = step.toolCalls.some((sig) => state.seen.has(sig));
  for (const sig of step.toolCalls) state.seen.add(sig);
  const index = EFFORTS.indexOf(state.current);
  if (step.errored || repeated) {
    state.okStreak = 0;
    state.current = EFFORTS[Math.min(index + 1, EFFORTS.length - 1)];
    return state.current;
  }
  state.okStreak += 1;
  const floor = Math.max(EFFORTS.indexOf(state.base) - 1, 0);
  if (state.okStreak >= CLEAN_STEPS_TO_LOWER && index > floor) {
    state.okStreak = 0;
    state.current = EFFORTS[index - 1];
  }
  return state.current;
}

type TurnEndLike = {
  message?: { content?: Array<{ type?: string; name?: string; arguments?: unknown }> };
  toolResults?: Array<{ isError?: boolean }>;
};
export function stepSignal(event: TurnEndLike): StepSignal {
  const content = Array.isArray(event.message?.content) ? event.message!.content! : [];
  const toolCalls = content
    .filter((part) => part?.type === "toolCall")
    .map((part) => `${part.name}:${JSON.stringify(part.arguments ?? {})}`);
  return { toolCalls, errored: (event.toolResults ?? []).some((result) => result?.isError === true) };
}

function restoreEnabled(ctx: ExtensionContext): boolean {
  let enabled = false;
  try {
    for (const entry of ctx.sessionManager.getBranch() as Array<{ type?: string; customType?: string; data?: { enabled?: unknown } }>) {
      if (entry?.type === "custom" && entry.customType === MAESTRO_ENTRY_TYPE) enabled = entry.data?.enabled === true;
    }
  } catch {
    return false;
  }
  return enabled;
}

export default function maestro(pi: ExtensionAPI): void {
  let enabled = false;
  let adapt: AdaptState | undefined;
  const setStatus = (ctx: ExtensionContext, text: string | undefined) => ctx.ui.setStatus("maestro", text);

  pi.on("session_start", async (_event, ctx) => {
    enabled = restoreEnabled(ctx);
    setStatus(ctx, enabled ? "🎼 maestro" : undefined);
  });

  pi.registerCommand("maestro", {
    description: "Auto-escolhe modelo (Luna 6 / Sol 6 / Opus 5.5) e esforço por prompt via Jev: /maestro on|off|status",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (arg === "on" || arg === "off") {
        if (arg === "on" && !readApiKey()) {
          ctx.ui.notify("Maestro: defina JEV_API_KEY ou ~/.config/jev/api_key antes de ativar.", "error");
          return;
        }
        enabled = arg === "on";
        pi.appendEntry(MAESTRO_ENTRY_TYPE, { enabled });
        setStatus(ctx, enabled ? "🎼 maestro" : undefined);
      }
      ctx.ui.notify(`Maestro ${enabled ? "ativo" : "desligado"}.`, "info");
    },
  });

  pi.on("input", async (event, ctx) => {
    // Route only fresh interactive prompts; never switch mid-run (steer/follow-up) or on commands.
    if (!enabled || event.streamingBehavior || event.source === "extension" || event.text.trim().startsWith("/")) {
      return { action: "continue" };
    }
    if (!event.text.trim()) return { action: "continue" };

    // Pure continuation keeps the current model/effort; anything else is classified by Jev.
    if (isContinuation(event.text)) {
      const base = pi.getThinkingLevel();
      adapt = (EFFORTS as readonly string[]).includes(base) ? newAdaptState(base as EffortChoice) : undefined;
      setStatus(ctx, `🎼 ${ctx.model?.id ?? "?"} · ${base} (continua)`);
      return { action: "continue" };
    }
    const apiKey = readApiKey();
    if (!apiKey) return { action: "continue" };
    const modelChoice = await classify(event.text, apiKey);
    const effort = modelChoice ? EFFORT_FOR[modelChoice] : undefined;
    let label = "";
    if (modelChoice) {
      const target = MODEL_TARGETS[modelChoice];
      const model = ctx.modelRegistry.find(target.provider, target.id);
      if (model && (ctx.model?.provider !== model.provider || ctx.model?.id !== model.id)) {
        if (!(await pi.setModel(model))) {
          ctx.ui.notify(`Maestro: sem autenticação para ${target.label}; modelo mantido.`, "warning");
        }
      }
      label = target.label;
    }
    if (effort) pi.setThinkingLevel(effort);
    const base = pi.getThinkingLevel();
    adapt = (EFFORTS as readonly string[]).includes(base) ? newAdaptState(base as EffortChoice) : undefined;
    if (!modelChoice && !effort) {
      ctx.ui.notify("Maestro: Jev indisponível; modelo e esforço mantidos.", "warning");
      return { action: "continue" };
    }
    setStatus(ctx, `🎼 ${label || ctx.model?.id || "?"} · ${pi.getThinkingLevel()}`);
    return { action: "continue" };
  });

  pi.on("turn_end", async (event, ctx) => {
    if (!enabled || !adapt) return;
    const before = adapt.current;
    const next = adaptEffort(adapt, stepSignal(event as TurnEndLike));
    if (next !== before) {
      pi.setThinkingLevel(next);
      setStatus(ctx, `🎼 ${ctx.model?.id ?? "?"} · ${next} (${EFFORTS.indexOf(next) > EFFORTS.indexOf(before) ? "↑" : "↓"})`);
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!adapt) return;
    if (adapt.current !== adapt.base) pi.setThinkingLevel(adapt.base);
    if (enabled) setStatus(ctx, `🎼 ${ctx.model?.id ?? "?"} · ${adapt.base}`);
    adapt = undefined;
  });
}

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Maestro: before each user prompt, asks TypeDec two independent `choice`
 * questions (model tier, reasoning effort) and switches the main session to
 * the answer for that whole turn, including its tool/agent loop.
 *
 * Invariants:
 * - Every request carries exactly one question in `short` mode (ANE), whose
 *   hard limit is 96 tokens = question prefix + state + 1 separator, counted
 *   by the engine with the Laya tokenizer. Before sending, the prompt is cut
 *   locally to the exact remaining budget using the same tokenizer.json
 *   (@huggingface/tokenizers, vendored) after whitespace normalization, which
 *   matched laya_coreml exactly on 1,895 samples. If the tokenizer is not
 *   available, a proven upper bound (UTF-8 bytes + 1) is used instead, so a
 *   413 is not expected either way; one is still retried once at half budget.
 * - Failure never blocks the prompt: transient errors are retried up to 3
 *   times within a 6 s deadline, then the current model/effort stay unchanged.
 * - Subagents keep their frontmatter routes (pi-subagents gives frontmatter
 *   precedence over caller parameters), so only the main session is routed.
 * - Within a run, effort adapts per step without extra TypeDec calls: tool
 *   errors or a repeated identical tool call raise it one level; three clean
 *   steps in a row lower it one level, never below one level under the
 *   prompt's base. The model never changes mid-run. PI re-reads the thinking
 *   level before each step (prepareNextTurn), so a change applies to the next
 *   step. At agent_end the base is restored, because setThinkingLevel also
 *   persists defaultThinkingLevel and in-run swings must not leak there.
 * - The API key comes only from TYPEDEC_API_KEY and is never logged.
 */

export const MAESTRO_ENTRY_TYPE = "maestro";
const ENDPOINT = process.env.TYPEDEC_URL ?? "https://typedec.evolvera.com.br/v1/systemone";
const TIMEOUT_MS = 2_500;
/**
 * Transient failures (network/timeout, 429, 5xx) are retried up to 3 times
 * with backoff, but the whole question is bounded by deadlineMs because the
 * user's prompt waits on it. 400/401/403/422 are deterministic: never retried.
 * Retrying is safe: a choice inference has no side effect beyond usage.
 */
export type RetryPolicy = { retries: number; backoffMs: number[]; deadlineMs: number };
export const RETRY: RetryPolicy = { retries: 3, backoffMs: [200, 400, 800], deadlineMs: 6_000 };
export function isRetryable(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}
export const ANE_MAX_TOKENS = 96;

export const MODEL_TARGETS = {
  luna: { provider: "openai-codex", id: "gpt-6-luna", label: "Luna 6" },
  sol: { provider: "openai-codex", id: "gpt-6-sol", label: "Sol 6" },
  opus: { provider: "anthropic", id: "claude-opus-5-5", label: "Opus 5.5" },
} as const;
export type ModelChoice = keyof typeof MODEL_TARGETS;
export const EFFORTS = ["low", "medium", "high", "xhigh"] as const;
export type EffortChoice = (typeof EFFORTS)[number];

const MODEL_QUESTION = {
  type: "choice",
  instructions: "Complexidade da tarefa?",
  criteria: {
    luna: "Trivial: pergunta curta, commit, ajuste simples",
    sol: "Média: implementar ou revisar algo delimitado",
    opus: "Complexa: debug difícil, arquitetura, entender sistema",
  },
};
// Effort buys a longer chain of dependent inferences made without feedback;
// it does not replace missing information (tools) or mechanical work.
const EFFORT_QUESTION = {
  type: "choice",
  instructions: "Passos de raciocínio encadeados sem testar?",
  criteria: {
    low: "Nenhum: executar, commitar",
    medium: "Poucos: mudança delimitada",
    high: "Vários: bug, estado, lógica",
    xhigh: "Muitos: causa desconhecida, arquitetura",
  },
};

/**
 * Fixed engine cost per question (prefix + separator), measured with the
 * engine's own laya_coreml TokenCounter. Editing a question's text changes
 * these; the smoke test re-measures them whenever the engine venv exists.
 */
export const QUESTIONS = {
  model: { question: MODEL_QUESTION, fixedTokens: 50 },
  effort: { question: EFFORT_QUESTION, fixedTokens: 60 },
} as const;

// ---------------------------------------------------------------------------
// Exact token budgeting
// ---------------------------------------------------------------------------

export type TokenCounter = (text: string) => number;

/** Same normalization the engine applies to <mask>, plus whitespace collapse (keeps JS == Python counts). */
export function normalizeState(text: string): string {
  return text.replaceAll("<mask>", " ").replace(/\s+/g, " ").trim();
}

/** Upper bound for this byte-fallback BPE: every char is at most its UTF-8 bytes, plus the prepended ▁. */
export const boundCounter: TokenCounter = (text) => Buffer.byteLength(text, "utf8") + 1;

/** Longest head of the normalized prompt whose exact count fits the budget; never returns an over-budget string. */
export function fitState(text: string, budget: number, count: TokenCounter): string {
  const flat = normalizeState(text);
  if (budget <= 0) return "";
  if (count(flat) <= budget) return flat;
  const words = flat.split(" ");
  let lo = 0;
  let hi = words.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (count(words.slice(0, mid).join(" ")) <= budget) lo = mid;
    else hi = mid - 1;
  }
  let head = words.slice(0, lo).join(" ");
  if (lo === 0) {
    const chars = Array.from(flat);
    let a = 0;
    let b = chars.length;
    while (a < b) {
      const mid = Math.ceil((a + b) / 2);
      if (count(chars.slice(0, mid).join("")) <= budget) a = mid;
      else b = mid - 1;
    }
    head = chars.slice(0, a).join("");
  }
  // Counts need not be monotone in prefix length; only a verified string is returned.
  while (head && count(head) > budget) head = Array.from(head).slice(0, -1).join("").trimEnd();
  return head;
}

const TOKENIZER_REPO = "aac6fef/laya-multilingual-coreml-ane";
const TOKENIZER_REVISION = "39d6a9b3d0f67f06da74fbade6121ea134cbdb21";
const TOKENIZER_FILES = ["tokenizer.json", "tokenizer_config.json"] as const;

function tokenizerDirCandidates(): string[] {
  const hfHub = process.env.HF_HUB_CACHE ?? join(process.env.HF_HOME ?? join(homedir(), ".cache", "huggingface"), "hub");
  const snapshots = join(hfHub, `models--${TOKENIZER_REPO.replace("/", "--")}`, "snapshots");
  const pinned = join(snapshots, TOKENIZER_REVISION, "tokenizer");
  const others = existsSync(snapshots) ? readdirSync(snapshots).map((rev) => join(snapshots, rev, "tokenizer")) : [];
  return [process.env.MAESTRO_TOKENIZER_DIR, pinned, ...others, join(homedir(), ".cache", "maestro", TOKENIZER_REVISION)]
    .filter((dir): dir is string => Boolean(dir));
}

async function downloadTokenizer(dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true });
  for (const file of TOKENIZER_FILES) {
    const url = `https://huggingface.co/${TOKENIZER_REPO}/resolve/${TOKENIZER_REVISION}/tokenizer/${file}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`tokenizer download ${response.status}`);
    const temporary = join(dir, `${file}.part`);
    writeFileSync(temporary, Buffer.from(await response.arrayBuffer()));
    renameSync(temporary, join(dir, file));
  }
}

let exactCounter: Promise<TokenCounter | undefined> | undefined;

/** Lazily loads the exact Laya counter once (cache first, one pinned download otherwise). */
export function loadExactCounter(): Promise<TokenCounter | undefined> {
  exactCounter ??= (async () => {
    try {
      let dir = tokenizerDirCandidates().find((d) => TOKENIZER_FILES.every((f) => existsSync(join(d, f))));
      if (!dir) {
        dir = join(homedir(), ".cache", "maestro", TOKENIZER_REVISION);
        await downloadTokenizer(dir);
      }
      const { Tokenizer } = await import("./vendor/tokenizers.min.mjs");
      const tokenizer = new Tokenizer(
        JSON.parse(readFileSync(join(dir, "tokenizer.json"), "utf8")),
        JSON.parse(readFileSync(join(dir, "tokenizer_config.json"), "utf8")),
      );
      return (text: string) => tokenizer.encode(text, { add_special_tokens: false }).ids.length;
    } catch {
      exactCounter = undefined; // allow a later retry; the bound counter covers this prompt
      return undefined;
    }
  })();
  return exactCounter;
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

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** One single-question request; returns the chosen key or undefined. */
export async function askChoice(
  entry: { question: Record<string, unknown>; fixedTokens: number },
  prompt: string,
  allowed: readonly string[],
  apiKey: string,
  count: TokenCounter,
  fetchImpl: FetchLike = fetch,
  retry: RetryPolicy = RETRY,
): Promise<string | undefined> {
  const deadline = Date.now() + retry.deadlineMs;
  let stateBudget = ANE_MAX_TOKENS - entry.fixedTokens;
  let halved = false;
  let retriesLeft = retry.retries;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return undefined;
    let status: number;
    let response: Response | undefined;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          state: fitState(prompt, stateBudget, count),
          model: "laya-multilingual",
          mode: "short",
          questions: { q: entry.question },
        }),
        signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, remaining)),
      });
      status = response.status;
    } catch {
      status = 0; // network error or timeout
    }
    if (response?.ok) {
      const body = (await response.json()) as { answers?: { q?: { choice?: unknown } } };
      const choice = body.answers?.q?.choice;
      return typeof choice === "string" && allowed.includes(choice) ? choice : undefined;
    }
    if (status === 413 && !halved) {
      // Local count diverged from the engine (e.g. another tokenizer revision): shrink once, no backoff.
      halved = true;
      stateBudget = Math.floor(stateBudget / 2);
      continue;
    }
    if (!isRetryable(status) || retriesLeft <= 0) return undefined;
    const delay = retry.backoffMs[retry.retries - retriesLeft] ?? retry.backoffMs.at(-1) ?? 0;
    retriesLeft -= 1;
    if (Date.now() + delay >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/** Both questions in parallel, each cut to its own exact budget; a field is undefined when its call failed. */
export async function decide(prompt: string, apiKey: string, count: TokenCounter = boundCounter, fetchImpl: FetchLike = fetch) {
  const [model, effort] = await Promise.all([
    askChoice(QUESTIONS.model, prompt, Object.keys(MODEL_TARGETS), apiKey, count, fetchImpl).catch(() => undefined),
    askChoice(QUESTIONS.effort, prompt, EFFORTS, apiKey, count, fetchImpl).catch(() => undefined),
  ]);
  return { model: model as ModelChoice | undefined, effort: effort as EffortChoice | undefined };
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
  // Loaded in the background; until ready, the proven upper-bound counter is used (never blocks a prompt).
  let counter: TokenCounter | undefined;
  const warmCounter = () => void loadExactCounter().then((loaded) => { counter = loaded ?? counter; });
  const setStatus = (ctx: ExtensionContext, text: string | undefined) => ctx.ui.setStatus("maestro", text);

  pi.on("session_start", async (_event, ctx) => {
    enabled = restoreEnabled(ctx);
    if (enabled) warmCounter();
    setStatus(ctx, enabled ? "🎼 maestro" : undefined);
  });

  pi.registerCommand("maestro", {
    description: "Auto-escolhe modelo (Luna 6 / Sol 6 / Opus 5.5) e esforço por prompt via TypeDec: /maestro on|off|status",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (arg === "on" || arg === "off") {
        if (arg === "on" && !process.env.TYPEDEC_API_KEY) {
          ctx.ui.notify("Maestro: defina TYPEDEC_API_KEY no ambiente do PI antes de ativar.", "error");
          return;
        }
        enabled = arg === "on";
        if (enabled) warmCounter();
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
    const apiKey = process.env.TYPEDEC_API_KEY;
    if (!apiKey || !event.text.trim()) return { action: "continue" };

    const { model: modelChoice, effort } = await decide(event.text, apiKey, counter ?? boundCounter);
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
      ctx.ui.notify("Maestro: TypeDec indisponível; modelo e esforço mantidos.", "warning");
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

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Maestro: before each user prompt, picks the main session's model tier and
 * reasoning effort for that whole turn: a pure continuation keeps the current
 * pair; otherwise local intent rules decide; only unrecognized prompts go to
 * TypeDec (two independent `choice` questions, doubt -> Opus 5.5 / high).
 *
 * Invariants:
 * - Every request carries exactly one question in `short` mode (ANE), whose
 *   hard limit is 96 tokens = question prefix + state + 1 separator. No
 *   tokenizer is loaded (it cost ~430 MB RAM): the prompt is cut by a char
 *   limit per question (94 model / 82 effort), set from the Laya tokenizer so ~95% of real PT/EN/code
 *   text fits on the first try. On 413 the state is cut 25% and resent (up to
 *   4 times, not counted as retries).
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
 * - The API key comes from TYPEDEC_API_KEY, else ~/.config/typedec/api_key
 *   (outside any repo, mode 600). It is never logged.
 */

export const MAESTRO_ENTRY_TYPE = "maestro";
export const KEY_FILE = join(homedir(), ".config", "typedec", "api_key");
export function readApiKey(file = KEY_FILE): string | undefined {
  const fromEnv = process.env.TYPEDEC_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(file, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}
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
    opus: "Complexa: debug difícil, arquitetura, design, escrita",
    duvida: "Incerto: não dá para saber",
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
    duvida: "Incerto",
  },
};

/**
 * Char limits per question. Fixed engine cost is 50 (model) and 60 (effort)
 * tokens, leaving 46 and 36 for the state; on real text those fit >=135 and
 * >=104 chars in 95% of samples (measured with laya_coreml). The smoke test
 * re-measures the fixed costs when the engine venv exists.
 */
export const QUESTIONS = {
  model: { question: MODEL_QUESTION, maxChars: 94, fixedTokens: 63 },
  effort: { question: EFFORT_QUESTION, maxChars: 82, fixedTokens: 67 },
} as const;

/**
 * Doubt resolves upward: an explicit `duvida` answer, or a winning probability
 * below the threshold, picks Opus 5.5 / high. Thresholds are uncalibrated
 * starting points (confidence = top probability; 3-4 real options).
 */
export const DOUBT = { model: "opus", effort: "high", minConfidence: { model: 0.5, effort: 0.4 } } as const;
export const SHRINK_ON_413 = 0.75;
export const MAX_SHRINKS = 4;

/** Collapse whitespace (the engine also blanks <mask>) and keep the head within maxChars, at a word boundary when possible. */
export function cutState(text: string, maxChars: number): string {
  const flat = text.replaceAll("<mask>", " ").replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  if (chars.length <= maxChars) return flat;
  const head = chars.slice(0, Math.max(0, maxChars)).join("");
  const space = head.lastIndexOf(" ");
  return space > head.length * 0.6 ? head.slice(0, space) : head;
}

// ---------------------------------------------------------------------------
// Local intent rules (first pass)
// ---------------------------------------------------------------------------
// Measured on 46 labeled prompts, Laya alone reached only 40-55% on the
// 3-way model choice (7/18 on a held-out set): it reacts to words, not task
// complexity. So explicit intent is routed locally (free, deterministic) and
// TypeDec only decides what no rule recognizes.

export type Route = { model: ModelChoice; effort: EffortChoice; rule: string };

export function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

// Order is priority. Patterns are general PT/EN intent classes over folded
// (lowercase, accent-free) text, not phrase lists.
const W = (words: string) => new RegExp(`\\b(${words})`);
const CONFIG_FILE = "gitignore|\\.env|config|nvmrc|package\\.json|docker-?compose|\\.ya?ml|tsconfig|eslint|prettier|dockerfile|makefile|readme";
const RULES: Array<{ rule: string; model: ModelChoice; effort: EffortChoice; re: RegExp; short?: boolean }> = [
  // Explicitly trivial, whatever the length ("e so tirar o import", "quick one", "just bump").
  { rule: "trivial", model: "luna", effort: "low", re: W("(e|eh) so (o|a|um|uma|tirar|trocar|mudar|corrigir|remover|apagar)|so (isso|tira|troca|muda|corrige|remove|apaga)\\b|so corrigir|quick one|just (bump|change|rename|remove|fix the typo|update)|typo|erro de digitacao|rapidinho") },
  // Asking for a review is a review, even when it names a bug class.
  { rule: "review", model: "opus", effort: "high", re: W("revis(a|e|ar) .*(pr|codigo|code|bug|seguranc|concorr|race|lock|problema)|review (this|the|my|our)? ?(pr|code|diff)|code review|audit") },
  // Unknown cause: something is wrong and the reason is not known.
  { rule: "debug", model: "opus", effort: "xhigh", re: new RegExp([
    "\\b(investig|descobr|depur|debug|diagnostic|root cause|causa raiz|vazamento|leak|race condition|deadlock|flaky|intermitent)",
    "\\b(travand|trava |crash|estour|quebrou|quebrad|parou de|nao funciona|not working|doesn t work|is failing|keeps failing|is broken|do nada|out of nowhere)",
    "\\b(fic|fik)\\w* lent|got slow|became slow|is slow now",
    "\\b(por que|pq|porque|why)\\b.*\\b(falh|erro|error|quebr|trav|lent|slow|demor|take|fail|crash|nao|retorn|fica|acontec|pendent|duplic|twice|duas vezes|as vezes|sometimes|sum|stale)",
    "\\bo que (esta|ta) acontecendo|what s going on|figure out why|\\b(acha|encontra|find) (o|a|the) (bug|vazamento|leak|problema|erro|causa)",
  ].join("|")) },
  { rule: "architecture", model: "opus", effort: "xhigh", re: W("arquitetur|architect|system design|escalabil|scalab|multi-?tenan|downtime|sem parar|\\bplan (the|a|our) |migration plan|plano de migracao|estrategia de (migracao|deploy|cache|dados)|planej|projet(a|ar) (o|a|um|uma) (sistema|arquitetura|estrutura|modelo de dados|schema)") },
  { rule: "compare", model: "opus", effort: "high", re: W("compar|versus|\\bvs\\b|recomend|recommend|vale a pena|trade-?off|pros e contras|pros and cons|qual (faz mais sentido|e melhor|vc usaria)|which (one )?(should|would)|como (vc|voce) (faria|estruturaria|organizaria|modelaria)|how would you") },
  // Writing needs a writing verb or an unambiguous prose noun ("email" alone may be a feature).
  { rule: "writing", model: "opus", effort: "medium", re: W("(escrev|redig|write|draft|compose|rascunh)\\w* (o |a |um |uma |the |an |a |our )?(texto|copy|artigo|article|post|email|e-mail|mensagem|message|carta|letter|proposta|proposal|pitch|descricao|description|documentacao|docs|bio|roteiro|anuncio|newsletter|landing)|artigo|newsletter|blog|pitch|copywrit|roteiro|apresentacao|presentation|anuncio") },
  { rule: "understand", model: "opus", effort: "high", re: W("entend|explic|explain|how does|how .* works|como funciona|como (isso|ele|ela|o|a) funcion|tem como|da pra fazer|e possivel|is it possible|system prompt|reescrev\\w* o prompt") },
  { rule: "design", model: "opus", effort: "high", re: W("design|desenh|redesenh|layout|identidade visual|visual identity|branding|landing|wireframe|prototip|mockup|\\bux\\b|\\bui\\b|paleta|tipografia|typography") },
  { rule: "refactor", model: "sol", effort: "high", re: W("refator|refactor|reestrutur|reorganiz|desacopl|decouple|modulariz") },
  // Mechanical actions: leading verb (after optional filler) on a short message, or a one-line config edit.
  { rule: "chore", model: "luna", effort: "low", short: true, re: new RegExp([
    "^(git |faz o |faz |faca o |da um |pode |vc pode |please |pls |can you |could you )?(commit|push|pull|merge|roda|rode|run|executa|execute|lista|list|mostra|show me|instala|install|troca|renomei|rename|sobe|bump|atualiza|update|muda|deleta|delete|remove|apaga|formata|format|deploya|abre|open|checa|check|verifica|cade|where is|gera o changelog|limpa|clean|status)\\b(?!,)",
    `\\b(adiciona|add|coloca|poe|troca|muda|remove|tira)\\b.*\\b(no|na|in|to|from|do|da) (o |a |the )?(${CONFIG_FILE})`,
  ].join("|")) },
  { rule: "build", model: "sol", effort: "medium", re: W("implement|adicion|adicione|\\badd\\b|cri(a|e|ar) (um|uma|o|a|os|as)|create|build (a|an|the)|construi|gera(r)? (um|uma)|escrev\\w* (os )?test|write (the )?tests|tests? (de|para|for)|convert|migr|integr|corrig|conserta|\\bfix\\b|faz (a|o) .* funcionar|make .* work|suporte a|support for|automatiz|retry|endpoint|validac|paginac|webhook|script|job|(vc|voce) (consegue|pode) (fazer|criar|implementar|montar)|can you (make|build|implement|set up)|faz (o|a|um|uma) (upload|login|tela|pagina|endpoint|integracao|feature|funcionalidade)") },
  { rule: "question", model: "luna", effort: "low", short: true, re: /^(e |and )?(qual|quais|quanto|quantos|quantas|onde|o que|oque|quando|existe|tem |what|which|where|when|is there|does|do |can )|\?$/ },
];
const SHORT_WORDS = 14;

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

export function ruleRoute(text: string): Route | undefined {
  const t = fold(text);
  const short = t.split(" ").length <= SHORT_WORDS;
  for (const r of RULES) {
    if (r.short && !short) continue;
    if (r.re.test(t)) return { model: r.model, effort: r.effort, rule: r.rule };
  }
  return undefined;
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
  entry: { question: Record<string, unknown>; maxChars: number },
  prompt: string,
  allowed: readonly string[],
  apiKey: string,
  fetchImpl: FetchLike = fetch,
  retry: RetryPolicy = RETRY,
  minConfidence = 0,
): Promise<string | undefined> {
  const deadline = Date.now() + retry.deadlineMs;
  let maxChars = entry.maxChars;
  let shrinks = 0;
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
          state: cutState(prompt, maxChars),
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
      const body = (await response.json()) as { answers?: { q?: { choice?: unknown; confidence?: unknown } } };
      const choice = body.answers?.q?.choice;
      if (typeof choice !== "string" || !allowed.includes(choice)) return undefined;
      const confidence = body.answers?.q?.confidence;
      if (choice === "duvida" || (typeof confidence === "number" && confidence < minConfidence)) return "duvida";
      return choice;
    }
    if (status === 413 && shrinks < MAX_SHRINKS) {
      // Dense text (code, emoji, other scripts) exceeded 96 tokens: cut 25% and resend, no backoff.
      shrinks += 1;
      maxChars = Math.floor(maxChars * SHRINK_ON_413);
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
export async function decide(prompt: string, apiKey: string, fetchImpl: FetchLike = fetch) {
  const [model, effort] = await Promise.all([
    askChoice(QUESTIONS.model, prompt, [...Object.keys(MODEL_TARGETS), "duvida"], apiKey, fetchImpl, RETRY, DOUBT.minConfidence.model).catch(() => undefined),
    askChoice(QUESTIONS.effort, prompt, [...EFFORTS, "duvida"], apiKey, fetchImpl, RETRY, DOUBT.minConfidence.effort).catch(() => undefined),
  ]);
  return {
    model: (model === "duvida" ? DOUBT.model : model) as ModelChoice | undefined,
    effort: (effort === "duvida" ? DOUBT.effort : effort) as EffortChoice | undefined,
  };
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
    description: "Auto-escolhe modelo (Luna 6 / Sol 6 / Opus 5.5) e esforço por prompt via TypeDec: /maestro on|off|status",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (arg === "on" || arg === "off") {
        if (arg === "on" && !readApiKey()) {
          ctx.ui.notify("Maestro: defina TYPEDEC_API_KEY ou ~/.config/typedec/api_key antes de ativar.", "error");
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

    // 1. Continuation keeps the current model/effort. 2. Local intent rules. 3. TypeDec (doubt -> Opus/high).
    if (isContinuation(event.text)) {
      const base = pi.getThinkingLevel();
      adapt = (EFFORTS as readonly string[]).includes(base) ? newAdaptState(base as EffortChoice) : undefined;
      setStatus(ctx, `🎼 ${ctx.model?.id ?? "?"} · ${base} (continua)`);
      return { action: "continue" };
    }
    let source = "regra";
    let decision: { model?: ModelChoice; effort?: EffortChoice } | undefined = ruleRoute(event.text);
    if (!decision) {
      const apiKey = readApiKey();
      if (!apiKey) return { action: "continue" };
      decision = await decide(event.text, apiKey);
      source = "typedec";
    }
    const { model: modelChoice, effort } = decision;
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
    setStatus(ctx, `🎼 ${label || ctx.model?.id || "?"} · ${pi.getThinkingLevel()} (${source})`);
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

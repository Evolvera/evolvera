import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Maestro chooses the main session's model before each fresh user prompt.
 * Jev classifies the task; the Luna fallback handles Jev failures. Pure
 * continuations and in-flight turns keep the model. The extension never sets
 * reasoning effort: PI preserves or clamps it when switching models.
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
 * the same Jev request as the route question. With the PREVIOUS/USER state,
 * all 9 hostile benchmark messages score >= 0.95 while urgent or stressed but
 * not hostile ones reach 0.90-0.91, hence 0.94.
 */
export const FRUSTRATION_QUESTION = {
  type: "noul",
  instructions: "In USER, the user is frustrated, angry or annoyed with the assistant or the situation (cursing, insults, sarcasm, complaining that something broke again, shouting). Ignore PREVIOUS.",
};
export const FRUSTRATION_THRESHOLD = 0.94;

/**
 * Jev classifies the task type; the type decides model and starting effort.
 * Jev picks only the category; this table decides model and effort. The
 * state carries the tail of the previous assistant reply (PREVIOUS) so short
 * answers like "sim faz" or "a opção 2" are classified by what they approve.
 * Measured: unseen context set 92%, biz 91%, blind3 93%, edge100 82%; the 12
 * extra Sol kinds (tests .. automation) were written before two unseen
 * Sol-heavy sets and took them from 76/80 to 80/80 Sol with 0 under-powered
 * picks. Run-to-run noise is about ±2 items per set. Laya: 37-57%.
 * `duvida` lets Jev say it cannot tell instead of forcing a type; it maps to Opus/high.
 */
export const CATEGORIES: Record<string, { model: ModelChoice; effort: EffortChoice; criterion: string }> = {
  chore: { model: "luna", effort: "medium", criterion: "Run a command, commit/push/revert, check status, rename, bump a version, change a setting." },
  question: { model: "luna", effort: "medium", criterion: "A quick factual question with a short direct answer, including simple questions about the assistant itself." },
  small_edit: { model: "luna", effort: "medium", criterion: "One small edit to existing text, number, style or config: fix a typo, change a value, tweak spacing or color." },
  multi_small: { model: "luna", effort: "medium", criterion: "Several independent small mechanical edits, each trivial on its own." },
  install_simple: { model: "luna", effort: "medium", criterion: "Download, install and run a named tool or release using its documented installer or release instructions, without custom integration, debugging or deployment." },
  doc_routine: { model: "sol", effort: "medium", criterion: "Routine document work on given content: summarize, transcribe, reformat, fill a template." },
  spreadsheet: { model: "sol", effort: "medium", criterion: "Create or edit a spreadsheet (xlsx, csv, Google Sheets): formulas, tables, pivots, data cleanup, without charts." },
  chart: { model: "opus", effort: "high", criterion: "Create or change a chart, graph, dashboard visualization or data visualization, including charts inside a spreadsheet." },
  research: { model: "sol", effort: "medium", criterion: "Look something up: search docs or the web, find how a library or API works, gather a few facts." },
  ui_change: { model: "sol", effort: "medium", criterion: "Change a screen or component to a given spec: add a field, button, state or layout adjustment, without redesigning it." },
  code_feature: { model: "sol", effort: "medium", criterion: "Implement a feature, endpoint, validation, test, script or integration with a known approach." },
  fix_known: { model: "sol", effort: "medium", criterion: "Fix a bug whose cause is known: stated by the user, visible in the message, or already found by the assistant." },
  apply_plan: { model: "sol", effort: "high", criterion: "Carry out a plan, fix or option the assistant already proposed and the user approved." },
  multi_moderate: { model: "sol", effort: "high", criterion: "Several moderate changes across files or documents with clear instructions." },
  setup: { model: "sol", effort: "medium", criterion: "Configure or wire up tools, dependencies, CI, environment or credentials, or install with custom integration or debugging beyond documented installation." },
  refactor: { model: "sol", effort: "high", criterion: "Refactor, restructure or convert existing code without changing behavior." },
  tests: { model: "sol", effort: "medium", criterion: "Write, extend or fix automated tests, fixtures, mocks or seed data." },
  ci_fix: { model: "sol", effort: "medium", criterion: "Make failing lint, type-check, build or CI pass when the error output is visible." },
  data_script: { model: "sol", effort: "medium", criterion: "Write a query, report, data conversion, import/export or one-off script with a clear expected result." },
  upgrade: { model: "sol", effort: "medium", criterion: "Upgrade a dependency, framework or runtime version and adapt the code to its changes." },
  integrate_api: { model: "sol", effort: "medium", criterion: "Integrate a third-party API, SDK or webhook by following its documentation." },
  review_feedback: { model: "sol", effort: "medium", criterion: "Apply code review comments, resolve merge conflicts or rebase a branch." },
  observability: { model: "sol", effort: "medium", criterion: "Add or adjust logging, metrics, alerts, tracing or feature flags." },
  port_translate: { model: "sol", effort: "medium", criterion: "Port code to another language or framework, or translate/localize UI strings." },
  dev_docs: { model: "sol", effort: "medium", criterion: "Update developer documentation, README, comments, changelog or API docs to match the code." },
  perf_known: { model: "sol", effort: "high", criterion: "Speed up code or queries when the bottleneck is already identified." },
  migration_file: { model: "sol", effort: "medium", criterion: "Write a database migration or schema change to a given spec, without running it in production." },
  automation: { model: "sol", effort: "medium", criterion: "Set up a cron job, scheduled task, CI workflow step or automation script." },
  debug_unknown: { model: "opus", effort: "xhigh", criterion: "Find an unknown cause: outage, slowness, intermittent, production-only or unexplained failure." },
  multi_complex: { model: "opus", effort: "xhigh", criterion: "Many interdependent complex changes or requirements in one request, where getting one wrong breaks others." },
  plan: { model: "opus", effort: "high", criterion: "Plan a multi-step change: break down work, sequence it, decide scope before implementing." },
  architecture: { model: "opus", effort: "xhigh", criterion: "System architecture, data modeling, scalability or a risky migration design." },
  deploy: { model: "opus", effort: "medium", criterion: "Deploy, release, publish or roll back an application or service." },
  risky_ops: { model: "opus", effort: "high", criterion: "Other live or irreversible operations: running a production database migration, deleting data, security or access changes." },
  design: { model: "opus", effort: "high", criterion: "UX, UI or visual design or redesign of screens, flows or brand." },
  deep_research: { model: "opus", effort: "high", criterion: "Deep research: investigate a topic across many sources, compare evidence and write a cited report or recommendation." },
  document: { model: "opus", effort: "high", criterion: "Produce a finished document for people: PDF, Word/docx, slides or deck, report, contract or proposal with layout." },
  writing: { model: "opus", effort: "high", criterion: "Write or substantially rewrite text for people: copy, articles, emails, proposals, prompts, or a document with many requested changes." },
  business: { model: "opus", effort: "high", criterion: "Business judgment: pricing, plans, discounts, financial projections, unit economics, legal or regulatory questions, strategy, product rules." },
  analysis: { model: "opus", effort: "high", criterion: "Explain how a system works, compare options and recommend, or review code for subtle problems or security." },
  correction: { model: "opus", effort: "high", criterion: "The user says the assistant's previous work or answer was wrong and must be redone differently." },
  duvida: { model: "opus", effort: "high", criterion: "Unclear: even with the previous assistant message, the task cannot be classified." },
};

export const ROUTE_QUESTION = {
  type: "choice",
  instructions: "An AI agent that does software and business work sent PREVIOUS (end of its last reply); the user answered USER. Classify the hardest task USER actually asks for now. Use PREVIOUS only to resolve references like 'sim', 'faz isso', 'a opção 2'; ignore tone and words used in another sense.",
  criteria: Object.fromEntries(Object.entries(CATEGORIES).map(([name, c]) => [name, c.criterion])),
};

export type Route = { model: ModelChoice; effort: EffortChoice; category: string };

/** How many distinct changes the user asks for; only multi_* categories use it. */
export const COUNT_QUESTION = {
  type: "choice",
  instructions: "How many distinct changes or requests does USER ask for now? Use PREVIOUS only to resolve references like 'faz tudo' or 'aplica os 3'.",
  criteria: { one: "One change or request.", two: "Two changes.", three_four: "Three or four changes.", many: "Five or more changes." },
};
export type ChangeCount = keyof typeof COUNT_QUESTION.criteria;

/**
 * Size scaling for multi-change requests:
 * - multi_complex: up to 2 -> Opus medium, 3-4 -> Opus high, 5+ -> Opus xhigh.
 * - multi_moderate: up to 2 -> Sol high, 3+ -> Opus medium.
 */
export function scaleByCount(route: Route, count: ChangeCount | undefined): Route {
  if (!count) return route;
  const small = count === "one" || count === "two";
  if (route.category === "multi_complex") {
    return { ...route, model: "opus", effort: small ? "medium" : count === "three_four" ? "high" : "xhigh" };
  }
  if (route.category === "multi_moderate") {
    return small ? { ...route, model: "sol", effort: "high" } : { ...route, model: "opus", effort: "medium" };
  }
  return route;
}

/** The category Jev chose (argmax of probabilities, else `choice`), resolved to model + effort. */
export function pickRoute(answer: { choice?: unknown; probabilities?: Record<string, unknown> } | undefined): Route | undefined {
  let category = typeof answer?.choice === "string" ? answer.choice : undefined;
  const probs = answer?.probabilities;
  if (probs) {
    let best: string | undefined;
    for (const name of Object.keys(CATEGORIES)) {
      const p = probs[name];
      if (typeof p === "number" && (best === undefined || p > (probs[best] as number))) best = name;
    }
    category = best ?? category;
  }
  const hit = category ? CATEGORIES[category] : undefined;
  return hit && category ? { model: hit.model, effort: hit.effort, category } : undefined;
}

export function cutState(text: string, maxChars = STATE_MAX_CHARS): string {
  return Array.from(text.replace(/\s+/g, " ").trim()).slice(0, maxChars).join("");
}

/**
 * Credentials pasted in chat are detected locally and routed to Opus high
 * WITHOUT calling Jev or Luna, so a secret never leaves for the classifier.
 * Secrets in PREVIOUS are redacted before it is sent.
 */
const SECRET_PATTERNS: RegExp[] = [
  /\b(sk|pk|rk)[-_](live|test|proj|ant|or)?[-_]?[A-Za-z0-9_-]{16,}/,
  /\b(td_live|td_test|apikey|api_key|ghp|gho|ghs|github_pat|glpat|xox[abpr]|hf|AIza|ya29)[_-]?[A-Za-z0-9_-]{16,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /\b(postgres|postgresql|mysql|mongodb(\+srv)?|redis|amqp):\/\/[^\s:@]+:[^\s@]+@/,
  /\b(api[_ -]?key|token|secret|senha|password|chave)\b\s*[:=]?\s*["']?[A-Za-z0-9_\-./+]{24,}/i,
];
export function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}
export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((out, re) => out.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"), "[REDACTED]"), text);
}
export const SECRET_ROUTE = { model: "opus", effort: "high", category: "secret" } as const;

/** The end of the previous reply carries its question/proposal, so keep its tail. */
export const PREVIOUS_MAX_CHARS = 400;
export function tailOf(text: string, maxChars = PREVIOUS_MAX_CHARS): string {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  return chars.length <= maxChars ? chars.join("") : `…${chars.slice(-maxChars).join("")}`;
}
export function buildState(prompt: string, previous = ""): string {
  const prev = tailOf(redactSecrets(previous));
  return `PREVIOUS: ${prev || "(none)"}\nUSER: ${cutState(prompt)}`;
}

/** Text of the last assistant message on the current branch. */
export function lastAssistantText(entries: unknown[]): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as { type?: string; message?: { role?: string; content?: unknown } };
    if (entry?.type !== "message" || entry.message?.role !== "assistant") continue;
    const content = entry.message.content;
    const text = typeof content === "string" ? content
      : Array.isArray(content) ? content.filter((part) => part?.type === "text").map((part) => part.text ?? "").join(" ") : "";
    if (text.trim()) return text;
  }
  return "";
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** One Jev call with bounded retries; undefined on any non-recoverable failure. */
export async function classify(prompt: string, apiKey: string, fetchImpl: FetchLike = fetch, retry: RetryPolicy = RETRY, previous = ""): Promise<Route | undefined> {
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
        body: JSON.stringify({ state: buildState(prompt, previous), model: JEV_MODEL, questions: { q: ROUTE_QUESTION, f: FRUSTRATION_QUESTION, n: COUNT_QUESTION } }),
        signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, remaining)),
      });
      status = response.status;
    } catch {
      status = 0;
    }
    if (response?.ok) {
      try {
        const body = (await response.json()) as {
          answers?: { q?: { choice?: unknown; probabilities?: Record<string, unknown> }; f?: { noul?: unknown }; n?: { choice?: unknown } };
        };
        const frustration = body.answers?.f?.noul;
        if (typeof frustration === "number" && frustration >= FRUSTRATION_THRESHOLD) return { model: "astra", effort: "high", category: "frustrado" };
        const route = pickRoute(body.answers?.q);
        const count = body.answers?.n?.choice;
        return route && scaleByCount(route, typeof count === "string" && count in COUNT_QUESTION.criteria ? (count as ChangeCount) : undefined);
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

// ---------------------------------------------------------------------------
// Luna fallback: same decision by gpt-6-luna when Jev is unavailable
// ---------------------------------------------------------------------------
// Measured on the same benchmark (reasoning minimal, one call): edge100 94%,
// blind2 100%, blind3 99%; frustration 9/9 hostile, 0 false positives. It is
// ~2 s p50 versus ~0.35 s for Jev, so it runs only when Jev fails.

export const LUNA_ROUTER_SYSTEM = `You route a user's chat message to an AI assistant tier (software and business work). Pick the tier for the hardest task the message actually asks for; ignore tone, context and words used in another sense.
luna: mechanical or quick: run/commit/revert/rename/bump, small config, text or style edit, a quick factual question, a status check.
sol: normal implementation with a known approach: add a feature, field, validation or endpoint, write tests, refactor, fix an error whose cause is visible in the message.
opus: needs judgment: find an unknown cause (outage, slowness, intermittent or prod-only failure), architecture, UX or visual design, prose for people (emails, copy, articles), explaining a system, recommending between options, reviewing for subtle bugs, rewriting prompts, business decisions: pricing, plans, discounts, financial projections, strategy or product rules described at length.
frustrated: true if the user is angry or fed up: any cursing or profanity (porra, merda, caralho, wtf, fuck, "what the hell", joder), insulting the assistant, exasperation ("I'm losing my mind", "estoy harto"), or hostile sarcasm about what the assistant just did. false for plain corrections ("that's wrong, revert"), urgency or ALL CAPS alerts, stressful context, a problem that happened again stated without anger, and jokes or sarcasm about teammates or old code.
Reply with JSON only: {"tier":"luna|sol|opus","frustrated":true|false}`;

/** Parses the fallback reply; frustration wins, as in the Jev path. */
export function parseLunaRoute(text: string): ModelChoice | undefined {
  try {
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { tier?: unknown; frustrated?: unknown };
    if (json.frustrated === true) return "astra";
    return typeof json.tier === "string" && (TIERS as readonly string[]).includes(json.tier) ? (json.tier as ModelChoice) : undefined;
  } catch {
    return undefined;
  }
}

type Completer = (model: unknown, context: unknown, options: Record<string, unknown>) => Promise<{ content?: Array<{ type?: string; text?: string }> }>;

export async function classifyWithLuna(prompt: string, ctx: Pick<ExtensionContext, "modelRegistry">, complete?: Completer): Promise<Route | undefined> {
  try {
    const model = ctx.modelRegistry.find("openai-codex", "gpt-6-luna");
    if (!model) return undefined;
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok) return undefined;
    // Loaded lazily: PI aliases this specifier for extensions; tests inject `complete`.
    const run = complete ?? ((await import("@earendil-works/pi-ai")) as unknown as { completeSimple: Completer }).completeSimple;
    const reply = await run(
      model,
      { systemPrompt: LUNA_ROUTER_SYSTEM, messages: [{ role: "user", content: [{ type: "text", text: cutState(prompt) }], timestamp: Date.now() }] },
      { apiKey: auth.apiKey, headers: auth.headers, reasoning: "minimal", maxTokens: 400, signal: AbortSignal.timeout(10_000) },
    );
    const tier = parseLunaRoute((reply.content ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join(""));
    return tier ? { model: tier, effort: EFFORT_FOR[tier], category: tier === "astra" ? "frustrado" : tier } : undefined;
  } catch {
    return undefined;
  }
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
  const setStatus = (ctx: ExtensionContext, text: string | undefined) => ctx.ui.setStatus("maestro", text);

  pi.on("session_start", async (_event, ctx) => {
    enabled = restoreEnabled(ctx);
    setStatus(ctx, enabled ? "🎼 maestro" : undefined);
  });

  pi.registerCommand("maestro", {
    description: "Auto-escolhe modelo (Luna 6 / Sol 6 / Opus 5.5) por prompt via Jev, sem alterar esforço: /maestro on|off|status",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (arg === "on" || arg === "off") {
        if (arg === "on" && !readApiKey()) {
          ctx.ui.notify("Maestro: sem chave do Jev; usando só o Luna (mais lento).", "warning");
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

    // A pure continuation keeps the current model and the user's effort setting.
    if (isContinuation(event.text)) {
      setStatus(ctx, `🎼 ${ctx.model?.id ?? "?"} · ${pi.getThinkingLevel()} (continua)`);
      return { action: "continue" };
    }
    if (containsSecret(event.text)) {
      const target = MODEL_TARGETS.opus;
      const model = ctx.modelRegistry.find(target.provider, target.id);
      if (model && (ctx.model?.provider !== model.provider || ctx.model?.id !== model.id)) await pi.setModel(model);
      setStatus(ctx, `🎼 ${target.label} · ${pi.getThinkingLevel()} · secret`);
      return { action: "continue" };
    }
    const apiKey = readApiKey();
    let previous = "";
    try { previous = lastAssistantText(ctx.sessionManager.getBranch() as unknown[]); } catch { /* no context */ }
    let route = apiKey ? await classify(event.text, apiKey, fetch, RETRY, previous) : undefined;
    let via = "jev";
    if (!route) {
      route = await classifyWithLuna(event.text, ctx);
      via = "luna";
    }
    const modelChoice = route?.model;
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
    if (!modelChoice) {
      ctx.ui.notify("Maestro: Jev e Luna indisponíveis; modelo e esforço mantidos.", "warning");
      return { action: "continue" };
    }
    setStatus(ctx, `🎼 ${label || ctx.model?.id || "?"} · ${pi.getThinkingLevel()} · ${route?.category}${via === "luna" ? " (luna)" : ""}`);
    return { action: "continue" };
  });
}

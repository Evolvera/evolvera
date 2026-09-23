import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Maestro: before each user prompt, asks TypeDec two independent `choice`
 * questions (model tier, reasoning effort) and switches the main session to
 * the answer for that whole turn, including its tool/agent loop.
 *
 * Invariants:
 * - Every request carries exactly one question in `short` mode, so it runs
 *   on the ANE and stays within its 96-token budget. The prompt excerpt is
 *   truncated to fit; on 413 we retry once with half the excerpt.
 * - Failure never blocks the prompt: the current model/effort stay unchanged.
 * - Subagents keep their frontmatter routes (pi-subagents gives frontmatter
 *   precedence over caller parameters), so only the main session is routed.
 * - The API key comes only from TYPEDEC_API_KEY and is never logged.
 */

export const MAESTRO_ENTRY_TYPE = "maestro";
const ENDPOINT = process.env.TYPEDEC_URL ?? "https://typedec.evolvera.com.br/v1/systemone";
const TIMEOUT_MS = 2_500;
/** ~3 chars/token for PT/EN text leaves room for instructions + criteria within 96 tokens. */
export const STATE_MAX_CHARS = 150;

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
const EFFORT_QUESTION = {
  type: "choice",
  instructions: "Quanto raciocínio exige?",
  criteria: {
    low: "Quase nenhum",
    medium: "Moderado",
    high: "Alto",
    xhigh: "Máximo, problema difícil",
  },
};

/** Collapse whitespace and keep the head of the prompt within the char budget. */
export function promptExcerpt(text: string, maxChars = STATE_MAX_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= maxChars ? flat : `${flat.slice(0, maxChars - 1)}…`;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** One single-question request; returns the chosen key or undefined. */
export async function askChoice(
  question: Record<string, unknown>,
  prompt: string,
  allowed: readonly string[],
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<string | undefined> {
  for (const maxChars of [STATE_MAX_CHARS, Math.floor(STATE_MAX_CHARS / 2)]) {
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        state: promptExcerpt(prompt, maxChars),
        model: "laya-multilingual",
        mode: "short",
        questions: { q: question },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 413) continue;
    if (!response.ok) return undefined;
    const body = (await response.json()) as { answers?: { q?: { choice?: unknown } } };
    const choice = body.answers?.q?.choice;
    return typeof choice === "string" && allowed.includes(choice) ? choice : undefined;
  }
  return undefined;
}

/** Both questions in parallel; each field is undefined when its call failed. */
export async function decide(prompt: string, apiKey: string, fetchImpl: FetchLike = fetch) {
  const [model, effort] = await Promise.all([
    askChoice(MODEL_QUESTION, prompt, Object.keys(MODEL_TARGETS), apiKey, fetchImpl).catch(() => undefined),
    askChoice(EFFORT_QUESTION, prompt, EFFORTS, apiKey, fetchImpl).catch(() => undefined),
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
        if (arg === "on" && !process.env.TYPEDEC_API_KEY) {
          ctx.ui.notify("Maestro: defina TYPEDEC_API_KEY no ambiente do PI antes de ativar.", "error");
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
    const apiKey = process.env.TYPEDEC_API_KEY;
    if (!apiKey || !event.text.trim()) return { action: "continue" };

    const { model: modelChoice, effort } = await decide(event.text, apiKey);
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
    if (!modelChoice && !effort) {
      ctx.ui.notify("Maestro: TypeDec indisponível; modelo e esforço mantidos.", "warning");
      return { action: "continue" };
    }
    setStatus(ctx, `🎼 ${label || ctx.model?.id || "?"} · ${pi.getThinkingLevel()}`);
    return { action: "continue" };
  });
}

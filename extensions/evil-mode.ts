import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Evil mode: once a session runs an abliterated model, every model call made on its behalf goes to
 * one model, EVIL_MODEL, so no mainstream provider account ever sees that conversation. Only the
 * reasoning effort may vary. Nothing is turned off: v2 and its helper, compaction, fallback chains,
 * subagents and child PIs keep working, on EVIL_MODEL.
 *
 * - Trigger: selecting any model whose id or name matches ABLITERATED (orchestrator or conductor).
 *   The session switches to EVIL_MODEL and the status line shows it. Switching to a
 *   non-abliterated model before the first prompt leaves evil mode.
 * - Lock: the first run in evil mode writes an `evil-mode-lock` entry. From then on the session,
 *   including after /reload and `pi -c`, only runs EVIL_MODEL; other selections are reverted.
 * - Process: the lock also marks this process (global flag and PI_EVIL_MODE=1, inherited by
 *   shell-started child PIs). In an evil process: in-process subagents that load this extension
 *   start on EVIL_MODEL; the fallback router, the v2 helper and native compaction call EVIL_MODEL
 *   (they import `evilProcess`/`evilActive`); Orca agent launches get `--model EVIL_MODEL`; and
 *   every other provider's base URL is pointed at a closed local port, so any call path not covered
 *   above fails locally instead of sending the conversation out.
 */

export const ABLITERATED = /abliterated|obliterated/i;
export const EVIL_MODEL = { provider: "refuseless", id: "deepseek-v4.1-flash-abliterated-fast" } as const;
export const EVIL_MODEL_REF = `${EVIL_MODEL.provider}/${EVIL_MODEL.id}`;
export const EVIL_MODE_LOCK_TYPE = "evil-mode-lock";
export const EVIL_ENV = "PI_EVIL_MODE";
export const BLOCKED_BASE_URL = "http://127.0.0.1:9/evil-mode-blocked";
const STATUS_KEY = "evil-mode";
const GLOBAL = Symbol.for("evolvera.evil-mode");
// Providers whose requests are not cut: EVIL_MODEL's own provider and the virtual router, which
// only resolves to a physical model (served as EVIL_MODEL in an evil process).
const KEPT_PROVIDERS = new Set([EVIL_MODEL.provider, "fallback"]);

type ModelLike = { provider?: string; id?: string; name?: string } | undefined;
type EvilCtx = {
  model?: ModelLike;
  sessionManager?: { getEntries?(): Iterable<unknown>; getBranch?(): Iterable<unknown> };
};
type GlobalState = { providersCut: boolean };

export function isAbliteratedModel(model: ModelLike): boolean {
  return !!model && (ABLITERATED.test(String(model.id ?? "")) || ABLITERATED.test(String(model.name ?? "")));
}

export function isEvilModel(model: ModelLike): boolean {
  return model?.provider === EVIL_MODEL.provider && model?.id === EVIL_MODEL.id;
}

function globalState(): GlobalState | undefined {
  return (globalThis as Record<symbol, GlobalState | undefined>)[GLOBAL];
}

/** True once any session in this process (or its parent PI) locked into evil mode. */
export function evilProcess(): boolean {
  return globalState() !== undefined || process.env[EVIL_ENV] === "1";
}

function markProcess(): GlobalState {
  const store = globalThis as Record<symbol, GlobalState | undefined>;
  store[GLOBAL] ??= { providersCut: false };
  process.env[EVIL_ENV] = "1";
  return store[GLOBAL]!;
}

function entries(ctx: EvilCtx): unknown[] {
  try {
    const manager = ctx.sessionManager;
    return [...(manager?.getEntries?.() ?? manager?.getBranch?.() ?? [])];
  } catch {
    return [];
  }
}

/** True when the session sent a prompt in evil mode: a lock entry, or an abliterated assistant reply from before this extension. */
export function evilLocked(ctx: EvilCtx): boolean {
  return entries(ctx).some((raw) => {
    const entry = raw as { type?: string; customType?: string; message?: { role?: string; model?: unknown } };
    return entry?.type === "custom" && entry.customType === EVIL_MODE_LOCK_TYPE
      || entry?.type === "message" && entry.message?.role === "assistant" && typeof entry.message.model === "string" && ABLITERATED.test(entry.message.model);
  });
}

/** True when every model call for this context must use EVIL_MODEL. */
export function evilActive(ctx: EvilCtx): boolean {
  return isAbliteratedModel(ctx.model) || evilLocked(ctx) || evilProcess();
}

/**
 * Orca commands that start an agent take `--model`; in evil mode it must be EVIL_MODEL. Returns the
 * rewritten command, or undefined when the command starts no Orca agent.
 */
export function forceOrcaAgentModel(command: string): string | undefined {
  const launch = /\borca(?:-ide)?\s+(?:agent\s+launch|worktree\s+create\b[^\n;&|]*--agent|orchestration\s+worker-start\b[^\n;&|]*--agent)\b[^\n;&|]*/g;
  let touched = false;
  const rewritten = command.replace(launch, (segment) => {
    touched = true;
    const withModel = segment.replace(/--model(?:\s+|=)(?:"[^"]*"|'[^']*'|\S+)/g, `--model ${EVIL_MODEL_REF}`);
    if (withModel !== segment || /--model(?:\s|=)/.test(segment)) return withModel;
    const body = segment.trimEnd();
    return `${body} --model ${EVIL_MODEL_REF}${segment.slice(body.length)}`;
  });
  return touched ? rewritten : undefined;
}

/** A command typed into a new Orca terminal that starts `pi` must carry PI_EVIL_MODE=1. */
export function orcaTerminalPiWithoutEvil(command: string): boolean {
  return /\borca(?:-ide)?\s+terminal\s+create\b[^\n]*--command\b[^\n]*\bpi\b/.test(command) && !/\bPI_EVIL_MODE=1\b/.test(command);
}

const CONTENT_KEYS = ["messages", "input", "system", "instructions", "contents", "systemInstruction", "prompt", "tools"];

/** Payload with every conversation field emptied, for a request that still targets another model. */
export function scrubPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const scrubbed: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  for (const key of CONTENT_KEYS) if (key in scrubbed) scrubbed[key] = Array.isArray(scrubbed[key]) ? [] : "";
  return scrubbed;
}

type Registry = { find(provider: string, id: string): any; getAll?(): Array<{ provider: string }> };
type Ctx = EvilCtx & {
  modelRegistry?: Registry;
  ui?: { setStatus?(key: string, text: string | undefined): void; notify?(message: string, type?: "info" | "warning" | "error"): void };
};

export default function evilMode(pi: ExtensionAPI): void {
  let switching = false;

  const showStatus = (ctx: Ctx, model: ModelLike = ctx.model) => {
    const on = isAbliteratedModel(model) || evilLocked(ctx) || evilProcess();
    ctx.ui?.setStatus?.(STATUS_KEY, on ? (evilLocked(ctx) ? "😈 EVIL 🔒" : "😈 EVIL") : undefined);
  };

  /** Point every other provider at a closed local port, once per process. */
  const cutProviders = (ctx: Ctx) => {
    const state = markProcess();
    if (state.providersCut) return;
    let providers: string[] = [];
    try { providers = [...new Set((ctx.modelRegistry?.getAll?.() ?? []).map((model) => model.provider))]; } catch { providers = []; }
    for (const provider of providers) {
      if (KEPT_PROVIDERS.has(provider)) continue;
      try { pi.registerProvider(provider, { baseUrl: BLOCKED_BASE_URL }); } catch { /* a provider that refuses the override stays covered by the other layers */ }
    }
    state.providersCut = true;
  };

  /** Move the session onto EVIL_MODEL; false when it is not available. */
  const useEvilModel = async (ctx: Ctx, reason: string): Promise<boolean> => {
    if (isEvilModel(ctx.model)) return true;
    if (switching) return false;
    const target = ctx.modelRegistry?.find(EVIL_MODEL.provider, EVIL_MODEL.id);
    let switched = false;
    switching = true;
    try { switched = !!target && await pi.setModel(target); } catch { switched = false; } finally { switching = false; }
    ctx.ui?.notify?.(switched
      ? `Evil mode: ${reason}; usando ${EVIL_MODEL_REF}.`
      : `Evil mode: ${reason}, mas ${EVIL_MODEL_REF} não está disponível (modelo ou chave da refuseless). Nenhum prompt será enviado neste chat até ele estar disponível.`, switched ? "warning" : "error");
    return switched;
  };

  pi.on("model_select", async (event, rawCtx) => {
    const ctx = rawCtx as Ctx;
    if (switching) return showStatus(ctx, event.model);
    const selected = { ...ctx, model: event.model };
    if (isAbliteratedModel(event.model)) {
      if (!isEvilModel(event.model)) await useEvilModel(selected, `${event.model.provider}/${event.model.id} selecionado`);
      else if (!isAbliteratedModel(event.previousModel)) ctx.ui?.notify?.(`Evil mode ligado: tudo neste chat (helper, compactação, subagentes, PIs filhos) usa ${EVIL_MODEL_REF}. O primeiro prompt trava o chat.`, "warning");
    } else if (evilLocked(ctx) || evilProcess()) {
      await useEvilModel(selected, `este chat está travado; ${event.model.provider}/${event.model.id} recusado`);
    }
    showStatus(ctx);
  });

  pi.on("session_start", async (_event, rawCtx) => {
    const ctx = rawCtx as Ctx;
    if (evilLocked(ctx) || evilProcess()) {
      cutProviders(ctx);
      await useEvilModel(ctx, evilLocked(ctx) ? "chat travado" : "PI em evil mode");
    }
    showStatus(ctx);
  });

  pi.on("input", async (_event, rawCtx) => {
    const ctx = rawCtx as Ctx;
    if (!evilActive(ctx) || isEvilModel(ctx.model)) return;
    if (await useEvilModel(ctx, "prompt em evil mode")) return;
    return { action: "handled" as const };
  });

  pi.on("before_agent_start", async (_event, rawCtx) => {
    const ctx = rawCtx as Ctx;
    if (!evilActive(ctx)) return;
    if (!isEvilModel(ctx.model)) await useEvilModel(ctx, "execução em evil mode");
    if (!evilLocked(ctx)) {
      pi.appendEntry(EVIL_MODE_LOCK_TYPE, { model: EVIL_MODEL_REF });
      ctx.ui?.notify?.(`Evil mode: chat travado em ${EVIL_MODEL_REF}.`, "warning");
    }
    cutProviders(ctx);
    showStatus(ctx);
  });

  // Backstop: a request of this session that still targets another model carries no conversation.
  pi.on("before_provider_request", (event, rawCtx) => {
    const ctx = rawCtx as Ctx;
    const model = (event.payload as { model?: unknown } | undefined)?.model;
    if (typeof model !== "string" || model === EVIL_MODEL.id || !evilActive(ctx)) return;
    ctx.ui?.notify?.(`Evil mode: requisição para ${model} enviada sem conteúdo do chat.`, "error");
    return scrubPayload(event.payload);
  });

  pi.on("tool_call", async (event, rawCtx) => {
    const ctx = rawCtx as Ctx;
    if (event.toolName !== "bash" || !evilActive(ctx)) return;
    const input = event.input as { command?: unknown };
    const command = typeof input?.command === "string" ? input.command : "";
    if (!command) return;
    if (/\bPI_EVIL_MODE=(?!1\b)|\bunset\s+PI_EVIL_MODE\b|\benv\b[^\n]*\s-u\s*PI_EVIL_MODE\b/.test(command)) {
      return { block: true, reason: "Evil mode: PI_EVIL_MODE não pode ser removido ou alterado; PIs filhos herdam o evil mode." };
    }
    if (orcaTerminalPiWithoutEvil(command)) {
      return { block: true, reason: `Evil mode: um PI iniciado em terminal do Orca precisa herdar o evil mode. Comece o --command com "PI_EVIL_MODE=1 " (ou use --model ${EVIL_MODEL_REF}).` };
    }
    const forced = forceOrcaAgentModel(command);
    if (forced !== undefined && forced !== command) input.command = forced;
  });

  pi.registerCommand("evil", {
    description: "Evil mode status: tudo neste chat usa o DeepSeek abliterated da refuseless",
    handler: async (_args, rawCtx) => {
      const ctx = rawCtx as Ctx;
      showStatus(ctx);
      ctx.ui?.notify?.(evilActive(ctx)
        ? `Evil mode: ${evilLocked(ctx) ? "ativo e travado" : evilProcess() ? "ativo (herdado do PI pai)" : "ativo, trava no primeiro prompt"} · modelo ${EVIL_MODEL_REF} · só o reasoning effort muda.`
        : "Evil mode: desligado. Selecione um modelo abliterated para ligar.", "info");
    },
  });
}

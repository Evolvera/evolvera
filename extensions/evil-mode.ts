import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Evil mode: selecting an abliterated model routes every model call on its behalf to that model.
 * Switching to a non-abliterated model before the first prompt leaves evil mode.
 * The first run stores the selected model in an `evil-mode-lock` entry and inherited process env.
 * Child PIs, subagents, fallback routing, compaction, helper calls and Orca launches use that ref.
 * The DeepSeek abliterated model is the fallback for old locks and unavailable selected models.
 */

export const ABLITERATED = /abliterated|obliterated/i;
export const EVIL_MODEL = { provider: "refuseless", id: "deepseek-v4.1-flash-abliterated-fast" } as const;
export const EVIL_MODEL_REF = `${EVIL_MODEL.provider}/${EVIL_MODEL.id}`;
export const EVIL_MODE_LOCK_TYPE = "evil-mode-lock";
export const EVIL_ENV = "PI_EVIL_MODE";
export const EVIL_MODEL_ENV = "PI_EVIL_MODEL";
export const BLOCKED_BASE_URL = "http://127.0.0.1:9/evil-mode-blocked";
const STATUS_KEY = "evil-mode";
const GLOBAL = Symbol.for("evolvera.evil-mode");
const KEPT_PROVIDERS = new Set(["fallback"]);

type ModelLike = { provider?: string; id?: string; name?: string } | undefined;
type EvilCtx = {
  model?: ModelLike;
  modelRegistry?: { find(provider: string, id: string): ModelLike; hasConfiguredAuth?(model: NonNullable<ModelLike>): boolean };
  sessionManager?: { getEntries?(): Iterable<unknown>; getBranch?(): Iterable<unknown> };
};
type GlobalState = { providersCut: boolean; modelRef?: string };
type EvilModelRef = { provider: string; id: string };
type EvilLockEntry = { type?: string; customType?: string; data?: { model?: unknown }; message?: { role?: string; model?: unknown } };

export function isAbliteratedModel(model: ModelLike): boolean {
  return !!model && (ABLITERATED.test(String(model.id ?? "")) || ABLITERATED.test(String(model.name ?? "")));
}

export function isEvilModel(model: ModelLike, ref = EVIL_MODEL_REF): boolean {
  return !!model && `${model.provider}/${model.id}` === ref;
}

function modelRef(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const separator = value.indexOf("/");
  if (separator < 1 || separator === value.length - 1) return undefined;
  return value;
}

function lockModelRef(ctx: EvilCtx): string | undefined {
  for (const raw of entries(ctx)) {
    const entry = raw as EvilLockEntry;
    if (entry?.type === "custom" && entry.customType === EVIL_MODE_LOCK_TYPE) return modelRef(entry.data?.model) ?? EVIL_MODEL_REF;
  }
  return undefined;
}

export function getEvilModel(ctx: EvilCtx): EvilModelRef {
  const lockedRef = lockModelRef(ctx);
  const stateRef = globalState()?.modelRef;
  const envRef = modelRef(process.env[EVIL_MODEL_ENV]);
  const selectedRef = isAbliteratedModel(ctx.model) && ctx.model?.provider && ctx.model.id
    ? `${ctx.model.provider}/${ctx.model.id}`
    : undefined;
  const preferred = lockedRef ?? stateRef ?? envRef ?? selectedRef ?? EVIL_MODEL_REF;
  const [provider, id] = preferred.split(/\/(.+)/, 2);
  const candidate = ctx.modelRegistry?.find(provider, id);
  if (candidate && (!ctx.modelRegistry?.hasConfiguredAuth || ctx.modelRegistry.hasConfiguredAuth(candidate as NonNullable<ModelLike>))) return { provider, id };
  if (preferred !== EVIL_MODEL_REF) {
    const fallback = ctx.modelRegistry?.find(EVIL_MODEL.provider, EVIL_MODEL.id);
    if (fallback && (!ctx.modelRegistry?.hasConfiguredAuth || ctx.modelRegistry.hasConfiguredAuth(fallback as NonNullable<ModelLike>))) return EVIL_MODEL;
  }
  return { provider: EVIL_MODEL.provider, id: EVIL_MODEL.id };
}

function globalState(): GlobalState | undefined {
  return (globalThis as Record<symbol, GlobalState | undefined>)[GLOBAL];
}

/** True once any session in this process (or its parent PI) locked into evil mode. */
export function evilProcess(): boolean {
  return globalState() !== undefined || process.env[EVIL_ENV] === "1";
}

function markProcess(ref: string): GlobalState {
  const store = globalThis as Record<symbol, GlobalState | undefined>;
  store[GLOBAL] ??= { providersCut: false, modelRef: ref };
  store[GLOBAL]!.modelRef ??= ref;
  process.env[EVIL_ENV] = "1";
  process.env[EVIL_MODEL_ENV] = store[GLOBAL]!.modelRef;
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
    const entry = raw as EvilLockEntry;
    return entry?.type === "custom" && entry.customType === EVIL_MODE_LOCK_TYPE
      || entry?.type === "message" && entry.message?.role === "assistant" && typeof entry.message.model === "string" && ABLITERATED.test(entry.message.model);
  });
}

/** True when every model call for this context must use its selected evil model. */
export function evilActive(ctx: EvilCtx): boolean {
  return isAbliteratedModel(ctx.model) || evilLocked(ctx) || evilProcess();
}

/**
 * Orca commands that start an agent take `--model`; in evil mode it must be the selected model. Returns the
 * rewritten command, or undefined when the command starts no Orca agent.
 */
export function forceOrcaAgentModel(command: string, ref = modelRef(process.env[EVIL_MODEL_ENV]) ?? EVIL_MODEL_REF): string | undefined {
  const launch = /\borca(?:-ide)?\s+(?:agent\s+launch|worktree\s+create\b[^\n;&|]*--agent|orchestration\s+worker-start\b[^\n;&|]*--agent)\b[^\n;&|]*/g;
  let touched = false;
  const rewritten = command.replace(launch, (segment) => {
    touched = true;
    const withModel = segment.replace(/--model(?:\s+|=)(?:"[^"]*"|'[^']*'|\S+)/g, `--model ${ref}`);
    if (withModel !== segment || /--model(?:\s|=)/.test(segment)) return withModel;
    const body = segment.trimEnd();
    return `${body} --model ${ref}${segment.slice(body.length)}`;
  });
  return touched ? rewritten : undefined;
}

/** A command typed into a new Orca terminal that starts `pi` must carry the evil mode and model ref. */
export function orcaTerminalPiWithoutEvil(command: string, ref = modelRef(process.env[EVIL_MODEL_ENV]) ?? EVIL_MODEL_REF): boolean {
  const startsPi = /\borca(?:-ide)?\s+terminal\s+create\b[^\n]*--command\b[^\n]*\bpi\b/.test(command);
  return startsPi && (!/\bPI_EVIL_MODE=1\b/.test(command) || !command.includes(`PI_EVIL_MODEL=${ref}`));
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
    const target = getEvilModel(ctx);
    const state = markProcess(`${target.provider}/${target.id}`);
    if (state.providersCut) return;
    let providers: string[] = [];
    try { providers = [...new Set((ctx.modelRegistry?.getAll?.() ?? []).map((model) => model.provider))]; } catch { providers = []; }
    for (const provider of providers) {
      if (provider === target.provider || KEPT_PROVIDERS.has(provider)) continue;
      try { pi.registerProvider(provider, { baseUrl: BLOCKED_BASE_URL }); } catch { /* a provider that refuses the override stays covered by the other layers */ }
    }
    state.providersCut = true;
  };

  /** Move the session onto its effective evil model; false when it is not available. */
  const useEvilModel = async (ctx: Ctx, reason: string): Promise<boolean> => {
    const targetRef = getEvilModel(ctx);
    const ref = `${targetRef.provider}/${targetRef.id}`;
    if (isEvilModel(ctx.model, ref)) return true;
    if (switching) return false;
    const target = ctx.modelRegistry?.find(targetRef.provider, targetRef.id);
    let switched = false;
    switching = true;
    try { switched = !!target && await pi.setModel(target); } catch { switched = false; } finally { switching = false; }
    ctx.ui?.notify?.(switched
      ? `Evil mode: ${reason}; usando ${ref}.`
      : `Evil mode: ${reason}, mas ${ref} não está disponível (modelo ou chave do provider). Usando ${EVIL_MODEL_REF} se disponível; nenhum prompt será enviado até haver modelo disponível.`, switched ? "warning" : "error");
    return switched;
  };

  pi.on("model_select", async (event, rawCtx) => {
    const ctx = rawCtx as Ctx;
    if (switching) return showStatus(ctx, event.model);
    const selected = { ...ctx, model: event.model };
    if (isAbliteratedModel(event.model)) {
      if (evilLocked(ctx) || evilProcess()) {
        await useEvilModel(selected, `este chat está travado; ${event.model.provider}/${event.model.id} recusado`);
      } else if (!isAbliteratedModel(event.previousModel)) {
        ctx.ui?.notify?.(`Evil mode ligado: tudo neste chat (helper, compactação, subagentes, PIs filhos) usa ${event.model.provider}/${event.model.id}. O primeiro prompt trava o chat.`, "warning");
      }
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
    const target = getEvilModel(ctx);
    if (!evilActive(ctx) || isEvilModel(ctx.model, `${target.provider}/${target.id}`)) return;
    if (await useEvilModel(ctx, "prompt em evil mode")) return;
    return { action: "handled" as const };
  });

  pi.on("before_agent_start", async (_event, rawCtx) => {
    const ctx = rawCtx as Ctx;
    if (!evilActive(ctx)) return;
    const target = getEvilModel(ctx);
    if (!isEvilModel(ctx.model, `${target.provider}/${target.id}`)) await useEvilModel(ctx, "execução em evil mode");
    if (!evilLocked(ctx)) {
      const target = getEvilModel(ctx);
      const ref = `${target.provider}/${target.id}`;
      pi.appendEntry(EVIL_MODE_LOCK_TYPE, { model: ref });
      markProcess(ref);
      ctx.ui?.notify?.(`Evil mode: chat travado em ${ref}.`, "warning");
    }
    cutProviders(ctx);
    showStatus(ctx);
  });

  // Backstop: a request of this session that still targets another model carries no conversation.
  pi.on("before_provider_request", (event, rawCtx) => {
    const ctx = rawCtx as Ctx;
    const model = (event.payload as { model?: unknown } | undefined)?.model;
    const target = getEvilModel(ctx);
    if (typeof model !== "string" || model === target.id || !evilActive(ctx)) return;
    ctx.ui?.notify?.(`Evil mode: requisição para ${model} enviada sem conteúdo do chat.`, "error");
    return scrubPayload(event.payload);
  });

  pi.on("tool_call", async (event, rawCtx) => {
    const ctx = rawCtx as Ctx;
    if (event.toolName !== "bash" || !evilActive(ctx)) return;
    const input = event.input as { command?: unknown };
    const command = typeof input?.command === "string" ? input.command : "";
    if (!command) return;
    const target = getEvilModel(ctx);
    const ref = `${target.provider}/${target.id}`;
    const assignedModelRefs = [...command.matchAll(/\bPI_EVIL_MODEL=([^\s;&|]*)/g)].map((match) => match[1]);
    if (/\bPI_EVIL_MODE=(?!1\b)|\bunset\s+PI_EVIL_MODE\b|\benv\b[^\n]*\s-u\s*PI_EVIL_MODE\b/.test(command)
      || /\bunset\s+PI_EVIL_MODEL\b|\benv\b[^\n]*\s-u\s*PI_EVIL_MODEL\b/.test(command)
      || assignedModelRefs.some((assignedRef) => assignedRef !== ref)) {
      return { block: true, reason: "Evil mode: PI_EVIL_MODE e PI_EVIL_MODEL não podem ser removidos ou alterados; PIs filhos herdam o modelo evil." };
    }
    if (orcaTerminalPiWithoutEvil(command, ref)) {
      return { block: true, reason: `Evil mode: um PI iniciado em terminal do Orca precisa herdar o evil mode. Comece o --command com "PI_EVIL_MODE=1 PI_EVIL_MODEL=${ref} " (ou use --model ${ref}).` };
    }
    const forced = forceOrcaAgentModel(command, ref);
    if (forced !== undefined && forced !== command) input.command = forced;
  });

  pi.registerCommand("evil", {
    description: "Evil mode status: o chat usa o modelo abliterated selecionado",
    handler: async (_args, rawCtx) => {
      const ctx = rawCtx as Ctx;
      showStatus(ctx);
      ctx.ui?.notify?.(evilActive(ctx)
        ? `Evil mode: ${evilLocked(ctx) ? "ativo e travado" : evilProcess() ? "ativo (herdado do PI pai)" : "ativo, trava no primeiro prompt"} · modelo ${getEvilModel(ctx).provider}/${getEvilModel(ctx).id} · só o reasoning effort muda.`
        : "Evil mode: desligado. Selecione um modelo abliterated para ligar.", "info");
    },
  });
}

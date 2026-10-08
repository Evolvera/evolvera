import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const STATUS_KEY = "codex-fast-mode";
const FAST_REQUEST_TIER = "priority";
const ULTRAFAST_REQUEST_TIER = "ultrafast";
const FAST_STATE_KEY = Symbol.for("evolvera.codex-fast-mode.state");
const ECO_DEFAULT_KEY = "codexFastEcoDefault";

// "ultra"/"ultra-subagents" mirror "all"/"subagents" but request Ultrafast where the model supports it.
type FastMode = "off" | "all" | "subagents" | "ultra" | "ultra-subagents";
const FAST_MODES: readonly FastMode[] = ["off", "all", "subagents", "ultra", "ultra-subagents"];

interface SharedFastState {
  // Keep enabled for compatibility with extensions loaded before /reload.
  enabled: boolean;
  mode?: FastMode;
  ownerSessionId?: string;
}

const globalState = globalThis as typeof globalThis & { [key: symbol]: unknown };

function getSharedFastState(): SharedFastState {
  const existing = globalState[FAST_STATE_KEY];
  if (existing) return existing as SharedFastState;

  const state: SharedFastState = { enabled: false, mode: "off" };
  globalState[FAST_STATE_KEY] = state;
  return state;
}

function getFastMode(state: SharedFastState): FastMode {
  if (state.mode && FAST_MODES.includes(state.mode)) return state.mode;
  return state.enabled ? "all" : "off";
}

function setFastMode(state: SharedFastState, mode: FastMode, ownerSessionId?: string): void {
  state.mode = mode;
  state.enabled = mode !== "off";
  state.ownerSessionId = mode === "off" ? undefined : ownerSessionId;
}

type EcoDefaultResult = { enabled: boolean; invalid: boolean };

function readEcoDefault(): EcoDefaultResult {
  const path = join(getAgentDir(), "settings.json");
  try {
    const entry = lstatSync(path, { throwIfNoEntry: false });
    if (!entry) return { enabled: false, invalid: false };
    if (!entry.isFile()) return { enabled: false, invalid: true };
    const settings = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) return { enabled: false, invalid: true };
    const value = (settings as Record<string, unknown>)[ECO_DEFAULT_KEY];
    if (value === undefined) return { enabled: false, invalid: false };
    return typeof value === "boolean"
      ? { enabled: value, invalid: false }
      : { enabled: false, invalid: true };
  } catch {
    return { enabled: false, invalid: true };
  }
}

function writeEcoDefault(enabled: boolean): void {
  const path = join(getAgentDir(), "settings.json");
  let settings: Record<string, unknown> = {};
  let fileMode: number | undefined;
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (entry && !entry.isFile()) throw new Error("Settings must be a regular file.");
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      settings = parsed as Record<string, unknown>;
      fileMode = statSync(path).mode & 0o777;
    } catch {
      throw new Error("Settings file is invalid or unavailable.");
    }
  }
  settings[ECO_DEFAULT_KEY] = enabled;
  mkdirSync(dirname(path), { recursive: true });
  const temporaryDir = mkdtempSync(join(dirname(path), ".codex-fast-mode-"));
  const temporary = join(temporaryDir, "settings.json");
  try {
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: fileMode ?? 0o600, flag: "wx" });
    renameSync(temporary, path);
  } catch {
    throw new Error("Settings file is invalid or unavailable.");
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }
}

function resetFastStateForOwner(sessionId: string): void {
  const state = getSharedFastState();
  if (state.ownerSessionId !== sessionId) return;
  setFastMode(state, "off");
}

function continueFastStateForNewOwner(sessionId: string): void {
  const state = getSharedFastState();
  const mode = getFastMode(state);
  if (mode !== "off") setFastMode(state, mode, sessionId);
}

interface ModelIdentity {
  provider?: unknown;
  id?: unknown;
}

interface ProviderPayload {
  [key: string]: unknown;
}

export function isFastEligibleModel(model: ModelIdentity | undefined): boolean {
  if (model?.provider !== "openai-codex" || typeof model.id !== "string") return false;

  // The configured GPT-5.6 Sol/Terra/Luna IDs, GPT-6 Astra/Sol/Luna, and GPT-6.1 Sol support Fast mode.
  return model.id.startsWith("gpt-5.6-")
    || model.id === "gpt-5.6"
    || model.id === "gpt-5.5"
    || model.id === "gpt-5.4"
    || model.id === "gpt-6-astra"
    || model.id === "gpt-6-sol"
    || model.id === "gpt-6.1-sol"
    || model.id === "gpt-6-luna";
}

// Ultrafast supports GPT-6 Astra and GPT-6.1 Sol (Pro $500 / eligible Enterprise/Edu; OpenAI Codex
// speed docs, 2026-10-08). The backend accepts the tier for other models but silently serves Standard,
// so only the documented models are ever sent it.
const ULTRAFAST_MODEL_IDS = new Set(["gpt-6-astra", "gpt-6.1-sol"]);
export function isUltrafastEligibleModel(model: ModelIdentity | undefined): boolean {
  return model?.provider === "openai-codex" && ULTRAFAST_MODEL_IDS.has(model.id);
}

export function isUltraMode(mode: FastMode): boolean {
  return mode === "ultra" || mode === "ultra-subagents";
}

export function serviceTierFor(mode: FastMode, model: ModelIdentity | undefined): string {
  return isUltraMode(mode) && isUltrafastEligibleModel(model) ? ULTRAFAST_REQUEST_TIER : FAST_REQUEST_TIER;
}

export function creditMultiplierFor(model: ModelIdentity | undefined): string {
  return model?.id === "gpt-5.4" ? "2×" : "2,5×";
}

export function applyFastServiceTier(payload: unknown, tier: string = FAST_REQUEST_TIER): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return { ...(payload as ProviderPayload), service_tier: tier };
}

export default function codexFastModeExtension(pi: ExtensionAPI) {
  let eligibleModelSelected = false;
  let currentModel: ModelIdentity | undefined;
  let fastRequestInFlight = false;
  let fastRequestAccepted = false;

  const updateStatus = (ctx: {
    sessionManager: { getSessionId(): string };
    ui: { setStatus(key: string, text: string | undefined): void };
  }) => {
    const state = getSharedFastState();
    const mode = getFastMode(state);
    const isOwner = state.ownerSessionId === ctx.sessionManager.getSessionId();
    const icon = mode === "ultra" && isUltrafastEligibleModel(currentModel) ? "🚀" : "⚡";
    const status = isOwner && mode === "subagents"
      ? "⚡ECO"
      : isOwner && mode === "ultra-subagents"
        ? "🚀ECO"
        : isOwner && (mode === "all" || mode === "ultra")
          // An ineligible main model (e.g. Claude) keeps the mode active for eligible subagents.
          ? eligibleModelSelected ? `${icon}${fastRequestAccepted ? "🟢" : "🟡"}` : `${mode === "ultra" ? "🚀" : "⚡"}SUB`
          : undefined;
    ctx.ui.setStatus(STATUS_KEY, status);
  };

  const notifyEnabled = (
    ctx: { ui: { notify(message: string, type?: "info" | "warning" | "error"): void } },
    model: ModelIdentity | undefined,
  ) => {
    ctx.ui.notify(
      `Fast Mode ativado: aproximadamente 1,5× mais rápido e ${creditMultiplierFor(model)} mais consumo de créditos.`,
      "warning",
    );
  };

  const notifyEcoEnabled = (ctx: { ui: { notify(message: string, type?: "info" | "warning" | "error"): void } }) => {
    ctx.ui.notify(
      "Fast Mode ECO ativado: a sessão principal permanece no service tier padrão; apenas subagentes OpenAI Codex compatíveis usam Fast e consomem créditos adicionais.",
      "warning",
    );
  };

  const notifyUltraEnabled = (
    ctx: { ui: { notify(message: string, type?: "info" | "warning" | "error"): void } },
    model: ModelIdentity | undefined,
  ) => {
    ctx.ui.notify(
      isUltrafastEligibleModel(model)
        ? `Ultrafast ativado no ${model?.id === "gpt-6-astra" ? "GPT-6 Astra (até ~8× mais rápido)" : "GPT-6.1 Sol"}: 8× consumo do limite incluído (6× em créditos). Outros modelos compatíveis usam Fast.`
        : "Ultrafast só existe no GPT-6 Astra e no GPT-6.1 Sol. Este modelo usa Fast (priority); troque para gpt-6-astra ou gpt-6.1-sol para Ultrafast.",
      "warning",
    );
  };

  const USAGE = "Uso: /fast on | /fast eco | /fast ultra | /fast ultra-eco | /fast off | /fast eco default on|off";

  pi.registerCommand("fast", {
    description: "Toggle OpenAI Codex Fast mode or set its optional Eco default: /fast on | /fast eco | /fast ultra | /fast ultra-eco | /fast off | /fast eco default on|off",
    getArgumentCompletions: async (prefix) => {
      const options = [
        {
          value: "on",
          label: "on",
          description: eligibleModelSelected
            ? "Fast here + eligible subagents; ~1,5–2× faster, 2,5× credits"
            : "Fast for eligible subagents (this model has no Fast)",
        },
        {
          value: "ultra",
          label: "ultra",
          description: isUltrafastEligibleModel(currentModel)
            ? "Ultrafast here + subagents (Astra/6.1 Sol); 8× credits"
            : "Ultrafast on Astra/6.1 Sol, Fast on other eligible models, here + subagents",
        },
        { value: "eco", label: "eco", description: "Fast for eligible subagents only" },
        { value: "eco default on", label: "eco default on", description: "Enable Eco for future TUI initializations" },
        { value: "eco default off", label: "eco default off", description: "Disable Eco for future TUI initializations" },
        { value: "ultra-eco", label: "ultra-eco", description: "Ultrafast for Astra/6.1 Sol subagents, Fast for others" },
        { value: "off", label: "off", description: "Use standard service tier" },
      ];
      const normalizedPrefix = prefix.toLowerCase();
      return options.filter((option) => option.value.startsWith(normalizedPrefix.trim()));
    },
    handler: async (rawArgs, ctx) => {
      const action = rawArgs.trim().toLowerCase();
      const model = ctx.model;
      const sessionId = ctx.sessionManager.getSessionId();

      const defaultMatch = /^eco default (on|off)$/.exec(action);
      if (defaultMatch) {
        const enabled = defaultMatch[1] === "on";
        try {
          writeEcoDefault(enabled);
        } catch {
          ctx.ui.notify("Não foi possível salvar o padrão Eco; o modo da sessão não foi alterado.", "warning");
          return;
        }
        ctx.ui.notify(`Padrão Eco ${enabled ? "ativado" : "desativado"} salvo; aplica-se apenas a futuras inicializações.`, "info");
        return;
      }

      if (action === "off") {
        resetFastStateForOwner(sessionId);
        fastRequestInFlight = false;
        fastRequestAccepted = false;
        updateStatus(ctx);
        ctx.ui.notify("Fast Mode desativado. OpenAI Codex voltou ao service tier padrão.", "info");
        return;
      }

      if (action === "eco") {
        const sharedState = getSharedFastState();
        setFastMode(sharedState, "subagents", sessionId);
        fastRequestInFlight = false;
        fastRequestAccepted = false;
        updateStatus(ctx);
        notifyEcoEnabled(ctx);
        return;
      }

      if (action === "ultra-eco") {
        const sharedState = getSharedFastState();
        setFastMode(sharedState, "ultra-subagents", sessionId);
        fastRequestInFlight = false;
        fastRequestAccepted = false;
        updateStatus(ctx);
        ctx.ui.notify(
          "Fast Mode ULTRA ECO ativado: a sessão principal fica no tier padrão; subagentes GPT-6 Astra e GPT-6.1 Sol usam Ultrafast (8× créditos) e outros compatíveis usam Fast.",
          "warning",
        );
        return;
      }

      if (action !== "on" && action !== "ultra") {
        ctx.ui.notify(USAGE, "warning");
        return;
      }

      const sharedState = getSharedFastState();
      setFastMode(sharedState, action === "ultra" ? "ultra" : "all", sessionId);
      eligibleModelSelected = isFastEligibleModel(model);
      currentModel = model;
      fastRequestInFlight = false;
      fastRequestAccepted = false;
      updateStatus(ctx);
      if (!eligibleModelSelected) {
        ctx.ui.notify(
          `Fast Mode ${action === "ultra" ? "ULTRA " : ""}ativado: este modelo não tem Fast e segue no tier padrão; subagentes OpenAI Codex compatíveis usam ${action === "ultra" ? "Ultrafast (Astra/6.1 Sol) ou Fast" : "Fast"}.`,
          "warning",
        );
      } else if (action === "ultra") notifyUltraEnabled(ctx, model);
      else notifyEnabled(ctx, model);
    },
  });

  pi.on("session_start", (event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const sharedState = getSharedFastState();
    // `/new` carries the selected runtime mode; other TUI roots use the optional global default.
    if (event.reason === "new" && ctx.mode === "tui") {
      continueFastStateForNewOwner(sessionId);
    } else if (ctx.mode === "tui") {
      const preference = readEcoDefault();
      setFastMode(sharedState, preference.enabled ? "subagents" : "off", preference.enabled ? sessionId : undefined);
      if (preference.invalid) ctx.ui.notify("Fast Eco default is invalid; using standard mode.", "warning");
    } else {
      resetFastStateForOwner(sessionId);
    }
    eligibleModelSelected = isFastEligibleModel(ctx.model);
    currentModel = ctx.model;
    fastRequestInFlight = false;
    fastRequestAccepted = false;
    updateStatus(ctx);
  });

  pi.on("model_select", (event, ctx) => {
    const modelChanged = event.previousModel?.provider !== event.model.provider
      || event.previousModel?.id !== event.model.id;
    eligibleModelSelected = isFastEligibleModel(event.model);
    currentModel = event.model;
    // The chosen mode survives model changes: requests are gated per model, so an ineligible main
    // model (e.g. Claude) simply stays standard while eligible subagents keep Fast/Ultrafast.
    if (modelChanged) {
      fastRequestInFlight = false;
      fastRequestAccepted = false;
    }
    updateStatus(ctx);
  });

  pi.on("before_provider_request", (event, ctx) => {
    const state = getSharedFastState();
    const mode = getFastMode(state);
    const isOwner = state.ownerSessionId === ctx.sessionManager.getSessionId();
    const appliesToRequest = mode === "all" || mode === "ultra"
      || ((mode === "subagents" || mode === "ultra-subagents") && !isOwner);
    if (!appliesToRequest || !isFastEligibleModel(ctx.model)) return undefined;
    fastRequestInFlight = true;
    return applyFastServiceTier(event.payload, serviceTierFor(mode, ctx.model));
  });

  pi.on("after_provider_response", (event, ctx) => {
    if (!fastRequestInFlight) return;
    fastRequestInFlight = false;
    fastRequestAccepted = event.status >= 200 && event.status < 300;
    updateStatus(ctx);
  });

  pi.on("session_shutdown", (event, ctx) => {
    // `/new` replaces the maestro session; keep its explicit Fast mode for the new root.
    if (event.reason !== "new") resetFastStateForOwner(ctx.sessionManager.getSessionId());
    eligibleModelSelected = false;
    currentModel = undefined;
    fastRequestInFlight = false;
    fastRequestAccepted = false;
    updateStatus(ctx);
  });
}

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "codex-fast-mode";
const FAST_REQUEST_TIER = "priority";
const ULTRAFAST_REQUEST_TIER = "ultrafast";
const FAST_STATE_KEY = Symbol.for("evolvera.codex-fast-mode.state");

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

  const state: SharedFastState = { enabled: true, mode: "subagents" };
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

// Ultrafast is Astra-only (Pro $500 / eligible Enterprise/Edu). The backend accepts the tier for other
// models and for non-entitled accounts but silently serves Standard, so only Astra is ever sent it.
export function isUltrafastEligibleModel(model: ModelIdentity | undefined): boolean {
  return model?.provider === "openai-codex" && model.id === "gpt-6-astra";
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
        : isOwner && (mode === "all" || mode === "ultra") && eligibleModelSelected
          ? `${icon}${fastRequestAccepted ? "🟢" : "🟡"}`
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
        ? "Ultrafast ativado no GPT-6 Astra: até ~8× mais rápido (medido ~12×) e 8× consumo do limite incluído (6× em créditos). Outros modelos compatíveis usam Fast."
        : "Ultrafast só existe no GPT-6 Astra. Este modelo usa Fast (priority); troque para gpt-6-astra para Ultrafast.",
      "warning",
    );
  };

  const USAGE = "Uso: /fast on | /fast eco | /fast ultra | /fast ultra-eco | /fast off";

  pi.registerCommand("fast", {
    description: "Toggle OpenAI Codex Fast mode: /fast on | /fast eco | /fast ultra | /fast ultra-eco | /fast off",
    getArgumentCompletions: async (prefix) => {
      const options = [
        ...(eligibleModelSelected
          ? [{ value: "on", label: "on", description: "1,5× faster; 2,5× GPT-5.6/5.5 credits" }]
          : []),
        ...(isUltrafastEligibleModel(currentModel)
          ? [{ value: "ultra", label: "ultra", description: "Astra Ultrafast (~8×+ faster); 8× credits" }]
          : []),
        { value: "eco", label: "eco", description: "Fast for eligible subagents only" },
        { value: "ultra-eco", label: "ultra-eco", description: "Ultrafast for Astra subagents, Fast for others" },
        { value: "off", label: "off", description: "Use standard service tier" },
      ];
      return options.filter((option) => option.value.startsWith(prefix.trim().toLowerCase()));
    },
    handler: async (rawArgs, ctx) => {
      const action = rawArgs.trim().toLowerCase();
      const model = ctx.model;
      const sessionId = ctx.sessionManager.getSessionId();

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
          "Fast Mode ULTRA ECO ativado: a sessão principal fica no tier padrão; subagentes GPT-6 Astra usam Ultrafast (8× créditos) e outros compatíveis usam Fast.",
          "warning",
        );
        return;
      }

      if (action !== "on" && action !== "ultra") {
        ctx.ui.notify(USAGE, "warning");
        return;
      }

      if (!isFastEligibleModel(model)) {
        ctx.ui.notify("Fast Mode is available only for supported OpenAI Codex models (GPT-5.6, GPT-5.5, GPT-5.4, GPT-6 Astra/Sol/Luna, or GPT-6.1 Sol).", "warning");
        return;
      }

      const sharedState = getSharedFastState();
      setFastMode(sharedState, action === "ultra" ? "ultra" : "all", sessionId);
      eligibleModelSelected = true;
      currentModel = model;
      fastRequestInFlight = false;
      fastRequestAccepted = false;
      updateStatus(ctx);
      if (action === "ultra") notifyUltraEnabled(ctx, model);
      else notifyEnabled(ctx, model);
    },
  });

  pi.on("session_start", (event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const sharedState = getSharedFastState();
    // ECO is the default for each TUI root; only eligible subagents use Fast.
    if (event.reason === "new" && ctx.mode === "tui") {
      continueFastStateForNewOwner(sessionId);
    } else if (ctx.mode === "tui") {
      setFastMode(sharedState, "subagents", sessionId);
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
    const state = getSharedFastState();
    const isOwner = state.ownerSessionId === ctx.sessionManager.getSessionId();
    const ownerMode = getFastMode(state);
    if (modelChanged && isOwner && (ownerMode === "all" || ownerMode === "ultra")) {
      resetFastStateForOwner(ctx.sessionManager.getSessionId());
    }
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

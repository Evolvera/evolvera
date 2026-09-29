import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "codex-fast-mode";
const FAST_REQUEST_TIER = "priority";
const FAST_STATE_KEY = Symbol.for("evolvera.codex-fast-mode.state");

type FastMode = "off" | "all" | "subagents";

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
  if (state.mode === "all" || state.mode === "subagents" || state.mode === "off") return state.mode;
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
  // Ultrafast is a separate Astra-only tier (Pro $500 / eligible Enterprise/Edu) and is not requested here.
  return model.id.startsWith("gpt-5.6-")
    || model.id === "gpt-5.6"
    || model.id === "gpt-5.5"
    || model.id === "gpt-5.4"
    || model.id === "gpt-6-astra"
    || model.id === "gpt-6-sol"
    || model.id === "gpt-6.1-sol"
    || model.id === "gpt-6-luna";
}

export function creditMultiplierFor(model: ModelIdentity | undefined): string {
  return model?.id === "gpt-5.4" ? "2×" : "2,5×";
}

export function applyFastServiceTier(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return { ...(payload as ProviderPayload), service_tier: FAST_REQUEST_TIER };
}

export default function codexFastModeExtension(pi: ExtensionAPI) {
  let eligibleModelSelected = false;
  let fastRequestInFlight = false;
  let fastRequestAccepted = false;

  const updateStatus = (ctx: {
    sessionManager: { getSessionId(): string };
    ui: { setStatus(key: string, text: string | undefined): void };
  }) => {
    const state = getSharedFastState();
    const mode = getFastMode(state);
    const isOwner = state.ownerSessionId === ctx.sessionManager.getSessionId();
    const status = isOwner && mode === "subagents"
      ? "⚡ECO"
      : isOwner && mode === "all" && eligibleModelSelected
        ? fastRequestAccepted ? "⚡🟢" : "⚡🟡"
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

  pi.registerCommand("fast", {
    description: "Toggle OpenAI Codex Fast mode: /fast on | /fast eco | /fast off",
    getArgumentCompletions: async (prefix) => {
      const options = [
        ...(eligibleModelSelected
          ? [{ value: "on", label: "on", description: "1,5× faster; 2,5× GPT-5.6/5.5 credits" }]
          : []),
        { value: "eco", label: "eco", description: "Fast for eligible subagents only" },
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

      if (action !== "on") {
        ctx.ui.notify("Uso: /fast on | /fast eco | /fast off", "warning");
        return;
      }

      if (!isFastEligibleModel(model)) {
        ctx.ui.notify("Fast Mode is available only for supported OpenAI Codex models (GPT-5.6, GPT-5.5, GPT-5.4, or GPT-6 Astra).", "warning");
        return;
      }

      const sharedState = getSharedFastState();
      setFastMode(sharedState, "all", sessionId);
      eligibleModelSelected = true;
      fastRequestInFlight = false;
      fastRequestAccepted = false;
      updateStatus(ctx);
      notifyEnabled(ctx, model);
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
    fastRequestInFlight = false;
    fastRequestAccepted = false;
    updateStatus(ctx);
  });

  pi.on("model_select", (event, ctx) => {
    const modelChanged = event.previousModel?.provider !== event.model.provider
      || event.previousModel?.id !== event.model.id;
    eligibleModelSelected = isFastEligibleModel(event.model);
    const state = getSharedFastState();
    const isOwner = state.ownerSessionId === ctx.sessionManager.getSessionId();
    if (modelChanged && isOwner && getFastMode(state) === "all") {
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
    const appliesToRequest = mode === "all" || (mode === "subagents" && !isOwner);
    if (!appliesToRequest || !isFastEligibleModel(ctx.model)) return undefined;
    fastRequestInFlight = true;
    return applyFastServiceTier(event.payload);
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
    fastRequestInFlight = false;
    fastRequestAccepted = false;
    updateStatus(ctx);
  });
}

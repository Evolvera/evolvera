import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";

const STATUS_KEY = "codex-fast-mode";
const FAST_REQUEST_TIER = "priority";
const FAST_STATE_KEY = Symbol.for("evolvera.codex-fast-mode.state");

interface SharedFastState {
  enabled: boolean;
  ownerSessionId?: string;
}

const globalState = globalThis as typeof globalThis & { [key: symbol]: unknown };

function getSharedFastState(): SharedFastState {
  const existing = globalState[FAST_STATE_KEY];
  if (existing) return existing as SharedFastState;

  const state: SharedFastState = { enabled: false };
  globalState[FAST_STATE_KEY] = state;
  return state;
}

function resetFastStateForOwner(sessionId: string): void {
  const state = getSharedFastState();
  if (state.ownerSessionId !== sessionId) return;
  state.enabled = false;
  state.ownerSessionId = undefined;
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

  // The configured GPT-5.6 Sol/Terra/Luna IDs and GPT-6 Astra route support Fast mode.
  return model.id.startsWith("gpt-5.6-")
    || model.id === "gpt-5.6"
    || model.id === "gpt-5.5"
    || model.id === "gpt-5.4"
    || model.id === "gpt-6-astra";
}

export function creditMultiplierFor(model: ModelIdentity | undefined): string {
  return model?.id === "gpt-5.4" ? "2×" : "2,5×";
}

export function applyFastServiceTier(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return { ...(payload as ProviderPayload), service_tier: FAST_REQUEST_TIER };
}

export function filterFastCommandSuggestions(
  suggestions: Awaited<ReturnType<AutocompleteProvider["getSuggestions"]>>,
  eligible: boolean,
): Awaited<ReturnType<AutocompleteProvider["getSuggestions"]>> {
  if (eligible || !suggestions) return suggestions;

  const items = suggestions.items.filter((item: AutocompleteItem) => item.value !== "fast" && item.label !== "fast");
  return items.length > 0 ? { ...suggestions, items } : null;
}

export default function codexFastModeExtension(pi: ExtensionAPI) {
  let enabled = false;
  let eligibleModelSelected = false;
  let fastRequestInFlight = false;
  let fastRequestAccepted = false;
  let autocompleteInstalled = false;

  const updateStatus = (ctx: { ui: { setStatus(key: string, text: string | undefined): void } }) => {
    const status = enabled && eligibleModelSelected
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

  pi.registerCommand("fast", {
    description: "Toggle OpenAI Codex Fast mode: /fast on | /fast off",
    getArgumentCompletions: async (prefix) => {
      if (!eligibleModelSelected) return null;
      const options = [
        { value: "on", label: "on", description: "1,5× faster; 2,5× GPT-5.6/5.5 credits" },
        { value: "off", label: "off", description: "Use standard service tier" },
      ];
      return options.filter((option) => option.value.startsWith(prefix.trim().toLowerCase()));
    },
    handler: async (rawArgs, ctx) => {
      const action = rawArgs.trim().toLowerCase();
      const model = ctx.model;

      if (!isFastEligibleModel(model)) {
        ctx.ui.notify("Fast Mode is available only for supported OpenAI Codex models (GPT-5.6, GPT-5.5, or GPT-5.4).", "warning");
        return;
      }

      if (action === "on") {
        const sharedState = getSharedFastState();
        sharedState.enabled = true;
        sharedState.ownerSessionId = ctx.sessionManager.getSessionId();
        enabled = true;
        eligibleModelSelected = true;
        fastRequestInFlight = false;
        fastRequestAccepted = false;
        updateStatus(ctx);
        notifyEnabled(ctx, model);
        return;
      }

      if (action === "off") {
        resetFastStateForOwner(ctx.sessionManager.getSessionId());
        enabled = false;
        fastRequestInFlight = false;
        fastRequestAccepted = false;
        updateStatus(ctx);
        ctx.ui.notify("Fast Mode desativado. OpenAI Codex voltou ao service tier padrão.", "info");
        return;
      }

      ctx.ui.notify("Uso: /fast on | /fast off", "warning");
    },
  });

  pi.on("session_start", (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    resetFastStateForOwner(sessionId);
    eligibleModelSelected = isFastEligibleModel(ctx.model);
    enabled = false;
    fastRequestInFlight = false;
    fastRequestAccepted = false;
    updateStatus(ctx);

    if (ctx.mode !== "tui" || autocompleteInstalled) return;
    autocompleteInstalled = true;
    ctx.ui.addAutocompleteProvider((current) => ({
      triggerCharacters: current.triggerCharacters,
      async getSuggestions(lines, cursorLine, cursorCol, options) {
        const suggestions = await current.getSuggestions(lines, cursorLine, cursorCol, options);
        const textBeforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
        const showingTopLevelSlashCommands = textBeforeCursor.startsWith("/") && !textBeforeCursor.includes(" ");
        return showingTopLevelSlashCommands
          ? filterFastCommandSuggestions(suggestions, eligibleModelSelected)
          : suggestions;
      },
      applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
        return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
      },
      shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
        return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
      },
    }));
  });

  pi.on("model_select", (event, ctx) => {
    const modelChanged = event.previousModel?.provider !== event.model.provider
      || event.previousModel?.id !== event.model.id;
    eligibleModelSelected = isFastEligibleModel(event.model);
    if (modelChanged) {
      resetFastStateForOwner(ctx.sessionManager.getSessionId());
      enabled = false;
      fastRequestInFlight = false;
      fastRequestAccepted = false;
    }
    updateStatus(ctx);
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!getSharedFastState().enabled || !isFastEligibleModel(ctx.model)) return undefined;
    fastRequestInFlight = true;
    return applyFastServiceTier(event.payload);
  });

  pi.on("after_provider_response", (event, ctx) => {
    if (!fastRequestInFlight) return;
    fastRequestInFlight = false;
    fastRequestAccepted = event.status >= 200 && event.status < 300;
    updateStatus(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    resetFastStateForOwner(ctx.sessionManager.getSessionId());
    enabled = false;
    eligibleModelSelected = false;
    fastRequestInFlight = false;
    fastRequestAccepted = false;
    updateStatus(ctx);
  });
}

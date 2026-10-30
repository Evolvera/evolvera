import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, lstatSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { currentMode, MODE_CHANGED_EVENT } from "./orchestration-mode";

// Owns the runtime context window. Normal capacity policy is applied first; conductor sessions
// use 70% of that effective window. maxTokens and provider capacity stay unchanged.
// The contextMode preference remains global, while conductor status is read from this session's branch.
// Workers launched by a conductor (PI_REPORT_RUN) start on the default window and never save a preference.

export type ContextMode = "default" | "high";
export const CONTEXT_MODES: readonly ContextMode[] = ["default", "high"];
export const ANTHROPIC_NATIVE_CONTEXT_WINDOW = 1_000_000;
export const ANTHROPIC_APPLIED_CONTEXT_WINDOW = 450_000;
export const HIGH_CONTEXT_WINDOW = 800_000;
const SETTINGS_KEY = "contextMode";
const STATUS_KEY = "context-mode";
const HIGH_PROVIDERS = new Set(["anthropic", "openai", "openai-codex"]);
const QWEN_PROVIDER = "alibaba-plan";
const QWEN_MODEL = "qwen3.8-max-preview";
const QWEN_CONTEXT_WINDOW = 200_000;
const CONDUCTOR_RATIO = 0.7;
const ROUTED_MODEL_EVENT = "model-fallback:routed";
const VIRTUAL_ROUTER_PROVIDER = "fallback";

type RoutedPhysicalModel = { provider: string; modelId: string };

function readRoutedModel(payload: unknown): RoutedPhysicalModel | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const { provider, modelId } = payload as { provider?: unknown; modelId?: unknown };
  if (typeof provider !== "string" || !provider || typeof modelId !== "string" || !modelId) return undefined;
  return { provider, modelId };
}

export function effectiveDispatchModel<T extends { provider: string; id?: string }>(selected: T | undefined, routed: RoutedPhysicalModel | undefined): T | { provider: string; id: string } | undefined {
  if (selected?.provider !== VIRTUAL_ROUTER_PROVIDER || !routed) return selected;
  return { provider: routed.provider, id: routed.modelId };
}

export function isHighContextDispatchModel(selected: ModelContext | undefined, routed?: RoutedPhysicalModel): boolean {
  if (selected?.provider !== VIRTUAL_ROUTER_PROVIDER || !routed) return selected !== undefined && isHighContextModel(selected);
  // Virtual fallback chains qualify for High only on their codex primary; other providers retain
  // their own context sizing even when their model family normally qualifies for direct selection.
  return routed.provider === "openai-codex" && isHighContextModel({ provider: routed.provider, id: routed.modelId });
}

// Stored on the model object itself so a /reload (new extension instance, same model objects)
// still restores the real default instead of capturing an already-raised window.
const DEFAULT_WINDOW = Symbol.for("evolvera.context-mode.default-window");

type ModelContext = { provider: string; id?: string; contextWindow: number; [DEFAULT_WINDOW]?: number };

export function isHighContextModel(model: Pick<ModelContext, "provider" | "id">): boolean {
  if (!HIGH_PROVIDERS.has(model.provider) || !model.id) return false;
  const gpt = /^gpt-(\d+)(?:[.-]|$)/.exec(model.id);
  if (gpt) return Number(gpt[1]) >= 6;
  const claude = /^claude-(?:opus|sonnet|fable|haiku)-(\d+)(?:-|$)/.exec(model.id);
  return claude !== null && Number(claude[1]) >= 5;
}

function defaultWindow(model: ModelContext): number {
  const qwen = model.provider === QWEN_PROVIDER && model.id === QWEN_MODEL;
  if (qwen || model[DEFAULT_WINDOW] === undefined) {
    const base = qwen ? QWEN_CONTEXT_WINDOW
      : model.provider === "anthropic" && model.contextWindow === ANTHROPIC_NATIVE_CONTEXT_WINDOW
        ? ANTHROPIC_APPLIED_CONTEXT_WINDOW
        : model.contextWindow;
    try {
      Object.defineProperty(model, DEFAULT_WINDOW, { value: base, enumerable: false, configurable: true });
    } catch {
      return base;
    }
    return base;
  }
  return model[DEFAULT_WINDOW] as number;
}

/** Apply policy selection then optional session-local conductor reduction. */
export function applyContextMode(model: ModelContext | undefined, mode: ContextMode, conductor = false): boolean {
  if (!model || !Number.isSafeInteger(model.contextWindow)) return false;
  const base = defaultWindow(model);
  const normal = mode === "high" && isHighContextModel(model) ? HIGH_CONTEXT_WINDOW : base;
  const target = conductor ? Math.floor(normal * CONDUCTOR_RATIO) : normal;
  if (model.contextWindow === target) return false;
  model.contextWindow = target;
  return true;
}

export function parseContextMode(raw: unknown): ContextMode | undefined {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "high" || value === "max" || value === "alto") return "high";
  if (value === "default" || value === "padrao" || value === "padrão" || value === "normal") return "default";
  return undefined;
}

export function readContextMode(settingsPath: string): ContextMode {
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    return parseContextMode(parsed?.[SETTINGS_KEY]) ?? "default";
  } catch {
    return "default";
  }
}

/** Atomically set only `contextMode`, preserving every other key and the file mode. */
export function writeContextMode(settingsPath: string, mode: ContextMode): void {
  const entry = lstatSync(settingsPath, { throwIfNoEntry: false });
  if (entry && !entry.isFile()) throw new Error("settings.json must be a regular file");
  const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("settings.json is not an object");
  settings[SETTINGS_KEY] = mode;
  const fileMode = entry ? statSync(settingsPath).mode & 0o777 : 0o600;
  const dir = mkdtempSync(join(dirname(settingsPath), ".context-mode-"));
  try {
    const temporary = join(dir, "settings.json");
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: fileMode, flag: "wx" });
    renameSync(temporary, settingsPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Only the session's live model object matters: ctx.model and model_select's event.model are
// agent.state.model, while modelRegistry.getAll() returns fresh copies whose mutation has no effect.
function applyToSession(ctx: ExtensionContext, mode: ContextMode, routedModel?: RoutedPhysicalModel): void {
  const conductor = currentMode(ctx);
  const dispatchModel = mode === "high" ? effectiveDispatchModel(ctx.model, routedModel) : ctx.model;
  const targetModel = dispatchModel !== ctx.model && dispatchModel
    ? ctx.modelRegistry.find(dispatchModel.provider, dispatchModel.id)
    : ctx.model;
  const effectiveMode = mode === "high" && isHighContextDispatchModel(ctx.model, routedModel) ? mode : "default";
  applyContextMode(targetModel, effectiveMode, conductor === "conductor");
  const activeHigh = mode === "high" && isHighContextDispatchModel(ctx.model, routedModel);
  const effective = targetModel?.contextWindow;
  const showCapacity = conductor === "conductor" || activeHigh;
  ctx.ui?.setStatus?.(STATUS_KEY, showCapacity && effective ? `${Math.round(effective / 1000)}K` : undefined);
}

const RUN_ID_PATTERN = /^run_[A-Za-z0-9]+$/;

/** An Orca worker PI is launched by a conductor with PI_REPORT_RUN set; it is a separate process. */
export function isConductorChild(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.PI_REPORT_RUN === "string" && RUN_ID_PATTERN.test(env.PI_REPORT_RUN);
}

export default function contextMode(pi: ExtensionAPI, settingsPath = () => join(getAgentDir(), "settings.json")) {
  let mode: ContextMode = "default";
  let routedModel: RoutedPhysicalModel | undefined;
  pi.events?.on?.(ROUTED_MODEL_EVENT, (data: unknown) => { routedModel = readRoutedModel(data); });

  // Children created by a conductor always start on the default window; the saved High
  // preference belongs to the user's own sessions. They never write that preference either.
  pi.on("session_start", async (_event, ctx) => {
    mode = isConductorChild() ? "default" : readContextMode(settingsPath());
    applyToSession(ctx, mode, routedModel);
  });

  pi.events.on(MODE_CHANGED_EVENT, (data: unknown) => {
    if (!data || typeof data !== "object") return;
    const ctx = (data as { ctx?: unknown }).ctx;
    if (ctx && typeof ctx === "object") applyToSession(ctx as ExtensionContext, mode, routedModel);
  });

  pi.on("model_select", async (_event, ctx) => {
    applyToSession(ctx, mode, routedModel);
  });

  // Selecting the same model can replace its object without emitting model_select.
  pi.on("before_agent_start", async (_event, ctx) => {
    applyToSession(ctx, mode, routedModel);
  });

  pi.registerCommand("context-mode", {
    description: "Context window: default, or high (800K for GPT >= 6 and Claude >= 5). /context-mode [default|high|status]",
    getArgumentCompletions: (prefix: string) =>
      ["default", "high", "status"].filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value })),
    handler: async (rawArgs, ctx) => {
      const arg = rawArgs.trim();
      const show = () => {
        const window = ctx.model?.contextWindow;
        ctx.ui.notify(`Context mode: ${mode.toUpperCase()}${window ? ` · ${ctx.model?.id} ${Math.round(window / 1000)}K` : ""}`, "info");
      };
      if (arg.toLowerCase() === "status" || (arg === "" && !ctx.hasUI)) return show();
      let requested = parseContextMode(arg);
      if (arg === "") {
        const selected = await ctx.ui.select("Contexto — High: 800K para GPT ≥ 6 / Claude ≥ 5", ["Padrão", "High"]);
        if (!selected) return;
        requested = parseContextMode(selected);
      }
      if (!requested) {
        ctx.ui.notify("Uso: /context-mode [default|high|status]", "error");
        return;
      }
      try {
        if (!isConductorChild()) writeContextMode(settingsPath(), requested);
      } catch (error) {
        ctx.ui.notify(`Could not save context mode: ${(error as Error).message}`, "error");
        return;
      }
      mode = requested;
      applyToSession(ctx, mode, routedModel);
      show();
    },
  });
}

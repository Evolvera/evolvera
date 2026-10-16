import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, lstatSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Owns the runtime context window of Claude and GPT models. The window decides when PI compacts
// and what the footer's ctx gauge measures; maxTokens and the provider's actual capacity stay unchanged.
//   default: Anthropic native 1M windows are capped to 450K; every other model keeps its own value.
//   high:    GPT >= 6 and Claude >= 5 on first-party providers get 800K.
// The mode is global (`contextMode` in the agent settings.json) and applies to every session that
// loads this extension, including in-process subagents.

export type ContextMode = "default" | "high";
export const CONTEXT_MODES: readonly ContextMode[] = ["default", "high"];
export const ANTHROPIC_NATIVE_CONTEXT_WINDOW = 1_000_000;
export const ANTHROPIC_APPLIED_CONTEXT_WINDOW = 450_000;
export const HIGH_CONTEXT_WINDOW = 800_000;
const SETTINGS_KEY = "contextMode";
const STATUS_KEY = "context-mode";
const HIGH_PROVIDERS = new Set(["anthropic", "openai", "openai-codex"]);
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
  if (model[DEFAULT_WINDOW] === undefined) {
    const base = model.provider === "anthropic" && model.contextWindow === ANTHROPIC_NATIVE_CONTEXT_WINDOW
      ? ANTHROPIC_APPLIED_CONTEXT_WINDOW
      : model.contextWindow;
    try {
      Object.defineProperty(model, DEFAULT_WINDOW, { value: base, enumerable: false, configurable: true });
    } catch {
      return base;
    }
  }
  return model[DEFAULT_WINDOW] as number;
}

/** Set the model's window for `mode`; returns true when it changed. */
export function applyContextMode(model: ModelContext | undefined, mode: ContextMode): boolean {
  if (!model || !Number.isSafeInteger(model.contextWindow)) return false;
  const base = defaultWindow(model); // record the default before the first raise
  const target = mode === "high" && isHighContextModel(model) ? HIGH_CONTEXT_WINDOW : base;
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
function applyToSession(ctx: ExtensionContext, mode: ContextMode): void {
  applyContextMode(ctx.model, mode);
  const activeHigh = mode === "high" && ctx.model !== undefined && isHighContextModel(ctx.model);
  ctx.ui?.setStatus?.(STATUS_KEY, activeHigh ? `${HIGH_CONTEXT_WINDOW / 1000}K` : undefined);
}

export default function contextMode(pi: ExtensionAPI, settingsPath = () => join(getAgentDir(), "settings.json")) {
  let mode: ContextMode = "default";

  pi.on("session_start", async (_event, ctx) => {
    mode = readContextMode(settingsPath());
    applyToSession(ctx, mode);
  });

  pi.on("model_select", async (_event, ctx) => {
    applyToSession(ctx, mode);
  });

  // Selecting the same model can replace its object without emitting model_select.
  pi.on("before_agent_start", async (_event, ctx) => {
    applyToSession(ctx, mode);
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
        writeContextMode(settingsPath(), requested);
      } catch (error) {
        ctx.ui.notify(`Could not save context mode: ${(error as Error).message}`, "error");
        return;
      }
      mode = requested;
      applyToSession(ctx, mode);
      show();
    },
  });
}

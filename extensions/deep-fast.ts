import { existsSync, lstatSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Deep fast is a speed preference for the subagents that do the bulk of the work. It leaves the
// configured model setup alone: the chains keep their configured primaries, and this mode only
// changes which model a request uses while it is on.
//
// It has to work at the chain level. `pi-subagents` resolves a spawn as
// `modelInput: agentConfig?.model ?? params.model` (invocation-config.ts), so an agent file's
// `model:` outranks a model passed on the Agent call; every agent here pins one, which makes a
// per-call override unreachable. Swapping the chain primary is the lever that actually moves a
// subagent onto another model.
//
// Only the chains that serve the workhorse subagents are swapped:
//   luna    -> scout, general-purpose, deep-research-*     (low effort: they only locate evidence)
//   builder -> builder                                      (keeps the effort its agent declares)
//   heavy   -> builder-heavy                                (keeps the effort its agent declares)
// The sol/terra/conductor chains are deliberately untouched: they serve judgment work where the
// configured model is the point.

export const DEEP_FAST_SETTINGS_KEY = "deepFastMode";
export const DEEP_FAST_PROVIDER = "opengateway";
export const DEEP_FAST_MODEL = "deepseek/deepseek-v4.1-flash-ultrafast";
export const DEEP_FAST_TARGET = `${DEEP_FAST_PROVIDER}/${DEEP_FAST_MODEL}`;

type Step = { provider: string; model: string; level: string };
type Chain = readonly Step[];

/** Chains deep fast accelerates, and the effort each one runs at while it is on. */
export const DEEP_FAST_CHAINS: Readonly<Record<string, { thinking: string }>> = {
  luna: { thinking: "low" },
  builder: { thinking: "inherit" },
  heavy: { thinking: "inherit" },
};

/**
 * The chain deep fast serves for `chainId`. The fast primary replaces the configured one so the
 * request stays a single step, and the original attempts remain as fallbacks in their own order —
 * deep fast buys speed without giving up the chain's resilience. Chains outside
 * `DEEP_FAST_CHAINS` are returned untouched.
 */
export function deepFastChain(chainId: string, chain: Chain): Chain {
  const target = DEEP_FAST_CHAINS[chainId];
  if (!target) return chain;
  const primary = { provider: DEEP_FAST_PROVIDER, model: DEEP_FAST_MODEL, level: target.thinking };
  const rest = chain.filter((step) => step.provider !== primary.provider || step.model !== primary.model);
  return [primary, ...rest];
}

/** Defaults to off; a malformed or absent settings file never enables speed mode. */
export function readDeepFast(settingsPath: string): boolean {
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    return parsed?.[DEEP_FAST_SETTINGS_KEY] === true;
  } catch {
    return false;
  }
}

// The router asks for this on every request, so the flag is cached against the file's mtime: the
// read stays cheap while a hand-edited settings.json still takes effect on the next request.
const settingCache = new Map<string, { mtimeMs: number; enabled: boolean }>();

export function deepFastEnabled(settingsPath: string): boolean {
  try {
    const stat = statSync(settingsPath);
    const cached = settingCache.get(settingsPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.enabled;
    const enabled = readDeepFast(settingsPath);
    settingCache.set(settingsPath, { mtimeMs: stat.mtimeMs, enabled });
    return enabled;
  } catch {
    return false;
  }
}

/**
 * The chain a request should use, as the router sees it. Pure apart from reading the preference
 * from disk, so the router can call it directly: extension modules do not share in-memory state,
 * and an installed callback would never reach the router's own module instance.
 */
export function resolveDeepFastChain(
  chainId: string,
  chain: Chain,
  registry?: Parameters<typeof fastModelUsable>[0],
  settingsPath: string = join(getAgentDir(), "settings.json"),
): Chain {
  const enabled = deepFastEnabled(settingsPath);
  const usable = registry ? fastModelUsable(registry) : false;
  return effectiveChain(chainId, chain, { enabled, usable });
}

/** Atomically set only `deepFastMode`, preserving every other key and the file mode. */
export function writeDeepFast(settingsPath: string, enabled: boolean): void {
  const entry = lstatSync(settingsPath, { throwIfNoEntry: false });
  if (entry && !entry.isFile()) throw new Error("settings.json must be a regular file");
  const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("settings.json is not an object");
  settings[DEEP_FAST_SETTINGS_KEY] = enabled;
  const fileMode = entry ? statSync(settingsPath).mode & 0o777 : 0o600;
  const dir = mkdtempSync(join(dirname(settingsPath), ".deep-fast-"));
  try {
    const temporary = join(dir, "settings.json");
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: fileMode, flag: "wx" });
    renameSync(temporary, settingsPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** True only when the router provider and model are both present and credentialed. */
export function fastModelUsable(registry: { find?: (provider: string, modelId: string) => unknown; hasConfiguredAuth?: (model: unknown) => boolean } | undefined): boolean {
  const model = registry?.find?.(DEEP_FAST_PROVIDER, DEEP_FAST_MODEL);
  if (!model) return false;
  return registry?.hasConfiguredAuth?.(model) ?? false;
}

/**
 * The chain a request should actually use. Exported so the policy is testable without a runtime.
 * The fast chain only applies while the mode is on AND the router is usable; otherwise the
 * configured chain is returned unchanged, so a machine without the router key keeps working.
 */
export function effectiveChain(
  chainId: string,
  chain: Chain,
  options: { enabled: boolean; usable: boolean },
): Chain {
  if (!options.enabled || !options.usable) return chain;
  return deepFastChain(chainId, chain);
}

export default function deepFast(pi: ExtensionAPI, settingsPath = () => join(getAgentDir(), "settings.json")): void {
  // The mode takes effect through `resolveDeepFastChain`, which the fallback router calls per
  // request. This extension owns the preference and its command, nothing else.
  pi.registerCommand("deep-fast", {
    description: "Speed mode for delegation: scout, builder and builder-heavy run on the fastest model. /deep-fast [on|off|status]",
    getArgumentCompletions: (prefix: string) =>
      ["on", "off", "status"].filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value })),
    handler: async (rawArgs, ctx) => {
      const arg = rawArgs.trim().toLowerCase();
      const enabled = deepFastEnabled(settingsPath());
      const ready = fastModelUsable(ctx.modelRegistry);
      const show = () => ctx.ui.notify(
        enabled
          ? `Deep fast: ON · ${DEEP_FAST_TARGET}${ready ? "" : " · NOT USABLE (router key or model missing)"} · scout low, builders keep their effort`
          : "Deep fast: OFF · subagents use their configured models",
        ready || !enabled ? "info" : "warning",
      );
      if (arg === "status" || (arg === "" && !ctx.hasUI)) return show();
      let requested: boolean | undefined = arg === "on" ? true : arg === "off" ? false : undefined;
      if (arg === "") {
        const selected = await ctx.ui.select("Deep fast — subagentes no modelo mais rápido", ["Ligado", "Desligado"]);
        if (!selected) return;
        requested = selected === "Ligado";
      }
      if (requested === undefined) {
        ctx.ui.notify("Uso: /deep-fast [on|off|status]", "error");
        return;
      }
      try {
        writeDeepFast(settingsPath(), requested);
      } catch (error) {
        ctx.ui.notify(`Could not save deep fast: ${(error as Error).message}`, "error");
        return;
      }
      show();
    },
  });
}

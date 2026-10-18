import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Restores slash input that Git Bash (MSYS) rewrote into a Windows path.
 *
 * Observed failure: on Windows `pi` starts through Git's `sh.exe` wrapper and Orca
 * injects the prompt as an argv argument (and as ORCA_PI_PREFILL). MSYS converts any
 * argument/env value that looks like a POSIX path when it launches a native program,
 * so `/fast ultra` reached PI as `C:/Program Files/Git/fast ultra` and went to the model
 * as plain text instead of running the command.
 */

export const PREFILL_ENV = "ORCA_PI_PREFILL";

/** Windows paths of the MSYS root (`/`) for the usual Git for Windows installs. */
export function msysRoots(env: Record<string, string | undefined> = process.env): string[] {
  const clean = (value: string | undefined) => value?.replace(/\\/g, "/").replace(/\/+$/, "") || undefined;
  const localAppData = clean(env.LOCALAPPDATA);
  const bases = [clean(env.ProgramFiles), clean(env["ProgramFiles(x86)"]), clean(env.ProgramW6432), localAppData && `${localAppData}/Programs`];
  const roots = bases.filter((base): base is string => base !== undefined).map((base) => `${base}/Git`);
  return [...new Set(roots)];
}

/** `C:/Program Files/Git/fast ultra` → `/fast ultra`; undefined when the text was not mangled. */
export function restoreMangledSlash(text: string, roots: string[]): string | undefined {
  const lower = text.toLowerCase();
  for (const root of roots) {
    const prefix = `${root.toLowerCase()}/`;
    if (lower.startsWith(prefix) && /^[^\s/]/.test(text.slice(prefix.length))) return `/${text.slice(prefix.length)}`;
  }
  return undefined;
}

type CommandInfo = { name: string; source: string };

export default function msysSlashRestore(pi: ExtensionAPI): void {
  const roots = msysRoots();
  // Runs at load, before Orca's prefill extension copies the value into the editor on session_start.
  const prefill = process.env[PREFILL_ENV];
  const restoredPrefill = prefill === undefined ? undefined : restoreMangledSlash(prefill, roots);
  if (restoredPrefill !== undefined) process.env[PREFILL_ENV] = restoredPrefill;

  pi.on("input", async (event, ctx) => {
    const restored = restoreMangledSlash(event.text, roots);
    if (restored === undefined) return;
    const name = restored.slice(1).split(/\s/, 1)[0];
    const command = (pi.getCommands() as CommandInfo[]).find((info) => info.name === name);
    // Prompt templates and skills are expanded after this event, so the restored text works as is.
    if (command && command.source !== "extension") return { action: "transform", text: restored };
    if (!ctx.hasUI) return { action: "transform", text: restored };
    // Commands are dispatched before this event and cannot be re-dispatched by an extension.
    ctx.ui.setEditorText(restored);
    ctx.ui.notify(`O Git Bash transformou "${restored}" em caminho do Windows. Texto restaurado no editor: pressione Enter.`, "warning");
    return { action: "handled" };
  });
}

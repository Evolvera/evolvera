import { CONFIG_DIR_NAME, getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const EXECUTION_MODES = ["supervised", "autonomous", "yolo"] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];
export const EXECUTION_SCOPES = ["global", "project", "session"] as const;
export type ExecutionModeScope = (typeof EXECUTION_SCOPES)[number];

const SETTINGS_KEY = "executionMode";
const SESSION_ENTRY_TYPE = "execution-mode";
const INSTRUCTION_START = "<!-- PI EXECUTION MODE START -->";
const INSTRUCTION_END = "<!-- PI EXECUTION MODE END -->";
const SAFE_CONFIGURATION_DIAGNOSTIC = "Execution mode configuration is invalid; using SUPERVISIONADO fail-safe.";

const MODE_ALIASES: Record<string, ExecutionMode> = {
  supervised: "supervised",
  supervisionado: "supervised",
  autonomous: "autonomous",
  autônomo: "autonomous",
  autonomo: "autonomous",
  "autônomo até pr": "autonomous",
  "autonomo ate pr": "autonomous",
  yolo: "yolo",
};

const MODE_LABELS: Record<ExecutionMode, string> = {
  supervised: "SUPERVISIONADO",
  autonomous: "AUTÔNOMO",
  yolo: "YOLO",
};

export type ResolvedExecutionMode = {
  mode: ExecutionMode;
  source: "session" | "project" | "global" | "default";
  diagnostic?: string;
};

export function parseExecutionMode(value: unknown): ExecutionMode | undefined {
  if (typeof value !== "string") return undefined;
  const key = value.trim().toLowerCase();
  return Object.hasOwn(MODE_ALIASES, key) ? MODE_ALIASES[key] : undefined;
}

export function parseExecutionScope(value: unknown): ExecutionModeScope | undefined {
  return typeof value === "string" && EXECUTION_SCOPES.includes(value.trim().toLowerCase() as ExecutionModeScope)
    ? value.trim().toLowerCase() as ExecutionModeScope
    : undefined;
}

export function executionModeLabel(mode: ExecutionMode): string {
  return MODE_LABELS[mode];
}

type ReadResult = { mode?: ExecutionMode; invalid: boolean };

function readConfiguredMode(path: string): ReadResult {
  if (!existsSync(path)) return { invalid: false };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { invalid: true };
    const configured = (parsed as Record<string, unknown>)[SETTINGS_KEY];
    if (configured === undefined) return { invalid: false };
    const mode = parseExecutionMode(configured);
    return mode ? { mode, invalid: false } : { invalid: true };
  } catch {
    return { invalid: true };
  }
}

function readSessionMode(sessionManager: unknown): ReadResult {
  if (!sessionManager || typeof (sessionManager as { getBranch?: unknown }).getBranch !== "function") {
    return { invalid: false };
  }
  try {
    const branch = (sessionManager as { getBranch: () => unknown[] }).getBranch();
    for (let index = branch.length - 1; index >= 0; index -= 1) {
      const entry = branch[index] as { type?: unknown; customType?: unknown; data?: unknown };
      if (entry?.type !== "custom" || entry.customType !== SESSION_ENTRY_TYPE) continue;
      const data = entry.data as { mode?: unknown } | undefined;
      const mode = parseExecutionMode(data?.mode);
      return mode ? { mode, invalid: false } : { invalid: true };
    }
  } catch {
    return { invalid: true };
  }
  return { invalid: false };
}

export function resolveExecutionModeState(
  cwd: string,
  projectTrusted: boolean,
  agentDir = getAgentDir(),
  sessionManager?: unknown,
): ResolvedExecutionMode {
  const session = readSessionMode(sessionManager);
  if (session.mode) return { mode: session.mode, source: "session" };
  if (session.invalid) return { mode: "supervised", source: "session", diagnostic: SAFE_CONFIGURATION_DIAGNOSTIC };

  if (projectTrusted) {
    const project = readConfiguredMode(join(cwd, CONFIG_DIR_NAME, "settings.json"));
    if (project.mode) return { mode: project.mode, source: "project" };
    if (project.invalid) return { mode: "supervised", source: "project", diagnostic: SAFE_CONFIGURATION_DIAGNOSTIC };
  }

  const global = readConfiguredMode(join(agentDir, "settings.json"));
  if (global.mode) return { mode: global.mode, source: "global" };
  if (global.invalid) return { mode: "supervised", source: "global", diagnostic: SAFE_CONFIGURATION_DIAGNOSTIC };
  return { mode: "autonomous", source: "default" };
}

export function resolveExecutionMode(
  cwd: string,
  projectTrusted: boolean,
  agentDir = getAgentDir(),
  sessionManager?: unknown,
): ExecutionMode {
  return resolveExecutionModeState(cwd, projectTrusted, agentDir, sessionManager).mode;
}

function modeInstruction(mode: ExecutionMode): string {
  switch (mode) {
    case "supervised":
      return `EXECUTION MODE: SUPERVISIONADO
The user approves each meaningful proposed stage or effect. Do not repeatedly ask inside an unchanged approved stage; stop before a meaningful new stage or effect, or a material target/method/scope change—not for ordinary safe implementation details inside that stage.`;
    case "yolo":
      return `EXECUTION MODE: YOLO
This is explicit task-scoped broader finishing authority. Never ask permission for a local, reversible, in-scope step (diagnostic build, instrumentation, local test, fix of a found defect, branch commit); asking for one is a defect in this mode. Never repeat an authorization question: any user reply other than an explicit no is a yes for the pending action; execute it now. A bug report asks for a fix unless the user explicitly asks only for a diagnosis: never end a turn on a diagnosis while a fix is in reach; fix every found defect, build, test, then report. Complete the approved software-delivery scope through merge only after the required independent final-head review and checks; a direct user order to merge waives that review, not the repository's required checks, and approves the deploy that merge triggers. Deploy, migration, deletion, publication, sending, purchase, and other consequential effects remain separately named and approved.`;
    case "autonomous":
      return `EXECUTION MODE: AUTÔNOMO
Carry the authorized outcome through evidence, in-scope work, safe validation, and delivery without asking to continue. Invent no final external effect; a software PR is conditional on the request or workflow, and stop before merge unless merge is explicitly authorized.`;
  }
}

const COMMON_EXECUTION_CONTRACT = `EXECUTION MODE RUNTIME CONTRACT
This general execution mode applies to research, analysis, writing, configuration, coding, file work, and explicitly authorized operations. A saved mode is a behavior preference, not proof of action authority. It never widens a delegated role, write/tool scope, or campaign grant; it is not runtime, sandbox, credential, or tool-permission access. Preserve authorization, grant provenance, effect-scope, and all safety gates. A changed target, method, scope, evidence, failure state, or blast radius requires reconciliation; evidence and readiness checks are not permission. Use ordinary judgment: carry out necessary, evidence-backed, safe and reversible in-scope steps without requesting separate approval for internal details. Ask only when a concrete unresolved user decision, material consequence, or explicit approval boundary requires the answer; a routine choice of tool, internal path, or diagnostic step is not such a boundary. Continue through safe in-scope work without a repeated “may I continue?” question, but stop at the requested-deliverable boundary or for unresolved material authority.`;

export function executionInstruction(mode: ExecutionMode): string {
  return `${COMMON_EXECUTION_CONTRACT}\n${modeInstruction(mode)}`;
}

export function formatExecutionModeReceipt(state: ResolvedExecutionMode): string {
  return `EXECUTION_MODE=${JSON.stringify({ mode: state.mode, source: state.source, ...(state.diagnostic ? { valid: false } : {}) })}`;
}

/** Human-facing footer label. Keep the machine receipt separate for Flow admission. */
export function formatExecutionModeStatus(state: Pick<ResolvedExecutionMode, "mode" | "source">): string {
  return `MODE  ${MODE_LABELS[state.mode]} · ${state.source.toUpperCase()}`;
}

function writeConfiguredMode(path: string, mode: ExecutionMode): void {
  let settings: Record<string, unknown> = {};
  let fileMode: number | undefined;
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (entry && !entry.isFile()) throw new Error("Settings must be a regular file; no link or resource replacement is allowed.");
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      settings = parsed as Record<string, unknown>;
      fileMode = statSync(path).mode & 0o777;
    } catch {
      throw new Error("Could not save execution mode: settings file is invalid or unavailable.");
    }
  }
  settings[SETTINGS_KEY] = mode;
  mkdirSync(dirname(path), { recursive: true });
  const temporaryDir = mkdtempSync(join(dirname(path), ".execution-mode-"));
  const temporary = join(temporaryDir, "settings.json");
  try {
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: fileMode ?? 0o600, flag: "wx" });
    renameSync(temporary, path);
  } catch {
    throw new Error("Could not save execution mode: settings file is invalid or unavailable.");
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }
}

function cleanInjectedInstruction(prompt: string): string {
  const block = new RegExp(`\\n?${INSTRUCTION_START}[\\s\\S]*?${INSTRUCTION_END}\\n?`, "g");
  return prompt.replace(block, "").trimEnd();
}

function showState(ctx: ExtensionContext, state: ResolvedExecutionMode, notify = true): void {
  const receipt = formatExecutionModeReceipt(state);
  ctx.ui?.setStatus?.("execution-mode", formatExecutionModeStatus(state));
  if (notify) ctx.ui?.notify?.(receipt, "info");
  if (state.diagnostic) ctx.ui?.notify?.(SAFE_CONFIGURATION_DIAGNOSTIC, "warning");
}

export default function executionModeExtension(pi: ExtensionAPI) {
  pi.registerCommand("execution-mode", {
    description: "Set execution mode: supervised, autonomous, or yolo ([mode] [global|project|session])",
    handler: async (rawArgs, ctx) => {
      const parts = rawArgs.trim().split(/\s+/).filter(Boolean);
      const first = parts[0]?.toLowerCase();
      if (first === "status") {
        if (parts.length !== 1) {
          ctx.ui.notify("Usage: /execution-mode status", "error");
          return;
        }
        showState(ctx, resolveExecutionModeState(ctx.cwd, ctx.isProjectTrusted(), getAgentDir(), ctx.sessionManager));
        return;
      }

      const explicitScope = parts.length > 1 ? parseExecutionScope(parts.at(-1)) : undefined;
      if (explicitScope) parts.pop();
      const requestedMode = parseExecutionMode(parts.join(" "));
      const requestedScope = explicitScope ?? "global";
      if (parts.length && !requestedMode) {
        ctx.ui.notify("Invalid mode. Use supervised, autonomous, or yolo.", "error");
        return;
      }
      let mode = requestedMode;
      if (!mode) {
        if (!ctx.hasUI) {
          ctx.ui.notify("Usage: /execution-mode <supervised|autonomous|yolo> [global|project|session]", "error");
          return;
        }
        const selected = await ctx.ui.select("Execution mode", EXECUTION_MODES.map(executionModeLabel));
        mode = parseExecutionMode(selected);
        if (!mode) return;
      }
      if (!mode) return;

      const scope = requestedScope ?? "global";
      if (scope === "project" && !ctx.isProjectTrusted()) {
        ctx.ui.notify("Project settings are not trusted; refusing to write project execution mode.", "error");
        return;
      }

      try {
        if (scope === "session") {
          if (!ctx.sessionManager || typeof ctx.sessionManager.getBranch !== "function" || !ctx.sessionManager.getSessionFile?.()) {
            throw new Error("Could not save execution mode: session persistence is unavailable.");
          }
          pi.appendEntry(SESSION_ENTRY_TYPE, { mode });
          const state = resolveExecutionModeState(ctx.cwd, ctx.isProjectTrusted(), getAgentDir(), ctx.sessionManager);
          if (state.diagnostic || state.source !== "session" || state.mode !== mode) {
            throw new Error("Could not save execution mode: session readback did not verify the requested mode.");
          }
          showState(ctx, state);
          return;
        }

        const path = scope === "project"
          ? join(ctx.cwd, CONFIG_DIR_NAME, "settings.json")
          : join(getAgentDir(), "settings.json");
        writeConfiguredMode(path, mode);
        const state = resolveExecutionModeState(ctx.cwd, ctx.isProjectTrusted(), getAgentDir(), ctx.sessionManager);
        showState(ctx, state);
      } catch {
        ctx.ui.notify("Could not save execution mode; no success receipt was emitted.", "error");
      }
    },
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const state = resolveExecutionModeState(ctx.cwd, ctx.isProjectTrusted(), getAgentDir(), ctx.sessionManager);
    const diagnostic = state.diagnostic ? `\nCONFIGURATION DIAGNOSTIC: ${state.diagnostic}` : "";
    const instruction = `${INSTRUCTION_START}\n${formatExecutionModeReceipt(state)}\n${executionInstruction(state.mode)}${diagnostic}\n${INSTRUCTION_END}`;
    ctx.ui?.setStatus?.("execution-mode", formatExecutionModeStatus(state));
    if (state.diagnostic) ctx.ui?.notify?.(SAFE_CONFIGURATION_DIAGNOSTIC, "warning");
    const base = cleanInjectedInstruction(event.systemPrompt ?? "");
    return { systemPrompt: `${base}${base ? "\n\n" : ""}${instruction}` };
  });
}

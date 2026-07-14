import { CONFIG_DIR_NAME, getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const COMMUNICATION_MODES = ["default", "default+caveman", "caveman"] as const;
export type CommunicationMode = (typeof COMMUNICATION_MODES)[number];

const SETTINGS_KEY = "communicationMode";

export function parseCommunicationMode(value: unknown): CommunicationMode | undefined {
  return typeof value === "string" && COMMUNICATION_MODES.includes(value as CommunicationMode)
    ? (value as CommunicationMode)
    : undefined;
}

function readConfiguredMode(path: string): CommunicationMode | undefined {
  if (!existsSync(path)) return undefined;
  const settings = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  return parseCommunicationMode(settings[SETTINGS_KEY]);
}

export function resolveCommunicationMode(
  cwd: string,
  projectTrusted: boolean,
  agentDir = getAgentDir(),
): CommunicationMode {
  if (projectTrusted) {
    const projectMode = readConfiguredMode(join(cwd, CONFIG_DIR_NAME, "settings.json"));
    if (projectMode) return projectMode;
  }
  return readConfiguredMode(join(agentDir, "settings.json")) ?? "default";
}

export function isPrimaryOrchestratorPrompt(customPrompt: unknown): boolean {
  return typeof customPrompt === "string" && customPrompt.trimStart().startsWith("# PI Coding Agent");
}

const SHARED_COMMUNICATION_CONTRACT = `
COMMUNICATION CONTRACT — ALL MODES
Lead with the conclusion. For tool-heavy work, briefly state the understood outcome and first action before using tools; add a short checklist only when there are multiple deliverables. Avoid ceremonial restatement and unnecessary process narration. Final reports state intentional changes, validation/result, material caveats or unresolved risks, and a next action only when one exists. Never let communication style remove evidence, a safety caveat, blocker, authorization request, or exact technical detail.`;

const DEFAULT_STYLE = `
COMMUNICATION MODE: DEFAULT
Communicate naturally, directly, and proportionately.`;

const CAVEMAN_SUMMARY_STYLE = `
COMMUNICATION MODE ADDITION: CAVEMAN SUMMARY
Use normal default-style communication. In the FINAL response only, append this section after the normal answer:

Resumo caveman:
- <1–3 very short telegraphic lines in the user's language>

The caveman summary must restate only the conclusion, material validation/result, and unresolved next step when one exists. Use simple words and clipped grammar, but never add claims or alter exact commands, code, paths, hashes, identifiers, errors, numbers, or quoted text. Do not append the section to intermediate progress updates.`;

const CAVEMAN_STYLE = `
COMMUNICATION MODE: CAVEMAN
Write all user-facing prose in unmistakable caveman style in the user's language. Keep the full technical depth; simplify language, not reasoning or coverage. Use simple concrete words, clipped grammar, minimal articles/auxiliary verbs, and direct cause/effect explanations. Multi-paragraph explanation is good when outcome needs it. Explain trade-offs and failure modes concretely, like: \`Sistema morrer no meio. Pagamento ficar preso. Ninguém saber quem continua.\` Do not merely write concise standard prose and do not reduce every answer to a few fragments. Preserve commands, code blocks, paths, hashes, identifiers, errors, numbers, tables, and quoted text exactly. Clarity and correctness beat the gimmick; internal reasoning, tool inputs, code, and delegated prompts remain normal technical language.`;

export function communicationInstruction(mode: CommunicationMode): string {
  const style = mode === "default"
    ? DEFAULT_STYLE
    : mode === "default+caveman"
      ? `${DEFAULT_STYLE}\n${CAVEMAN_SUMMARY_STYLE}`
      : CAVEMAN_STYLE;
  return `${SHARED_COMMUNICATION_CONTRACT}\n${style}`;
}

function writeConfiguredMode(path: string, mode: CommunicationMode): void {
  mkdirSync(dirname(path), { recursive: true });
  const settings = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>)
    : {};
  settings[SETTINGS_KEY] = mode;

  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export default function communicationStyleExtension(pi: ExtensionAPI) {
  pi.registerCommand("communication-mode", {
    description: "Set communication style: default, default+caveman, or caveman ([mode] [global|project])",
    handler: async (rawArgs, ctx) => {
      const parts = rawArgs.trim().split(/\s+/).filter(Boolean);
      const requestedMode = parseCommunicationMode(parts[0]);
      const requestedScope = parts[1];

      if (parts[0] && !requestedMode) {
        ctx.ui.notify(`Invalid mode. Use: ${COMMUNICATION_MODES.join(", ")}`, "error");
        return;
      }
      if (requestedScope && requestedScope !== "global" && requestedScope !== "project") {
        ctx.ui.notify("Invalid scope. Use global or project.", "error");
        return;
      }

      let mode = requestedMode;
      if (!mode) {
        if (!ctx.hasUI) {
          ctx.ui.notify(`Usage: /communication-mode <${COMMUNICATION_MODES.join("|")}> [global|project]`, "error");
          return;
        }
        const selected = await ctx.ui.select("Communication mode", [...COMMUNICATION_MODES]);
        mode = parseCommunicationMode(selected);
        if (!mode) return;
      }

      const scope = requestedScope ?? "global";
      if (scope === "project" && !ctx.isProjectTrusted()) {
        ctx.ui.notify("Project settings are not trusted; refusing to write project communication mode.", "error");
        return;
      }

      const path = scope === "project"
        ? join(ctx.cwd, CONFIG_DIR_NAME, "settings.json")
        : join(getAgentDir(), "settings.json");

      try {
        writeConfiguredMode(path, mode);
        const effective = resolveCommunicationMode(ctx.cwd, ctx.isProjectTrusted());
        const suffix = effective === mode ? "" : ` Effective mode remains ${effective} because a project override wins.`;
        ctx.ui.notify(`Communication mode saved as ${mode} (${scope}).${suffix}`, "info");
      } catch (error) {
        ctx.ui.notify(`Could not update ${path}: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });

  pi.on("before_agent_start", async (event, ctx) => {
    // Subagents commonly load global extensions too. Style only the primary PI
    // orchestrator; never contaminate builder/planner prompts or their reports.
    if (!isPrimaryOrchestratorPrompt(event.systemPromptOptions.customPrompt)) return undefined;

    let mode: CommunicationMode;
    try {
      mode = resolveCommunicationMode(ctx.cwd, ctx.isProjectTrusted());
    } catch {
      mode = "default";
    }
    const instruction = communicationInstruction(mode);
    return { systemPrompt: `${event.systemPrompt}\n\n${instruction}` };
  });
}

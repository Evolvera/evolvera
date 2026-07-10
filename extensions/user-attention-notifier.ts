import { execFile } from "node:child_process";
import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const NEEDS_USER_MARKER = "<!-- pi:needs-user -->";
const ATTENTION_INSTRUCTION = `When you cannot continue without a user decision, authorization, required information, or an external user action, append the exact marker ${NEEDS_USER_MARKER} to the final assistant text. Use it only when work is genuinely blocked waiting for the user—not for optional next steps, normal completion, or rhetorical questions. Never mention or explain the marker.`;

type MessageLike = {
  role?: unknown;
  content?: unknown;
};

type TextPart = {
  type?: unknown;
  text?: unknown;
};

function stripMarker(message: MessageLike): { found: boolean; message: MessageLike } {
  if (message.role !== "assistant") return { found: false, message };

  if (typeof message.content === "string") {
    if (!message.content.includes(NEEDS_USER_MARKER)) return { found: false, message };
    return {
      found: true,
      message: { ...message, content: message.content.replaceAll(NEEDS_USER_MARKER, "").trimEnd() },
    };
  }

  if (!Array.isArray(message.content)) return { found: false, message };
  let found = false;
  const content = message.content.map((part: TextPart) => {
    if (part?.type !== "text" || typeof part.text !== "string" || !part.text.includes(NEEDS_USER_MARKER)) return part;
    found = true;
    return { ...part, text: part.text.replaceAll(NEEDS_USER_MARKER, "").trimEnd() };
  });

  return found ? { found, message: { ...message, content } } : { found: false, message };
}

function projectName(cwd: string): string {
  return basename(cwd.replace(/[\\/]+$/, "")) || "PI";
}

function nativeNotify(title: string, body: string): void {
  if (process.platform === "darwin") {
    const script = `const app = Application.currentApplication(); app.includeStandardAdditions = true; app.displayNotification(${JSON.stringify(body)}, { withTitle: ${JSON.stringify(title)}, soundName: "Glass" });`;
    execFile("osascript", ["-l", "JavaScript", "-e", script], (error) => {
      if (error) process.stdout.write("\x07");
    });
    return;
  }

  if (process.platform === "linux") {
    execFile("notify-send", [title, body], (error) => {
      if (error) process.stdout.write("\x07");
    });
    return;
  }

  process.stdout.write("\x07");
}

export default function userAttentionNotifier(pi: ExtensionAPI) {
  let enabled = process.env.PI_ATTENTION_NOTIFICATIONS !== "0";
  let needsUser = false;

  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${ATTENTION_INSTRUCTION}`,
  }));

  pi.on("agent_start", async () => {
    needsUser = false;
  });

  pi.on("message_end", async (event) => {
    const message = event.message as MessageLike;
    if (message.role !== "assistant") return;
    const stripped = stripMarker(message);
    needsUser = stripped.found;
    if (!stripped.found) return;
    return { message: stripped.message as typeof event.message };
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!enabled || !needsUser || ctx.mode !== "tui") return;
    needsUser = false;
    const project = projectName(ctx.cwd);
    const title = `PI precisa de você — ${project}`;
    const body = "Aguardando uma decisão, autorização ou informação para continuar.";
    nativeNotify(title, body);
    if (ctx.hasUI) ctx.ui.notify(title, "warning");
  });

  pi.registerCommand("attention", {
    description: "Control user-attention desktop notifications: status, on, off, test",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase() || "status";
      if (action === "on") enabled = true;
      else if (action === "off") enabled = false;
      else if (action === "test") {
        const title = `PI precisa de você — ${projectName(ctx.cwd)}`;
        nativeNotify(title, "Notificação de teste.");
      } else if (action !== "status") {
        if (ctx.hasUI) ctx.ui.notify("Uso: /attention status|on|off|test", "warning");
        return;
      }

      if (ctx.hasUI) ctx.ui.notify(`Attention notifications: ${enabled ? "on" : "off"}`, "info");
    },
  });
}

import { execFile } from "node:child_process";
import { basename } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const APP_NAME = "Gigavera";
const NOTIFICATION_DELAY_MS = 1_200;

function projectName(cwd: string): string {
  return basename(cwd.replace(/[\\/]+$/, "")) || APP_NAME;
}

export function isPrimaryOrchestratorPrompt(customPrompt: unknown): boolean {
  return typeof customPrompt === "string" && customPrompt.trimStart().startsWith("# PI Coding Agent");
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

export function registerUserAttentionNotifier(
  pi: ExtensionAPI,
  notify: (title: string, body: string) => void = nativeNotify,
  notificationDelayMs = NOTIFICATION_DELAY_MS,
) {
  let enabled = process.env.PI_ATTENTION_NOTIFICATIONS !== "0";
  let primaryOrchestrator = false;
  let lifecycleGeneration = 0;
  let pendingNotification: ReturnType<typeof setTimeout> | undefined;

  const cancelPendingNotification = () => {
    lifecycleGeneration += 1;
    if (pendingNotification) clearTimeout(pendingNotification);
    pendingNotification = undefined;
  };

  pi.on("before_agent_start", async (event) => {
    primaryOrchestrator = isPrimaryOrchestratorPrompt(event.systemPromptOptions.customPrompt);
    cancelPendingNotification();
  });

  pi.on("agent_start", async () => {
    // Automatic retries and queued continuations start a new agent lifecycle.
    // Invalidate any notification scheduled by the preceding transient agent_end.
    cancelPendingNotification();
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!enabled || ctx.mode !== "tui" || !primaryOrchestrator) return;

    const generation = ++lifecycleGeneration;
    pendingNotification = setTimeout(() => {
      pendingNotification = undefined;
      if (generation !== lifecycleGeneration) return;
      if (!ctx.isIdle() || ctx.hasPendingMessages()) return;

      const title = projectName(ctx.cwd);
      notify(title, "O agente terminou e está te aguardando.");
    }, notificationDelayMs);
  });

  pi.on("session_shutdown", async () => {
    cancelPendingNotification();
  });

  pi.registerCommand("attention", {
    description: "Control main-orchestrator idle notifications: status, on, off, test",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase() || "status";
      if (action === "on") enabled = true;
      else if (action === "off") {
        enabled = false;
        cancelPendingNotification();
      } else if (action === "test") {
        notify(`${APP_NAME} precisa de você — ${projectName(ctx.cwd)}`, "Notificação de teste.");
      } else if (action !== "status") {
        if (ctx.hasUI) ctx.ui.notify("Uso: /attention status|on|off|test", "warning");
        return;
      }

      if (ctx.hasUI) ctx.ui.notify(`Attention notifications: ${enabled ? "on" : "off"}`, "info");
    },
  });
}

export default function userAttentionNotifier(pi: ExtensionAPI) {
  registerUserAttentionNotifier(pi);
}

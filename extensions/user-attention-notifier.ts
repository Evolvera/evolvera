import { execFile } from "node:child_process";
import { basename } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const APP_NAME = "Gigavera";

function projectName(cwd: string): string {
  return basename(cwd.replace(/[\\/]+$/, "")) || APP_NAME;
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

  pi.on("agent_end", async (_event, ctx) => {
    if (!enabled || ctx.mode !== "tui") return;
    const title = `${APP_NAME} precisa de você — ${projectName(ctx.cwd)}`;
    nativeNotify(title, "O chat terminou e está aguardando sua próxima mensagem.");
  });

  pi.registerCommand("attention", {
    description: "Control chat-stop desktop notifications: status, on, off, test",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase() || "status";
      if (action === "on") enabled = true;
      else if (action === "off") enabled = false;
      else if (action === "test") {
        nativeNotify(`${APP_NAME} precisa de você — ${projectName(ctx.cwd)}`, "Notificação de teste.");
      } else if (action !== "status") {
        if (ctx.hasUI) ctx.ui.notify("Uso: /attention status|on|off|test", "warning");
        return;
      }

      if (ctx.hasUI) ctx.ui.notify(`Attention notifications: ${enabled ? "on" : "off"}`, "info");
    },
  });
}

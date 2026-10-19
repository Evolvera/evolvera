import { renderTerminalArt } from "../ui/terminal-art.mjs";

const KEY = "startup-art-managed";
const terminalColor = () => process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";

/** Create the managed-root startup art lifecycle without introducing transcript content. */
export function createStartupArtFactory({ label, sessionManager, color = terminalColor() }) {
  if (!sessionManager) throw new TypeError("sessionManager is required");
  let startupHandled = false;
  let visible = false;

  return (api) => {
    const clear = (ctx) => {
      if (!visible || ctx?.mode !== "tui" || ctx.sessionManager !== sessionManager) return;
      visible = false;
      ctx.ui?.setWidget(KEY, undefined);
    };
    api.on("session_start", (event, ctx) => {
      if (startupHandled || event?.reason !== "startup" || ctx?.mode !== "tui" || ctx.sessionManager !== sessionManager) return;
      if (!ctx.hasUI || typeof ctx.ui?.setWidget !== "function") return;
      startupHandled = true;
      visible = true;
      ctx.ui.setWidget(KEY, (tui) => ({
        render(width) {
          const rows = Number.isFinite(tui.terminal?.rows) ? tui.terminal.rows : 24;
          const height = Math.min(12, Math.max(0, rows - 10));
          return height >= 4 ? renderTerminalArt({ width, height, label, color }) : [];
        },
        invalidate() {},
      }), { placement: "aboveEditor" });
    });
    api.on("input", (_event, ctx) => clear(ctx));
    api.on("before_agent_start", (_event, ctx) => clear(ctx));
    api.on("session_shutdown", (_event, ctx) => clear(ctx));
  };
}

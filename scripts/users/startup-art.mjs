import { renderTerminalArt } from "../ui/terminal-art.mjs";
import { startArtAnimation } from "../ui/terminal-art-animation.mjs";

const KEY = "startup-art-managed";
const terminalColor = () => process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";

/** Create the managed-root startup art lifecycle without introducing transcript content. */
export function createStartupArtFactory({ label, sessionManager, color = terminalColor(), animate = process.env.TERM !== "dumb", animationClock } = {}) {
  if (!sessionManager) throw new TypeError("sessionManager is required");
  let startupHandled = false;
  let visible = false;
  let stopAnimation;

  return (api) => {
    const clear = (ctx) => {
      if (!visible || ctx?.mode !== "tui" || ctx.sessionManager !== sessionManager) return;
      stopAnimation?.();
      stopAnimation = undefined;
      visible = false;
      ctx.ui?.setWidget(KEY, undefined);
    };
    api.on("session_start", (event, ctx) => {
      if (startupHandled || event?.reason !== "startup" || ctx?.mode !== "tui" || ctx.sessionManager !== sessionManager) return;
      if (!ctx.hasUI || typeof ctx.ui?.setWidget !== "function") return;
      startupHandled = true;
      visible = true;
      ctx.ui.setWidget(KEY, (tui) => {
        let progress = 1;
        let elapsedMs = 0;
        const rows = () => Number.isFinite(tui.terminal?.rows) ? tui.terminal.rows : 24;
        const height = () => Math.min(36, Math.floor(rows() / 2), Math.max(0, rows() - 10));
        const dispose = () => {
          stopAnimation?.();
          stopAnimation = undefined;
        };
        if (animate && height() >= 4) {
          progress = 0;
          stopAnimation = startArtAnimation({
            onFrame(value, elapsed) { progress = value; elapsedMs = elapsed; tui.requestRender?.(); },
            onError() { progress = 1; elapsedMs = 0; stopAnimation = undefined; tui.requestRender?.(); },
            clock: animationClock,
          });
        }
        return {
          render(width) {
            const artHeight = height();
            return artHeight >= 4 ? renderTerminalArt({ width, height: artHeight, label, color, progress, timeMs: elapsedMs }) : [];
          },
          invalidate() {},
          dispose,
        };
      }, { placement: "aboveEditor" });
    });
    api.on("input", (_event, ctx) => clear(ctx));
    api.on("before_agent_start", (_event, ctx) => clear(ctx));
    api.on("session_shutdown", (_event, ctx) => clear(ctx));
  };
}

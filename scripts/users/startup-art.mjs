import { renderTerminalArt } from "../ui/terminal-art.mjs";
import { startArtAnimation } from "../ui/terminal-art-animation.mjs";

const KEY = "startup-art-managed";
const terminalColor = () => process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";

// Kitty's Caps/Num Lock bits do not modify Escape; key releases do not dismiss.
function isUnmodifiedEscape(data) {
  if (data === "\x1b") return true;
  const kitty = /^\x1b\[27(?::\d*)?(?::\d+)?(?:;(\d+)(?::(\d+))?)?u$/u.exec(data);
  if (kitty) {
    const modifier = (kitty[1] === undefined ? 1 : Number(kitty[1])) - 1;
    const event = kitty[2] === undefined ? 1 : Number(kitty[2]);
    return [0, 64, 128, 192].includes(modifier) && (event === 1 || event === 2);
  }
  const modifyOtherKeys = /^\x1b\[27;(\d+);27~$/u.exec(data);
  if (!modifyOtherKeys) return false;
  const modifier = Number(modifyOtherKeys[1]) - 1;
  return [0, 64, 128, 192].includes(modifier);
}

/** Create the managed-root startup art lifecycle without introducing transcript content. */
export function createStartupArtFactory({ label, sessionManager, color = terminalColor(), animate = process.env.TERM !== "dumb", animationClock } = {}) {
  if (!sessionManager) throw new TypeError("sessionManager is required");
  let startupHandled = false;
  let visible = false;
  let stopAnimation;
  let stopTerminalInput;

  const cleanup = () => {
    stopAnimation?.();
    stopAnimation = undefined;
    stopTerminalInput?.();
    stopTerminalInput = undefined;
  };

  return (api) => {
    const clear = (ctx) => {
      if (!visible || ctx?.mode !== "tui" || ctx.sessionManager !== sessionManager) return;
      visible = false;
      cleanup();
      ctx.ui?.setWidget(KEY, undefined);
    };
    api.on("session_start", (event, ctx) => {
      if (startupHandled || event?.reason !== "startup" || ctx?.mode !== "tui" || ctx.sessionManager !== sessionManager) return;
      if (!ctx.hasUI || typeof ctx.ui?.setWidget !== "function") return;
      startupHandled = true;
      visible = true;
      ctx.ui.setWidget(KEY, (tui) => {
        if (!visible) return { render: () => [], invalidate() {}, dispose() {} };
        if (!stopTerminalInput && typeof ctx.ui?.onTerminalInput === "function") {
          stopTerminalInput = ctx.ui.onTerminalInput((data) => {
            if (visible && isUnmodifiedEscape(data)) clear(ctx);
            return undefined;
          });
        }
        let progress = 1;
        let elapsedMs = 0;
        const rows = () => Number.isFinite(tui.terminal?.rows) ? tui.terminal.rows : 24;
        const height = () => Math.min(36, Math.floor(rows() / 2), Math.max(0, rows() - 10));
        const dispose = () => {
          visible = false;
          cleanup();
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

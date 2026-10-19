import { StringDecoder } from "node:string_decoder";
import { renderTerminalArt } from "../ui/terminal-art.mjs";
import { startArtAnimation } from "../ui/terminal-art-animation.mjs";
import { createTerminalArtOutput } from "../ui/terminal-art-output.mjs";

export const CREATE_ACCOUNT = Symbol("create-account");
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const clean = (value) => String(value ?? "").replace(/[\p{Cc}\p{Cf}]/gu, (character) => character === "\u200d" ? character : " ").replace(/\s+/gu, " ").trim();
const WIDE = /[\u1100-\u115f\u2329\u232a\u2e80-\u303e\u3040-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u;
const EMOJI = /\p{Extended_Pictographic}|[\u{1f1e6}-\u{1f1ff}]/u;
const cellWidth = (grapheme) => EMOJI.test(grapheme) || WIDE.test(grapheme) ? 2 : /^\p{Mark}+$/u.test(grapheme) ? 0 : 1;
const fit = (value, width) => {
  const parts = [...segmenter.segment(value)].map(({ segment }) => segment);
  let used = 0;
  const accepted = [];
  for (const part of parts) {
    const cells = cellWidth(part);
    if (used + cells > width) {
      while (accepted.length && used > width - 1) used -= cellWidth(accepted.pop());
      return width > 0 ? `${accepted.join("")}…` : "";
    }
    used += cells;
    accepted.push(part);
  }
  return accepted.join("");
};
const itemRows = (height) => Math.max(1, height >= 5 ? height - 4 : height - 2);
const safeDimension = (value, fallback, maximum = 240) => Math.min(maximum, Math.max(1, Math.floor(Number.isFinite(value) ? value : fallback)));
const displayWidth = (value) => [...segmenter.segment(value)].reduce((sum, { segment }) => sum + cellWidth(segment), 0);
const pad = (value, width) => value + " ".repeat(Math.max(0, width - displayWidth(value)));

// One authoritative budget for both pure rendering and interactive scrolling.
function layout(width, height, count) {
  const columns = safeDimension(width, 80);
  const terminalRows = safeDimension(height, 24, 80);
  const hud = columns >= 44 && terminalRows >= 12;
  const visible = hud ? Math.min(count, 5) : Math.min(count, itemRows(terminalRows));
  const remaining = terminalRows - visible - 4;
  const artHeight = hud && remaining >= 6 ? Math.min(40, remaining) : 0;
  return { columns, terminalRows, hud, visible, artHeight };
}
const profileText = (item) => {
  const id = clean(item.id);
  const label = clean(item.label);
  return item.create ? item.label : !label || id.toLowerCase() === label.toLowerCase() ? label || id : `${label} / ${id}`;
};

/** Render a bounded, injection-safe account menu for terminal evidence and redraws. */
export function renderAccountMenu(users, { width = 80, height = 24, selected = 0, offset = 0, color = false, progress = 1, timeMs = 0 } = {}) {
  const items = [...users.map((user) => ({ id: user.id, label: user.label })), { create: true, label: "Create new account" }];
  const { columns, terminalRows, hud, visible: rows, artHeight } = layout(width, height, items.length);
  const selectedIndex = Math.max(0, Math.min(Number.isFinite(selected) ? Math.floor(selected) : 0, items.length - 1));
  let start = Math.max(0, Math.min(Number.isFinite(offset) ? Math.floor(offset) : 0, Math.max(0, items.length - rows)));
  if (selectedIndex < start) start = selectedIndex;
  if (selectedIndex >= start + rows) start = selectedIndex - rows + 1;
  const visible = items.slice(start, start + rows);
  const artLines = artHeight ? renderTerminalArt({ width: columns, height: artHeight, label: users[selectedIndex]?.label ?? "", color, progress, timeMs }) : [];
  const title = "SELECT YOUR PROFILE";
  const help = "↑/↓ select · ENTER start · ESC back";
  let menu;
  if (hud) {
    const frameWidth = Math.min(56, columns - 4);
    const inner = frameWidth - 4;
    const margin = " ".repeat(Math.floor((columns - frameWidth) / 2));
    const muted = (text) => color ? `\u001b[38;2;154;128;180m${text}\u001b[0m` : text;
    const border = (text) => `${margin}${muted(text)}`;
    menu = [border(`+- ${title} ${"-".repeat(frameWidth - title.length - 5)}+`), border(`|${" ".repeat(frameWidth - 2)}|`)];
    for (const [i, item] of visible.entries()) {
      const active = start + i === selectedIndex;
      const text = pad(fit(`${active ? "> " : "  "}${profileText(item)}`, inner), inner);
      const fill = color && active ? `\u001b[38;2;29;21;53;48;2;233;196;255m${text}\u001b[0m` : muted(text);
      menu.push(`${margin}${muted("| ")}${fill}${muted(" |")}`);
    }
    const status = ` ${String(selectedIndex + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")} `;
    menu.push(border(`+-${status}${"-".repeat(frameWidth - status.length - 3)}+`));
    const footer = fit(help, columns);
    menu.push(`${" ".repeat(Math.max(0, Math.floor((columns - displayWidth(footer)) / 2)))}${muted(footer)}`);
  } else {
    const itemLines = visible.map((item, i) => fit(`${start + i === selectedIndex ? "> " : "  "}${profileText(item)}`, columns));
    if (terminalRows === 1) menu = itemLines;
    else if (terminalRows === 2) menu = [fit(title, columns), itemLines[0]];
    else if (terminalRows < 5) menu = [fit(title, columns), ...itemLines, fit(help, columns)];
    else menu = [fit(title, columns), "", ...itemLines, "", fit(help, columns)];
  }
  return [...artLines, ...menu].join("\n");
}

/**
 * Resolve to a saved id, CREATE_ACCOUNT, or null. Reads only this menu's raw data
 * listener; it does not initialize or alter Node's shared keypress decoder.
 */
const terminalColor = () => process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";

export async function selectAccountMenu({ users, input, output, color = terminalColor(), animate = true, animationClock } = {}) {
  if (!input?.isTTY || !output?.isTTY) throw Object.assign(new Error("ACCOUNT_SELECTION_REQUIRED"), { code: "ACCOUNT_SELECTION_REQUIRED" });
  const items = [...users, CREATE_ACCOUNT];
  let selected = 0;
  let offset = 0;
  let pending = "";
  let escapeTimer;
  const decoder = new StringDecoder("utf8");
  const height = () => safeDimension(output.rows, 24, 80);
  const rowCount = () => layout(output.columns, height(), items.length).visible;
  let progress = 1;
  let elapsedMs = 0;
  let stopAnimation;
  let terminalOutput;
  const clearEscapeTimer = () => { if (escapeTimer) clearTimeout(escapeTimer); escapeTimer = undefined; };
  let resolveChoice;
  let rejectChoice;
  let settled = false;
  const choice = new Promise((resolve, reject) => { resolveChoice = resolve; rejectChoice = reject; });
  const finish = (error, value) => {
    if (settled) return;
    settled = true;
    clearEscapeTimer();
    if (error) rejectChoice(error);
    else resolveChoice(value);
  };
  const redraw = () => {
    if (settled) return;
    const rows = rowCount();
    if (selected < offset) offset = selected;
    if (selected >= offset + rows) offset = selected - rows + 1;
    terminalOutput.render(({ width, height: viewportHeight }) => renderAccountMenu(users, {
      width, height: Math.min(height(), viewportHeight), selected, offset, color, progress, timeMs: elapsedMs,
    }).split("\n"));
  };
  const move = (delta) => {
    selected = (selected + delta + items.length) % items.length;
    redraw();
  };
  const expireEscape = () => {
    escapeTimer = undefined;
    pending = "";
    finish(undefined, null);
  };
  const armEscapeTimer = () => {
    if (escapeTimer) return;
    escapeTimer = setTimeout(expireEscape, 35);
  };
  const escapeSequences = ["\u001b[A", "\u001b[B", "\u001bOA", "\u001bOB"];
  const parse = (text) => {
    pending += text;
    while (pending && !settled) {
      if (pending[0] === "\u001b") {
        const sequence = escapeSequences.find((candidate) => pending.startsWith(candidate));
        if (sequence) {
          pending = pending.slice(sequence.length);
          clearEscapeTimer();
          move(sequence.endsWith("A") ? -1 : 1);
          continue;
        }
        if (escapeSequences.some((candidate) => candidate.startsWith(pending))) {
          armEscapeTimer();
          return;
        }
        pending = pending.slice(1);
        clearEscapeTimer();
        finish(undefined, null);
        continue;
      }
      const point = String.fromCodePoint(pending.codePointAt(0));
      pending = pending.slice(point.length);
      if (point === "\r" || point === "\n") finish(undefined, selected === users.length ? CREATE_ACCOUNT : users[selected].id);
      else if (point === "\u0003") finish(undefined, null);
    }
  };
  const onData = (chunk) => {
    try { parse(typeof chunk === "string" ? chunk : decoder.write(chunk)); }
    catch (error) { finish(error); }
  };
  const onEnd = () => finish(undefined, null);
  const onClose = () => finish(undefined, null);
  const onInputError = (error) => finish(error);
  const onOutputError = (error) => { terminalOutput?.markBroken(); finish(error); };
  const onOutputClose = () => { terminalOutput?.markBroken(); finish(undefined, null); };
  const onResize = () => {
    if (settled) return;
    try { redraw(); } catch (error) { finish(error); }
  };
  const beforePaused = typeof input.isPaused === "function" ? input.isPaused() : false;
  const beforeRaw = input.isRaw;
  let result;
  let failure;
  try {
    terminalOutput = createTerminalArtOutput({ output, getSize: () => ({ columns: output.columns, rows: height() }), onError: (error) => finish(error) });
    input.on("data", onData);
    input.once("end", onEnd);
    input.once("close", onClose);
    input.once("error", onInputError);
    output.once("error", onOutputError);
    output.once("close", onOutputClose);
    output.on("resize", onResize);
    if (typeof input.setRawMode === "function") input.setRawMode(true);
    if (animate && process.env.TERM !== "dumb") {
      stopAnimation = startArtAnimation({ clock: animationClock, onFrame: (value, elapsed) => { progress = value; elapsedMs = elapsed; redraw(); }, onError: (error) => finish(error) });
    } else redraw();
    input.resume();
    result = await choice;
  } catch (error) {
    failure = error;
  } finally {
    stopAnimation?.();
    terminalOutput?.dispose();
    clearEscapeTimer();
    input.off("data", onData);
    input.off("end", onEnd);
    input.off("close", onClose);
    input.off("error", onInputError);
    output.off("error", onOutputError);
    output.off("close", onOutputClose);
    output.off("resize", onResize);
    try {
      if (typeof input.setRawMode === "function" && typeof beforeRaw === "boolean" && input.isRaw !== beforeRaw) input.setRawMode(beforeRaw);
    } catch (error) { failure ??= error; }
    try {
      if (beforePaused && typeof input.pause === "function") input.pause();
      else if (!beforePaused && typeof input.resume === "function") input.resume();
    } catch (error) { failure ??= error; }
  }
  if (failure) throw failure;
  return result;
}

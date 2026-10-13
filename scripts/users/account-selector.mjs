import { StringDecoder } from "node:string_decoder";

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
const safeDimension = (value, fallback) => Math.max(1, Math.floor(Number.isFinite(value) ? value : fallback));

/** Render a bounded, injection-safe account menu for terminal evidence and redraws. */
export function renderAccountMenu(users, { width = 80, height = 24, selected = 0, offset = 0 } = {}) {
  const items = [...users.map((user) => ({ id: user.id, label: user.label })), { create: true, label: "Create new account" }];
  const columns = safeDimension(width, 80);
  const terminalRows = safeDimension(height, 24);
  const rows = itemRows(terminalRows);
  const selectedIndex = Math.max(0, Math.min(selected, items.length - 1));
  let start = Math.max(0, Math.min(offset, Math.max(0, items.length - rows)));
  if (selectedIndex < start) start = selectedIndex;
  if (selectedIndex >= start + rows) start = selectedIndex - rows + 1;
  const visible = items.slice(start, start + rows);
  const itemLines = visible.map((item, i) => {
    const index = start + i;
    const marker = index === selectedIndex ? "> " : "  ";
    const text = item.create ? item.label : `${clean(item.id)} (${clean(item.label)})`;
    return fit(`${marker}${text}`, columns);
  });
  const help = fit("↑/↓ Navigate · Enter Select · Esc Cancel", columns);
  const title = fit("Select an account", columns);
  if (terminalRows === 1) return itemLines.join("\n");
  if (terminalRows === 2) return [title, itemLines[0]].join("\n");
  if (terminalRows < 5) return [title, ...itemLines, help].join("\n");
  return [title, "", ...itemLines, "", help].join("\n");
}

/**
 * Resolve to a saved id, CREATE_ACCOUNT, or null. Reads only this menu's raw data
 * listener; it does not initialize or alter Node's shared keypress decoder.
 */
export async function selectAccountMenu({ users, input, output }) {
  if (!input?.isTTY || !output?.isTTY) throw Object.assign(new Error("ACCOUNT_SELECTION_REQUIRED"), { code: "ACCOUNT_SELECTION_REQUIRED" });
  const items = [...users, CREATE_ACCOUNT];
  let selected = 0;
  let offset = 0;
  let pending = "";
  let escapeTimer;
  const decoder = new StringDecoder("utf8");
  const height = () => safeDimension(output.rows, 24);
  const rowCount = () => itemRows(height());
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
    const rows = rowCount();
    if (selected < offset) offset = selected;
    if (selected >= offset + rows) offset = selected - rows + 1;
    output.write(`\u001b[2J\u001b[H${renderAccountMenu(users, { width: output.columns, height: height(), selected, offset })}`);
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
  const onOutputError = (error) => finish(error);
  const beforePaused = typeof input.isPaused === "function" ? input.isPaused() : false;
  const beforeRaw = input.isRaw;
  let result;
  let failure;
  try {
    input.on("data", onData);
    input.once("end", onEnd);
    input.once("close", onClose);
    input.once("error", onInputError);
    output.once("error", onOutputError);
    if (typeof input.setRawMode === "function") input.setRawMode(true);
    redraw();
    input.resume();
    result = await choice;
    output.write("\r\n");
  } catch (error) {
    failure = error;
  } finally {
    clearEscapeTimer();
    input.off("data", onData);
    input.off("end", onEnd);
    input.off("close", onClose);
    input.off("error", onInputError);
    output.off("error", onOutputError);
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

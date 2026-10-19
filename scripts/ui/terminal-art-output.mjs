import { Writable } from "node:stream";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const stripControls = (value) => value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "");
const cellWidth = (value) => [...segmenter.segment(stripControls(value))].reduce((width, { segment }) => {
  if (/\p{Extended_Pictographic}|[\u{1f1e6}-\u{1f1ff}]/u.test(segment) || /[\u1100-\u115f\u2329\u232a\u2e80-\u303e\u3040-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u.test(segment)) return width + 2;
  return width + (/^\p{Mark}+$/u.test(segment) ? 0 : 1);
}, 0);
const dimension = (value, fallback, maximum) => Math.max(1, Math.min(maximum, Math.floor(Number.isFinite(value) ? value : fallback)));

/** Own a fixed-coordinate alternate-screen viewport and coalesce blocked frames. */
export function createTerminalArtOutput({ output, getSize = () => ({ columns: output.columns, rows: output.rows }), onError = () => {} } = {}) {
  if (!output || typeof output.write !== "function") throw new TypeError("output must be a writable stream");
  let previous = [];
  let previousRaw = [];
  let previousWidths = [];
  let entered = false;
  let disposed = false;
  let blocked = false;
  let pending;
  let writing = false;
  let streamBroken = false;
  let errorReported = false;
  let inFlight = 0;
  const report = (error) => { if (!disposed) onError(error); };
  // Writable callbacks precede their error event; retain our listener until that
  // event (or successful completion), including writes pending during disposal.
  const detachError = () => {
    if (streamBroken && !errorReported) return;
    if (output instanceof Writable && inFlight > 0 && !streamBroken) return;
    output.off?.("error", onStreamError);
  };
  const onStreamError = (error) => {
    streamBroken = true;
    if (!errorReported) {
      errorReported = true;
      report(error);
    }
    detachError();
  };
  output.on?.("error", onStreamError);
  const write = (text) => {
    const track = output instanceof Writable;
    if (track) inFlight++;
    let callbackCalled = false;
    const complete = (error) => {
      if (callbackCalled) return;
      callbackCalled = true;
      if (error) {
        streamBroken = true;
        if (!track) setImmediate(() => onStreamError(error));
      }
      if (track) {
        inFlight--;
        if (!error && disposed && inFlight === 0) detachError();
      }
    };
    try { return output.write(text, complete); }
    catch (error) {
      streamBroken = true;
      errorReported = true;
      if (track && !callbackCalled) inFlight--;
      detachError();
      throw error;
    }
  };
  const onDrain = () => {
    if (disposed) return;
    blocked = false;
    const render = pending;
    pending = undefined;
    if (render) render();
  };
  output.on?.("drain", onDrain);

  const renderNow = (getFrame) => {
    if (disposed) return;
    if (blocked || writing) { pending = () => renderNow(getFrame); return; }
    let result;
    try {
      const size = getSize() ?? {};
      const columns = dimension(size.columns, 80, 240);
      const rows = dimension(size.rows, 24, 80);
      const width = Math.max(1, columns - 1);
      const height = rows;
      const lines = getFrame({ width, height, columns, rows });
      if (!Array.isArray(lines)) throw new TypeError("frame must be an array of rows");
      const raw = lines.slice(0, height).map((line) => String(line ?? ""));
      const widths = raw.map((line, index) => line === previousRaw[index] ? previousWidths[index] : cellWidth(line));
      const current = raw.map((line, index) => line + " ".repeat(Math.max(0, width - widths[index])));
      const changed = [];
      for (let row = 0; row < Math.max(current.length, Math.min(previous.length, height)); row++) {
        const line = current[row] ?? " ".repeat(width);
        if (line !== previous[row]) changed.push(`\r\u001b[${row + 1};1H${line}`);
      }
      if (!entered || changed.length) {
        result = `${entered ? "" : "\u001b[?1049h\u001b[?25l\u001b[2J"}\u001b[?2026h${changed.join("")}\u001b[0m\u001b[?2026l`;
        entered = true;
        previous = current;
        previousRaw = raw;
        previousWidths = widths;
        writing = true;
        const accepted = write(result);
        if (accepted === false) blocked = true;
        writing = false;
      }
    } catch (error) { writing = false; report(error); }
  };

  return {
    render(getFrame) {
      if (typeof getFrame !== "function") throw new TypeError("getFrame must be a function");
      renderNow(getFrame);
    },
    markBroken() { streamBroken = true; errorReported = true; detachError(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = undefined;
      output.off?.("drain", onDrain);
      if (entered && !streamBroken) {
        try { write("\u001b[0m\u001b[?2026l\u001b[?25h\u001b[?1049l"); } catch { streamBroken = true; }
      }
      if (inFlight === 0 || streamBroken) detachError();
      previous = [];
      previousRaw = [];
      previousWidths = [];
    },
  };
}

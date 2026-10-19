// The one status dot: <span class="state" data-state="working|done|attention|urgent|idle">.
// working is a braille spinner animated by CSS alone (no timers); see ".state" in styles.css.
import { escapeHtml, stateLabel } from "./lib.js";

const STATES = new Set(["working", "done", "attention", "urgent", "idle"]);
const known = (state) => (STATES.has(state) ? state : "idle");

// Sets state, accessible label and tooltip on an existing element; returns false (no DOM write) when nothing changed.
export function applyState(el, state) {
  const next = known(state);
  if (el.dataset.state === next) return false;
  const label = stateLabel(next);
  el.dataset.state = next;
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", label);
  el.title = label;
  return true;
}

// Markup for innerHTML templates. `extra`: additional class names.
export function stateHtml(state, extra = "") {
  const next = known(state);
  const label = escapeHtml(stateLabel(next));
  return `<span class="state${extra ? ` ${escapeHtml(extra)}` : ""}" data-state="${next}" role="img" aria-label="${label}" title="${label}"></span>`;
}

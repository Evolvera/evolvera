import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

// clean-ui: OMP-inspired quiet terminal chrome built only on public extension seams
// (registerToolRenderer, ctx.ui.setFooter/setWorkingIndicator/setHiddenThinkingLabel).
// Plain Unicode terminal art (box/branch strokes, check/cross signs, comet indicator): single-cell
// glyphs from ordinary monospace fonts. No emoji, no private-use/Nerd Font glyphs, no banners.

export const MAX_EXPANDED_LINES = 20;
export const STATE_FILE_NAME = "clean-ui.json";
export const SPINNER_FRAMES = Array.from({ length: 8 }, (_, step) =>
  Array.from({ length: 8 }, (_, cell) => cell === step ? "◆" : cell === (step + 7) % 8 ? "━" : "·").join(""));

export function coloredWorkingFrames(theme: ThemeLike): string[] {
  return SPINNER_FRAMES.map((frame, step) => [...frame].map((glyph) =>
    theme.fg(glyph === "◆" ? (step % 2 ? "warning" : "accent") : glyph === "━" ? "accent" : "muted", glyph)).join(""));
}
const BUILTIN_TOOLS = new Set(["bash", "powershell", "read", "edit", "write", "grep", "find", "ls"]);
// Extension tools that stay quiet even if they bring their own (verbose) renderer.
const EXTRA_COLLAPSED_TOOLS = new Set(["todo"]);
const ELLIPSIS = "…";
const SUMMARY_SEP = " · ";

// ---------------------------------------------------------------------------
// Structural types (kept minimal so plain fakes work in tests; the SDK types are assignable).
// ---------------------------------------------------------------------------

export interface ThemeLike {
  fg(color: any, text: string): string;
  bold(text: string): string;
}

export interface RenderComponent {
  render(width: number): string[];
  invalidate(): void;
}

interface ContentBlock {
  type: string;
  text?: string;
}

export interface ToolResultLike {
  content?: ContentBlock[];
  details?: any;
}

type CardState = "running" | "ok" | "error";

export interface CardData {
  toolName: string;
  args?: Record<string, unknown>;
  cwd?: string;
  result?: ToolResultLike;
  partial: boolean;
  isError: boolean;
  startedAt?: number;
  endedAt?: number;
}

// ---------------------------------------------------------------------------
// Pure text helpers
// ---------------------------------------------------------------------------

const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

/** Remove terminal escape sequences and C0/C1 control characters (keeps \n and \t). */
export function stripControl(text: string): string {
  return text.replace(ANSI_PATTERN, "").replace(/\r/g, "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");
}

// BMP symbols with default emoji presentation (e.g. ⚡ ✅ ❌ ⭐) occupy two terminal cells.
const WIDE_BMP_EMOJI = new Set([
  0x231a, 0x231b, 0x23e9, 0x23ea, 0x23eb, 0x23ec, 0x23f0, 0x23f3, 0x25fd, 0x25fe, 0x2614, 0x2615,
  0x26a1, 0x26aa, 0x26ab, 0x26bd, 0x26be, 0x26c4, 0x26c5, 0x26d4, 0x26ea, 0x26f2, 0x26f3, 0x26f5,
  0x26fa, 0x26fd, 0x2705, 0x270a, 0x270b, 0x2728, 0x274c, 0x274e, 0x2753, 0x2754, 0x2755, 0x2757,
  0x2795, 0x2796, 0x2797, 0x27b0, 0x27bf, 0x2b1b, 0x2b1c, 0x2b50, 0x2b55,
]);

function charWidth(cp: number): number {
  if (cp === 0 || cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (
    (cp >= 0x300 && cp <= 0x36f) || (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xfe20 && cp <= 0xfe2f) || cp === 0x200d
  ) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd) ||
    WIDE_BMP_EMOJI.has(cp)
  ) return 2;
  return 1;
}

/** Terminal cell width of plain (already control-stripped) text. Conservative for wide glyphs. */
export function cellWidth(text: string): number {
  let width = 0;
  for (const char of text) width += charWidth(char.codePointAt(0) ?? 0);
  return width;
}

/** Cut plain text to at most `max` cells, ending with "…" when something was removed. */
export function cut(text: string, max: number): string {
  if (max <= 0) return "";
  if (cellWidth(text) <= max) return text;
  const room = max - ELLIPSIS.length;
  if (room <= 0) return ELLIPSIS.slice(0, max);
  let out = "";
  let used = 0;
  for (const char of text) {
    const w = charWidth(char.codePointAt(0) ?? 0);
    if (used + w > room) break;
    out += char;
    used += w;
  }
  return out + ELLIPSIS;
}

/** Collapse whitespace/newlines into one plain line. */
export function oneLine(text: string): string {
  return stripControl(text).replace(/\s+/g, " ").trim();
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${total % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ${total % 60}s`;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function displayPath(raw: string, cwd?: string, home?: string): string {
  if (cwd && isAbsolute(raw)) {
    const rel = relative(cwd, raw);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return oneLine(rel);
  }
  if (home && raw.startsWith(home)) return oneLine(`~${raw.slice(home.length)}`);
  return oneLine(raw);
}

export function resultText(result: ToolResultLike | undefined): string {
  if (!result?.content) return "";
  return result.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => stripControl(block.text as string))
    .join("\n");
}

export function hasImage(result: ToolResultLike | undefined): boolean {
  return Boolean(result?.content?.some((block) => block.type === "image"));
}

function nonEmptyLines(text: string): string[] {
  return text.split("\n").filter((line) => line.trim() !== "");
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function joinSummary(parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(SUMMARY_SEP);
}

// ---------------------------------------------------------------------------
// Per-tool description (target + summary)
// ---------------------------------------------------------------------------

export function describeTarget(toolName: string, args: Record<string, unknown> | undefined, cwd?: string, home?: string): string {
  const a = args ?? {};
  const path = (value: unknown) => {
    const text = str(value);
    return text === undefined ? undefined : displayPath(text, cwd, home);
  };
  switch (toolName) {
    case "bash":
    case "powershell": {
      const lines = (str(a.command) ?? "").split("\n").map((line) => oneLine(line)).filter(Boolean);
      if (lines.length === 0) return "…";
      return lines.length > 1 ? `${lines[0]} (+${lines.length - 1} lines)` : lines[0];
    }
    case "read": {
      const base = path(a.path) ?? "?";
      const offset = typeof a.offset === "number" ? a.offset : undefined;
      const limit = typeof a.limit === "number" ? a.limit : undefined;
      if (offset === undefined && limit === undefined) return base;
      const start = offset ?? 1;
      return `${base}:${start}-${limit === undefined ? "" : start + limit - 1}`;
    }
    case "edit":
    case "write":
      return path(a.path) ?? "?";
    case "grep":
      return `/${oneLine(str(a.pattern) ?? "")}/ in ${path(a.path) ?? "."}`;
    case "find":
      return `${oneLine(str(a.pattern) ?? "")} in ${path(a.path) ?? "."}`;
    case "ls":
      return path(a.path) ?? ".";
    default: {
      const pairs: string[] = [];
      for (const [key, value] of Object.entries(a)) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          pairs.push(`${key}=${cut(oneLine(String(value)), 30)}`);
        }
        if (pairs.length >= 3) break;
      }
      return pairs.join(" ");
    }
  }
}

/** `+N -M` from a unified diff produced by the edit tool ("+12 text" / "-12 text" / " 12 ctx"). */
export function diffStats(diff: unknown): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  if (typeof diff === "string") {
    for (const line of diff.split("\n")) {
      if (line.startsWith("+++") || line.startsWith("---")) continue;
      if (line.startsWith("+")) added++;
      else if (line.startsWith("-")) removed++;
    }
  }
  return { added, removed };
}

export function parseShellFailure(text: string): string {
  const exit = /Command exited with code (-?\d+)\s*$/.exec(text.trim());
  if (exit) return `exit ${exit[1]}`;
  if (/Command aborted\s*$/.test(text.trim())) return "aborted";
  const timeout = /Command timed out after (\d+) seconds\s*$/.exec(text.trim());
  if (timeout) return `timeout ${timeout[1]}s`;
  return "error";
}

const STATUS_LINE = /^Command (exited with code|aborted|timed out after)/;

/** First meaningful error line, shown even when the card is collapsed. */
export function firstErrorLine(text: string): string | undefined {
  const line = nonEmptyLines(text).find((candidate) => !STATUS_LINE.test(candidate.trim()));
  return line === undefined ? undefined : oneLine(line);
}

export function describeSummary(data: CardData): string {
  const { toolName, args, result, isError } = data;
  const text = resultText(result);
  const duration = data.startedAt !== undefined && data.endedAt !== undefined ? formatDuration(data.endedAt - data.startedAt) : undefined;
  const details = result?.details;
  const truncated = Boolean(details?.truncation?.truncated);
  if (isError) {
    if (toolName === "bash" || toolName === "powershell") {
      return joinSummary([parseShellFailure(text), duration]);
    }
    return "error";
  }
  const lines = nonEmptyLines(text).filter((line) => !line.startsWith("["));
  switch (toolName) {
    case "bash":
    case "powershell": {
      const out = lines.length === 0 ? "no output" : plural(lines.length, "line");
      return joinSummary([duration, out, truncated && "truncated"]);
    }
    case "read": {
      const total = details?.truncation?.totalLines;
      return truncated && typeof total === "number" ? `${lines.length} of ${total} lines` : plural(lines.length, "line");
    }
    case "edit": {
      const { added, removed } = diffStats(details?.diff);
      return added || removed ? `+${added} -${removed}` : "applied";
    }
    case "write": {
      const content = str(args?.content);
      return content === undefined ? "written" : plural(content === "" ? 0 : content.split("\n").length, "line");
    }
    case "grep":
      return /^No matches found/.test(text.trim()) ? "0 matches" : joinSummary([plural(lines.length, "match", "matches"), details?.matchLimitReached && "limit"]);
    case "find":
      return /^No files found/.test(text.trim()) ? "0 files" : joinSummary([plural(lines.length, "file"), details?.resultLimitReached && "limit"]);
    case "ls":
      return text.trim() === "(empty directory)" ? "0 entries" : joinSummary([plural(lines.length, "entry", "entries"), details?.entryLimitReached && "limit"]);
    default:
      return plural(lines.length, "line");
  }
}

export function cardState(data: CardData): CardState {
  if (!data.result) return "running";
  if (data.isError) return "error";
  return data.partial ? "running" : "ok";
}

// ---------------------------------------------------------------------------
// Card rendering
// ---------------------------------------------------------------------------

const ICONS: Record<CardState, string> = { running: "◌", ok: "✓", error: "×" };
const ICON_COLORS: Record<CardState, string> = { running: "warning", ok: "success", error: "error" };

/** One-line header: `✓ bash  npm test  0.8s · 42 lines`, never wider than `width`. */
export function renderHeader(data: CardData, theme: ThemeLike, width: number, home?: string): string {
  const state = cardState(data);
  const icon = ICONS[state];
  const name = data.toolName;
  const summary = state === "running" ? "" : describeSummary(data);
  const fixed = `${icon} ${name}  `;
  let target = describeTarget(data.toolName, data.args, data.cwd, home);
  const suffixWidth = summary ? cellWidth(summary) + 2 : 0;
  let budget = width - cellWidth(fixed) - suffixWidth;
  let suffix = summary;
  if (budget < 8 && summary) {
    // Narrow terminal: the target matters more than the summary.
    suffix = "";
    budget = width - cellWidth(fixed);
  }
  if (budget < 1) {
    return theme.fg(ICON_COLORS[state], cut(`${fixed}${target}`.trimEnd(), Math.max(0, width)));
  }
  target = cut(target, budget);
  const tail = suffix ? `  ${theme.fg(state === "error" ? "error" : "muted", suffix)}` : "";
  return `${theme.fg(ICON_COLORS[state], icon)} ${theme.fg("toolTitle", theme.bold(name))}  ${theme.fg("accent", target)}${tail}`;
}

function bodyLines(data: CardData): { lines: string[]; skipped: number; from: "head" | "tail" } {
  const diff = data.toolName === "edit" && !data.isError ? data.result?.details?.diff : undefined;
  const text = typeof diff === "string" ? stripControl(diff) : resultText(data.result);
  const all = text.replace(/\t/g, "   ").split("\n");
  while (all.length > 0 && all[all.length - 1].trim() === "") all.pop();
  while (all.length > 0 && all[0].trim() === "") all.shift();
  if (all.length <= MAX_EXPANDED_LINES) return { lines: all, skipped: 0, from: "head" };
  const tail = data.toolName === "bash" || data.toolName === "powershell";
  return {
    lines: tail ? all.slice(-MAX_EXPANDED_LINES) : all.slice(0, MAX_EXPANDED_LINES),
    skipped: all.length - MAX_EXPANDED_LINES,
    from: tail ? "tail" : "head",
  };
}

/**
 * Body shown below the header: capped output when expanded, first error line when collapsed.
 * Rows hang from the header on a thin rail (`│`, closed by `╰` on the last row); below 9 cells the
 * rail is dropped so narrow terminals keep every cell for content.
 */
export function renderBody(data: CardData, theme: ThemeLike, width: number, expanded: boolean): string[] {
  if (!data.result || (data.partial && !data.isError && !expanded)) return [];
  const railed = width > 8;
  const room = railed ? width - 4 : Math.max(1, width);
  const row = (rail: string, railColor: string, color: string, text: string) =>
    `${railed ? `  ${theme.fg(railColor, rail)} ` : ""}${theme.fg(color, cut(text, room))}`;
  if (!expanded) {
    if (data.isError) {
      const line = firstErrorLine(resultText(data.result));
      return line === undefined ? [] : [row("╰", "error", "error", line)];
    }
    if (data.toolName !== "edit" || typeof data.result.details?.diff !== "string") return [];
  }
  const { lines, skipped, from } = bodyLines(data);
  const isDiff = data.toolName === "edit" && !data.isError && typeof data.result.details?.diff === "string";
  const rows = lines.map((line) => {
    let color = "toolOutput";
    if (isDiff) {
      if (line.startsWith("+++") || line.startsWith("---")) color = "dim";
      else if (line.startsWith("+")) color = "success";
      else if (line.startsWith("-")) color = "error";
      else color = "dim";
    }
    return { color, text: line };
  });
  if (skipped > 0) {
    const note = { color: "muted", text: from === "tail" ? `… ${skipped} earlier lines` : `… ${skipped} more lines` };
    if (from === "tail") rows.unshift(note);
    else rows.push(note);
  }
  if (!rows.length) return [];
  if (isDiff && railed) {
    const edge = (glyph: string) => `  ${theme.fg("dim", glyph)}${"─".repeat(Math.max(0, Math.min(width - 3, 12)))}`;
    return [edge("╭"), ...rows.map((item) => row("│", "dim", item.color, item.text)), edge("╰")];
  }
  return rows.map((item, index) => row(index === rows.length - 1 ? "╰" : "│", "dim", item.color, item.text));
}

class LazyComponent implements RenderComponent {
  private readonly produce: (width: number) => string[];
  private readonly revision: () => number;
  private readonly onInvalidate?: () => void;
  private cached?: { width: number; revision: number; lines: string[] };
  constructor(produce: (width: number) => string[], revision: () => number = () => 0, onInvalidate?: () => void) {
    this.produce = produce;
    this.revision = revision;
    this.onInvalidate = onInvalidate;
  }
  render(width: number): string[] {
    const actualWidth = Math.max(1, width);
    const revision = this.revision();
    if (this.cached?.width === actualWidth && this.cached.revision === revision) return this.cached.lines;
    const lines = this.produce(actualWidth);
    this.cached = { width: actualWidth, revision, lines };
    return lines;
  }
  invalidate(): void {
    this.cached = undefined;
    this.onInvalidate?.();
  }
}

interface SharedState {
  cleanUi?: CardData;
  revision?: number;
  stock?: Record<string, unknown>;
}

function cardOf(state: SharedState, toolName: string): CardData {
  state.cleanUi ??= { toolName, partial: true, isError: false };
  return state.cleanUi;
}

function bumpRevision(state: SharedState): number {
  return state.revision = (state.revision ?? 0) + 1;
}

export interface ToolRenderersLike {
  renderShell?: "default" | "self";
  renderCall?: (args: any, theme: any, context: any) => RenderComponent;
  renderResult?: (result: any, options: any, theme: any, context: any) => RenderComponent;
}

/**
 * Renderers for one tool card. The call component draws the single header line lazily (it reads the
 * result that renderResult stored in the shared per-card state); the result component only adds the
 * collapsed error line or the expanded, capped output. `renderShell: "self"` removes the boxed shell
 * so the collapsed card really is one line.
 */
export function createCardRenderers(toolName: string, stock: ToolRenderersLike | undefined, home?: string): ToolRenderersLike {
  return {
    renderShell: "self",
    renderCall(args, theme, context) {
      const state: SharedState = (context.state ??= {});
      const card = cardOf(state, toolName);
      bumpRevision(state);
      card.args = args;
      card.cwd = context.cwd;
      if (context.executionStarted && card.startedAt === undefined) card.startedAt = Date.now();
      return new LazyComponent((width) => [renderHeader(card, theme, width, home)], () => state.revision ?? 0);
    },
    renderResult(result, options, theme, context) {
      const state: SharedState = (context.state ??= {});
      const card = cardOf(state, toolName);
      bumpRevision(state);
      card.result = result;
      card.partial = Boolean(options?.isPartial);
      card.isError = Boolean(context.isError);
      card.args = context.args ?? card.args;
      card.cwd = context.cwd ?? card.cwd;
      if (!card.partial || card.isError) card.endedAt ??= Date.now();
      if (hasImage(result) && stock?.renderResult) {
        // Finish our header first, but leave image presentation to the SDK.
        state.stock ??= {};
        return stock.renderResult(result, options, theme, { ...context, state: state.stock, lastComponent: undefined });
      }
      const expanded = Boolean(options?.expanded);
      return new LazyComponent((width) => renderBody(card, theme, width, expanded), () => state.revision ?? 0);
    },
  };
}

export function shouldCollapse(toolName: string, stock: ToolRenderersLike | undefined): boolean {
  if (BUILTIN_TOOLS.has(toolName) || EXTRA_COLLAPSED_TOOLS.has(toolName)) return true;
  // Tools without their own call renderer fall back to the verbose generic dump; tools with one keep it.
  return !stock?.renderCall;
}

interface TodoRenderState extends SharedState {
  visible?: boolean;
  args?: Record<string, unknown>;
  finalDecisionMade?: boolean;
}

function todoAction(args: Record<string, unknown> | undefined): string {
  const value = args?.action ?? args?.operation ?? args?.op;
  return typeof value === "string" ? value.toLowerCase() : "";
}

function isTodoCreation(args: Record<string, unknown> | undefined): boolean {
  return ["create", "add", "new"].includes(todoAction(args));
}

function isTodoCompletion(args: Record<string, unknown> | undefined): boolean {
  const action = todoAction(args);
  if (action !== "update" && action !== "complete" && action !== "set") return false;
  const status = args?.status ?? args?.state;
  return status === "completed" || status === "complete" || args?.completed === true || action === "complete";
}

function todoId(args: Record<string, unknown> | undefined): string | undefined {
  const id = args?.id ?? args?.todoId ?? args?.taskId;
  return typeof id === "string" || typeof id === "number" ? String(id) : undefined;
}

function createTodoRenderers(stock: ToolRenderersLike | undefined, home: string | undefined, completedIds: Set<string>): ToolRenderersLike {
  const card = createCardRenderers("todo", stock, home);
  return {
    renderShell: "self",
    renderCall(args, theme, context) {
      const state: TodoRenderState = (context.state ??= {});
      state.args = args;
      const component = card.renderCall!(args, theme, context);
      return new LazyComponent((width) => state.visible ? component.render(width) : [], () => state.revision ?? 0, () => component.invalidate());
    },
    renderResult(result, options, theme, context) {
      const state: TodoRenderState = (context.state ??= {});
      bumpRevision(state);
      const args = context.args ?? state.args;
      const error = Boolean(context.isError);
      const completion = isTodoCompletion(args);
      const id = todoId(args);
      if (hasImage(result) && stock?.renderResult) {
        state.visible = true;
        return card.renderResult!(result, options, theme, context);
      }
      if (error) {
        state.visible = true;
      } else if (!state.finalDecisionMade) {
        if (options?.isPartial) {
          state.visible = false;
        } else {
          // One decision per completed call: repainting old cards is not a
          // new task transition and must not mutate completion/reopening state.
          state.finalDecisionMade = true;
          if (isTodoCreation(args)) {
            state.visible = true;
          } else if (completion && (!id || !completedIds.has(id))) {
            state.visible = true;
            if (id) completedIds.add(id);
          } else {
            state.visible = false;
            if (id && ["update", "set"].includes(todoAction(args)) &&
                (args?.status === "pending" || args?.status === "in_progress")) completedIds.delete(id);
          }
        }
      }
      if (!state.visible) return new LazyComponent(() => []);
      return card.renderResult!(result, options, theme, context);
    },
  };
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

export interface FooterData {
  model?: string;
  thinking?: string;
  contextPercent?: number | null;
  branch?: string | null;
}

// Cyberpunk HUD: a neon rail glyph, colour-coded tokens, and only *active* modes. Inactive or
// unavailable modes are hidden instead of spelled out; emoji from other extensions' statuses are
// translated into short single-cell tags so the footer stays quiet and width-exact.
const HUD_RAIL = "▌";
const HUD_GAP = "  ";
// Palette: red, orange, white and gray from the active theme (cyberpsycho maps warning to orange).
const BAR_CELL = "━";

type Segment = { text: string; color: string; bold?: boolean; parts?: Array<{ text: string; color: string }> };

function paint(theme: ThemeLike, segment: Segment, text = segment.text): string {
  const colored = segment.parts && text === oneLine(segment.text)
    ? segment.parts.map((part) => theme.fg(part.color, part.text)).join("")
    : theme.fg(segment.color, text);
  return segment.bold ? theme.bold(colored) : colored;
}

/** Theme token for a thinking level, so the label matches the editor's thinking border. */
export function thinkingColor(level: string | undefined): string {
  const key = (level || "off").toLowerCase();
  const tokens: Record<string, string> = {
    off: "thinkingOff", minimal: "thinkingMinimal", low: "thinkingLow", medium: "thinkingMedium",
    high: "thinkingHigh", xhigh: "thinkingXhigh", max: "thinkingMax", ultra: "thinkingMax",
  };
  return tokens[key] ?? "accent";
}

/** Lay segments onto as many lines as needed, each prefixed by the rail and never wider than `width`. */
function layoutHud(segments: Segment[], theme: ThemeLike, width: number, railColor: string, wrap = true): string[] {
  const railWidth = width >= 8 ? cellWidth(HUD_RAIL) + 1 : 0;
  const rail = railWidth ? theme.fg(railColor, HUD_RAIL) + " " : "";
  const room = Math.max(0, width - railWidth);
  const lines: string[] = [];
  let line = "";
  let used = 0;
  for (const segment of segments) {
    const full = oneLine(segment.text);
    if (!full) continue;
    const gap = used ? cellWidth(HUD_GAP) : 0;
    if (used && used + gap + cellWidth(full) > room) {
      if (!wrap) {
        const tail = cut(full, room - used - gap);
        if (tail) line += HUD_GAP + paint(theme, segment, tail);
        break;
      }
      lines.push(rail + line);
      line = "";
      used = 0;
    }
    const sep = used ? HUD_GAP : "";
    const text = cut(full, room - (used ? cellWidth(HUD_GAP) : 0));
    if (!text) continue;
    line += sep + paint(theme, segment, text);
    used += cellWidth(sep) + cellWidth(text);
  }
  if (line || !lines.length) lines.push(rail + line);
  return lines;
}

/** First footer line: model, thinking, branch (truncated, never wrapped). */
export function formatFooter(data: FooterData, theme: ThemeLike, width: number): string {
  const segments: Segment[] = [
    { text: data.model || "no-model", color: "accent", bold: true },
    { text: `› ${data.thinking || "off"}`, color: thinkingColor(data.thinking) },
  ];
  if (data.branch) segments.push({ text: `◇ ${oneLine(data.branch)}`, color: "muted" });
  return layoutHud(segments, theme, width, "accent", false)[0];
}

/** Context gauge: a red bar (scarlet past 80%) on a gray track, matching the first line, then the percentage. */
function contextSegments(percent: number | null | undefined, width: number): Segment[] {
  const valid = typeof percent === "number" && Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : undefined;
  const rounded = valid === undefined ? undefined : Math.round(valid);
  const barWidth = Math.max(4, Math.min(16, Math.floor(Math.max(0, width) / 10)));
  const filled = rounded === undefined ? 0 : Math.round((rounded / 100) * barWidth);
  const heat = (cell: number) => (cell + 1) / barWidth > 0.8 ? "thinkingXhigh" : "accent";
  const label = rounded === undefined ? "--" : `${rounded}%`;
  const labelColor = rounded === undefined ? "dim" : rounded >= 95 ? "thinkingXhigh" : rounded >= 80 ? "warning" : "text";
  const parts = [{ text: "ctx ", color: "dim" }];
  for (let cell = 0; cell < barWidth; cell++) parts.push({ text: BAR_CELL, color: cell < filled ? heat(cell) : "borderMuted" });
  parts.push({ text: ` ${label}`, color: labelColor });
  return [{ text: parts.map((part) => part.text).join(""), color: labelColor, parts }];
}

/** Keep the fast-mode lightning/rocket icon and its qualifier (e.g. ⚡ECO); state dots become colour. */
export function fastTag(status: string | undefined): Segment | undefined {
  if (status === undefined) return undefined;
  const raw = oneLine(status);
  if (!raw || raw === "OFF") return undefined;
  const icon = raw.includes("🚀") ? "🚀" : "⚡";
  const color = raw.includes("🟡") ? "muted" : "warning";
  const rest = raw.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter((word) => word && word !== "ON");
  return { text: icon + rest.join("·"), color };
}

/** Second footer line: context gauge plus only the active modes and identities (truncated, never wrapped). */
function modeFooter(footerData: { getExtensionStatuses(): ReadonlyMap<string, string> }, theme: ThemeLike, width: number, context: Segment[]): string[] {
  const statuses = footerData.getExtensionStatuses();
  const segments: Segment[] = [...context];
  const fast = fastTag(statuses.get("codex-fast-mode"));
  if (fast) segments.push(fast);
  const maestro = oneLine(statuses.get("maestro") ?? "");
  if (maestro && maestro !== "OFF") segments.push({ text: maestro === "ON" ? "MAESTRO" : `MAESTRO·${maestro}`, color: "warning" });
  const execution = oneLine(statuses.get("execution-mode") ?? "");
  if (execution) {
    const match = /^MODE\s+(.+?)(?:\s*·\s*(\S+))?$/.exec(execution);
    const mode = match?.[1] ?? execution;
    const source = match?.[2];
    const color = /YOLO/.test(mode) ? "thinkingXhigh" : /SUPERVIS/.test(mode) ? "muted" : "warning";
    segments.push({ text: source && source !== "GLOBAL" ? `${mode}·${source.toLowerCase()}` : mode, color, bold: color === "thinkingXhigh" });
  }
  const user = oneLine(statuses.get("usuario") ?? "");
  if (user) segments.push({ text: `@${user}`, color: "muted" });
  const known = new Set(["codex-fast-mode", "maestro", "execution-mode", "usuario"]);
  for (const [key, value] of statuses) if (!known.has(key) && oneLine(value)) segments.push({ text: `${key} ${value}`, color: "dim" });
  return layoutHud(segments, theme, width, "accent", false);
}

// ---------------------------------------------------------------------------
// Persisted toggle
// ---------------------------------------------------------------------------

export function parseEnabled(raw: string | undefined): boolean {
  if (raw === undefined) return true;
  try {
    const value = JSON.parse(raw) as { enabled?: unknown };
    return typeof value?.enabled === "boolean" ? value.enabled : true;
  } catch {
    return true;
  }
}

export function readEnabled(path: string): boolean {
  try {
    return existsSync(path) ? parseEnabled(readFileSync(path, "utf8")) : true;
  } catch {
    return true;
  }
}

export function writeEnabled(path: string, enabled: boolean): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify({ enabled }, null, 2)}\n`);
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function parseCommand(args: string | undefined): "on" | "off" | "status" | undefined {
  const word = (args ?? "").trim().toLowerCase();
  if (word === "" || word === "status") return "status";
  return word === "on" || word === "off" ? word : undefined;
}

// ---------------------------------------------------------------------------
// Extension wiring
// ---------------------------------------------------------------------------

export function registerCleanUi(pi: ExtensionAPI, statePath: () => string): void {
  let enabled = true;
  let loaded = false;
  let requestFooterRender: (() => void) | undefined;
  let invalidateFooterStats: () => void = () => {};
  const completedTodoIds = new Set<string>();
  const isEnabled = () => {
    if (!loaded) {
      enabled = readEnabled(statePath());
      loaded = true;
    }
    return enabled;
  };
  const home = process.env.USERPROFILE || process.env.HOME;

  // SDK 0.83 lacks renderer middleware: keep native tool cards while retaining the footer/chrome.
  if (typeof pi.registerToolRenderer === "function") {
    pi.registerToolRenderer((toolName, next) => {
      // Decided per card at creation: existing cards keep their look until the transcript is redrawn.
      if (!isEnabled()) return next();
      const stock = next();
      if (toolName === "todo") return createTodoRenderers(stock, home, completedTodoIds);
      if (!shouldCollapse(toolName, stock)) return stock;
      return createCardRenderers(toolName, stock, home);
    });
  }

  const applyChrome = (ctx: ExtensionContext) => {
    if (ctx.mode !== "tui" || !ctx.hasUI) return;
    const ui = ctx.ui;
    // Empty label renders no line at all (pi-tui Text skips blank text). It is only consulted when
    // the hideThinkingBlock setting is true; extensions cannot flip that setting.
    ui.setHiddenThinkingLabel("");
    ui.setWorkingIndicator({ frames: coloredWorkingFrames(ui.theme), intervalMs: 125 });
    ui.setWorkingMessage("working");
    ui.setFooter((tui, theme, footerData) => {
      let cachedStats: { manager: object; sessionId: unknown; leafId: unknown; entryCount: unknown; model: unknown; modelId: unknown; contextWindow: unknown; contextPercent: number | null | undefined } | undefined;
      invalidateFooterStats = () => { cachedStats = undefined; };
      const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
      const renderRequest = () => tui.requestRender();
      requestFooterRender = renderRequest;
      return {
        dispose() {
          unsubscribe();
          if (requestFooterRender === renderRequest) requestFooterRender = undefined;
        },
        invalidate() {},
        render(width: number): string[] {
          try {
            const manager = ctx.sessionManager as any;
            const model = ctx.model;
            const hasStableKey = typeof manager.getSessionId === "function" &&
              typeof manager.getLeafId === "function";
            let contextPercent: number | null | undefined;
            if (hasStableKey) {
              const sessionId = manager.getSessionId();
              const leafId = manager.getLeafId();
              const entryCount = typeof manager.getEntryCount === "function" ? manager.getEntryCount() : undefined;
              const modelId = model?.id;
              const contextWindow = model?.contextWindow;
              const cached = cachedStats;
              if (cached && cached.manager === manager && cached.sessionId === sessionId &&
                  cached.leafId === leafId && cached.entryCount === entryCount && cached.model === model &&
                  cached.modelId === modelId && cached.contextWindow === contextWindow) {
                ({ contextPercent } = cached);
              } else {
                contextPercent = ctx.getContextUsage()?.percent;
                cachedStats = { manager, sessionId, leafId, entryCount, model, modelId, contextWindow, contextPercent };
              }
            } else {
              contextPercent = ctx.getContextUsage()?.percent;
            }
            const data = {
              model: model?.id,
              thinking: pi.getThinkingLevel(),
              contextPercent,
              branch: footerData.getGitBranch(),
            };
            return [
              formatFooter(data, theme, width),
              ...modeFooter(footerData, theme, width, contextSegments(data.contextPercent, width)),
            ];
          } catch {
            return [""];
          }
        },
      };
    });
  };

  const restoreChrome = (ctx: ExtensionContext) => {
    if (ctx.mode !== "tui" || !ctx.hasUI) return;
    ctx.ui.setFooter(undefined);
    ctx.ui.setWorkingIndicator();
    ctx.ui.setWorkingMessage();
    ctx.ui.setHiddenThinkingLabel();
  };

  pi.on("session_start", async (_event, ctx) => {
    invalidateFooterStats();
    completedTodoIds.clear();
    if (isEnabled()) applyChrome(ctx);
  });

  pi.on("model_select", async () => {
    invalidateFooterStats();
    requestFooterRender?.();
  });
  pi.on("thinking_level_select", async () => requestFooterRender?.());
  pi.on("session_compact", async () => {
    invalidateFooterStats();
    requestFooterRender?.();
  });

  // working-time resets the message to the default on turn_end; re-apply our short one for the next turn.
  pi.on("agent_start", async (_event, ctx) => {
    if (isEnabled() && ctx.mode === "tui" && ctx.hasUI) ctx.ui.setWorkingMessage("working");
  });

  pi.registerCommand("clean-ui", {
    description: "Quiet terminal UI: /clean-ui on|off|status",
    handler: async (args, ctx) => {
      const action = parseCommand(args);
      if (!action) {
        ctx.ui.notify("Usage: /clean-ui on|off|status", "warning");
        return;
      }
      if (action === "status") {
        ctx.ui.notify(`clean-ui is ${isEnabled() ? "on" : "off"}`, "info");
        return;
      }
      enabled = action === "on";
      loaded = true;
      try {
        writeEnabled(statePath(), enabled);
      } catch (error) {
        ctx.ui.notify(`clean-ui: could not save state (${error instanceof Error ? error.message : String(error)})`, "warning");
      }
      if (enabled) applyChrome(ctx);
      else restoreChrome(ctx);
      ctx.ui.notify(`clean-ui ${action}. New tool cards use the ${enabled ? "clean" : "stock"} look; /reload redraws old ones.`, "info");
    },
  });
}

export default function cleanUiExtension(pi: ExtensionAPI): void {
  registerCleanUi(pi, () => join(getAgentDir(), STATE_FILE_NAME));
}

import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

// clean-ui: OMP-inspired quiet terminal chrome built only on public extension seams
// (registerToolRenderer, ctx.ui.setFooter/setWorkingIndicator/setHiddenThinkingLabel).
// Plain Unicode terminal art (box/branch strokes, check/cross signs, braille spinner): single-cell
// glyphs from ordinary monospace fonts. No emoji, no private-use/Nerd Font glyphs, no banners.

export const MAX_EXPANDED_LINES = 20;
export const STATE_FILE_NAME = "clean-ui.json";
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BUILTIN_TOOLS = new Set(["bash", "powershell", "read", "edit", "write", "grep", "find", "ls"]);
// Extension tools that stay quiet even if they bring their own (verbose) renderer.
const EXTRA_COLLAPSED_TOOLS = new Set(["todo"]);
const ELLIPSIS = "…";
const SUMMARY_SEP = " · ";
const FOOTER_SEP = " · ";

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

function charWidth(cp: number): number {
  if (cp === 0 || cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (
    (cp >= 0x300 && cp <= 0x36f) || (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xfe20 && cp <= 0xfe2f) || cp === 0x200d
  ) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd)
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
    if (!data.isError) return [];
    const line = firstErrorLine(resultText(data.result));
    return line === undefined ? [] : [row("╰", "error", "error", line)];
  }
  const { lines, skipped, from } = bodyLines(data);
  const isDiff = data.toolName === "edit" && !data.isError && typeof data.result.details?.diff === "string";
  const rows = lines.map((line) => {
    let color = "toolOutput";
    if (isDiff) color = line.startsWith("+") ? "success" : line.startsWith("-") ? "error" : "dim";
    return { color, text: line };
  });
  if (skipped > 0) {
    const note = { color: "muted", text: from === "tail" ? `… ${skipped} earlier lines` : `… ${skipped} more lines` };
    if (from === "tail") rows.unshift(note);
    else rows.push(note);
  }
  return rows.map((item, index) => row(index === rows.length - 1 ? "╰" : "│", "dim", item.color, item.text));
}

class LazyComponent implements RenderComponent {
  private readonly produce: (width: number) => string[];
  constructor(produce: (width: number) => string[]) {
    this.produce = produce;
  }
  render(width: number): string[] {
    return this.produce(Math.max(1, width));
  }
  invalidate(): void {}
}

interface SharedState {
  cleanUi?: CardData;
  stock?: Record<string, unknown>;
}

function cardOf(state: SharedState, toolName: string): CardData {
  state.cleanUi ??= { toolName, partial: true, isError: false };
  return state.cleanUi;
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
      const card = cardOf((context.state ??= {}), toolName);
      card.args = args;
      card.cwd = context.cwd;
      if (context.executionStarted && card.startedAt === undefined) card.startedAt = Date.now();
      return new LazyComponent((width) => [renderHeader(card, theme, width, home)]);
    },
    renderResult(result, options, theme, context) {
      const state: SharedState = (context.state ??= {});
      if (hasImage(result) && stock?.renderResult) {
        // Image results keep the stock presentation; the SDK draws the image itself.
        state.stock ??= {};
        return stock.renderResult(result, options, theme, { ...context, state: state.stock, lastComponent: undefined });
      }
      const card = cardOf(state, toolName);
      card.result = result;
      card.partial = Boolean(options?.isPartial);
      card.isError = Boolean(context.isError);
      card.args = context.args ?? card.args;
      card.cwd = context.cwd ?? card.cwd;
      if (!card.partial || card.isError) card.endedAt ??= Date.now();
      const expanded = Boolean(options?.expanded);
      return new LazyComponent((width) => renderBody(card, theme, width, expanded));
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
  announcedCompletionId?: string;
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
      return new LazyComponent((width) => state.visible ? component.render(width) : []);
    },
    renderResult(result, options, theme, context) {
      const state: TodoRenderState = (context.state ??= {});
      const args = context.args ?? state.args;
      const error = Boolean(context.isError);
      const completion = isTodoCompletion(args);
      const id = completion ? todoId(args) : undefined;
      if (hasImage(result) && stock?.renderResult) {
        state.visible = true;
        return card.renderResult!(result, options, theme, context);
      }
      if (error) {
        state.visible = true;
      } else if (options?.isPartial) {
        state.visible = false;
      } else if (isTodoCreation(args)) {
        state.visible = true;
      } else if (completion && (!id || state.announcedCompletionId === id || !completedIds.has(id))) {
        state.visible = true;
        if (id) {
          completedIds.add(id);
          state.announcedCompletionId = id;
        }
      } else {
        state.visible = false;
        // A successful reopening starts a new transition; querying or merely
        // redrawing an existing completed card must not change the dedup state.
        const reopenedId = todoId(args);
        if (reopenedId && ["update", "set"].includes(todoAction(args)) &&
            (args?.status === "pending" || args?.status === "in_progress")) completedIds.delete(reopenedId);
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
  cost?: number;
  branch?: string | null;
}

/**
 * `model · thinking · ctx 34% · $0.12 · branch`, never wider than `width`. Model leads in the accent
 * color, the rest is muted, separators are dim, and context turns warning/error when nearly full.
 * When space runs out the current field is ellipsized and later fields are dropped.
 */
export function formatFooter(data: FooterData, theme: ThemeLike, width: number): string {
  const rawPercent = data.contextPercent;
  const validPercent = typeof rawPercent === "number" && Number.isFinite(rawPercent) ? Math.min(100, Math.max(0, rawPercent)) : undefined;
  const rounded = validPercent === undefined ? undefined : Math.round(validPercent);
  const ctxColor = rounded === undefined ? "muted" : rounded >= 95 ? "error" : rounded >= 80 ? "warning" : "muted";
  const barWidth = Math.max(4, Math.min(20, Math.floor(Math.max(0, width) / 8)));
  const filled = rounded === undefined ? 0 : Math.round((rounded / 100) * barWidth);
  const bar = rounded === undefined ? "-".repeat(barWidth) : "#".repeat(filled) + "-".repeat(barWidth - filled);
  const context = rounded === undefined ? `ctx [${bar}] --` : `ctx [${bar}] ${rounded}%`;
  const parts: Array<[string, string]> = [
    ["accent", data.model || "no-model"],
    ["muted", data.thinking || "off"],
    [ctxColor, context],
    ["muted", `$${(data.cost ?? 0).toFixed(2)}`],
  ];
  if (data.branch) parts.push(["muted", data.branch]);
  let remaining = Math.max(0, width);
  let out = "";
  for (const [index, [color, raw]] of parts.entries()) {
    const sep = index === 0 ? 0 : cellWidth(FOOTER_SEP);
    if (remaining < sep + 1) break;
    const full = oneLine(raw);
    const text = cut(full, remaining - sep);
    out += (sep ? theme.fg("dim", FOOTER_SEP) : "") + theme.fg(color, text);
    remaining -= sep + cellWidth(text);
    if (text !== full) break;
  }
  return out;
}

function modeFooter(pi: ExtensionAPI, footerData: { getExtensionStatuses(): ReadonlyMap<string, string> }, theme: ThemeLike, width: number): string[] {
  // getCommands() is deliberately deferred until render: the SDK is not bound during extension loading.
  const commands = new Set(pi.getCommands().map((command) => command.name.replace(/^\/+/, "")));
  const statuses = footerData.getExtensionStatuses();
  const modeStatus = (key: string, command: string) => {
    const status = statuses.get(key);
    if (status === undefined) return commands.has(command) ? "OFF" : "--/unavailable";
    const label = oneLine(status);
    if (label === "ON" || label === "OFF") return label;
    return label ? `ON (${label})` : "ON";
  };
  const known = new Set(["codex-fast-mode", "maestro"]);
  const fields = [`fast ${modeStatus("codex-fast-mode", "fast")}`, `maestro ${modeStatus("maestro", "maestro")}`];
  for (const [key, value] of statuses) if (!known.has(key)) fields.push(`${key} ${value}`);
  const lines: string[] = [];
  let line = "";
  for (const rawField of fields) {
    const field = oneLine(rawField);
    const candidate = line ? `${line}${FOOTER_SEP}${field}` : field;
    if (cellWidth(field) <= width && (!line || cellWidth(candidate) <= width)) {
      line = candidate;
      continue;
    }
    if (line) lines.push(theme.fg("muted", line));
    line = "";
    for (const word of field.split(" ")) {
      const token = cut(word, width);
      const wrapped = line ? `${line}${FOOTER_SEP}${token}` : token;
      if (line && cellWidth(wrapped) > width) {
        lines.push(theme.fg("muted", line));
        line = token;
      } else {
        line = wrapped;
      }
    }
  }
  if (line) lines.push(theme.fg("muted", line));
  return lines;
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

function sessionCost(ctx: ExtensionContext): number {
  let cost = 0;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && (entry.message as any)?.role === "assistant") {
      const total = (entry.message as any).usage?.cost?.total;
      if (typeof total === "number") cost += total;
    }
  }
  return cost;
}

export function registerCleanUi(pi: ExtensionAPI, statePath: () => string): void {
  let enabled = true;
  let loaded = false;
  let requestFooterRender: (() => void) | undefined;
  const completedTodoIds = new Set<string>();
  const isEnabled = () => {
    if (!loaded) {
      enabled = readEnabled(statePath());
      loaded = true;
    }
    return enabled;
  };
  const home = process.env.USERPROFILE || process.env.HOME;

  pi.registerToolRenderer((toolName, next) => {
    // Decided per card at creation: existing cards keep their look until the transcript is redrawn.
    if (!isEnabled()) return next();
    const stock = next();
    if (toolName === "todo") return createTodoRenderers(stock, home, completedTodoIds);
    if (!shouldCollapse(toolName, stock)) return stock;
    return createCardRenderers(toolName, stock, home);
  });

  const applyChrome = (ctx: ExtensionContext) => {
    if (ctx.mode !== "tui" || !ctx.hasUI) return;
    const ui = ctx.ui;
    // Empty label renders no line at all (pi-tui Text skips blank text). It is only consulted when
    // the hideThinkingBlock setting is true; extensions cannot flip that setting.
    ui.setHiddenThinkingLabel("");
    ui.setWorkingIndicator({ frames: SPINNER_FRAMES.map((frame) => ui.theme.fg("accent", frame)), intervalMs: 80 });
    ui.setWorkingMessage("working");
    ui.setFooter((tui, theme, footerData) => {
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
            return [
              formatFooter(
                {
                  model: ctx.model?.id,
                  thinking: pi.getThinkingLevel(),
                  contextPercent: ctx.getContextUsage()?.percent,
                  cost: sessionCost(ctx),
                  branch: footerData.getGitBranch(),
                },
                theme,
                width,
              ),
              ...modeFooter(pi, footerData, theme, width),
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
    completedTodoIds.clear();
    if (isEnabled()) applyChrome(ctx);
  });

  pi.on("model_select", async () => requestFooterRender?.());
  pi.on("thinking_level_select", async () => requestFooterRender?.());
  pi.on("session_compact", async () => requestFooterRender?.());

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

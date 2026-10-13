import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";

export interface SessionUsageTotals {
  provider: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

const TOKEN_FIELDS = ["input", "output", "cacheRead", "cacheWrite"] as const;
const COST_FIELDS = ["input", "output", "cacheRead", "cacheWrite", "total"] as const;
const SOURCE_LABEL = "Current session/branch; not provider quotas or billing balance";
const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

function cleanLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(ANSI_PATTERN, "").replace(/[\x00-\x1f\x7f-\x9f]/g, "").trim();
  return cleaned || undefined;
}

function nonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function addFinite(current: number, next: number): number {
  const sum = current + next;
  return Number.isFinite(sum) ? sum : Number.MAX_VALUE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Aggregate only assistant message usage from the supplied active branch. */
export function aggregateSessionUsage(entries: readonly unknown[]): SessionUsageTotals[] {
  const byModel = new Map<string, SessionUsageTotals>();
  for (const entry of entries) {
    if (!isRecord(entry) || entry.type !== "message" || !isRecord(entry.message) || entry.message.role !== "assistant") continue;
    const provider = cleanLabel(entry.message.provider);
    const model = cleanLabel(entry.message.model);
    const usage = entry.message.usage;
    if (!provider || !model || !isRecord(usage)) continue;

    const key = `${provider}\u0000${model}`;
    let row = byModel.get(key);
    if (!row) {
      row = { provider, model, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
      byModel.set(key, row);
    }
    for (const field of TOKEN_FIELDS) row[field] = addFinite(row[field], nonNegative(usage[field]));
    const tokenSum = TOKEN_FIELDS.reduce((sum, field) => addFinite(sum, nonNegative(usage[field])), 0);
    row.totalTokens = addFinite(row.totalTokens, tokenSum);
    const cost = isRecord(usage.cost) ? usage.cost : undefined;
    if (cost) for (const field of COST_FIELDS) row.cost[field] = addFinite(row.cost[field], nonNegative(cost[field]));
  }
  return [...byModel.values()];
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}

/** Render local session usage, clearly distinguished from provider account quotas/billing. */
export function formatSessionUsage(rows: readonly SessionUsageTotals[]): string {
  const lines = ["Session usage (assistant messages)", SOURCE_LABEL];
  if (rows.length === 0) {
    lines.push("No assistant usage recorded on this branch.");
    lines.push("Estimated SDK cost: $0.000000 USD");
    return lines.join("\n");
  }

  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 };
  for (const row of rows) {
    lines.push(`${row.provider} / ${row.model}`);
    lines.push(`  Tokens: input ${formatCount(row.input)} · output ${formatCount(row.output)} · cache read ${formatCount(row.cacheRead)} · cache write ${formatCount(row.cacheWrite)} · total ${formatCount(row.totalTokens)}`);
    lines.push(`  Estimated SDK cost (input/output/cache read/cache write/total): ${formatUsd(row.cost.input)} / ${formatUsd(row.cost.output)} / ${formatUsd(row.cost.cacheRead)} / ${formatUsd(row.cost.cacheWrite)} / ${formatUsd(row.cost.total)} USD`);
    totals.input = addFinite(totals.input, row.input);
    totals.output = addFinite(totals.output, row.output);
    totals.cacheRead = addFinite(totals.cacheRead, row.cacheRead);
    totals.cacheWrite = addFinite(totals.cacheWrite, row.cacheWrite);
    totals.totalTokens = addFinite(totals.totalTokens, row.totalTokens);
    totals.cost = addFinite(totals.cost, row.cost.total);
  }
  lines.push(`All models: input ${formatCount(totals.input)} · output ${formatCount(totals.output)} · cache read ${formatCount(totals.cacheRead)} · cache write ${formatCount(totals.cacheWrite)} · total ${formatCount(totals.totalTokens)}`);
  lines.push(`Estimated SDK cost total: ${formatUsd(totals.cost)} USD`);
  return lines.join("\n");
}

const QUOTA_LABEL = "Cotas dos provedores: não consultadas";
const ACTIVITY_LABEL = "Atividade desta branch — não é histórico global";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function timestampMs(entry: unknown): number | undefined {
  if (!isRecord(entry) || typeof entry.timestamp !== "string") return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(entry.timestamp);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  calendarDate.setUTCHours(Number(hour), Number(minute), Number(second), 0);
  if (calendarDate.getUTCFullYear() !== Number(year) || calendarDate.getUTCMonth() !== Number(month) - 1 || calendarDate.getUTCDate() !== Number(day)) return undefined;
  const parsed = Date.parse(entry.timestamp);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mondayUtc(timestamp: number): number {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.getTime();
}

export interface SessionUsageActivityGrid {
  weeks: number[][];
  months: string[];
  startWeek: number;
  endWeek: number;
  asOf: number;
  dated: number;
  inWindow: number;
  excluded: number;
}

/** Count timestamped assistant responses in the 53 UTC weeks ending this week. */
export function activityGrid(entries: readonly unknown[], now = Date.now()): SessionUsageActivityGrid {
  const endWeek = mondayUtc(now);
  const startWeek = endWeek - 52 * WEEK_MS;
  const valid: number[] = [];
  let excluded = 0;
  for (const entry of entries) {
    if (!isRecord(entry) || entry.type !== "message" || !isRecord(entry.message) || entry.message.role !== "assistant") continue;
    const timestamp = timestampMs(entry);
    if (timestamp === undefined || timestamp > now) excluded++;
    else valid.push(timestamp);
  }
  const weeks = Array.from({ length: 53 }, () => Array<number>(7).fill(0));
  let inWindow = 0;
  for (const timestamp of valid) {
    const week = Math.floor((endWeek - mondayUtc(timestamp)) / WEEK_MS);
    if (week < 0 || week >= 53) continue;
    const day = (new Date(timestamp).getUTCDay() + 6) % 7;
    weeks[52 - week]![day]++;
    inWindow++;
  }
  const months: string[] = [];
  const seenMonths = new Set<string>();
  const firstMonth = new Date(startWeek);
  firstMonth.setUTCDate(1);
  for (let monthStart = firstMonth.getTime(); monthStart <= now;) {
    const date = new Date(monthStart);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    if (!seenMonths.has(key)) {
      seenMonths.add(key);
      months.push(date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }));
    }
    date.setUTCMonth(date.getUTCMonth() + 1);
    monthStart = date.getTime();
  }
  return { weeks, months, startWeek, endWeek, asOf: now, dated: valid.length, inWindow, excluded };
}

function graphemeWidth(grapheme: string): number {
  if (/^\p{Mark}+$/u.test(grapheme)) return 0;
  return /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}]/u.test(grapheme) ? 2 : 1;
}

function visibleWidth(value: string): number {
  const plain = value.replace(ANSI_PATTERN, "");
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(plain)]
    .reduce((width, item) => width + graphemeWidth(item.segment), 0);
}

function truncateWidth(value: string, width: number): string {
  if (width <= 0) return "";
  const tokens = value.match(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]|[^\x1b]+/gu) ?? [];
  let output = "";
  let used = 0;
  for (const token of tokens) {
    if (token.startsWith("\x1b")) { output += token; continue; }
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(token)) {
      const cells = graphemeWidth(segment);
      if (used + cells > width) return `${output}\x1b[0m`;
      output += segment;
      used += cells;
    }
  }
  return output;
}

function wrapPlain(text: string, width: number): string[] {
  const result: string[] = [];
  let line = "";
  let used = 0;
  for (const word of text.split(" ")) {
    const wordWidth = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(word)]
      .reduce((sum, item) => sum + graphemeWidth(item.segment), 0);
    if (line && used + 1 + wordWidth <= width) { line += ` ${word}`; used += 1 + wordWidth; continue; }
    if (line) result.push(line);
    if (wordWidth <= width) { line = word; used = wordWidth; continue; }
    line = "";
    used = 0;
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(word)) {
      const cells = graphemeWidth(segment);
      if (used + cells > width && line) { result.push(line); line = ""; used = 0; }
      line += segment;
      used += cells;
    }
  }
  if (line) result.push(line);
  return result;
}

function panelLines(rows: readonly SessionUsageTotals[], entries: readonly unknown[], width: number, theme: Theme): string[] {
  const maxWidth = Math.max(1, Math.floor(width));
  const clip = (line: string) => truncateWidth(line, maxWidth);
  const title = theme.style(" Usage ", { fg: "accent", bold: true });
  const muted = (text: string) => theme.fg("muted", text);
  const lines = [clip(title), ...wrapPlain(QUOTA_LABEL, maxWidth).map(muted), ...wrapPlain(SOURCE_LABEL, maxWidth).map(muted), ""];
  if (rows.length === 0) {
    lines.push(clip("No assistant usage recorded on this branch."));
    lines.push(clip("Estimated SDK cost: $0.000000 USD"));
  } else {
    const providers = new Map<string, SessionUsageTotals[]>();
    for (const row of rows) providers.set(row.provider, [...(providers.get(row.provider) ?? []), row]);
    for (const [provider, models] of providers) {
      lines.push(clip(theme.style(` ${provider} `, { fg: "success", bold: true })));
      for (const row of models) {
        lines.push(...wrapPlain(`Model: ${row.model}`, maxWidth).map(clip));
        for (const detail of [
          `Tokens: input ${formatCount(row.input)} · output ${formatCount(row.output)} · total ${formatCount(row.totalTokens)}`,
          `Cache tokens: read ${formatCount(row.cacheRead)} · write ${formatCount(row.cacheWrite)}`,
          `Estimated cost USD: input ${formatUsd(row.cost.input)} · output ${formatUsd(row.cost.output)}`,
          `Cache cost USD: read ${formatUsd(row.cost.cacheRead)} · write ${formatUsd(row.cost.cacheWrite)} · total ${formatUsd(row.cost.total)}`,
        ]) lines.push(...wrapPlain(detail, maxWidth).map(clip));
      }
    }
  }
  lines.push("");
  lines.push(...wrapPlain(ACTIVITY_LABEL, maxWidth).map(muted));
  const activity = activityGrid(entries);
  if (activity.dated === 0) {
    lines.push(clip("No dated assistant responses for this branch."));
    if (activity.excluded > 0) lines.push(clip(`No date used for ${activity.excluded} assistant responses (missing, invalid, or future timestamp).`));
  } else {
    const dateLabel = `UTC range: ${new Date(activity.startWeek).toISOString().slice(0, 10)} – ${new Date(activity.asOf).toISOString().slice(0, 10)}`;
    lines.push(...wrapPlain(dateLabel, maxWidth).map(muted));
    lines.push(...wrapPlain(`Months: ${activity.months.join(" ")}`, maxWidth).map(muted));
    const available = Math.max(1, maxWidth - 12);
    const columns = Math.min(53, available);
    const start = 53 - columns;
    const narrow = columns < 53;
    lines.push(clip(`${narrow ? `Narrow: last ${columns}w` : "53-week calendar"} · assistant responses`));
    const symbols = ["·", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
    for (let day = 0; day < 7; day++) {
      const cells = activity.weeks.slice(start).map((week) => {
        const count = week[day] ?? 0;
        return count === 0 ? "·" : symbols[Math.min(symbols.length - 1, count)]!;
      }).join("");
      lines.push(clip(`${["M", "T", "W", "T", "F", "S", "S"][day]} ${cells}`));
    }
    lines.push(clip(`Dated responses: ${activity.dated} · in UTC window: ${activity.inWindow}`));
    if (activity.inWindow === 0) lines.push(clip("No assistant responses in displayed UTC window."));
    if (activity.excluded > 0) lines.push(clip(`No date used for ${activity.excluded} assistant responses (missing, invalid, or future timestamp).`));
  }
  lines.push("");
  lines.push(clip(muted("Press Enter or Esc to close")));
  return lines;
}

class SessionUsagePanel {
  private readonly rows: readonly SessionUsageTotals[];
  private readonly entries: readonly unknown[];
  private readonly theme: Theme;
  private readonly done: () => void;
  constructor(rows: readonly SessionUsageTotals[], entries: readonly unknown[], theme: Theme, done: () => void) {
    this.rows = rows;
    this.entries = entries;
    this.theme = theme;
    this.done = done;
  }
  render(width: number): string[] {
    const safeWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
    if (safeWidth === 0) return [];
    if (safeWidth < 3) return panelLines(this.rows, this.entries, safeWidth, this.theme).map((line) => truncateWidth(line, safeWidth));
    const innerWidth = safeWidth - 2;
    const content = panelLines(this.rows, this.entries, innerWidth, this.theme);
    const border = "─".repeat(innerWidth);
    const frameRow = (line: string) => {
      const clipped = truncateWidth(line, innerWidth);
      const padding = Math.max(0, innerWidth - visibleWidth(clipped));
      return `│${clipped}${" ".repeat(padding)}│`;
    };
    return [truncateWidth(`┌${border}┐`, safeWidth), ...content.map(frameRow), truncateWidth(`└${border}┘`, safeWidth)];
  }
  handleInput(data: string): void { if (data === "\x1b" || data === "\r" || data === "\n") this.done(); }
  invalidate(): void { /* Theme is read during render; no cached ANSI content. */ }
}

export function registerSessionUsage(pi: ExtensionAPI): void {
  // SDK 1.2 binds action methods after factories finish loading. A bound caller
  // can check conflicts; the native loader rejects this query before binding.
  try {
    if (pi.getCommands().some((command) => command.name === "usage")) return;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "Extension runtime not initialized. Action methods cannot be called during extension loading.") throw error;
  }

  pi.registerCommand("usage", {
    description: "Show current session/branch token usage and estimated SDK cost by provider/model",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const branch = ctx.sessionManager.getBranch();
      const rows = aggregateSessionUsage(branch);
      const text = formatSessionUsage(rows);
      if (ctx.mode === "tui" && ctx.hasUI) {
        const ui = ctx.ui as typeof ctx.ui & { custom?: ExtensionCommandContext["ui"]["custom"] };
        if (typeof ui.custom === "function") {
          await ui.custom<void>((_tui, theme, _keybindings, done) => new SessionUsagePanel(rows, branch, theme, done));
        } else ctx.ui.notify(text, "info");
      } else pi.sendMessage({ customType: "session-usage", content: text, display: true }, { triggerTurn: false });
    },
  });
}

export default function sessionUsage(pi: ExtensionAPI): void {
  registerSessionUsage(pi);
}

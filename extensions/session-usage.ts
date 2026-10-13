import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

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
      const text = formatSessionUsage(aggregateSessionUsage(ctx.sessionManager.getBranch()));
      if (ctx.mode === "tui" && ctx.hasUI) ctx.ui.notify(text, "info");
      else pi.sendMessage({ customType: "session-usage", content: text, display: true }, { triggerTurn: false });
    },
  });
}

export default function sessionUsage(pi: ExtensionAPI): void {
  registerSessionUsage(pi);
}

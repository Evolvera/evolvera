import { loadJiti } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createJiti } = await loadJiti(import.meta.url);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const coordinator = await jiti.import(path.join(root, "plastic-memory/runtime/coordinator.ts"));

const SUMMARY_TOKENS = 12_000;
const RESERVE_TOKENS = 16_384;
function estimateMessage(message) {
  return Math.ceil(JSON.stringify(message).length / 4);
}
function systemTokens(systemPrompt) {
  return estimateMessage({ role: "user", content: [{ type: "text", text: systemPrompt }] });
}
function messageEntry(id, text) {
  return { type: "message", id, message: { role: "user", content: [{ type: "text", text }] } };
}
function context(entries, usageTokens, options = {}) {
  const result = {
    getContextUsage: () => ({ tokens: usageTokens, contextWindow: options.contextWindow ?? 100_000 }),
    getSystemPrompt: () => options.systemPrompt ?? "synthetic system prompt",
    sessionManager: { buildContextEntries: () => entries },
  };
  if (options.unavailable) delete result.getContextUsage;
  return result;
}
function estimateContext(ctx, entries) {
  return systemTokens(ctx.getSystemPrompt()) + entries.reduce((sum, entry) => sum + estimateMessage(entry.message), 0);
}

// A small sample must remain byte-identical to the existing uncalibrated math.
{
  const ctx = context([] , 5_000);
  const budget = coordinator.physicalBudgetFor(ctx, []);
  assert.deepEqual(budget, {
    contextWindow: 100_000,
    fixedTokens: systemTokens(ctx.getSystemPrompt()) + SUMMARY_TOKENS + RESERVE_TOKENS,
    entryTokens: {},
  });
  assert.equal(coordinator.calibrationFactorFor(ctx), 1);
}

const largeEntries = [
  messageEntry("large-1", "a".repeat(5_000)),
  messageEntry("large-2", "b".repeat(5_000)),
  messageEntry("large-3", "c".repeat(5_000)),
];
const largeEstimate = estimateContext(context(largeEntries, 1), largeEntries);
assert.equal(largeEstimate >= 2_000, true);
const largeCtx = context(largeEntries, largeEstimate * 1.7);
const largeFactor = coordinator.calibrationFactorFor(largeCtx);
assert.equal(largeFactor, 1.7);
const largeBudget = coordinator.physicalBudgetFor(largeCtx, largeEntries);
assert.equal(largeBudget.fixedTokens, Math.ceil((systemTokens(largeCtx.getSystemPrompt()) + SUMMARY_TOKENS) * 1.7) + RESERVE_TOKENS);
assert.equal(largeBudget.fixedTokens - Math.ceil((systemTokens(largeCtx.getSystemPrompt()) + SUMMARY_TOKENS) * 1.7), RESERVE_TOKENS);
for (const entry of largeEntries) {
  assert.equal(largeBudget.entryTokens[entry.id], Math.ceil(estimateMessage(entry.message) * 1.7));
}

// A provider count at or below our estimate can never loosen the budget.
for (const usageTokens of [largeEstimate, largeEstimate / 2]) {
  const ctx = context(largeEntries, usageTokens);
  assert.equal(coordinator.calibrationFactorFor(ctx), 1);
  const budget = coordinator.physicalBudgetFor(ctx, largeEntries);
  assert.equal(budget.fixedTokens, systemTokens(ctx.getSystemPrompt()) + SUMMARY_TOKENS + RESERVE_TOKENS);
  assert.equal(budget.entryTokens[largeEntries[0].id], estimateMessage(largeEntries[0].message));
}

// Pathological evidence is bounded so one bad ratio cannot make every cut unfittable.
{
  const ctx = context(largeEntries, largeEstimate * 10);
  assert.equal(coordinator.calibrationFactorFor(ctx), 3);
  const budget = coordinator.physicalBudgetFor(ctx, largeEntries);
  assert.equal(budget.entryTokens[largeEntries[0].id], Math.ceil(estimateMessage(largeEntries[0].message) * 3));
}

// Invalid evidence, unavailable host APIs, and an unestimable context entry fail open to 1.
for (const usageTokens of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.equal(coordinator.calibrationFactorFor(context(largeEntries, usageTokens)), 1, `invalid usage ${usageTokens}`);
}
assert.equal(coordinator.calibrationFactorFor(context(largeEntries, largeEstimate * 2, { unavailable: true })), 1);
assert.equal(coordinator.calibrationFactorFor(context([{ type: "unrecognized", id: "unestimable" }], 10_000)), 1);

// Both physical paths use the same calibrated fixed/per-entry values for a cut.
{
  let contextWindow = 100_000;
  const ctx = {
    ...context(largeEntries, largeEstimate * 1.7),
    getContextUsage: () => ({ tokens: largeEstimate * 1.7, contextWindow }),
  };
  const initial = coordinator.physicalBudgetFor(ctx, largeEntries);
  contextWindow = initial.fixedTokens + initial.entryTokens["large-3"];
  const budget = coordinator.physicalBudgetFor(ctx, largeEntries);
  assert.equal(coordinator.physicalTailFits(ctx, largeEntries, "large-3"), true);
  assert.equal(coordinator.physicalTailFits(ctx, largeEntries, "large-1"), false);
  for (const cutId of ["large-1", "large-3"]) {
    const index = largeEntries.findIndex((entry) => entry.id === cutId);
    const expected = budget.fixedTokens + largeEntries.slice(index).reduce((sum, entry) => sum + budget.entryTokens[entry.id], 0) <= contextWindow;
    assert.equal(coordinator.physicalTailFits(ctx, largeEntries, cutId), expected, `${cutId}: tail agreement`);
  }
}

console.log("PLASTIC_MEMORY_TOKEN_CALIBRATION: PASS (sample guard, provider calibration, reserve preservation, clamping, fallbacks, and tail agreement)");

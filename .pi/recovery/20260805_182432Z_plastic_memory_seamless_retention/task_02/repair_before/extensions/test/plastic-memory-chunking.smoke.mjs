import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));
const ledger = await jiti.import(path.join(root, "plastic-memory/session/ledger.ts"));
const cycles = await jiti.import(path.join(root, "plastic-memory/session/cycles.ts"));
const schedulerModule = await jiti.import(path.join(root, "plastic-memory/workers/scheduler.ts"));

const binding = { sessionId: ids.sessionDigest("chunking-smoke", { generation: 1 }), generation: 1, branchId: "main" };
const MAX = 100_000;

let next = 0;
const chain = [];
function entry(role, tokenCount, text, toolCall = false) {
  const content = toolCall ? [{ type: "toolCall", id: `t${next}`, name: "read" }] : [{ type: "text", text }];
  const made = { type: "message", id: `e${++next}`, parentId: chain.at(-1)?.id ?? null, message: { role, content }, tokenCount };
  chain.push(made);
  return made;
}
// Three completed turns of 40k each: prefix@a1=40k, prefix@a2=80k, prefix@a3=120k > MAX.
const u1 = entry("user", 20_000, "goal one");
const a1 = entry("assistant", 20_000, "answer one");
const u2 = entry("user", 20_000, "goal two");
const a2 = entry("assistant", 20_000, "answer two");
const u3 = entry("user", 20_000, "goal three");
const a3 = entry("assistant", 20_000, "answer three");
const window3 = [u1, a1, u2, a2, u3, a3];

// A.1 — an over-bound completed span is preserved as one identity and partitioned safely.
const first = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: window3, maxTokens: MAX });
assert.equal(first.status, "ready");
assert.deepEqual(first.span.sourceEntryIds, [u1.id, a1.id, u2.id, a2.id, u3.id, a3.id]);
assert.equal(first.span.sourceStartId, u1.id);
assert.equal(first.span.sourceEndId, a3.id);
assert.equal(first.span.completedTurnEndId, a3.id);
assert.equal(first.tokenCount, 120_000);
const firstPartition = cycles.partitionCompletedTurnSnapshot(first, window3, MAX);
assert.equal(firstPartition.ok, true);
assert.deepEqual(firstPartition.chunks.map((chunk) => chunk.sourceEntryIds), [[u1.id, a1.id, u2.id, a2.id], [u3.id, a3.id]]);
assert.ok(firstPartition.chunks.every((chunk) => chunk.tokenCount <= MAX));
const toolEntries = [
  { type: "message", id: "tool-u", parentId: null, message: { role: "user", content: [{ type: "text", text: "tool goal" }] }, tokenCount: 20_000 },
  { type: "message", id: "tool-a", parentId: "tool-u", message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "read" }], stopReason: "toolUse" }, tokenCount: 30_000 },
  { type: "message", id: "tool-r", parentId: "tool-a", message: { role: "toolResult", toolCallId: "call-1", content: [{ type: "text", text: "result" }] }, tokenCount: 30_000 },
  { type: "message", id: "tool-end", parentId: "tool-r", message: { role: "assistant", content: [{ type: "text", text: "done" }] }, tokenCount: 20_000 },
  { type: "message", id: "tool-u2", parentId: "tool-end", message: { role: "user", content: [{ type: "text", text: "next" }] }, tokenCount: 10_000 },
  { type: "message", id: "tool-a2", parentId: "tool-u2", message: { role: "assistant", content: [{ type: "text", text: "next done" }] }, tokenCount: 10_000 },
];
const toolSnapshot = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: toolEntries, maxTokens: MAX });
const toolPartition = cycles.partitionCompletedTurnSnapshot(toolSnapshot, toolEntries, MAX);
assert.equal(toolPartition.ok, true);
assert.deepEqual(toolPartition.chunks[0].sourceEntryIds, ["tool-u", "tool-a", "tool-r", "tool-end"], "tool call/result stays indivisible");
const impossibleToolEntries = [
  { type: "message", id: "im-u", parentId: null, message: { role: "user", content: [{ type: "text", text: "impossible" }] }, tokenCount: 10_000 },
  { type: "message", id: "im-a", parentId: "im-u", message: { role: "assistant", content: [{ type: "toolCall", id: "im-call", name: "read" }], stopReason: "toolUse" }, tokenCount: 60_000 },
  { type: "message", id: "im-r", parentId: "im-a", message: { role: "toolResult", toolCallId: "im-call", content: [{ type: "text", text: "large result" }] }, tokenCount: 60_000 },
  { type: "message", id: "im-end", parentId: "im-r", message: { role: "assistant", content: [{ type: "text", text: "done" }] }, tokenCount: 10_000 },
];
const impossibleToolSnapshot = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: impossibleToolEntries, maxTokens: MAX });
assert.equal(impossibleToolSnapshot.status, "oversized");
assert.deepEqual(cycles.partitionCompletedTurnSnapshot(impossibleToolSnapshot, impossibleToolEntries, MAX), { ok: false, chunks: [], reason: "indivisible-message-group-exceeds-bound" });

// A.2 — the leftover turn remains a distinct fitting snapshot identity.
const second = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: [u3, a3], maxTokens: MAX });
assert.equal(second.status, "ready");
assert.deepEqual(second.span.sourceEntryIds, [u3.id, a3.id]);
assert.notEqual(second.snapshotId, first.snapshotId, "two different chunks are two different snapshots");
assert.notEqual(second.cycleId, first.cycleId);
assert.equal(second.tokenCount, 40_000);

// A.3 — a single turn larger than the bound still skips exactly as before.
const hugeUser = { type: "message", id: "h1", parentId: null, message: { role: "user", content: [{ type: "text", text: "huge" }] }, tokenCount: 60_000 };
const hugeAssistant = { type: "message", id: "h2", parentId: "h1", message: { role: "assistant", content: [{ type: "text", text: "huge answer" }] }, tokenCount: 60_000 };
const huge = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: [hugeUser, hugeAssistant], maxTokens: MAX });
assert.equal(huge.status, "oversized");
assert.deepEqual(huge.span.sourceEntryIds, ["h1", "h2"], "oversized keeps the whole completed window, as before");
assert.equal(huge.tokenCount, 120_000);
assert.equal(cycles.beginCycleAttempt(huge, []).allowed, false);

// A.4 — no terminal assistant at all is still empty-valid.
const toolUser = { type: "message", id: "p1", parentId: null, message: { role: "user", content: [{ type: "text", text: "run" }] }, tokenCount: 10 };
const toolCall = { type: "message", id: "p2", parentId: "p1", message: { role: "assistant", content: [{ type: "toolCall", id: "t", name: "read" }] }, tokenCount: 10 };
const pending = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: [toolUser, toolCall], maxTokens: MAX });
assert.equal(pending.status, "empty-valid");
assert.deepEqual(pending.span.sourceEntryIds, []);

// A.5 — IDENTITY-PRESERVATION GUARD: a window that already fits must produce exactly the
// span, tokenCount and snapshotId the pre-chunking implementation produced. The expectation
// is recomputed here from the entries with the same primitives (ledger.sourceDigest +
// ids.recordDigest over {binding, span, completedTurnBoundary}), not read from the snapshot.
const fitting = [u1, a1, u2, a2];
const expectedSpan = {
  sourceStartId: u1.id,
  sourceEndId: a2.id,
  sourceEntryIds: [u1.id, a1.id, u2.id, a2.id],
  sourceDigest: ledger.sourceDigest(fitting),
  completedTurnEndId: a2.id,
};
const expectedSnapshotId = ids.recordDigest(binding.sessionId, { generation: binding.generation, branchId: binding.branchId }, { binding, span: expectedSpan, completedTurnBoundary: expectedSpan.completedTurnEndId });
const fits = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: fitting, maxTokens: MAX });
assert.equal(fits.status, "ready");
assert.deepEqual(fits.span, expectedSpan);
assert.equal(fits.tokenCount, 80_000);
assert.equal(fits.snapshotId, expectedSnapshotId);
assert.equal(fits.cycleId, ids.makeCycleId(binding.sessionId, expectedSnapshotId));
assert.notEqual(fits.snapshotId, first.snapshotId, "the full-span snapshot owns the full completed coverage identity");

// B — each bounded observer call sees exactly one immutable chunk in order.
const captured = [];
const model = { provider: "openai-codex", id: "gpt-5.6-luna", contextWindow: 200_000, maxTokens: 16_000 };
const offlineRuntime = {
  modelRegistry: {
    find: () => model,
    async getProviderAuth() { return { apiKey: "fake-only" }; },
  },
  async agentLoop(prompts, context) {
    const request = JSON.parse(prompts[0].content[0].text);
    captured.push({ role: context.role, sourceEntryIds: request.sourceEntryIds ?? request.observations?.flatMap((item) => item.sourceEntryIds) ?? [] });
    if (context.role === "observer") return { observations: [{ content: `fact ${request.sourceEntryIds[0]}`, timestamp: "2026-08-03", relevance: "medium", sourceEntryIds: request.sourceEntryIds }] };
    return { reflections: [{ content: "aggregate reflection", supportingObservationIds: request.observations.map((item) => item.id) }] };
  },
};
// The scheduler uses the DEFAULT 160k bound: first two 60k turns fit together, third is a second chunk.
const b0 = entry("user", 30_000, "scheduler goal one");
const b1 = entry("assistant", 30_000, "scheduler answer one");
const b2 = entry("user", 30_000, "scheduler goal two");
const b3 = entry("assistant", 30_000, "scheduler answer two");
const b4 = entry("user", 30_000, "scheduler goal three");
const b5 = entry("assistant", 30_000, "scheduler answer three");
const schedulerWindow = [b0, b1, b2, b3, b4, b5];
const scheduler = schedulerModule.createCycleScheduler();
const result = await scheduler.trigger({
  binding,
  branchEntries: schedulerWindow,
  bootstrap: { activeEntryIds: schedulerWindow.map((item) => item.id), historicalPrefixIds: [], historicalGap: "historical-unindexed" },
  records: [],
  runtime: offlineRuntime,
  append: () => {},
});
assert.equal(result.status, "closed");
assert.deepEqual(result.snapshot.span.sourceEntryIds, schedulerWindow.map((item) => item.id), "the full completed span is preserved");
assert.equal(result.snapshot.tokenCount, 180_000);
assert.deepEqual(captured.filter((call) => call.role === "observer").map((call) => call.sourceEntryIds), [[b0.id, b1.id, b2.id, b3.id], [b4.id, b5.id]]);
assert.equal(captured.filter((call) => call.role === "reflector").length, 1, "one reflection covers the aggregate");

console.log("PLASTIC_MEMORY_CHUNKING: PASS (prefix chunking, reachable leftover, single-huge-turn oversized, empty-valid, identity preservation, observer span contract)");

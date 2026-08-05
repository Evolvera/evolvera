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

// A.1 — oversized window chunks to the largest terminal-ending PREFIX within budget.
const first = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: window3, maxTokens: MAX });
assert.equal(first.status, "ready");
assert.deepEqual(first.span.sourceEntryIds, [u1.id, a1.id, u2.id, a2.id]);
assert.equal(first.span.sourceStartId, u1.id);
assert.equal(first.span.sourceEndId, a2.id);
assert.equal(first.span.completedTurnEndId, a2.id);
assert.equal(first.tokenCount, 80_000);
assert.equal(first.span.sourceEntryIds.includes(a3.id), false, "coverage is a prefix, never the whole window");
assert.equal(first.span.sourceEntryIds[0], u1.id, "coverage is a prefix, never a suffix");

// A.2 — the leftover turn is still reachable as the next cycle's prefix, with a distinct identity.
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
assert.equal(fits.snapshotId, first.snapshotId, "the chunk of an oversized window is identical to the same fitting window");

// B — the observer must be shown exactly the span entries, in span order.
const captured = [];
const model = { provider: "openai-codex", id: "gpt-5.6-luna", contextWindow: 200_000, maxTokens: 16_000 };
const offlineRuntime = {
  modelRegistry: {
    find: () => model,
    async getProviderAuth() { return { apiKey: "fake-only" }; },
  },
  async agentLoop(prompts, context) {
    const request = JSON.parse(prompts[0].content[0].text);
    captured.push({ role: context.role, sourceEntryIds: (request.snapshot.sourceEntries ?? []).map((item) => item.id) });
    return { rejected: true }; // no manifest: the cycle fails closed; no network is ever touched
  },
};
// The scheduler never passes `maxTokens`, so this window is sized against the DEFAULT
// one-shot bound (160k): prefix@b1=60k, prefix@b2=120k, prefix@b3=180k > default.
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
assert.equal(result.status, "failed", "the offline stub returns no manifest, so the cycle fails closed");
assert.deepEqual(result.snapshot.span.sourceEntryIds, [b0.id, b1.id, b2.id, b3.id], "the scheduler snapshot is the chunked prefix under the default bound");
assert.equal(result.snapshot.tokenCount, 120_000, "the default bound admits a 120k prefix that the old 100k bound would have rejected");
assert.equal(captured.length, 1);
assert.equal(captured[0].role, "observer");
assert.deepEqual(captured[0].sourceEntryIds, result.snapshot.span.sourceEntryIds, "observer sees exactly the span entries, in span order");

console.log("PLASTIC_MEMORY_CHUNKING: PASS (prefix chunking, reachable leftover, single-huge-turn oversized, empty-valid, identity preservation, observer span contract)");

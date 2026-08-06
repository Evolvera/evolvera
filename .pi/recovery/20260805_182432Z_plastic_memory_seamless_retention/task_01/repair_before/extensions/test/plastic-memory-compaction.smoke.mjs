import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));
const safety = await jiti.import(path.join(root, "plastic-memory/common/safety.ts"));
const ledger = await jiti.import(path.join(root, "plastic-memory/session/ledger.ts"));
const engine = await jiti.import(path.join(root, "plastic-memory/compaction/engine.ts"));
const pendingModule = await jiti.import(path.join(root, "plastic-memory/compaction/pending.ts"));

const binding = { sessionId: ids.sessionDigest("compaction-smoke", { cwd: "/tmp/compaction", generation: 1 }), generation: 1, branchId: "main" };
const projectSnapshot = { summary: "bounded project summary", activeIndex: JSON.stringify({ kind: "active-chunk-index", chunks: [] }) };
let nextId = 0;
const entries = [];
function append(message) {
  const entry = { type: "message", id: `e${++nextId}`, parentId: entries.at(-1)?.id ?? null, message };
  entries.push(entry);
  return entry;
}
function cycle(number) {
  const start = append({ role: "user", content: [{ type: "text", text: `goal C${number}; must preserve exact constraint` }] });
  const tool = append({ role: "assistant", content: [{ type: "toolCall", id: `call-${number}`, name: "functions.read", arguments: { path: `src/C${number}.ts` } }], stopReason: "toolUse" });
  const result = append({ role: "toolResult", toolCallId: `call-${number}`, content: [{ type: "text", text: number === 2 ? "permission denied" : "read complete" }], isError: number === 2 });
  const end = append({ role: "assistant", content: [{ type: "text", text: `completed C${number}` }], stopReason: "stop" });
  return { start, end, ids: [start.id, tool.id, result.id, end.id] };
}
function closed(cycleData) {
  const sourceEntries = cycleData.ids.map((id) => entries.find((entry) => entry.id === id));
  return {
    schemaVersion: 1, ...binding, sourceStartId: cycleData.start.id, sourceEndId: cycleData.end.id,
    sourceEntryIds: cycleData.ids, sourceDigest: ledger.sourceDigest(sourceEntries), completedTurnEndId: cycleData.end.id,
    cycleId: `cycle-${cycleData.start.id}`, attemptId: `attempt-${cycleData.start.id}`, snapshotId: `snapshot-${cycleData.start.id}`,
    status: "complete", observationIds: [], reflectionIds: [],
  };
}
const cycles = [];
for (let index = 1; index <= 6; index += 1) cycles.push(closed(cycle(index)));

function appendCustom(customType, data) {
  const entry = { type: "custom", id: `m${++nextId}`, parentId: entries.at(-1)?.id ?? null, customType, data };
  entries.push(entry);
  return entry;
}
const memorySource = entries.slice(-4);
const memorySpan = {
  sourceStartId: memorySource[0].id, sourceEndId: memorySource.at(-1).id, sourceEntryIds: memorySource.map((entry) => entry.id),
  sourceDigest: ledger.sourceDigest(memorySource), completedTurnEndId: memorySource.at(-1).id,
};
const activeObservationId = ids.makeObservationId(binding.sessionId, ids.recordDigest(binding.sessionId, { kind: "active" }, { source: memorySource.at(-1).id }));
const droppedObservationId = ids.makeObservationId(binding.sessionId, ids.recordDigest(binding.sessionId, { kind: "dropped" }, { source: memorySource.at(-1).id }));
const reflectionId = ids.makeReflectionId(binding.sessionId, ids.recordDigest(binding.sessionId, { kind: "reflection" }, { source: memorySource.at(-1).id }));
appendCustom("plastic.observations.recorded", { schemaVersion: 1, ...binding, observations: [
  { id: activeObservationId, content: "active compaction fact", timestamp: "2026-08-03T00:00:00.000Z", relevance: "high", sourceEntryIds: [memorySource.at(-1).id], tokenCount: 2 },
  { id: droppedObservationId, content: "dropped compaction fact", timestamp: "2026-08-03T00:00:00.000Z", relevance: "low", sourceEntryIds: [memorySource.at(-1).id], tokenCount: 2 },
], span: memorySpan });
appendCustom("plastic.observations.dropped", { schemaVersion: 1, ...binding, observationIds: [droppedObservationId], coversThroughId: memorySource.at(-1).id, reflectionIds: [] });
appendCustom("plastic.reflections.recorded", { schemaVersion: 1, ...binding, reflections: [{ id: reflectionId, content: "durable compaction reflection", supportingObservationIds: [activeObservationId], tokenCount: 2 }], span: memorySpan });
const requests = [];
function fakeLuna(request) {
  requests.push(request);
  return { summary: "fake Luna prose is not authoritative; api_key=supersecret", state: { facts: { goals: request.facts.goals }, cycleIds: [...(request.priorState?.cycleIds ?? []), ...request.cycleIds], sourceEntryIds: [...(request.priorState?.sourceEntryIds ?? []), ...request.sourceEntryIds], sourceDigests: [...(request.priorState?.sourceDigests ?? []), ...request.sourceDigests] } };
}
const first = engine.prepareSemanticCompaction({ binding, branchEntries: entries, cycles, firstKeptEntryId: cycles[2].sourceStartId, projectSnapshot, runtimeToken: "runtime-1", now: 1_000, compact: fakeLuna });
assert.equal(first.eligible, true);
assert.equal(first.prepared.cut.firstKeptEntryId, cycles[2].sourceStartId);
assert.deepEqual(requests[0].cycleIds, [cycles[0].cycleId, cycles[1].cycleId]);
assert.equal(requests[0].sourceEntryIds.length, 8);
assert.ok(requests[0].priorState === undefined);
assert.ok(first.prepared.rendered.summary.startsWith("PLASTIC-COMPACTION cycle-range="));
assert.ok(first.prepared.rendered.state.facts.errors.includes("permission denied"));
assert.ok(first.prepared.rendered.details.plastic.stateDigest);

const firstRendered = first.prepared.rendered;
assert.match(firstRendered.summary, /Use memory_recall only with an exact observation or reflection ID shown in this index/u);
assert.match(firstRendered.summary, new RegExp(`\\[${reflectionId}\\] durable compaction reflection`));
assert.match(firstRendered.summary, new RegExp(`\\[${activeObservationId}\\] 2026-08-03T00:00:00.000Z \\[high\\] active compaction fact`));
assert.equal(firstRendered.summary.includes(`[${droppedObservationId}]`), false, "dropped observation id must not be indexed");
assert.equal(firstRendered.summary.includes("dropped compaction fact"), false, "dropped observation content must not be indexed");
assert.equal(firstRendered.summary.includes("supersecret"), false, "provider secret must not be visible");
assert.equal(firstRendered.summary.includes("sourceEntryIds"), false, "source-entry field must remain internal");
assert.equal(firstRendered.summary.includes("structuredState"), false, "hidden state JSON must remain internal");
assert.ok(firstRendered.summary.length <= 48_000);

// A proved physical budget may fold only the oldest normally-retained cycle into the
// same cumulative request/state. No cut is allowed to split a cycle.
const emergencyBudget = {
  contextWindow: 85,
  fixedTokens: 10,
  retainedCycleTokens: Object.fromEntries(cycles.map((cycle) => [cycle.cycleId, 25])),
  incompleteSuffixTokens: 0,
};
const emergency = engine.prepareSemanticCompaction({ binding, branchEntries: entries, cycles, projectSnapshot, runtimeToken: "runtime-1", now: 1_250, physicalBudget: emergencyBudget, compact: fakeLuna });
assert.equal(emergency.eligible, true);
assert.equal(emergency.prepared.cut.firstKeptEntryId, cycles[3].sourceStartId, "emergency advances one whole cycle");
assert.deepEqual(requests[1].cycleIds, cycles.slice(0, 3).map((cycle) => cycle.cycleId), "emergency folds the oldest retained cycle into the same request");
assert.deepEqual(emergency.prepared.rendered.state.cycleIds, cycles.slice(0, 3).map((cycle) => cycle.cycleId));
const impossibleBudget = { ...emergencyBudget, contextWindow: 84 };
assert.equal(engine.prepareSemanticCompaction({ binding, branchEntries: entries, cycles, projectSnapshot, runtimeToken: "runtime-1", now: 1_260, physicalBudget: impossibleBudget, compact: fakeLuna }).eligible, false, "impossible physical fit fails closed");
assert.equal(engine.prepareSemanticCompaction({ binding, branchEntries: entries, cycles, projectSnapshot, runtimeToken: "runtime-1", now: 1_270, physicalBudget: null, compact: fakeLuna }).eligible, false, "unknown physical proof fails closed");

const firstCompaction = { type: "compaction", id: "cmp1", parentId: entries.at(-1).id, firstKeptEntryId: first.prepared.cut.firstKeptEntryId, summary: firstRendered.summary, details: firstRendered.details };
entries.push(firstCompaction);
for (let index = 7; index <= 8; index += 1) cycles.push(closed(cycle(index)));
const delayedEight = engine.prepareSemanticCompaction({ binding, branchEntries: entries, cycles, projectSnapshot, runtimeToken: "runtime-1", now: 1_500, compact: fakeLuna });
assert.equal(delayedEight.eligible, true);
assert.equal(delayedEight.prepared.cut.firstKeptEntryId, cycles[4].sourceStartId);
assert.deepEqual(requests[2].cycleIds, cycles.slice(0, 4).map((cycle) => cycle.cycleId), "an unacknowledged eight-cycle branch sends every older cycle");
assert.deepEqual(delayedEight.prepared.rendered.state.cycleIds, cycles.slice(0, 4).map((cycle) => cycle.cycleId));

const second = engine.prepareSemanticCompaction({ binding, branchEntries: entries, cycles, priorState: firstRendered.state, projectSnapshot, runtimeToken: "runtime-1", now: 2_000, compact: fakeLuna });
assert.equal(second.eligible, true);
assert.equal(second.prepared.cut.firstKeptEntryId, cycles[4].sourceStartId);
assert.deepEqual(requests[3].cycleIds, [cycles[2].cycleId, cycles[3].cycleId]);
assert.deepEqual(second.prepared.rendered.state.cycleIds, cycles.slice(0, 4).map((cycle) => cycle.cycleId));
assert.equal(second.prepared.rendered.state.facts.errors.includes("permission denied"), true);
assert.notEqual(second.prepared.rendered.state.stateDigest, firstRendered.state.stateDigest);

for (let index = 9; index <= 10; index += 1) cycles.push(closed(cycle(index)));
const third = engine.prepareSemanticCompaction({ binding, branchEntries: entries, cycles, priorState: second.prepared.rendered.state, projectSnapshot, runtimeToken: "runtime-1", now: 2_500, compact: fakeLuna });
assert.equal(third.eligible, true);
assert.deepEqual(requests[4].cycleIds, [cycles[4].cycleId, cycles[5].cycleId]);
assert.deepEqual(third.prepared.rendered.state.cycleIds, cycles.slice(0, 6).map((cycle) => cycle.cycleId));

const suffixUser = append({ role: "user", content: [{ type: "text", text: "goal C9; incomplete suffix" }] });
const suffixTool = append({ role: "assistant", content: [{ type: "toolCall", id: "call-9", name: "functions.read", arguments: { path: "src/C9.ts" } }], stopReason: "toolUse" });
const suffixResult = append({ type: "toolResult", toolCallId: "call-9", content: [{ type: "text", text: "read complete" }] });
const delayedWithSuffix = engine.prepareSemanticCompaction({ binding, branchEntries: entries, cycles: cycles.slice(0, 8), projectSnapshot, runtimeToken: "runtime-1", now: 2_750, compact: fakeLuna });
assert.equal(delayedWithSuffix.eligible, true);
assert.equal(delayedWithSuffix.prepared.cut.firstKeptEntryId, cycles[4].sourceStartId);
assert.deepEqual(requests[5].cycleIds, cycles.slice(0, 4).map((cycle) => cycle.cycleId));
assert.deepEqual(delayedWithSuffix.prepared.pending.preparedPrefixIds.slice(-3), [suffixUser.id, suffixTool.id, suffixResult.id], "incomplete C9 suffix remains retained");

const store = pendingModule.createPendingStore();
store.stage(second.prepared.pending);
const descendant = [...entries, { type: "message", id: "descendant", parentId: entries.at(-1).id, message: { role: "user", content: "later" } }];
const branch = { binding, runtimeToken: "runtime-1", branchIds: descendant.map((entry) => entry.id), latestCompactionIdentity: second.prepared.pending.latestCompactionIdentity };
assert.ok(store.peek(2_000));
const hostCompaction = { type: "compaction", id: "cmp2", firstKeptEntryId: second.prepared.cut.firstKeptEntryId, summary: second.prepared.rendered.summary, details: second.prepared.rendered.details };
const ack = engine.acknowledgeCompaction(second.prepared.pending, hostCompaction, branch, ["cmp2", second.prepared.cut.firstKeptEntryId, "descendant"], 2_000);
assert.ok(ack);
assert.equal(engine.acknowledgeCompaction(second.prepared.pending, hostCompaction, branch, ["cmp2", second.prepared.cut.firstKeptEntryId, "descendant"], 2_000), undefined);
assert.equal(ack.record.customType, "plastic.compaction.applied");
assert.equal(ack.record.data.firstKeptEntryId, second.prepared.cut.firstKeptEntryId);
assert.ok(store.consume(branch, 2_000));
assert.equal(store.consume(branch, 2_000), undefined, "pending slot is consume-once");
assert.equal(pendingModule.consumePending(second.prepared.pending, { ...branch, runtimeToken: "runtime-reloaded" }, 2_000), undefined);
assert.equal(pendingModule.consumePending(second.prepared.pending, { ...branch, branchIds: [...branch.branchIds].reverse() }, 2_000), undefined);
assert.equal(pendingModule.consumePending(second.prepared.pending, { ...branch, latestCompactionIdentity: "changed" }, 2_000), undefined);
assert.equal(pendingModule.consumePending(second.prepared.pending, branch, 302_001), undefined);

const wrongCustomCut = engine.prepareSemanticCompaction({ binding, branchEntries: entries, cycles, firstKeptEntryId: "missing-entry", projectSnapshot, runtimeToken: "runtime-1", now: 3_000, compact: fakeLuna });
assert.equal(wrongCustomCut.eligible, false);
const badCut = engine.prepareSemanticCompaction({ binding, branchEntries: entries.map((entry) => entry.id === cycles[2].sourceStartId ? { ...entry, type: "custom_message" } : entry), cycles: cycles.slice(0, 8), projectSnapshot, runtimeToken: "runtime-1", now: 3_000, compact: fakeLuna });
assert.equal(badCut.eligible, false);
const staleCycle = { ...cycles[4], status: "partial" };
const stale = engine.prepareSemanticCompaction({ binding, branchEntries: entries, cycles: cycles.map((cycle, index) => index === 4 ? staleCycle : cycle), projectSnapshot, runtimeToken: "runtime-1", compact: fakeLuna });
assert.equal(stale.eligible, false);

// A custom cut must begin the first preserved complete turn, never its assistant tail or tool call.
const sixCycleWindow = cycles.slice(0, 6);
const assistantCut = engine.prepareSemanticCompaction({
  binding, branchEntries: entries, cycles: sixCycleWindow, firstKeptEntryId: sixCycleWindow[2].sourceEndId,
  projectSnapshot, runtimeToken: "runtime-1", compact: fakeLuna,
});
assert.equal(assistantCut.eligible, false, "terminal assistant cannot be a 6/4 turn-start cut");
const toolCallCut = engine.prepareSemanticCompaction({
  binding, branchEntries: entries, cycles: sixCycleWindow, firstKeptEntryId: sixCycleWindow[2].sourceEntryIds[1],
  projectSnapshot, runtimeToken: "runtime-1", compact: fakeLuna,
});
assert.equal(toolCallCut.eligible, false, "tool-call assistant cannot be a 6/4 cut");

// Shared Task 02 terminal semantics reject toolUse even when content has no toolCall object.
for (const stopKey of ["stopReason", "stop_reason"]) {
  const toolUseEntries = entries.map((entry) => {
    if (entry.id !== sixCycleWindow[5].sourceEndId) return entry;
    const message = { ...entry.message };
    delete message.stopReason;
    delete message.stop_reason;
    message[stopKey] = "toolUse";
    return { ...entry, message };
  });
  const toolUseCycle = {
    ...sixCycleWindow[5],
    sourceDigest: ledger.sourceDigest(sixCycleWindow[5].sourceEntryIds.map((id) => toolUseEntries.find((entry) => entry.id === id))),
  };
  const toolUse = engine.prepareSemanticCompaction({
    binding, branchEntries: toolUseEntries, cycles: sixCycleWindow.map((cycle, index) => index === 5 ? toolUseCycle : cycle),
    projectSnapshot, runtimeToken: "runtime-1", compact: fakeLuna,
  });
  assert.equal(toolUse.eligible, false, `${stopKey}=toolUse terminal assistant must be ineligible`);
}
assert.equal(safety.hasSensitiveText(firstRendered.summary), false);
console.log("COMPACTION: PASS (6/4, cumulative stride, safe cut, fake Luna facts, scrubbed state, acknowledgement, descendant-safe pending)");

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
const requests = [];
function fakeLuna(request) {
  requests.push(request);
  return { summary: "fake Luna prose is not authoritative", state: { facts: { goals: request.facts.goals }, cycleIds: [...(request.priorState?.cycleIds ?? []), ...request.cycleIds], sourceEntryIds: [...(request.priorState?.sourceEntryIds ?? []), ...request.sourceEntryIds], sourceDigests: [...(request.priorState?.sourceDigests ?? []), ...request.sourceDigests] } };
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
const firstCompaction = { type: "compaction", id: "cmp1", parentId: entries.at(-1).id, firstKeptEntryId: first.prepared.cut.firstKeptEntryId, summary: firstRendered.summary, details: firstRendered.details };
entries.push(firstCompaction);
for (let index = 7; index <= 8; index += 1) cycles.push(closed(cycle(index)));
const second = engine.prepareSemanticCompaction({ binding, branchEntries: entries, cycles, priorState: firstRendered.state, projectSnapshot, runtimeToken: "runtime-1", now: 2_000, compact: fakeLuna });
assert.equal(second.eligible, true);
assert.equal(second.prepared.cut.firstKeptEntryId, cycles[4].sourceStartId);
assert.deepEqual(requests[1].cycleIds, [cycles[2].cycleId, cycles[3].cycleId]);
assert.deepEqual(second.prepared.rendered.state.cycleIds, cycles.slice(0, 4).map((cycle) => cycle.cycleId));
assert.equal(second.prepared.rendered.state.facts.errors.includes("permission denied"), true);
assert.notEqual(second.prepared.rendered.state.stateDigest, firstRendered.state.stateDigest);

for (let index = 9; index <= 10; index += 1) cycles.push(closed(cycle(index)));
const third = engine.prepareSemanticCompaction({ binding, branchEntries: entries, cycles, priorState: second.prepared.rendered.state, projectSnapshot, runtimeToken: "runtime-1", now: 2_500, compact: fakeLuna });
assert.equal(third.eligible, true);
assert.deepEqual(requests[2].cycleIds, [cycles[4].cycleId, cycles[5].cycleId]);
assert.deepEqual(third.prepared.rendered.state.cycleIds, cycles.slice(0, 6).map((cycle) => cycle.cycleId));

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
assert.equal(safety.hasSensitiveText(firstRendered.summary), false);
console.log("COMPACTION: PASS (6/4, cumulative stride, safe cut, fake Luna facts, scrubbed state, acknowledgement, descendant-safe pending)");

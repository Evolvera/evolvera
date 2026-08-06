import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = await import(pathToFileURL(path.join(root, "plastic-memory/session/types.ts")).href);
const ledger = await import(pathToFileURL(path.join(root, "plastic-memory/session/ledger.ts")).href);
const cycles = await import(pathToFileURL(path.join(root, "plastic-memory/session/cycles.ts")).href);
const ids = await import(pathToFileURL(path.join(root, "plastic-memory/common/ids.ts")).href);

const binding = {
  sessionId: ids.sessionDigest("queue-kernel-smoke", { generation: 3 }),
  generation: 3,
  branchId: "branch-main",
};
let nextId = 0;
function turn(entries, userTokens, assistantTokens, label = "turn") {
  const user = { type: "message", id: `${label}-user-${++nextId}`, parentId: entries.at(-1)?.id ?? null, message: { role: "user", content: [{ type: "text", text: `${label} request` }] }, tokenCount: userTokens };
  const assistant = { type: "message", id: `${label}-assistant-${++nextId}`, parentId: user.id, message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: `${label} answer` }] }, tokenCount: assistantTokens };
  entries.push(user, assistant);
  return [user, assistant];
}
function queueRecordData(record) {
  return { ...record.data, sourceEntryIds: [...record.data.sourceEntryIds] };
}
function recordWithData(record, data) {
  return { type: "custom", customType: types.PLASTIC_CYCLE_QUEUED, data };
}

// Strict schema: the durable record is flattened, exact-keyed, and has no small-turn path.
const twenty = [];
turn(twenty, 9_999, 10_000, "threshold");
assert.equal(cycles.createQueuedCycleRecords({ binding, sourceEntries: twenty }).length, 0, "19,999 never queues");
const exact = [];
turn(exact, 10_000, 10_000, "exact");
const exactRecords = cycles.createQueuedCycleRecords({ binding, sourceEntries: exact });
assert.equal(exactRecords.length, 1);
assert.equal(exactRecords[0].customType, types.PLASTIC_CYCLE_QUEUED);
assert.equal(exactRecords[0].data.estimatedTokenCount, 20_000);
assert.equal(types.isCycleQueuedRecord(exactRecords[0]), true);
assert.equal(types.isPlasticRecord({ ...exactRecords[0], data: { ...exactRecords[0].data, estimatedTokenCount: 19_999 } }), false);
assert.equal(types.isPlasticRecord({ ...exactRecords[0], data: { ...exactRecords[0].data, span: exactRecords[0].data } }), false);
assert.equal(types.isPlasticRecord({ ...exactRecords[0], data: { ...exactRecords[0].data, extra: true } }), false);
assert.equal(types.isCycleQueuedRecord({ ...exactRecords[0], data: { ...exactRecords[0].data, estimatedTokenCount: 20_000.5 } }), false);

// Batching crosses the threshold only at whole terminal-turn boundaries and retains the remainder.
const fifteen = [];
turn(fifteen, 7_500, 7_500, "fifteen-a");
turn(fifteen, 7_500, 7_500, "fifteen-b");
turn(fifteen, 7_500, 7_500, "fifteen-c");
const batched = cycles.batchCompletedTurns(fifteen);
assert.equal(batched.valid, true);
assert.deepEqual(batched.batches.map((batch) => batch.tokenCount), [30_000]);
assert.equal(batched.batches[0].entries.length, 4);
assert.equal(batched.remainder.tokenCount, 15_000);
assert.equal(cycles.createQueuedCycleRecords({ binding, sourceEntries: fifteen }).length, 1);
const fifty = [];
turn(fifty, 25_000, 25_000, "fifty");
assert.deepEqual(cycles.createQueuedCycleRecords({ binding, sourceEntries: fifty }).map((record) => record.data.estimatedTokenCount), [50_000]);

// Open turns and complete tool exchanges stay atomic; an open suffix is not captured.
const toolEntries = [];
const [toolUser] = turn(toolEntries, 5_000, 5_000, "tool-prefix");
const toolCall = { type: "message", id: "tool-call", parentId: toolEntries.at(-1).id, message: { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", id: "call-1", name: "read" }] }, tokenCount: 2_000 };
const toolResult = { type: "message", id: "tool-result", parentId: toolCall.id, message: { role: "toolResult", toolCallId: "call-1", content: [{ type: "text", text: "result" }] }, tokenCount: 3_000 };
const terminal = { type: "message", id: "tool-terminal", parentId: toolResult.id, message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "done" }] }, tokenCount: 5_000 };
toolEntries.push(toolCall, toolResult, terminal);
const openUser = { type: "message", id: "open-user", parentId: terminal.id, message: { role: "user", content: [{ type: "text", text: "still running" }] }, tokenCount: 1_000 };
const openCall = { type: "message", id: "open-call", parentId: openUser.id, message: { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", id: "open-1", name: "read" }] }, tokenCount: 1_000 };
const openResult = { type: "message", id: "open-result", parentId: openCall.id, message: { role: "toolResult", toolCallId: "open-1", content: [{ type: "text", text: "pending" }] }, tokenCount: 1_000 };
toolEntries.push(openUser, openCall, openResult);
const toolRecords = cycles.createQueuedCycleRecords({ binding, sourceEntries: toolEntries });
assert.equal(toolRecords.length, 1);
assert.equal(toolRecords[0].data.estimatedTokenCount, 20_000);
assert.deepEqual(toolRecords[0].data.sourceEntryIds, [toolUser.id, toolEntries[1].id, toolCall.id, toolResult.id, terminal.id]);
assert.equal(toolRecords[0].data.sourceEntryIds.includes(openUser.id), false);
assert.equal(cycles.createQueuedCycleRecords({ binding, sourceEntries: [openUser, openCall, openResult] }).length, 0, "open exchange never closes a queue unit");

// Current-branch fold accepts flattened spans and excludes an off-branch queue record.
const branchQueue = [...exact];
const branchQueueEntry = { ...exactRecords[0], id: "queued-on-branch", parentId: exact.at(-1).id };
const offBranch = { ...exactRecords[0], id: "queued-off-branch", parentId: "fork", data: { ...exactRecords[0].data, sourceEntryIds: ["fork"] } };
const folded = ledger.foldLedger([...branchQueue, branchQueueEntry, offBranch], { leafId: branchQueueEntry.id, context: binding });
assert.equal(folded.queuedCycles.length, 1);
assert.deepEqual(folded.queuedCycles[0].sourceEntryIds, exactRecords[0].data.sourceEntryIds);

// Exact duplicates are idempotent; the oldest valid unresolved item is the FIFO restart candidate.
const twoTurns = [];
turn(twoTurns, 10_000, 10_000, "fifo-a");
turn(twoTurns, 10_000, 10_000, "fifo-b");
const twoRecords = cycles.createQueuedCycleRecords({ binding, sourceEntries: twoTurns });
const replay = cycles.reconstructCycleQueue({ binding, sourceEntries: twoTurns, records: [...twoRecords, ...twoRecords] });
assert.equal(replay.valid, true);
assert.equal(replay.queued.length, 2, "duplicate queue records fold once");
assert.equal(replay.unresolved.length, 2);
assert.equal(replay.restartCandidate.data.cycleId, twoRecords[0].data.cycleId);
assert.equal(cycles.selectOldestUnresolvedQueuedCycle(replay), replay.restartCandidate);
assert.equal(cycles.reconstructCycleQueue({ binding, sourceEntries: twoTurns, records: [] }).restartCandidate, undefined, "legacy/no-queue state is not revived");

// An exact attempted/closed descendant consumes only its queue item; a stale generation cannot restart it.
const firstSource = twoRecords[0].data.sourceEntryIds.map((id) => twoTurns.find((entry) => entry.id === id));
const firstSnapshot = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: firstSource });
const attempt = cycles.beginCycleAttempt(firstSnapshot).record;
const close = cycles.closeCycle(firstSnapshot, attempt, {
  outcome: "complete",
  sourceEntryIds: firstSnapshot.span.sourceEntryIds,
  sourceStartId: firstSnapshot.span.sourceStartId,
  sourceEndId: firstSnapshot.span.sourceEndId,
  sourceDigest: firstSnapshot.span.sourceDigest,
  completedTurnEndId: firstSnapshot.span.completedTurnEndId,
}, [attempt]);
assert.ok(close);
const resumed = cycles.reconstructCycleQueue({ binding, sourceEntries: twoTurns, records: [...twoRecords, attempt, close] });
assert.equal(resumed.valid, true);
assert.equal(resumed.unresolved.length, 1);
assert.equal(resumed.restartCandidate.data.cycleId, twoRecords[1].data.cycleId);
const staleAttempt = { ...attempt, data: { ...attempt.data, generation: binding.generation + 1 } };
assert.equal(cycles.reconstructCycleQueue({ binding, sourceEntries: twoTurns, records: [...twoRecords, staleAttempt] }).valid, false, "stale queue descendants fail closed");
const staleQueue = recordWithData(twoRecords[0], { ...queueRecordData(twoRecords[0]), generation: binding.generation + 1 });
assert.equal(cycles.reconstructCycleQueue({ binding, sourceEntries: twoTurns, records: [...twoRecords, staleQueue] }).valid, false);

// Conflicting identity, bad digest/count, overlap/gap, and unbacked close all fail closed.
const conflict = recordWithData(twoRecords[0], { ...queueRecordData(twoRecords[0]), estimatedTokenCount: 20_001 });
assert.equal(cycles.reconstructCycleQueue({ binding, sourceEntries: twoTurns, records: [...twoRecords, conflict] }).valid, false);
const badDigest = recordWithData(twoRecords[0], { ...queueRecordData(twoRecords[0]), sourceDigest: "0".repeat(24) });
assert.equal(cycles.reconstructCycleQueue({ binding, sourceEntries: twoTurns, records: [badDigest] }).valid, false);
const overlap = recordWithData(twoRecords[1], { ...queueRecordData(twoRecords[1]), sourceStartId: twoRecords[0].data.sourceStartId });
assert.equal(cycles.reconstructCycleQueue({ binding, sourceEntries: twoTurns, records: [...twoRecords.slice(0, 1), overlap] }).valid, false);
const gap = recordWithData(twoRecords[1], { ...queueRecordData(twoRecords[1]), sourceEntryIds: [twoRecords[1].data.sourceEntryIds[1], twoRecords[1].data.sourceEntryIds[2]], sourceStartId: twoRecords[1].data.sourceEntryIds[1] });
assert.equal(cycles.reconstructCycleQueue({ binding, sourceEntries: twoTurns, records: [...twoRecords.slice(0, 1), gap] }).valid, false);
const unbackedClose = { ...close, data: { ...close.data, attemptId: `${close.data.attemptId}-other` } };
assert.equal(cycles.reconstructCycleQueue({ binding, sourceEntries: twoTurns, records: [...twoRecords, unbackedClose] }).valid, false);
const offBranchQueue = recordWithData(twoRecords[0], { ...queueRecordData(twoRecords[0]), sourceEntryIds: ["off-branch"] });
assert.equal(cycles.reconstructCycleQueue({ binding, sourceEntries: twoTurns, records: [offBranchQueue] }).valid, false);

console.log("PLASTIC_MEMORY_QUEUE: PASS (strict >=20k schema, whole-turn FIFO batching, branch fold, replay/close/restart, fail-closed malformed state)");

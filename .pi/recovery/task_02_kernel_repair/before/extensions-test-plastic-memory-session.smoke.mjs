import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = await import(pathToFileURL(path.join(root, "plastic-memory/session/types.ts")).href);
const ledger = await import(pathToFileURL(path.join(root, "plastic-memory/session/ledger.ts")).href);
const bootstrap = await import(pathToFileURL(path.join(root, "plastic-memory/session/bootstrap.ts")).href);
const cycles = await import(pathToFileURL(path.join(root, "plastic-memory/session/cycles.ts")).href);
const retention = await import(pathToFileURL(path.join(root, "plastic-memory/session/retention.ts")).href);
const ids = await import(pathToFileURL(path.join(root, "plastic-memory/common/ids.ts")).href);

const binding = {
  sessionId: ids.sessionDigest("pre-plastic-session", { cwd: "/memory", generation: 7 }),
  generation: 7,
  branchId: "branch-main",
};
let next = 0;
const entries = [];
function append(type, extra = {}) {
  const id = `E${++next}`;
  const entry = { type, id, parentId: entries.at(-1)?.id ?? null, ...extra };
  entries.push(entry);
  return entry;
}
function message(role, tokenCount, text = role) {
  return append("message", { message: { role, content: [{ type: "text", text }] }, tokenCount });
}
function legacyObservation(id, sourceEntryIds, relevance = "medium") {
  return { id, content: `legacy ${id}`, timestamp: "2026-08-03T00:00:00.000Z", relevance, sourceEntryIds, tokenCount: 3 };
}
function legacyReflection(id, supportingObservationIds) {
  return { id, content: `reflection ${id}`, supportingObservationIds, tokenCount: 2 };
}
function legacy(customType, data) {
  return append("custom", { customType, data });
}

// A pre-plastic branch: raw history is enormous, compaction-aware context is small,
// and legacy markers include both valid and malformed/off-branch evidence.
const c1 = message("user", 2_000_000, "old goal");
const c2 = message("assistant", 2_000_000, "old answer");
legacy(types.LEGACY_OBSERVATIONS_RECORDED, {
  observations: [legacyObservation("abcdef000001", [c1.id])],
  coversUpToId: c2.id,
});
legacy(types.LEGACY_OBSERVATIONS_RECORDED, {
  observations: [{ id: "BAD", content: "ignored", timestamp: "now", relevance: "medium", sourceEntryIds: [c2.id], tokenCount: 1 }],
  coversUpToId: c2.id,
});
const c3 = append("thinking_level_change", { thinkingLevel: "off" });
const compaction = append("compaction", { firstKeptEntryId: c3.id, summary: "prior compaction", tokensBefore: 6_956_515 });
const c4 = message("user", 50_000, "active request");
const c5 = message("assistant", 50_000, "active answer");
legacy(types.LEGACY_REFLECTIONS_RECORDED, {
  reflections: [legacyReflection("abcdef000002", ["abcdef000001"])],
  coversUpToId: c5.id,
});
const forkOnly = { type: "message", id: "fork-only", parentId: c2.id, message: { role: "user", content: "not on current branch" }, tokenCount: 3 };
const activeContext = [compaction, c3, c4, c5];

assert.equal(types.isPlasticRecord({ type: "custom", customType: "plastic.bootstrap.recorded", data: { schemaVersion: 1 } }), false);
assert.equal(types.isLegacyObservationsRecorded(entries[2]), true);
assert.equal(types.isLegacyObservationsRecorded(entries[3]), false);
assert.equal(types.isLegacyMemoryId("abcdef000001"), true);
assert.equal(types.isLegacyMemoryId("ABCDEF000001"), false);

const currentLeafId = entries.at(-1).id;
const boot = bootstrap.bootstrapSession({ entries: [...entries, forkOnly], binding, leafId: currentLeafId, activeEntries: activeContext });
assert.equal(boot.appended, true);
assert.equal(boot.record.customType, types.PLASTIC_BOOTSTRAP_RECORDED);
assert.equal(boot.state.historicalGap, "historical-unindexed");
assert.deepEqual(boot.state.activeEntryIds, [c4.id, c5.id]);
assert.equal(boot.state.historicalPrefixIds.includes(c1.id), true);
assert.equal(boot.state.historicalPrefixIds.includes(c2.id), true);
assert.equal(boot.state.activeEntryIds.includes(c1.id), false);
assert.equal(bootstrap.isNormalBootstrapWindow(boot.state, c1.id), false);
assert.equal(bootstrap.isNormalBootstrapWindow(boot.state, c4.id), true);
const bootAgain = bootstrap.bootstrapSession({ entries: [...entries, forkOnly], binding, leafId: currentLeafId, activeEntries: activeContext, existingRecords: [boot.record] });
assert.equal(bootAgain.appended, false, "bootstrap must be idempotent");
assert.equal(bootAgain.record.data.activeDigest, boot.record.data.activeDigest);

const folded = ledger.foldLedger([...entries, forkOnly], { leafId: currentLeafId, context: binding });
assert.equal(folded.observations.length, 1, "first valid legacy observation only");
assert.equal(folded.reflections.length, 1);
assert.deepEqual(ledger.normalSourceEntries(folded.branch, boot.record.data), activeContext.filter(ledger.isSourceEntry));
assert.equal(ledger.normalSourceEntries(folded.branch, boot.record.data).some((entry) => entry.id === c1.id), false);
assert.equal(ledger.foldLedger([...entries, forkOnly], { leafId: "fork-only" }).branch.at(-1).id, "fork-only");

// A fitting 100k contiguous snapshot has one identity, one opportunity, and no fan-out.
const snapshot = cycles.createCompletedTurnSnapshot({
  binding,
  sourceEntries: ledger.normalSourceEntries(folded.branch, boot.record.data),
  activeEntryIds: boot.record.data.activeEntryIds,
  maxTokens: 100_000,
});
assert.equal(snapshot.status, "ready");
assert.equal(snapshot.tokenCount, 100_000);
const plasticObservation = {
  id: ids.makeObservationId(binding.sessionId, snapshot.span.sourceDigest),
  content: "new namespaced observation",
  timestamp: "2026-08-03T00:00:00.000Z",
  relevance: "medium",
  sourceEntryIds: snapshot.span.sourceEntryIds,
  tokenCount: 2,
};
assert.equal(types.isPlasticRecord({ type: "custom", customType: types.PLASTIC_OBSERVATIONS_RECORDED, data: {
  schemaVersion: 1, ...binding, observations: [plasticObservation], span: snapshot.span,
} }), true);
const repeated = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: activeContext.filter(ledger.isSourceEntry), activeEntryIds: boot.record.data.activeEntryIds });
assert.equal(repeated.snapshotId, snapshot.snapshotId);
const firstAttempt = cycles.beginCycleAttempt(snapshot);
assert.equal(firstAttempt.allowed, true);
const samePending = cycles.beginCycleAttempt(snapshot, [firstAttempt.record]);
assert.equal(samePending.record.data.attemptId, firstAttempt.record.data.attemptId);
assert.equal(samePending.record.data.attemptCount, 0);
const firstFailure = cycles.finishCycleAttempt(snapshot, firstAttempt.record, "failed");
assert.equal(firstFailure.data.outcome, "failed");
const retry = cycles.beginCycleAttempt(snapshot, [firstAttempt.record, firstFailure]);
assert.equal(retry.allowed, true);
assert.equal(retry.record.data.attemptCount, 1, "exactly one automatic retry");
const secondFailure = cycles.finishCycleAttempt(snapshot, retry.record, "failed");
const suppressed = cycles.beginCycleAttempt(snapshot, [firstAttempt.record, firstFailure, retry.record, secondFailure]);
assert.equal(suppressed.allowed, false);
assert.equal(suppressed.reason, "automatic-retry-exhausted");
assert.equal(suppressed.record.data.outcome, "suppressed");
assert.equal(cycles.beginCycleAttempt(snapshot, [firstAttempt.record, firstFailure, retry.record, secondFailure], { explicitRetry: true }).allowed, true);

const partial = cycles.closeCycle(snapshot, retry.record, {
  outcome: "partial", sourceEntryIds: snapshot.span.sourceEntryIds, sourceStartId: snapshot.span.sourceStartId,
  sourceEndId: snapshot.span.sourceEndId, sourceDigest: snapshot.span.sourceDigest, completedTurnEndId: snapshot.span.completedTurnEndId,
});
assert.equal(partial, undefined, "partial output cannot close coverage");
const exactClosed = cycles.closeCycle(snapshot, firstAttempt.record, {
  outcome: "complete", sourceEntryIds: snapshot.span.sourceEntryIds, sourceStartId: snapshot.span.sourceStartId,
  sourceEndId: snapshot.span.sourceEndId, sourceDigest: snapshot.span.sourceDigest, completedTurnEndId: snapshot.span.completedTurnEndId,
  observationIds: ["abcdef000001"], reflectionIds: ["abcdef000002"],
}, [firstAttempt.record, firstFailure]);
assert.equal(exactClosed, undefined, "a failed/non-pending attempt cannot close");
const cleanSnapshot = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: [c4, c5], maxTokens: 100_000 });
const cleanAttempt = cycles.beginCycleAttempt(cleanSnapshot);
const wrong = cycles.closeCycle(cleanSnapshot, cleanAttempt.record, {
  outcome: "complete", sourceEntryIds: [c4.id], sourceStartId: c4.id, sourceEndId: c4.id,
  sourceDigest: cleanSnapshot.span.sourceDigest, completedTurnEndId: c4.id,
});
assert.equal(wrong, undefined, "source span mismatch is not closure");
const closed = cycles.closeCycle(cleanSnapshot, cleanAttempt.record, {
  outcome: "complete", sourceEntryIds: cleanSnapshot.span.sourceEntryIds, sourceStartId: cleanSnapshot.span.sourceStartId,
  sourceEndId: cleanSnapshot.span.sourceEndId, sourceDigest: cleanSnapshot.span.sourceDigest,
  completedTurnEndId: cleanSnapshot.span.completedTurnEndId,
});
assert.equal(closed.customType, types.PLASTIC_CYCLE_CLOSED);
assert.equal(closed.data.status, "complete");
const nextGeneration = cycles.createCompletedTurnSnapshot({ binding: { ...binding, generation: 8 }, sourceEntries: [c4, c5] });
assert.equal(cycles.closeCycle(nextGeneration, cleanAttempt.record, {
  outcome: "complete", sourceEntryIds: cleanSnapshot.span.sourceEntryIds, sourceStartId: cleanSnapshot.span.sourceStartId,
  sourceEndId: cleanSnapshot.span.sourceEndId, sourceDigest: cleanSnapshot.span.sourceDigest,
  completedTurnEndId: cleanSnapshot.span.completedTurnEndId,
}), undefined, "late generation result must be rejected");

const empty = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: [] });
assert.equal(empty.status, "empty-valid");
const emptyAttempt = cycles.beginCycleAttempt(empty);
assert.equal(cycles.closeCycle(empty, emptyAttempt.record, {
  outcome: "empty-valid", sourceEntryIds: [], sourceStartId: "", sourceEndId: "", sourceDigest: empty.span.sourceDigest, completedTurnEndId: "",
})?.data.status, "empty-valid");
const oversized = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: [c1, c2], maxTokens: 100_000 });
assert.equal(oversized.status, "oversized");
assert.equal(cycles.beginCycleAttempt(oversized).allowed, false);

// Tool-call assistants and their results are not completed-turn boundaries.
const toolTurnUser = message("user", 1, "tool request");
const toolCallAssistant = append("message", {
  message: {
    role: "assistant",
    content: [{ type: "toolCall", id: "tool-call-1", name: "noop", arguments: {} }],
    stopReason: "toolUse",
  },
  tokenCount: 1,
});
const toolResultEntry = append("message", {
  message: {
    role: "toolResult",
    toolCallId: "tool-call-1",
    content: [{ type: "text", text: "tool result" }],
  },
  tokenCount: 1,
});
const trailingToolSnapshot = cycles.createCompletedTurnSnapshot({
  binding,
  sourceEntries: [toolTurnUser, toolCallAssistant, toolResultEntry],
});
assert.equal(trailingToolSnapshot.status, "empty-valid");
assert.deepEqual(trailingToolSnapshot.span.sourceEntryIds, [], "trailing tool pair is not normal cycle coverage");
const trailingToolBootstrap = bootstrap.bootstrapSession({
  entries,
  binding,
  leafId: toolResultEntry.id,
  activeEntries: [toolTurnUser, toolCallAssistant, toolResultEntry],
});
assert.equal(trailingToolBootstrap.state.completedTurnEndId, undefined, "bootstrap must not claim a tool-call bound");
assert.equal(trailingToolBootstrap.state.completedTurnStartId, undefined);

const terminalAssistant = message("assistant", 1, "terminal answer");
const completeToolSnapshot = cycles.createCompletedTurnSnapshot({
  binding,
  sourceEntries: [toolTurnUser, toolCallAssistant, toolResultEntry, terminalAssistant],
});
assert.equal(completeToolSnapshot.status, "ready");
assert.deepEqual(completeToolSnapshot.span.sourceEntryIds, [
  toolTurnUser.id,
  toolCallAssistant.id,
  toolResultEntry.id,
  terminalAssistant.id,
], "later terminal assistant closes the complete tool turn");
assert.equal(completeToolSnapshot.span.completedTurnEndId, terminalAssistant.id);
const completeToolBootstrap = bootstrap.bootstrapSession({
  entries,
  binding,
  leafId: terminalAssistant.id,
  activeEntries: [toolTurnUser, toolCallAssistant, toolResultEntry, terminalAssistant],
});
assert.equal(completeToolBootstrap.state.completedTurnEndId, terminalAssistant.id);

const retentionInput = {
  binding,
  observations: [
    legacyObservation("abcdef000010", [c4.id], "low"),
    legacyObservation("abcdef000011", [c5.id], "critical"),
    legacyObservation("abcdef000012", [c5.id], "medium"),
  ],
  reflections: [legacyReflection("abcdef000020", ["abcdef000010", "abcdef000011"])],
  absorbedObservationIds: ["abcdef000010", "abcdef000011", "abcdef000012"],
  coversThroughId: c5.id,
};
const plan = retention.planRetention(retentionInput);
assert.deepEqual(plan.observationIds, ["abcdef000010"]);
assert.deepEqual(plan.reflectionIds, ["abcdef000020"]);
assert.equal(plan.record.customType, types.PLASTIC_OBSERVATIONS_DROPPED);
assert.deepEqual(retention.planRetention({ ...retentionInput, absorbedObservationIds: ["abcdef000011"] }).observationIds, []);

// Branch/session/generation-bound later-task records reject malformed or cross-bound data.
assert.equal(types.isPlasticRecord(plan.record), true);
assert.equal(types.isPlasticRecord({ ...plan.record, data: { ...plan.record.data, schemaVersion: 2 } }), false);
assert.equal(ledger.acceptsBoundRecord(plan.record, binding), true);
assert.equal(ledger.acceptsBoundRecord(plan.record, { ...binding, generation: 8 }), false);
assert.equal(types.isPlasticRecord({ type: "custom", customType: "om.never.write", data: {} }), false);

console.log("PLASTIC_MEMORY_SESSION: PASS (v1 guards, legacy fold, safe 7m bootstrap, exact cycles/retry, stale rejection, retention)");

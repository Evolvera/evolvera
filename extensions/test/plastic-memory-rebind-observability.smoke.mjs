import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const coordinatorModule = await jiti.import(path.join(root, "plastic-memory/runtime/coordinator.ts"));
const cycles = await jiti.import(path.join(root, "plastic-memory/session/cycles.ts"));
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));
const ledger = await jiti.import(path.join(root, "plastic-memory/session/ledger.ts"));
const types = await jiti.import(path.join(root, "plastic-memory/session/types.ts"));

function appendMessage(entries, id, parentId, role, text) {
  const entry = {
    type: "message",
    id,
    parentId,
    message: { role, content: [{ type: "text", text }], ...(role === "assistant" ? { stopReason: "stop" } : {}) },
    tokenCount: 10_000,
  };
  entries.push(entry);
  return entry;
}
function sourceFixture(prefix, turns) {
  const entries = [];
  const spans = [];
  let parentId = null;
  for (let number = 1; number <= turns; number += 1) {
    const user = appendMessage(entries, `${prefix}-user-${number}`, parentId, "user", `${prefix} goal ${number}`);
    const assistant = appendMessage(entries, `${prefix}-assistant-${number}`, user.id, "assistant", `${prefix} answer ${number}`);
    parentId = assistant.id;
    spans.push({ entries: [user, assistant], user, assistant });
  }
  return { entries, spans };
}
function appendRecord(branch, record, sequence) {
  const entry = {
    ...record,
    id: `${sequence.prefix}-${++sequence.value}`,
    parentId: branch.at(-1)?.id ?? null,
  };
  branch.push(entry);
  return entry;
}
function appendClosedCycles(branch, binding, spans, prefix) {
  const sequence = { prefix, value: 0 };
  for (const span of spans) {
    const queued = cycles.createQueuedCycleRecords({ binding, sourceEntries: span.entries })[0];
    assert.ok(queued, "fixture span is a qualifying durable queue batch");
    const snapshot = cycles.snapshotFromQueuedCycle(queued);
    assert.ok(snapshot);
    const attempt = cycles.beginQueuedCycleAttempt(snapshot, [queued]);
    assert.ok(attempt.allowed && attempt.record);
    const closed = cycles.closeCycle(snapshot, attempt.record, {
      outcome: "complete",
      sourceEntryIds: snapshot.span.sourceEntryIds,
      sourceStartId: snapshot.span.sourceStartId,
      sourceEndId: snapshot.span.sourceEndId,
      sourceDigest: snapshot.span.sourceDigest,
      completedTurnEndId: snapshot.span.completedTurnEndId,
      observationIds: [],
      reflectionIds: [],
    }, [queued, attempt.record]);
    assert.ok(closed, "fixture close is backed by the exact queued attempt");
    appendRecord(branch, queued, sequence);
    appendRecord(branch, attempt.record, sequence);
    appendRecord(branch, closed, sequence);
  }
}
function harness({ branch, allEntries = branch, sessionId, enabled = true, runtime = undefined }) {
  const handlers = new Map();
  const state = { branch, allEntries };
  const pi = {
    on(type, handler) { handlers.set(type, handler); },
    appendEntry(customType, data) {
      const entry = { type: "custom", id: `runtime-${state.allEntries.length + 1}`, parentId: state.branch.at(-1)?.id ?? null, customType, data };
      state.branch.push(entry);
      if (state.allEntries !== state.branch) state.allEntries.push(entry);
    },
  };
  const ctx = {
    sessionManager: {
      getSessionId: () => sessionId,
      getEntries: () => state.allEntries,
      getBranch: () => state.branch,
      getLeafId: () => state.branch.at(-1)?.id,
      buildContextEntries: () => state.branch,
    },
    isIdle: () => true,
    hasPendingMessages: () => false,
    getContextUsage: () => ({ tokens: 21_000, contextWindow: 1_000_000 }),
    getSystemPrompt: () => "synthetic system prompt",
    compact: () => {},
    hasUI: false,
  };
  const coordinator = new coordinatorModule.PlasticMemoryCoordinator(pi, { enabled, runtime });
  return { state, handlers, ctx, coordinator };
}
async function start(world) {
  await world.handlers.get("session_start")({ type: "session_start", reason: "startup" }, world.ctx);
}
function beforeCompactEvent(world) {
  return {
    type: "session_before_compact",
    branchEntries: world.state.branch,
    preparation: { firstKeptEntryId: world.state.branch.find((entry) => entry.type === "message")?.id, tokensBefore: 7_777 },
  };
}
const runtime = { modelRegistry: {}, agentLoop: async () => ({}) };

// A closed record carries a stable sessionId and an exact source manifest/digest. Those
// two existing anchors prove a same-session current-branch lineage after Plastic rebind.
const sameSession = "rebind-same-session";
const oldBinding = {
  sessionId: ids.sessionDigest(sameSession, "plastic-memory:session"),
  generation: 0,
  branchId: "plastic-before-reload",
};
const positiveFixture = sourceFixture("same", 6);
appendClosedCycles(positiveFixture.entries, oldBinding, positiveFixture.spans, "old");
const positive = harness({ branch: positiveFixture.entries, sessionId: sameSession });
await start(positive);
const reboundBinding = positive.coordinator.getBinding(positive.ctx);
assert.notEqual(reboundBinding.branchId, oldBinding.branchId, "rebind generates a new Plastic branch id");
assert.notEqual(reboundBinding.generation, oldBinding.generation, "rebind advances the Plastic generation");
const adopted = cycles.closedCyclesForBinding(positive.state.branch, reboundBinding);
assert.equal(adopted.length, 6, "same-lineage closed cycles remain visible after rebind");
assert.equal(adopted.every((cycle) => cycle.sessionId === reboundBinding.sessionId
  && cycle.generation === reboundBinding.generation && cycle.branchId === reboundBinding.branchId), true,
"adopted cycles are only an in-memory current-binding view");
assert.equal(adopted.every((cycle) => cycle.sourceEntryIds.every((id) => positiveFixture.entries.some((entry) => entry.id === id))), true,
"adoption is anchored to exact current-branch source ids");
const positiveStatus = positive.coordinator.getStatus(positive.ctx);
assert.equal(positiveStatus.cycles.closed, 6, "status reports the recovered closed stride");
assert.equal(JSON.stringify(positiveStatus).includes("same goal"), false, "status remains content-free");
positive.coordinator.shutdown("positive-rebind-test");

// Negative controls: a foreign session record on the current branch and a same-session
// record on a forked parent chain are both excluded; neither can inflate closed count.
const currentFixture = sourceFixture("current", 6);
const foreignSession = {
  ...oldBinding,
  sessionId: ids.sessionDigest("different-session", "plastic-memory:session"),
  branchId: "foreign-session-branch",
};
const foreignSessionFixture = sourceFixture("foreign-session", 1);
appendClosedCycles(foreignSessionFixture.entries, foreignSession, foreignSessionFixture.spans, "foreign-session");
const currentWithForeignRecord = [...currentFixture.entries, ...foreignSessionFixture.entries.slice(2)];
assert.equal(cycles.closedCyclesForBinding(currentWithForeignRecord, { ...oldBinding, generation: 2, branchId: "new" }).length, 0,
"different-session closed records stay excluded");

const forked = sourceFixture("fork", 6);
const forkBinding = { ...oldBinding, branchId: "different-host-fork" };
appendClosedCycles(forked.entries, forkBinding, forked.spans, "fork");
const forkWorld = harness({ branch: currentFixture.entries, allEntries: [...currentFixture.entries, ...forked.entries], sessionId: sameSession });
await start(forkWorld);
const forkStatus = forkWorld.coordinator.getStatus(forkWorld.ctx);
assert.equal(forkStatus.cycles.closed, 0, "same-session records on a different host branch are absent from the current branch");
forkWorld.coordinator.shutdown("negative-rebind-test");

// Status reason codes separate an unbound coordinator, an unavailable runtime, and a
// structurally valid branch with no representable emergency window.
const reasonWorld = harness({ branch: sourceFixture("reason", 1).entries, sessionId: "reason-session", runtime });
const beforeStartStatus = reasonWorld.coordinator.getStatus(reasonWorld.ctx);
assert.equal(beforeStartStatus.emergency.reason, "binding-invalid");
assert.equal(beforeStartStatus.emergency.available, false);
await start(reasonWorld);
const noWindowStatus = reasonWorld.coordinator.getStatus(reasonWorld.ctx);
assert.equal(noWindowStatus.emergency.reason, "no-safe-window");
assert.equal(noWindowStatus.emergency.available, false);
reasonWorld.coordinator.shutdown("reason-test");
const runtimeWorld = harness({ branch: sourceFixture("runtime", 1).entries, sessionId: "runtime-session" });
await start(runtimeWorld);
assert.equal(runtimeWorld.coordinator.getStatus(runtimeWorld.ctx).emergency.reason, "runtime-unavailable");
runtimeWorld.coordinator.shutdown("runtime-reason-test");

// The registration/invocation marker is explicit even before any hook runs. An invoked
// Disabled and ineligible external hooks leave bounded diagnostics while preserving
// ordinary host compaction ownership.
const neverRan = harness({ branch: sourceFixture("never", 1).entries, sessionId: "never-session", runtime });
const neverRanStatus = neverRan.coordinator.getStatus(neverRan.ctx);
assert.equal(neverRanStatus.compaction.handlerRegistered, true);
assert.deepEqual(neverRanStatus.compaction.lastInvocation, { invoked: false, outcome: "not-invoked", code: "handler-not-invoked" });
assert.equal(neverRanStatus.lastCompactionDiagnostic, null);
neverRan.coordinator.shutdown("never-ran-test");

const disabled = harness({ branch: sourceFixture("disabled", 1).entries, sessionId: "disabled-session", enabled: false, runtime });
await start(disabled);
assert.equal(await disabled.handlers.get("session_before_compact")(beforeCompactEvent(disabled), disabled.ctx), undefined,
"disabled Plastic leaves ordinary host compaction ownership unchanged");
const disabledStatus = disabled.coordinator.getStatus(disabled.ctx);
assert.deepEqual(disabledStatus.lastCompactionDiagnostic, {
  phase: "compaction", outcome: "skipped", code: "coordinator-disabled",
  reason: "Plastic Memory compaction handler was invoked while disabled",
});
assert.deepEqual(disabledStatus.compaction.lastInvocation, { invoked: true, outcome: "skipped", code: "coordinator-disabled" });
disabled.coordinator.shutdown("disabled-test");

const yielded = harness({ branch: sourceFixture("yielded", 1).entries, sessionId: "yielded-session", runtime });
await start(yielded);
assert.equal(await yielded.handlers.get("session_before_compact")(beforeCompactEvent(yielded), yielded.ctx), undefined);
const yieldedStatus = yielded.coordinator.getStatus(yielded.ctx);
assert.equal(yieldedStatus.lastCompactionDiagnostic !== null, true, "every native fallback has a diagnostic");
assert.equal(yieldedStatus.lastCompactionDiagnostic.code, "no-safe-window");
assert.equal(yieldedStatus.lastCompactionDiagnostic.outcome, "skipped");
assert.deepEqual(yieldedStatus.compaction.lastInvocation, { invoked: true, outcome: "skipped", code: "native-fallback" });
yielded.coordinator.shutdown("yielded-test");

console.log("PLASTIC_MEMORY_REBIND_OBSERVABILITY: PASS (same-lineage closed-cycle adoption, fork/session exclusion, reason-coded emergency status, and explicit hook invocation diagnostics)");

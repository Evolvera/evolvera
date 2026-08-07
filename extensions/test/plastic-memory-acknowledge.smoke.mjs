import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const coordinatorModule = await jiti.import(path.join(root, "plastic-memory/runtime/coordinator.ts"));
const engine = await jiti.import(path.join(root, "plastic-memory/compaction/engine.ts"));
const pendingModule = await jiti.import(path.join(root, "plastic-memory/compaction/pending.ts"));
const ledger = await jiti.import(path.join(root, "plastic-memory/session/ledger.ts"));

const CYCLE_COUNT = 12;
const projectSnapshot = { summary: "bounded project summary", activeIndex: JSON.stringify({ kind: "active-chunk-index", chunks: [] }) };
function fakeLuna(request) {
  return { summary: "fake summary", state: { facts: { goals: request.facts.goals }, cycleIds: [...(request.priorState?.cycleIds ?? []), ...request.cycleIds], sourceEntryIds: [...(request.priorState?.sourceEntryIds ?? []), ...request.sourceEntryIds], sourceDigests: [...(request.priorState?.sourceDigests ?? []), ...request.sourceDigests] } };
}

function fixture() {
  let nextId = 0;
  const entries = [];
  const append = (message) => {
    const entry = { type: "message", id: `e${++nextId}`, parentId: entries.at(-1)?.id ?? null, message, tokenCount: 5_000 };
    entries.push(entry);
    return entry;
  };
  const spans = [];
  for (let number = 1; number <= CYCLE_COUNT; number += 1) {
    const start = append({ role: "user", content: [{ type: "text", text: `goal C${number}; preserve exact constraint` }] });
    const tool = append({ role: "assistant", content: [{ type: "toolCall", id: `call-${number}`, name: "functions.read", arguments: { path: `src/C${number}.ts` } }], stopReason: "toolUse" });
    const result = append({ role: "toolResult", toolCallId: `call-${number}`, content: [{ type: "text", text: "read complete" }] });
    const end = append({ role: "assistant", content: [{ type: "text", text: `completed C${number}` }], stopReason: "stop" });
    spans.push({ start, end, ids: [start.id, tool.id, result.id, end.id] });
  }
  return { entries, spans };
}
function closedCycle(binding, span, entries) {
  const sourceEntries = span.ids.map((id) => entries.find((entry) => entry.id === id));
  return {
    schemaVersion: 1, ...binding, sourceStartId: span.start.id, sourceEndId: span.end.id,
    sourceEntryIds: span.ids, sourceDigest: ledger.sourceDigest(sourceEntries), completedTurnEndId: span.end.id,
    cycleId: `cycle-${span.start.id}`, attemptId: `attempt-${span.start.id}`, snapshotId: `snapshot-${span.start.id}`,
    status: "complete", observationIds: [], reflectionIds: [],
  };
}

/** Real coordinator + host stubs; the branch is mutated exactly like the host session manager. */
function world() {
  const runtimeToken = "runtime-test";
  const { entries, spans } = fixture();
  const handlers = new Map();
  const compactCalls = [];
  const appended = [];
  let clock = 2_000;
  let compactionSeq = 0;
  let plasticSeq = 0;
  const state = { branch: [...entries] };
  const pi = {
    on(event, handler) { handlers.set(event, handler); },
    appendEntry(customType, data) {
      appended.push({ customType, data });
      state.branch.push({ type: "custom", id: `plastic-${++plasticSeq}`, parentId: state.branch.at(-1)?.id, customType, data });
    },
    registerTool() {}, registerCommand() {},
  };
  const ctx = {
    cwd: root,
    hasUI: false,
    sessionManager: {
      getSessionId() { return "019fcf17-6e55-7646-89f9-4e0e0258b267"; },
      getEntries() { return state.branch; },
      getBranch() { return state.branch; },
      getLeafId() { return state.branch.at(-1).id; },
      buildContextEntries() { return state.branch; },
    },
    isIdle() { return true; },
    hasPendingMessages() { return false; },
    getContextUsage() { return { tokens: 21_000, contextWindow: 160_000 }; },
    getSystemPrompt() { return "synthetic system prompt"; },
    compact(request) { compactCalls.push(request); },
    ui: { notify() {} },
  };
  const coordinator = new coordinatorModule.PlasticMemoryCoordinator(pi, { enabled: true, runtimeToken, now: () => clock });
  handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
  const binding = coordinator.getBinding(ctx);
  const allCycles = spans.map((span) => closedCycle(binding, span, entries));
  let priorState;
  let stagedGeneration = binding.generation;

  /** Stage a freshly prepared pending built from the first `cycleCount` closed cycles. */
  function stage(cycleCount) {
    clock += 1_000;
    const currentBinding = coordinator.getBinding(ctx);
    if (currentBinding.generation !== stagedGeneration) {
      priorState = coordinator.priorState;
      stagedGeneration = currentBinding.generation;
    }
    const currentCycles = allCycles.slice(0, cycleCount).map((cycle) => ({ ...cycle, ...currentBinding }));
    const prepared = engine.prepareSemanticCompaction({
      binding: currentBinding, branchEntries: state.branch, cycles: currentCycles, priorState,
      projectSnapshot, runtimeToken, now: clock, compact: fakeLuna,
    });
    assert.equal(prepared.eligible, true, `cycle window of ${cycleCount} prepares a real 6/4 pending: ${prepared.reason}`);
    priorState = prepared.prepared.rendered.state;
    coordinator.pendingStore.stage(prepared.prepared.pending);
    coordinator.preparedViews.set(prepared.prepared.pending, { summary: prepared.prepared.rendered.summary, details: prepared.prepared.rendered.details, state: prepared.prepared.rendered.state });
    return prepared.prepared;
  }

  /** Drive Pi's ordinary non-internal host hook directly. */
  async function beforeCompact() {
    const result = await handlers.get("session_before_compact")({
      type: "session_before_compact", branchEntries: state.branch,
      preparation: { firstKeptEntryId: state.branch[0].id, tokensBefore: 7_777 }, reason: "manual",
    }, ctx);
    assert.ok(result && result.compaction, "ordinary host hook returns a verified Plastic compaction");
    return result.compaction;
  }

  /** Append the host compaction entry exactly as session-manager `appendCompaction` does. */
  function hostAppend(compaction, mutate = (entry) => entry) {
    const entry = mutate({
      type: "compaction",
      id: `cmp${++compactionSeq}`,
      parentId: state.branch.at(-1).id,
      timestamp: new Date(clock).toISOString(),
      summary: compaction.summary,
      firstKeptEntryId: compaction.firstKeptEntryId,
      tokensBefore: compaction.tokensBefore,
      details: compaction.details,
      usage: undefined,
      fromHook: true,
    });
    state.branch = [...state.branch, entry];
    return entry;
  }

  function compactEvent(entry) {
    handlers.get("session_compact")({ type: "session_compact", compactionEntry: entry }, ctx);
  }

  return { coordinator, ctx, handlers, entries, state, appended, compactCalls, stage, beforeCompact, hostAppend, compactEvent };
}

const applied = (w) => w.appended.filter((record) => record.customType === "plastic.compaction.applied");

// 1. END-TO-END two-hook lifecycle: prepared → consumed at before_compact → acknowledged at compact.
const w = world();
{
  const prepared = w.stage(6);
  const compaction = await w.beforeCompact();
  assert.equal(compaction.firstKeptEntryId, prepared.cut.firstKeptEntryId);
  assert.equal(w.coordinator.priorState, undefined, "staging does not promote prior state");
  const entry = w.hostAppend(compaction);
  w.compactEvent(entry);
  assert.equal(applied(w).length, 1, "a consumed pending is acknowledged at session_compact");
  assert.equal(w.appended.findIndex((record) => record.customType === "plastic.compaction.applied")
    < w.appended.findIndex((record) => record.customType === "plastic.bootstrap.recorded" && record.data.generation === 2), true,
  "the applied record is visible before rebase/bootstrap");
  assert.deepEqual(w.coordinator.priorState, prepared.rendered.state, "rebase carries only the verified cumulative state");
  assert.equal(w.appended.some((candidate) => candidate.customType === "plastic.project.proposal.recorded"), false,
    "an unconfigured coordinator preserves acknowledgement/rebase order and fails promotion closed");
  const record = applied(w)[0].data;
  assert.equal(record.compactionEntryId, entry.id);
  assert.equal(record.firstKeptEntryId, prepared.cut.firstKeptEntryId);
  assert.equal(w.coordinator.getPending(), undefined, "pending slot stays consume-once");
}

// 2. State is not stuck: a second compaction still prepares and applies.
{
  const prepared = w.stage(8);
  const compaction = await w.beforeCompact();
  assert.notEqual(compaction.firstKeptEntryId, applied(w)[0].data.firstKeptEntryId, "the second cut advances");
  const entry = w.hostAppend(compaction);
  w.compactEvent(entry);
  assert.equal(applied(w).length, 2, "a second compaction is acknowledged after the first");
  assert.equal(applied(w)[1].data.firstKeptEntryId, prepared.cut.firstKeptEntryId);
}

// 3. Failure is non-sticky: a tampered host entry appends nothing, and the next cycle still applies.
{
  w.stage(10);
  const compaction = await w.beforeCompact();
  const generationBeforeFallback = w.coordinator.getGeneration();
  const tampered = w.hostAppend(compaction, (entry) => ({ ...entry, summary: `TAMPERED ${entry.summary}` }));
  w.compactEvent(tampered);
  assert.equal(applied(w).length, 2, "a tampered host compaction is never acknowledged");
  assert.equal(w.coordinator.getGeneration(), generationBeforeFallback + 1, "an unmatched actual boundary rebases the Plastic generation");
  assert.equal(w.coordinator.getPending(), undefined, "rebase clears stale pending before the next stage");

  const prepared = w.stage(12);
  const nextCompaction = await w.beforeCompact();
  const entry = w.hostAppend(nextCompaction);
  w.compactEvent(entry);
  assert.equal(applied(w).length, 3, "apply state recovers after a failed acknowledgement");
  assert.equal(applied(w)[2].data.firstKeptEntryId, prepared.cut.firstKeptEntryId);
}
// 3a. A native boundary with no in-flight Plastic apply clears pending/prior state and
// bootstraps from the host's active context without removing the native summary.
{
  const nativeWorld = world();
  nativeWorld.stage(6);
  const native = nativeWorld.hostAppend({ summary: "HOST-NATIVE-SUMMARY", firstKeptEntryId: nativeWorld.entries[0].id, tokensBefore: 7_777, details: undefined }, (entry) => ({
    ...entry,
    fromHook: false,
  }));
  // Simulate a native host compaction that bypassed the Plastic before hook.
  nativeWorld.compactEvent(native);
  assert.equal(nativeWorld.coordinator.getPending(), undefined, "native boundary clears stale pending");
  assert.equal(nativeWorld.coordinator.getGeneration(), 2, "native boundary starts a fresh generation");
  assert.equal(nativeWorld.appended.some((record) => record.customType === "plastic.bootstrap.recorded" && record.data.generation === 2), true,
    "native boundary bootstraps the new active host context");
  assert.equal(native.summary, "HOST-NATIVE-SUMMARY", "native summary remains host-owned, not rewritten");
}

// 4. Regression guard: the staging path still refuses an already-consumed pending.
{
  const fresh = world();
  const prepared = fresh.stage(6);
  const current = {
    binding: prepared.pending.binding,
    runtimeToken: prepared.pending.runtimeToken,
    branchIds: fresh.state.branch.map((entry) => entry.id),
    latestCompactionIdentity: prepared.pending.latestCompactionIdentity,
  };
  const now = prepared.pending.stagedAt + 1;
  assert.equal(pendingModule.isPendingUsable(prepared.pending, current, now), true);
  const consumed = pendingModule.consumePending(prepared.pending, current, now);
  assert.ok(consumed && consumed.consumed === true);
  assert.equal(pendingModule.isPendingUsable(consumed, current, now), false, "a consumed pending is never re-usable for staging");
  assert.equal(pendingModule.consumePending(consumed, current, now), undefined, "a consumed pending is never re-consumed");
  assert.equal(pendingModule.isPendingIdentityCurrent(consumed, current, now), true, "identity alone stays valid for acknowledgement");
  assert.equal(pendingModule.isPendingIdentityCurrent(consumed, { ...current, runtimeToken: "other" }, now), false);
  assert.equal(pendingModule.isPendingIdentityCurrent(consumed, current, prepared.pending.expiresAt), false, "TTL still bounds acknowledgement");
  // Double-acknowledge protection survives the identity-only path.
  const hostCompaction = { type: "compaction", id: "cmp-x", firstKeptEntryId: prepared.cut.firstKeptEntryId, summary: prepared.rendered.summary, details: prepared.rendered.details };
  assert.ok(engine.acknowledgeCompaction(consumed, hostCompaction, current, current.branchIds, now));
  assert.equal(engine.acknowledgeCompaction(consumed, hostCompaction, current, current.branchIds, now), undefined, "double acknowledgement is refused");
}

assert.equal(w.compactCalls.length, 0, "a direct ordinary acknowledgement does not issue a second ctx.compact request");
console.log("PLASTIC_MEMORY_ACKNOWLEDGE: PASS (ordinary host hook acknowledges visibly before cumulative-state rebase/bootstrap)");

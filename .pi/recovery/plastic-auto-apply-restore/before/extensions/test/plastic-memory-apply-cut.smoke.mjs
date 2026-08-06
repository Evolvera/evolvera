import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const coordinatorModule = await jiti.import(path.join(root, "plastic-memory/runtime/coordinator.ts"));
const engine = await jiti.import(path.join(root, "plastic-memory/compaction/engine.ts"));
const ledger = await jiti.import(path.join(root, "plastic-memory/session/ledger.ts"));

const PREPARE_AT = 1_000;
const NOW = 2_000;
const projectSnapshot = { summary: "bounded project summary", activeIndex: JSON.stringify({ kind: "active-chunk-index", chunks: [] }) };
function fakeLuna(request) {
  return { summary: "fake summary", state: { facts: { goals: request.facts.goals }, cycleIds: [...request.cycleIds], sourceEntryIds: [...request.sourceEntryIds], sourceDigests: [...request.sourceDigests] } };
}

function fixture(includeHostPrefix = false) {
  let nextId = 0;
  const entries = [];
  if (includeHostPrefix) {
    entries.push({ type: "session", id: "session", parentId: null });
    entries.push({ type: "model_change", id: "host-model", parentId: "disconnected-model" });
    entries.push({ type: "thinking_level_change", id: "host-thinking", parentId: "disconnected-thinking" });
    entries.push({
      type: "custom", id: "host-bootstrap", parentId: "disconnected-bootstrap",
      customType: "plastic.bootstrap.recorded",
      data: { sessionId: "host-prefix", generation: 0, branchId: "host-prefix", activeEntryIds: [], historicalPrefixIds: [] },
    });
  }
  const append = (message) => {
    const entry = { type: "message", id: `e${++nextId}`, parentId: entries.at(-1)?.id ?? null, message, tokenCount: 5_000 };
    entries.push(entry);
    return entry;
  };
  const spans = [];
  for (let number = 1; number <= 6; number += 1) {
    const start = append({ role: "user", content: [{ type: "text", text: `goal C${number}; preserve exact constraint` }] });
    const tool = append({ role: "assistant", content: [{ type: "toolCall", id: `call-${number}`, name: "functions.read", arguments: { path: `src/C${number}.ts` } }], stopReason: "toolUse" });
    const result = append({ role: "toolResult", toolCallId: `call-${number}`, content: [{ type: "text", text: "read complete" }] });
    const end = append({ role: "assistant", content: [{ type: "text", text: `completed C${number}` }], stopReason: "stop" });
    spans.push({ start, end, ids: [start.id, tool.id, result.id, end.id] });
  }
  return { entries, spans };
}
function entryBudget(entries, contextWindow, fixedTokens, tokensPerEntry) {
  return { contextWindow, fixedTokens, entryTokens: Object.fromEntries(entries.map((entry) => [entry.id, tokensPerEntry])) };
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

/** Fresh coordinator + host stubs with a real engine-prepared pending staged. */
function world(options = {}) {
  const runtimeToken = options.runtimeToken ?? "runtime-test";
  const contextWindow = options.contextWindow ?? 160_000;
  let usageTokens = Object.hasOwn(options, "usageTokens") ? options.usageTokens : 21_000;
  const { entries, spans } = fixture(options.hostPrefix === true);
  const handlers = new Map();
  const compactCalls = [];
  const notices = [];
  let clock = NOW;
  const pi = { on(event, handler) { handlers.set(event, handler); }, appendEntry() {}, registerTool() {}, registerCommand() {} };
  const state = { branch: entries };
  const ctx = {
    cwd: root,
    hasUI: true,
    sessionManager: {
      getSessionId() { return "019fcf17-6e55-7646-89f9-4e0e0258b267"; },
      getEntries() { return state.branch; },
      getBranch() { return state.branch; },
      getLeafId() { return state.branch.at(-1).id; },
      buildContextEntries() { return state.branch; },
    },
    isIdle() { return true; },
    hasPendingMessages() { return false; },
    getContextUsage() { return usageTokens === null ? { tokens: null, contextWindow } : usageTokens === undefined ? undefined : { tokens: usageTokens, contextWindow }; },
    getSystemPrompt() { return "synthetic system prompt"; },
    compact(request) { compactCalls.push(request); },
    ui: { notify(message, level) { notices.push({ message, level }); } },
  };
  const coordinator = new coordinatorModule.PlasticMemoryCoordinator(pi, { enabled: true, runtimeToken, now: () => clock });
  handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
  const binding = options.binding ? options.binding(coordinator.getBinding(ctx)) : coordinator.getBinding(ctx);
  const cycles = spans.map((span) => closedCycle(binding, span, entries));
  const physicalBudget = options.twoCyclePhysicalBudget ? entryBudget(entries, 25_000, 0, 2_500) : undefined;
  const prepared = engine.prepareSemanticCompaction({
    binding, branchEntries: entries, cycles, physicalBudget, projectSnapshot,
    runtimeToken: options.pendingRuntimeToken ?? runtimeToken, now: PREPARE_AT, compact: fakeLuna,
  });
  assert.equal(prepared.eligible, true, "fixture prepares a real 6/4 pending compaction");
  const pending = prepared.prepared.pending;
  coordinator.pendingStore.stage(pending);
  coordinator.preparedViews.set(pending, { summary: prepared.prepared.rendered.summary, details: prepared.prepared.rendered.details });
  return {
    coordinator, ctx, handlers, entries, state, pending, compactCalls, spans,
    rendered: prepared.prepared.rendered,
    cut: pending.cut.firstKeptEntryId,
    setClock(value) { clock = value; },
    setUsage(value) { usageTokens = value; },
    beforeCompact(event) {
      return handlers.get("session_before_compact")({ type: "session_before_compact", branchEntries: state.branch, ...event }, ctx);
    },
    notices,
  };
}
function hostEvent(firstKeptEntryId, extra = {}) {
  return { preparation: { firstKeptEntryId, tokensBefore: 7_777 }, reason: "auto", ...extra };
}

// Prepared work waits passively: lifecycle edges may capture/drain queue work but never
// invoke host compaction, regardless of context usage.
for (const usageTokens of [undefined, null, 0, 20_000, 20_001]) {
  const w = world({ usageTokens });
  w.handlers.get("turn_end")({ type: "turn_end" }, w.ctx);
  w.handlers.get("agent_settled")({ type: "agent_settled" }, w.ctx);
  assert.equal(w.compactCalls.length, 0, `usage ${usageTokens} never autonomously compacts`);
  assert.notEqual(w.coordinator.getPending(), undefined, `usage ${usageTokens} retains the prepared pending`);
}

// 2. HOST path: Plastic owns a valid cut regardless of host advisory ordering.
{
  const w = world();
  const result = await w.beforeCompact(hostEvent(w.entries[0].id));
  assert.equal(result.compaction.firstKeptEntryId, w.cut, "plastic cut later than the host cut is accepted");
  assert.equal(result.compaction.tokensBefore, 7_777);
}
{
  const w = world({ hostPrefix: true });
  const result = await w.beforeCompact(hostEvent(w.entries[0].id));
  assert.equal(result.compaction.firstKeptEntryId, w.cut, "host-prefixed branch keeps the Plastic cut");
}
{
  const w = world({ hostPrefix: true });
  const firstSource = w.state.branch.findIndex((entry) => entry.type === "message");
  w.state.branch = w.state.branch.map((entry, index) => index === firstSource + 1 ? { ...entry, parentId: "post-anchor-disconnected" } : entry);
  assert.deepEqual(await w.beforeCompact(hostEvent(w.state.branch[0].id)), { cancel: true }, "post-anchor mismatch cancels rather than exposing native compaction");
}
{
  const w = world();
  assert.equal((await w.beforeCompact(hostEvent(w.cut))).compaction.firstKeptEntryId, w.cut, "equal cut is accepted");
}
{
  const w = world();
  const later = w.entries.at(-4).id;
  assert.notEqual(later, w.cut);
  assert.equal((await w.beforeCompact(hostEvent(later))).compaction.firstKeptEntryId, w.cut, "plastic cut is accepted when host advice is later");
}
{
  const w = world();
  assert.deepEqual(await w.beforeCompact(hostEvent("not-on-this-branch")), { cancel: true }, "unlocatable host cut cancels without native fallback");
  assert.deepEqual(await w.beforeCompact(hostEvent(undefined)), { cancel: true }, "absent host cut cancels without native fallback");
}
// 2b. A descendant that makes the prepared cut physically unsafe is rejected at hook time.
{
  const w = world();
  w.state.branch.push({ type: "message", id: "huge-descendant", parentId: w.state.branch.at(-1).id, message: { role: "user", content: [{ type: "text", text: "x".repeat(700_000) }] } });
  assert.deepEqual(await w.beforeCompact(hostEvent(w.entries[0].id)), { cancel: true }, "hook-time budget recheck cancels an overflowing descendant");
  assert.notEqual(w.coordinator.getPending(), undefined, "budget rejection retains the existing pending for retry");
}

// 3. Every pre-existing rejection still rejects.
{
  const w = world({ binding: (binding) => ({ ...binding, generation: binding.generation + 1 }) });
  assert.deepEqual(await w.beforeCompact(hostEvent(w.entries[0].id)), { cancel: true }, "wrong binding");
}
{
  const w = world({ pendingRuntimeToken: "runtime-other" });
  assert.deepEqual(await w.beforeCompact(hostEvent(w.entries[0].id)), { cancel: true }, "wrong runtimeToken");
}
{
  const w = world();
  const kept = w.entries.find((entry) => entry.id === w.cut);
  kept.message = { ...kept.message, role: "assistant" };
  assert.deepEqual(await w.beforeCompact(hostEvent(w.entries[0].id)), { cancel: true }, "non-user kept entry");
}
{
  const w = world();
  w.state.branch = w.entries.map((entry, index) => index === 0 ? { ...entry, id: "forked-root" } : index === 1 ? { ...entry, parentId: "forked-root" } : entry);
  assert.deepEqual(await w.beforeCompact(hostEvent(w.state.branch[0].id)), { cancel: true }, "prefix mismatch");
}
{
  const w = world();
  w.state.branch = [...w.entries].reverse();
  assert.deepEqual(await w.beforeCompact(hostEvent(w.entries[0].id)), { cancel: true }, "unordered branch");
}
{
  const w = world();
  w.setClock(PREPARE_AT + 300_001);
  assert.deepEqual(await w.beforeCompact(hostEvent(w.entries[0].id)), { cancel: true }, "expired pending");
}
console.log("PLASTIC_MEMORY_APPLY_CUT: PASS (passive prepared-pending host use preserves exact cut, binding, prefix, TTL, and physical-tail guards)");

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
  let usageTokens = Object.hasOwn(options, "usageTokens") ? options.usageTokens : 120_001;
  let idle = options.isIdle ?? true;
  let pendingMessages = options.pendingMessages ?? false;
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
    isIdle() { return idle; },
    hasPendingMessages() { return pendingMessages; },
    getContextUsage() { return usageTokens === null ? { tokens: null, contextWindow } : usageTokens === undefined ? undefined : { tokens: usageTokens, contextWindow }; },
    getSystemPrompt() { return "synthetic system prompt"; },
    compact(request) { compactCalls.push(request); },
    ui: { notify(message, level) { notices.push({ message, level }); } },
  };
  const coordinator = new coordinatorModule.PlasticMemoryCoordinator(pi, { enabled: true, runtimeToken, now: () => clock });
  handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
  const binding = options.binding ? options.binding(coordinator.getBinding(ctx)) : coordinator.getBinding(ctx);
  const cycles = spans.map((span) => closedCycle(binding, span, entries));
  for (const cycle of cycles) {
    entries.push({ type: "custom", id: `closed-${cycle.cycleId}`, parentId: entries.at(-1).id, customType: "plastic.cycle.closed", data: cycle });
  }
  let started = false;
  const startNextCycle = () => {
    if (started) return;
    started = true;
    entries.push({ type: "message", id: "started-next-cycle", parentId: entries.at(-1).id, message: { role: "user", content: [{ type: "text", text: "next cycle has started" }] }, tokenCount: 5_000 });
  };
  if (options.startedNextCycle !== false) startNextCycle();
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
    setIdle(value) { idle = value; },
    setPendingMessages(value) { pendingMessages = value; },
    startNextCycle,
    internalInstructions() {
      handlers.get("agent_settled")({ type: "agent_settled" }, ctx);
      assert.equal(compactCalls.length, 1, "settled coordinator issues one internal compact");
      return compactCalls[0].customInstructions;
    },
    beforeCompact(event) {
      return handlers.get("session_before_compact")({ type: "session_before_compact", branchEntries: state.branch, ...event }, ctx);
    },
    notices,
  };
}
function hostEvent(firstKeptEntryId, extra = {}) {
  return { preparation: { firstKeptEntryId, tokensBefore: 7_777 }, reason: "auto", ...extra };
}

// 0. Application requires a known usage strictly above 120,000, and keeps the
// prepared six/four pending intact while a started next cycle waits below that threshold.
for (const usageTokens of [undefined, null, 0, 20_000, 120_000]) {
  const w = world({ usageTokens });
  w.handlers.get("agent_settled")({ type: "agent_settled" }, w.ctx);
  assert.equal(w.compactCalls.length, 0, `usage ${usageTokens} defers internal apply`);
  assert.notEqual(w.coordinator.getPending(), undefined, `usage ${usageTokens} retains the prepared pending`);
}
{
  const w = world({ usageTokens: 120_000 });
  w.handlers.get("agent_settled")({ type: "agent_settled" }, w.ctx);
  w.setUsage(120_001);
  w.handlers.get("agent_settled")({ type: "agent_settled" }, w.ctx);
  assert.equal(w.compactCalls.length, 1, "strictly high usage applies exactly once after deferral");
}

// The manual host compaction path calls abort(), so automatic application is forbidden
// until Pi is idle with no queued messages, even if every other gate is satisfied.
for (const options of [{ isIdle: false }, { pendingMessages: true }]) {
  const w = world({ usageTokens: 120_001, ...options });
  w.handlers.get("agent_settled")({ type: "agent_settled" }, w.ctx);
  assert.equal(w.compactCalls.length, 0, "busy or queued Pi state cannot auto-apply");
}

// Six validated closed cycles alone are not enough: a normal source entry must have
// started the next cycle. Starting it later enables exactly one internal compact.
{
  const w = world({ usageTokens: 120_001, startedNextCycle: false });
  w.handlers.get("agent_settled")({ type: "agent_settled" }, w.ctx);
  assert.equal(w.compactCalls.length, 0, "no started next cycle defers automatic compaction");
  w.startNextCycle();
  w.handlers.get("agent_settled")({ type: "agent_settled" }, w.ctx);
  assert.equal(w.compactCalls.length, 1, "starting the next cycle triggers one automatic compaction");
}

// 1. INTERNAL path: the host's own keepRecentTokens suggestion differs from the 6/4 cut
// and must be ignored; the coordinator applies its own cut instead of cancelling.
{
  const w = world();
  const customInstructions = w.internalInstructions();
  assert.notEqual(w.entries[0].id, w.cut, "host suggestion differs from the Plastic cut");
  const result = await w.beforeCompact({ preparation: { firstKeptEntryId: w.entries[0].id, tokensBefore: 4_242 }, customInstructions, reason: "manual" });
  assert.equal(result.cancel, undefined, "internal apply is not cancelled");
  assert.equal(result.compaction.firstKeptEntryId, w.cut);
  assert.equal(result.compaction.summary, w.rendered.summary);
  assert.equal(result.compaction.tokensBefore, 4_242);
  assert.deepEqual(result.compaction.details, w.rendered.details);
  assert.equal(w.coordinator.getPending(), undefined, "pending slot is consumed once");
}
{
  const w = world();
  const customInstructions = w.internalInstructions();
  const result = await w.beforeCompact({ preparation: { tokensBefore: 1 }, customInstructions, reason: "manual" });
  assert.equal(result.compaction.firstKeptEntryId, w.cut, "internal calls bypass the host advisory cut requirement");
}
{
  const w = world();
  w.internalInstructions();
  assert.deepEqual(await w.beforeCompact({ preparation: { firstKeptEntryId: w.cut }, customInstructions: "\u0000plastic-memory:internal-compaction:foreign", reason: "manual" }), { cancel: true }, "foreign internal nonce cancels");
}
{
  const w = world();
  const customInstructions = w.internalInstructions();
  w.compactCalls[0].onError(new Error("Nothing to compact (session too small)"));
  assert.notEqual(w.coordinator.getPending(), undefined, "benign host refusal retains pending");
  assert.equal(w.notices.at(-1)?.message, "Plastic memory: compaction skipped — compaction-skipped: Nothing to compact (session too small)");
  w.handlers.get("agent_settled")({ type: "agent_settled" }, w.ctx);
  assert.equal(w.compactCalls.length, 2, "a later settled edge retries once without callback recursion");
  assert.notEqual(w.compactCalls[1].customInstructions, customInstructions);
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
  assert.equal(await w.beforeCompact(hostEvent(w.state.branch[0].id)), undefined, "post-anchor mismatch yields to native compaction");
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
  assert.equal(await w.beforeCompact(hostEvent("not-on-this-branch")), undefined, "unlocatable host cut yields to native compaction");
  assert.equal(await w.beforeCompact(hostEvent(undefined)), undefined, "absent host cut yields to native compaction");
}
// 2b. A descendant that makes the prepared cut physically unsafe is rejected at hook time.
{
  const w = world();
  w.state.branch.push({ type: "message", id: "huge-descendant", parentId: w.state.branch.at(-1).id, message: { role: "user", content: [{ type: "text", text: "x".repeat(700_000) }] } });
  assert.equal(await w.beforeCompact(hostEvent(w.entries[0].id)), undefined, "hook-time budget recheck yields an overflowing descendant to native compaction");
  assert.notEqual(w.coordinator.getPending(), undefined, "budget rejection retains the existing pending for retry");
}

// 3. Every external rejection yields to native compaction; internal rejection remains fail-closed.
{
  const w = world({ binding: (binding) => ({ ...binding, generation: binding.generation + 1 }) });
  assert.equal(await w.beforeCompact(hostEvent(w.entries[0].id)), undefined, "wrong binding yields to native compaction");
}
{
  const w = world({ pendingRuntimeToken: "runtime-other" });
  assert.equal(await w.beforeCompact(hostEvent(w.entries[0].id)), undefined, "wrong runtimeToken yields to native compaction");
}
{
  const w = world();
  const kept = w.entries.find((entry) => entry.id === w.cut);
  kept.message = { ...kept.message, role: "assistant" };
  assert.equal(await w.beforeCompact(hostEvent(w.entries[0].id)), undefined, "non-user kept entry yields to native compaction");
}
{
  const w = world();
  w.state.branch = w.entries.map((entry, index) => index === 0 ? { ...entry, id: "forked-root" } : index === 1 ? { ...entry, parentId: "forked-root" } : entry);
  assert.equal(await w.beforeCompact(hostEvent(w.state.branch[0].id)), undefined, "prefix mismatch yields to native compaction");
}
{
  const w = world();
  w.state.branch = [...w.entries].reverse();
  assert.equal(await w.beforeCompact(hostEvent(w.entries[0].id)), undefined, "unordered branch yields to native compaction");
}
{
  const w = world();
  w.setClock(PREPARE_AT + 300_001);
  assert.equal(await w.beforeCompact(hostEvent(w.entries[0].id)), undefined, "expired pending yields to native compaction");
}
{
  const w = world();
  const customInstructions = w.internalInstructions();
  w.setClock(PREPARE_AT + 300_001);
  assert.deepEqual(await w.beforeCompact({ preparation: { firstKeptEntryId: w.entries[0].id }, customInstructions, reason: "manual" }), { cancel: true }, "expired internal pending");
}

// A cancelled internal hook spends its nonce before validating the branch. It must still
// release the latch locally because Pi need not invoke onError after a hook cancellation.
{
  const w = world();
  const customInstructions = w.internalInstructions();
  const foreignBranch = [...w.state.branch.slice(0, -1)];
  const cancelled = await w.beforeCompact({ preparation: { firstKeptEntryId: w.cut }, customInstructions, reason: "manual", branchEntries: foreignBranch });
  assert.deepEqual(cancelled, { cancel: true }, "mismatched internal branch cancels");
  assert.notEqual(w.coordinator.getPending(), undefined, "cancelled internal apply retains pending");
  w.handlers.get("agent_settled")({ type: "agent_settled" }, w.ctx);
  assert.equal(w.compactCalls.length, 2, "cancellation releases the apply latch for a later settle");
  const retry = await w.beforeCompact({ preparation: { firstKeptEntryId: w.entries[0].id }, customInstructions: w.compactCalls[1].customInstructions, reason: "manual" });
  assert.equal(retry.cancel, undefined, "retry applies after latch release");
}
console.log("PLASTIC_MEMORY_APPLY_CUT: PASS (automatic six/four application requires a started next cycle, >120k context, and settled idle Pi; internal nonce, latch, and host guards preserve exact cuts)");

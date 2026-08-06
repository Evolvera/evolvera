import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const projection = await jiti.import(path.join(root, "plastic-memory/compaction/projection.ts"));
const coordinatorModule = await jiti.import(path.join(root, "plastic-memory/runtime/coordinator.ts"));
const runnerRuntimeModule = await jiti.import(path.join(root, "plastic-memory/runtime/runner-runtime.ts"));


function entry(id, parentId, role = "user") {
  return { type: "message", id, parentId, message: { role, content: [{ type: "text", text: id }] } };
}
const branch = [entry("C1", "host-bootstrap"), entry("C2", "C1", "assistant"), entry("C3", "C2"), entry("C4", "C3", "assistant")];
const hostPrefix = [
  { type: "session", id: "session", parentId: null },
  { type: "model_change", id: "host-model", parentId: "disconnected-model" },
  { type: "thinking_level_change", id: "host-thinking", parentId: "disconnected-thinking" },
  { type: "custom", id: "host-bootstrap", parentId: "disconnected-bootstrap", customType: "plastic.bootstrap.recorded", data: {} },
];
function compaction(id, parentId, from, through, stateDigest) {
  const header = `PLASTIC-COMPACTION ${stateDigest}`;
  return {
    type: "compaction", id, parentId, firstKeptEntryId: through,
    summary: `${header}\nverified body`,
    details: { plastic: { kind: "cumulative", state: "verified", stateDigest, header, sourceEntryIds: ["C1", "C2", ...(through === "C4" ? ["C3", "C4"] : [])] } },
  };
}
const old = compaction("old", "C4", "C1", "C2", "old-state");
const latest = compaction("latest", "old", "C1", "C4", "latest-state");
const fullBranch = [...hostPrefix, ...branch, old, latest];
const contextEntries = [latest, old];
const messages = [
  { role: "compactionSummary", summary: latest.summary },
  { role: "compactionSummary", summary: old.summary },
  { role: "user", content: [{ type: "text", text: "descendant" }] },
];
const projected = projection.projectPlasticContext({ messages, branchEntries: fullBranch, contextEntries });
assert.equal(projected.status, "projected");
assert.equal(projected.removed, 1);
assert.deepEqual(projected.messages.map((message) => message.role), ["compactionSummary", "user"]);
assert.equal(projected.messages[0].summary, latest.summary);

const malformedHostBranch = [...hostPrefix, ...branch.map((candidate, index) => index === 1 ? { ...candidate, parentId: "post-anchor-disconnected" } : candidate), old, latest];
const malformed = projection.projectPlasticContext({ messages, branchEntries: malformedHostBranch, contextEntries });
assert.equal(malformed.status, "noop");
assert.equal(malformed.reason, "ambiguous branch order");
const noContext = projection.projectPlasticContext({
  messages: [],
  branchEntries: hostPrefix,
  contextEntries: [],
});
assert.equal(noContext.status, "noop");
assert.equal(noContext.reason, "ambiguous branch order");

const native = { type: "compaction", id: "native", parentId: "C4", firstKeptEntryId: "C2", summary: "host-native" };
const nativeResult = projection.projectPlasticContext({
  messages: [{ role: "compactionSummary", summary: "host-native" }],
  branchEntries: [...branch, native], contextEntries: [native],
});
assert.equal(nativeResult.status, "noop");
assert.deepEqual(nativeResult.messages, [{ role: "compactionSummary", summary: "host-native" }]);

const ambiguous = projection.projectPlasticContext({
  messages: [
    { role: "compactionSummary", summary: latest.summary },
    { role: "compactionSummary", summary: "host-native" },
    { role: "compactionSummary", summary: old.summary },
  ],
  branchEntries: [...branch, old, { ...native, parentId: old.id }, { ...latest, parentId: native.id }], contextEntries: [latest, native, old],
});
assert.equal(ambiguous.status, "blocked");
assert.equal(ambiguous.removed, 0);

// Full-mode scheduling crosses the adapter boundary without a provider: fake
// registry/auth/complete calls produce valid observer and reflector outputs,
// and the coordinator closes one plastic cycle from the current host branch.
const cycleModel = { provider: "openai-codex", id: "gpt-5.6-luna", contextWindow: 200_000, maxTokens: 16_000 };
const cycleCalls = [];
let cycleMode = "observations";
const cycleRuntime = runnerRuntimeModule.createPiRunnerRuntime({
  find(provider, id) { assert.equal(provider, "openai-codex"); assert.equal(id, "gpt-5.6-luna"); return cycleModel; },
  async getApiKeyAndHeaders(model) { assert.equal(model, cycleModel); return { ok: true, apiKey: "cycle-fake", headers: { "x-cycle": "fake" }, env: { CYCLE_FAKE: "yes" } }; },
}, async (model, context, options) => {
  cycleCalls.push({ model, context, options });
  const request = JSON.parse(context.messages[0].content[0].text);
  if (context.systemPrompt.startsWith("Extract durable")) {
    if (cycleMode === "failure") return { content: [{ type: "text", text: JSON.stringify({ noObservations: true }) }] };
    return { content: [{ type: "text", text: JSON.stringify({ observations: cycleMode === "empty" ? [] : [{ content: "cycle fact", timestamp: "2026-08-03 00:00", relevance: "medium", sourceEntryIds: request.sourceEntryIds }] }) }] };
  }
  return { content: [{ type: "text", text: JSON.stringify({ reflections: [{ content: "cycle reflection", supportingObservationIds: request.observations.map((observation) => observation.id) }] }) }] };
});
assert.ok(cycleRuntime);
const ownerEntries = [{ ...entry("O1", undefined), tokenCount: 10_000 }, { ...entry("O2", "O1", "assistant"), tokenCount: 10_000 }];
let customId = 0;
const ownerHandlers = new Map();
const ownerPi = {
  on(type, handler) { ownerHandlers.set(type, handler); },
  appendEntry(customType, data) {
    const parentId = ownerEntries.at(-1)?.id;
    ownerEntries.push({ type: "custom", id: `OC${++customId}`, parentId, customType, data });
  },
};
const ownerSessionManager = {
  getSessionId: () => "aaaaaaaaaaaaaaaaaaaaaaaa",
  getLeafId: () => ownerEntries.at(-1)?.id,
  getEntries: () => ownerEntries,
  getBranch: () => ownerEntries,
  buildContextEntries: () => ownerEntries,
};
const ownerNotices = [];
const ownerCompactCalls = [];
const ownerCtx = {
  sessionManager: ownerSessionManager,
  isIdle: () => true,
  hasPendingMessages: () => false,
  getContextUsage: () => ({ tokens: 120_001, contextWindow: 160_000 }),
  getSystemPrompt: () => "synthetic system prompt",
  compact: (request) => { ownerCompactCalls.push(request); },
  hasUI: true,
  ui: { notify(message, level) { ownerNotices.push({ message, level }); } },
};
const ownerCoordinator = coordinatorModule.registerPlasticMemoryCoordinator(ownerPi, { enabled: true, runtime: cycleRuntime, now: () => 1_000 });
await ownerHandlers.get("session_start")({ type: "session_start", reason: "startup" }, ownerCtx);
ownerHandlers.get("turn_end")({ type: "turn_end" }, ownerCtx);
ownerHandlers.get("agent_settled")({ type: "agent_settled" }, ownerCtx);
ownerHandlers.get("agent_settled")({ type: "agent_settled" }, ownerCtx);

for (let attempt = 0; attempt < 20 && !ownerEntries.some((item) => item.customType === "plastic.cycle.closed"); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(ownerEntries.some((item) => item.customType === "plastic.observations.recorded"), true);
assert.equal(ownerEntries.some((item) => item.customType === "plastic.reflections.recorded"), true);
assert.equal(ownerEntries.some((item) => item.customType === "plastic.cycle.closed"), true);
assert.equal(ownerCompactCalls.length, 0, "one 20k closed cycle cannot pass the six-cycle automatic-application gate");
assert.equal(ownerNotices.some(({ message, level }) => level === "info" && /^Plastic memory: observer running on ~[0-9,]+-token snapshot$/u.test(message)), true);
assert.equal(ownerNotices.every(({ message }) => !message.includes("cycle fact") && !message.includes("OC")), true);
async function lifecycleProbe(mode) {
  const entries = [{ ...entry(`${mode}-1`, undefined), tokenCount: 10_000 }, { ...entry(`${mode}-2`, `${mode}-1`, "assistant"), tokenCount: 10_000 }];
  const handlers = new Map();
  const notices = [];
  const pi = {
    on(type, handler) { handlers.set(type, handler); },
    appendEntry(customType, data) { entries.push({ type: "custom", id: `${mode}-custom-${entries.length}`, parentId: entries.at(-1)?.id, customType, data }); },
  };
  const sessionManager = {
    getSessionId: () => mode === "empty" ? "bbbbbbbbbbbbbbbbbbbbbbbb" : "cccccccccccccccccccccccc",
    getLeafId: () => entries.at(-1)?.id,
    getEntries: () => entries,
    getBranch: () => entries,
    buildContextEntries: () => entries,
  };
  const ctx = { sessionManager, isIdle: () => true, hasPendingMessages: () => false, getContextUsage: () => ({ tokens: 21_000, contextWindow: 160_000 }), getSystemPrompt: () => "synthetic system prompt", compact: () => {}, hasUI: true, ui: { notify(message, level) { notices.push({ message, level }); } } };
  const coordinator = coordinatorModule.registerPlasticMemoryCoordinator(pi, { enabled: true, runtime: cycleRuntime, now: () => 1_000 });
  cycleMode = mode;
  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
  handlers.get("turn_end")({ type: "turn_end" }, ctx);
  const wanted = mode === "empty"
    ? (notice) => notice.message === "Plastic memory: observer returned no observations"
    : (notice) => notice.message.startsWith("Plastic memory: observer failed — ");
  for (let attempt = 0; attempt < 20 && !notices.some(wanted); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  coordinator.shutdown(`${mode}-test`);
  return notices;
}
const emptyNotices = await lifecycleProbe("empty");
// A cycle that legitimately finds nothing durable is a waiting state, not a failure:
// only `status: "failed"` warns, so real defects stand out in a live session.
assert.equal(emptyNotices.some(({ message, level }) => message === "Plastic memory: observer returned no observations" && level === "info"), true);
const failedNotices = await lifecycleProbe("failure");
assert.equal(failedNotices.some(({ message, level }) => level === "warning" && message.startsWith("Plastic memory: observer failed — ")), true);
assert.deepEqual([...new Set(cycleCalls.map((call) => call.model))], [cycleModel]);
assert.equal(cycleCalls.every((call) => call.options.cacheRetention === "none" && call.options.apiKey === "cycle-fake" && call.options.env.CYCLE_FAKE === "yes"), true);
ownerCoordinator.shutdown("cycle-test");
const coordinatorSource = readFileSync(path.join(root, "plastic-memory/runtime/coordinator.ts"), "utf8");
assert.equal(/prepareEmergencyCompaction|selectEmergencyWindow/u.test(coordinatorSource), false,
  "the active coordinator hook graph contains no emergency path");
assert.equal(/AUTO_APPLY_MIN_CONTEXT_TOKENS = 120_000[\s\S]*ctx\.compact/u.test(coordinatorSource), true,
  "the gated automatic compaction path remains connected at the 120k threshold");

function completedTurn(entries, label, userTokens, assistantTokens) {
  const user = { type: "message", id: `${label}-user`, parentId: entries.at(-1)?.id ?? null, message: { role: "user", content: [{ type: "text", text: `${label} goal` }] }, tokenCount: userTokens };
  const assistant = { type: "message", id: `${label}-assistant`, parentId: user.id, message: { role: "assistant", content: [{ type: "text", text: `${label} answer` }], stopReason: "stop" }, tokenCount: assistantTokens };
  entries.push(user, assistant);
  return [user, assistant];
}
function queueHarness(entries, runtime, sessionId = "dddddddddddddddddddddddd") {
  const state = { entries, nextCustom: entries.length, calls: [] };
  const handlers = new Map();
  const pi = {
    on(type, handler) { handlers.set(type, handler); },
    appendEntry(customType, data) {
      state.entries.push({ type: "custom", id: `queue-custom-${++state.nextCustom}`, parentId: state.entries.at(-1)?.id ?? null, customType, data });
    },
  };
  const ctx = {
    sessionManager: {
      getSessionId: () => sessionId,
      getLeafId: () => state.entries.at(-1)?.id,
      getEntries: () => state.entries,
      getBranch: () => state.entries,
      buildContextEntries: () => state.entries,
    },
    isIdle: () => true,
    hasPendingMessages: () => false,
    getContextUsage: () => ({ tokens: 21_000, contextWindow: 160_000 }),
    getSystemPrompt: () => "synthetic system prompt",
    compact: () => {},
    hasUI: false,
  };
  const coordinator = coordinatorModule.registerPlasticMemoryCoordinator(pi, { enabled: true, ...(runtime ? { runtime } : {}), now: () => 1_000 });
  return {
    state,
    ctx,
    coordinator,
    async start() { await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx); },
    turn() { handlers.get("turn_end")({ type: "turn_end" }, ctx); },
  };
}
function queueRuntime(state, waitForFirstObserver) {
  return {
    modelRegistry: {
      find(provider, id) { assert.equal(provider, "openai-codex"); assert.equal(id, "gpt-5.6-luna"); return cycleModel; },
      async getProviderAuth() { return { apiKey: "in-process-only" }; },
    },
    async agentLoop(prompts, context) {
      const request = JSON.parse(prompts[0].content[0].text);
      state.calls.push({ role: context.role, sourceEntryIds: request.sourceEntryIds ?? [] });
      if (context.role === "observer") {
        if (waitForFirstObserver) await waitForFirstObserver();
        return { observations: [{ content: "queued integration fact", timestamp: "2026-08-06", relevance: "medium", sourceEntryIds: request.sourceEntryIds }] };
      }
      return { reflections: [{ content: "queued integration reflection", supportingObservationIds: request.observations.map((observation) => observation.id) }] };
    },
  };
}
async function waitFor(check, message) {
  for (let attempt = 0; attempt < 80 && !check(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(check(), true, message);
}
function queueEntries(state) { return state.entries.filter((item) => item.customType === "plastic.cycle.queued"); }

// Terminal capture is synchronous and independent of a runtime: no undersized source can
// start a worker, while exactly 20k and multiple crossed batches become persisted queue records.
{
  const underEntries = [];
  completedTurn(underEntries, "under", 9_999, 10_000);
  const underRuntimeState = { calls: [] };
  const under = queueHarness(underEntries, queueRuntime(underRuntimeState));
  await under.start();
  under.turn();
  assert.equal(queueEntries(under.state).length, 0, "19,999 tokens append no queue item");
  assert.equal(under.state.entries.some((item) => item.customType === "plastic.cycle.attempted"), false, "19,999 tokens append no attempt");
  assert.equal(under.state.entries.some((item) => item.customType === "plastic.cycle.closed"), false, "19,999 tokens append no close");
  assert.equal(underRuntimeState.calls.length, 0, "19,999 tokens start no model work");

  const exactEntries = [];
  completedTurn(exactEntries, "exact", 10_000, 10_000);
  const exact = queueHarness(exactEntries);
  await exact.start();
  exact.turn();
  assert.equal(queueEntries(exact.state).length, 1, "20,000 tokens synchronously append one deterministic queue item");
  assert.equal(queueEntries(exact.state)[0].data.estimatedTokenCount, 20_000);
  assert.equal(exact.state.entries.some((item) => item.customType === "plastic.cycle.attempted"), false, "runtime absence captures without worker work");

  const multiEntries = [];
  completedTurn(multiEntries, "multi-a", 10_000, 10_000);
  completedTurn(multiEntries, "multi-b", 10_000, 10_000);
  const multi = queueHarness(multiEntries);
  await multi.start();
  multi.turn();
  assert.deepEqual(queueEntries(multi.state).map((item) => item.data.estimatedTokenCount), [20_000, 20_000], "every newly crossed batch is synchronously persisted without a runtime");
}

// A runs from its immutable queued A manifest while later terminal B/C batches append,
// then the durable wake-up drains the exact FIFO order without duplicate capture.
{
  const entries = [];
  const a = completedTurn(entries, "A", 10_000, 10_000);
  let releaseA;
  const releasedA = new Promise((resolve) => { releaseA = resolve; });
  let firstObserver;
  const observedA = new Promise((resolve) => { firstObserver = resolve; });
  let observerCount = 0;
  const stateForRuntime = { calls: [] };
  const runtime = queueRuntime(stateForRuntime, async () => {
    observerCount += 1;
    if (observerCount === 1) {
      firstObserver();
      await releasedA;
    }
  });
  const harness = queueHarness(entries, runtime);
  await harness.start();
  harness.turn();
  await observedA;
  const b = completedTurn(harness.state.entries, "B", 10_000, 10_000);
  harness.turn();
  const c = completedTurn(harness.state.entries, "C", 10_000, 10_000);
  harness.turn();
  assert.deepEqual(queueEntries(harness.state).map((item) => item.data.sourceEntryIds), [a.map((item) => item.id), b.map((item) => item.id), c.map((item) => item.id)], "active A does not prevent B/C durable capture");
  assert.equal(stateForRuntime.calls.filter((call) => call.role === "observer").length, 1, "A is the only observer before release");
  releaseA();
  await waitFor(() => harness.state.entries.filter((item) => item.customType === "plastic.cycle.closed").length === 3, "durable wake-up drains queued B then C");
  assert.deepEqual(stateForRuntime.calls.filter((call) => call.role === "observer").map((call) => call.sourceEntryIds), [a.map((item) => item.id), b.map((item) => item.id), c.map((item) => item.id)], "worker inputs remain exact FIFO queue manifests");
  assert.equal(queueEntries(harness.state).length, 3, "later turns do not duplicate durable capture");
}

// A fresh coordinator restores only the same valid unresolved queue lineage and starts its oldest ID.
{
  const entries = [];
  const first = completedTurn(entries, "restart-a", 10_000, 10_000);
  const second = completedTurn(entries, "restart-b", 10_000, 10_000);
  const captured = queueHarness(entries, undefined, "eeeeeeeeeeeeeeeeeeeeeeee");
  await captured.start();
  captured.turn();
  const persisted = queueEntries(captured.state);
  assert.equal(persisted.length, 2);
  const resumedRuntimeState = { calls: [] };
  const resumed = queueHarness(captured.state.entries, queueRuntime(resumedRuntimeState), "eeeeeeeeeeeeeeeeeeeeeeee");
  await resumed.start();
  assert.deepEqual(resumed.coordinator.getBinding(resumed.ctx), { sessionId: persisted[0].data.sessionId, generation: persisted[0].data.generation, branchId: persisted[0].data.branchId }, "restart restores the stable queued binding rather than randomizing it");
  resumed.turn();
  await waitFor(() => resumed.state.entries.some((item) => item.customType === "plastic.cycle.closed"), "restart schedules the persisted oldest unresolved item");
  assert.deepEqual(resumedRuntimeState.calls.find((call) => call.role === "observer")?.sourceEntryIds, first.map((item) => item.id));
  assert.notDeepEqual(resumedRuntimeState.calls.find((call) => call.role === "observer")?.sourceEntryIds, second.map((item) => item.id));
}

// Malformed durable evidence blocks capture extension and all model/worker calls.
{
  const entries = [];
  completedTurn(entries, "malformed", 10_000, 10_000);
  entries.push({ type: "custom", id: "malformed-queue", parentId: entries.at(-1)?.id, customType: "plastic.cycle.queued", data: {} });
  const runtimeState = { calls: [] };
  const malformed = queueHarness(entries, queueRuntime(runtimeState), "ffffffffffffffffffffffff");
  await malformed.start();
  malformed.turn();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(queueEntries(malformed.state).length, 1, "malformed queue state cannot be extended");
  assert.equal(malformed.state.entries.some((item) => item.customType === "plastic.cycle.attempted"), false, "malformed queue state starts no attempt");
  assert.equal(runtimeState.calls.length, 0, "malformed queue state starts no model work");
}

// Registration is direct and provider-free: the coordinator only asks Pi for
// public session/context/lifecycle callbacks and does not register a provider.
const handlers = new Map();
const pi = {
  on(type, handler) { handlers.set(type, handler); },
  appendEntry() { throw new Error("workers are intentionally not enabled in this probe"); },
};
const coordinator = coordinatorModule.registerPlasticMemoryCoordinator(pi, { enabled: true });
const sessionManager = {
  getSessionId: () => "session",
  getLeafId: () => undefined,
  getEntries: () => [],
  getBranch: () => [],
  buildContextEntries: () => [],
};
const ctx = { sessionManager, isIdle: () => true, hasPendingMessages: () => false, getContextUsage: () => ({ tokens: 21_000, contextWindow: 160_000 }), getSystemPrompt: () => "synthetic system prompt", compact: () => {} };
await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
assert.equal(coordinator.getGeneration(), 1);
assert.ok(handlers.has("session_before_compact"));
assert.ok(handlers.has("context"));
await handlers.get("session_shutdown")({ type: "session_shutdown", reason: "quit" }, ctx);
assert.equal(coordinator.getGeneration(), 2);

// The fake owner above is the complete lifecycle boundary for this smoke: no Pi runtime,
// provider, user session, or host patch is started during validation.
console.log("PLASTIC_MEMORY_INTEGRATION: PASS (in-process projection, durable queue lifecycle, gated automatic ownership, and no active emergency path)");

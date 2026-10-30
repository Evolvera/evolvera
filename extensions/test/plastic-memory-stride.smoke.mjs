import { loadJiti } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createJiti } = await loadJiti(import.meta.url);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));
const ledger = await jiti.import(path.join(root, "plastic-memory/session/ledger.ts"));
const cyclesModule = await jiti.import(path.join(root, "plastic-memory/session/cycles.ts"));
const engine = await jiti.import(path.join(root, "plastic-memory/compaction/engine.ts"));
const schedulerModule = await jiti.import(path.join(root, "plastic-memory/workers/scheduler.ts"));
const coordinatorModule = await jiti.import(path.join(root, "plastic-memory/runtime/coordinator.ts"));

const projectSnapshot = { summary: "bounded project summary", activeIndex: JSON.stringify({ kind: "active-chunk-index", chunks: [] }) };
const model = { provider: "openai", id: "gpt-6-luna", contextWindow: 200_000, maxTokens: 16_000 };

/** Offline stub runtime: no network, counts every model invocation per role and keeps the emitted prompts. */
function stubRuntime(options = {}) {
  const calls = [];
  const prompts = { observer: [], reflector: [], compactor: [] };
  const runtime = {
    modelRegistry: {
      find(provider, id) {
        if (provider === model.provider && id === model.id) return model;
        return { provider, id, contextWindow: 200_000, maxTokens: 16_000 };
      },
      async getProviderAuth() { return { apiKey: "offline-only" }; },
    },
    async agentLoop(promptMessages, context) {
      const text = promptMessages[0].content[0].text;
      calls.push({ role: context.role, prompt: text });
      prompts[context.role]?.push(text);
      const request = JSON.parse(text);
      if (context.role === "compactor") {
        if (options.compactorMode === "unstructured") return "plain prose without any JSON object";
        return JSON.stringify({ summary: "Bounded cumulative state for the compacted stride.", state: { facts: { goals: request.deterministicFacts.goals } } });
      }
      if (context.role === "observer") {
        return JSON.stringify({ observations: [{ content: "The bounded turn constraint is durable.", timestamp: "2026-08-03T00:00:00Z", relevance: "high", sourceEntryIds: [request.sourceEntryIds[0]] }] });
      }
      return JSON.stringify({ reflections: [{ content: "The bounded constraint persists.", supportingObservationIds: request.observations.map((observation) => observation.id) }] });
    },
  };
  return { runtime, calls, prompts, count(role) { return calls.filter((call) => call.role === role).length; } };
}

/** Closed cycles over a contiguous synthetic branch: each cycle ends on a terminal assistant and starts on a user message. */
function entryBudget(entries, contextWindow, fixedTokens, tokensPerEntry) {
  return { contextWindow, fixedTokens, entryTokens: Object.fromEntries(entries.map((entry) => [entry.id, tokensPerEntry])) };
}

function branchFixture(binding, closedTurns, includeHostPrefix = false) {
  let next = 0;
  const entries = [];
  let hostBootstrap;
  if (includeHostPrefix) {
    entries.push({ type: "session", id: "session", parentId: null });
    entries.push({ type: "model_change", id: "host-model", parentId: "disconnected-model" });
    entries.push({ type: "thinking_level_change", id: "host-thinking", parentId: "disconnected-thinking" });
    hostBootstrap = { type: "custom", id: "host-bootstrap", parentId: "disconnected-bootstrap", customType: "plastic.bootstrap.recorded", data: {} };
    entries.push(hostBootstrap);
  }
  const append = (message) => {
    const entry = { type: "message", id: `e${++next}`, parentId: entries.at(-1)?.id ?? null, message, tokenCount: 10_000 };
    entries.push(entry);
    return entry;
  };
  const turn = (number) => {
    const start = append({ role: "user", content: [{ type: "text", text: `goal C${number}; preserve exact constraint` }] });
    const tool = append({ role: "assistant", content: [{ type: "toolCall", id: `call-${number}`, name: "functions.read", arguments: { path: `src/C${number}.ts` } }], stopReason: "toolUse" });
    const result = append({ role: "toolResult", toolCallId: `call-${number}`, content: [{ type: "text", text: "read complete" }] });
    const end = append({ role: "assistant", content: [{ type: "text", text: `completed C${number}` }], stopReason: "stop" });
    return { start, end, ids: [start.id, tool.id, result.id, end.id] };
  };
  const cycles = [];
  for (let number = 1; number <= closedTurns; number += 1) {
    const span = turn(number);
    const sourceEntries = span.ids.map((id) => entries.find((entry) => entry.id === id));
    cycles.push({
      schemaVersion: 1, ...binding, sourceStartId: span.start.id, sourceEndId: span.end.id,
      sourceEntryIds: span.ids, sourceDigest: ledger.sourceDigest(sourceEntries), completedTurnEndId: span.end.id,
      cycleId: `cycle-${span.start.id}`, attemptId: `attempt-${span.start.id}`, snapshotId: `snapshot-${span.start.id}`,
      status: "complete", observationIds: [], reflectionIds: [],
    });
  }
  const openTurn = turn(closedTurns + 1);
  if (hostBootstrap) {
    const sourceIds = entries.filter((entry) => entry.type === "message" || entry.type === "custom_message" || entry.type === "branch_summary").map((entry) => entry.id);
    hostBootstrap.data = {
      schemaVersion: 1, sessionId: "host-prefix", generation: 0, branchId: "host-prefix",
      activeEntryIds: openTurn.ids,
      activeDigest: "host-active",
      historicalPrefixIds: sourceIds.filter((id) => !openTurn.ids.includes(id)),
      historicalGap: "historical-unindexed",
    };
  }
  return { entries, cycles, openTurn };
}

async function runStride(closedTurns, options = {}) {
  const binding = { sessionId: ids.sessionDigest(`stride-smoke-${closedTurns}-${options.compactorMode ?? "valid"}`, { generation: 1 }), generation: 1, branchId: "main" };
  const { entries, cycles, openTurn } = branchFixture(binding, closedTurns, options.hostPrefix === true);
  const sourceIds = entries.filter((entry) => entry.type === "message" || entry.type === "custom_message" || entry.type === "branch_summary").map((entry) => entry.id);
  const stub = stubRuntime(options);
  const queued = cyclesModule.createQueuedCycleRecords({ binding, sourceEntries: openTurn.ids.map((id) => entries.find((entry) => entry.id === id)) });
  assert.equal(queued.length, 1, "stride worker receives one qualifying queued resumed turn");
  const physicalBudget = typeof options.physicalBudgetForEntries === "function"
    ? options.physicalBudgetForEntries(entries)
    : options.preClosePhysicalBudget
      ? entryBudget(entries, 170, 10, 20)
      : options.physicalBudget;
  const lifecycle = [];
  const scheduler = schedulerModule.createCycleScheduler();
  const result = await scheduler.trigger({
    binding,
    branchEntries: entries,
    bootstrap: {
      ...binding,
      activeEntryIds: openTurn.ids,
      historicalPrefixIds: sourceIds.filter((id) => !openTurn.ids.includes(id)),
      historicalGap: "historical-unindexed",
    },
    records: queued,
    runtime: stub.runtime,
    append() {},
    lifecycleReporter: (event) => lifecycle.push(event),
    compaction: {
      engine: { branchEntries: entries, cycles, activeMemoryIds: [], runtimeToken: "runtime-stride", physicalBudget, projectSnapshot },
      cycles,
      eligibleCycles: cycles,
      runtimeToken: "runtime-stride",
      projectSnapshot,
    },
  });
  const compacted = result.compactorJob ? await result.compactorJob : undefined;
  return { binding, entries, cycles, openTurn, stub, lifecycle, result, compacted, physicalBudget };
}

// 1. Fewer than six valid cycles: the compactor must not be started and must not burn a model call.
{
  const run = await runStride(3);
  assert.equal(run.result.status, "closed", "the cycle still closes normally");
  assert.equal(run.result.compactorJob, undefined, "no compactor job is started below the stride");
  assert.equal(run.stub.count("compactor"), 0, "ZERO compactor model calls below the six-cycle stride");
  const skipped = run.lifecycle.filter((event) => event.phase === "compactor");
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].status, "skipped");
  assert.match(skipped[0].reason, /stride/u);
}

// 2. Six or more valid cycles: the compactor receives every older cycle before the newest four.
{
  const run = await runStride(7); // seven prior cycles + the one the scheduler closes = eight
  assert.equal(run.cycles.every((cycle) => cycle.sourceEntryIds.reduce((total, id) => total + run.entries.find((entry) => entry.id === id).tokenCount, 0) >= 20_000), true,
    "six/four controls use honest >=20k durable closed cycles");
  assert.ok(run.compacted, "the compactor runs on a full stride");
  assert.equal(run.compacted.ok, true, run.compacted?.reason);
  assert.equal(run.stub.count("compactor"), 1);
  const closedCycles = [...run.cycles, run.result.cycle.data];
  const stride = engine.selectEligibleStride({ binding: run.binding, branchEntries: run.entries, cycles: closedCycles, projectSnapshot });
  assert.equal(stride.length, 4);
  const expected = closedCycles.slice(0, -4).map((cycle) => cycle.cycleId);
  assert.deepEqual(stride.map((cycle) => cycle.cycleId), expected, "the stride contains every older closed cycle before the retained four");
  // The emitted compactor prompt lists only the exact eligible cycles it was fed.
  const prompt = JSON.parse(run.stub.prompts.compactor[0]);
  assert.deepEqual(prompt.readOnlyIdentityContext.cycleIds, expected);
  assert.equal(prompt.readOnlyIdentityContext.cycleIds.length, 4, "the newest four retained cycles are never described to the compactor");
  assert.equal(run.compacted.prepared.cut.firstKeptEntryId, closedCycles.at(-4).sourceStartId, "the newest four-cycle cut is preserved");
  assert.equal(run.lifecycle.some((event) => event.phase === "compactor"), false, "a successful stride reports no compactor waiting or failure event");
}
// 2b. Pi's leading host metadata prefix is accepted, while the six-cycle stride
// still uses the actual branch positions and starts one compactor job.
{
  const run = await runStride(7, { hostPrefix: true });
  assert.ok(run.compacted?.ok, run.compacted?.reason);
  assert.equal(run.stub.count("compactor"), 1, "host-prefixed branch starts one compactor job");
  const closedCycles = [...run.cycles, run.result.cycle.data];
  const stride = engine.selectEligibleStride({ binding: run.binding, branchEntries: run.entries, cycles: closedCycles, projectSnapshot });
  assert.deepEqual(stride.map((cycle) => cycle.cycleId), closedCycles.slice(0, -4).map((cycle) => cycle.cycleId));
  const firstSource = run.entries.findIndex((entry) => entry.type === "message");
  const malformed = run.entries.map((entry, index) => index === firstSource + 1 ? { ...entry, parentId: "post-anchor-disconnected" } : entry);
  assert.equal(engine.selectEligibleStride({ binding: run.binding, branchEntries: malformed, cycles: closedCycles, projectSnapshot }), undefined, "post-anchor mismatch makes engine selection ineligible");
}
// A branch with IDs but no context-bearing anchor remains fail-closed.
{
  const binding = { sessionId: ids.sessionDigest("stride-no-context", { generation: 1 }), generation: 1, branchId: "main" };
  assert.equal(engine.selectEligibleStride({
    binding,
    branchEntries: [
      { type: "session", id: "session", parentId: null },
      { type: "model_change", id: "model", parentId: "unrelated" },
      { type: "custom", id: "bootstrap", parentId: "another-unrelated", customType: "plastic.bootstrap.recorded" },
    ],
    cycles: [],
    projectSnapshot,
  }), undefined);
}
// 2a. Physical pressure cannot shrink normal retention. The separate emergency
// selector owns any transient smaller window, so detached normal compaction is skipped.
{
  const run = await runStride(7, { preClosePhysicalBudget: true });
  assert.equal(run.compacted, undefined, "normal compactor is not started when four retained cycles do not fit");
  assert.equal(run.stub.count("compactor"), 0, "physical four-cycle failure makes no normal compactor call");
  const closedCycles = [...run.cycles, run.result.cycle.data];
  assert.equal(Object.hasOwn(run.physicalBudget.entryTokens, run.result.cycle.data.cycleId), false, "pre-close budget has no per-cycle key");
  assert.equal(engine.selectEligibleStride({ binding: run.binding, branchEntries: run.entries, cycles: closedCycles, physicalBudget: entryBudget(run.entries, 170, 10, 20), projectSnapshot }), undefined, "normal selector does not fold below four retained cycles");
}
// An even smaller public window remains fail-closed before any model call.
{
  const run = await runStride(7, { physicalBudgetForEntries: (entries) => entryBudget(entries, 59, 10, 20) });
  assert.equal(run.result.compactorJob, undefined, "impossible one-cycle-plus-incomplete-suffix window is skipped");
  assert.equal(run.stub.count("compactor"), 0, "impossible physical fit makes no compactor call");
}

// 3. A genuine compactor failure is still a failure.
{
  const run = await runStride(5, { compactorMode: "unstructured" });
  assert.equal(run.compacted.ok, false);
  assert.equal(run.stub.count("compactor"), 3, "queued compactor exhausts Luna retry and Sonnet candidates");
  const events = run.lifecycle.filter((event) => event.phase === "compactor");
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "failed");
  assert.match(events[0].reason, /not structured/u);
}

// 4. Lifecycle notice levels on the real coordinator: only `failed` warns.
{
  const notices = [];
  const handlers = new Map();
  const pi = { on(type, handler) { handlers.set(type, handler); }, appendEntry() {} };
  const ctx = {
    sessionManager: { getSessionId: () => "019fcf17-6e55-7646-89f9-4e0e0258b267", getEntries: () => [], getBranch: () => [], getLeafId: () => undefined, buildContextEntries: () => [] },
    isIdle: () => true,
    hasPendingMessages: () => false,
    compact() {},
    hasUI: true,
    ui: { notify(message, level) { notices.push({ message, level }); } },
  };
  const coordinator = new coordinatorModule.PlasticMemoryCoordinator(pi, { enabled: true });
  handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
  const level = (event) => { notices.length = 0; coordinator.reportLifecycle(ctx, event); return notices.at(-1); };
  assert.equal(level({ phase: "compactor", status: "failed", reason: "compactor output is not structured" }).level, "warning");
  assert.equal(level({ phase: "observer", status: "started", tokenCount: 1_000 }).level, "info");
  assert.equal(level({ phase: "observer", status: "no-observations" }).level, "info");
  assert.equal(level({ phase: "compactor", status: "skipped", reason: "no six-cycle stride yet" }).level, "info");
  assert.equal(level({ phase: "compaction", status: "prepared" }).level, "info");
  assert.equal(level({ phase: "compaction", status: "applied" }).level, "info");
  assert.match(level({ phase: "compactor", status: "skipped", reason: "no six-cycle stride yet" }).message, /^Plastic memory: compactor skipped — compactor-skipped: no six-cycle stride yet$/u);
  coordinator.shutdown("stride-test");
}

console.log("PLASTIC_MEMORY_STRIDE: PASS (no compactor call below the stride, exact 6/4 stride fed to the compactor, real failures still failed, only failures warn)");

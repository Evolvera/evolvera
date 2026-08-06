import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const coordinatorModule = await jiti.import(path.join(root, "plastic-memory/runtime/coordinator.ts"));
const cycles = await jiti.import(path.join(root, "plastic-memory/session/cycles.ts"));
const engine = await jiti.import(path.join(root, "plastic-memory/compaction/engine.ts"));
const types = await jiti.import(path.join(root, "plastic-memory/session/types.ts"));

const projectSnapshot = { summary: "bounded emergency project", activeIndex: "[]" };
const luna = { provider: "openai-codex", id: "gpt-5.6-luna", contextWindow: 200_000, maxTokens: 16_000 };
const sonnet = { provider: "anthropic", id: "claude-sonnet-5", contextWindow: 200_000, maxTokens: 16_000 };
const visible = { provider: "google", id: "visible-hook-model", contextWindow: 200_000, maxTokens: 16_000 };
const models = new Map([
  [`${luna.provider}/${luna.id}`, luna],
  [`${sonnet.provider}/${sonnet.id}`, sonnet],
  [`${visible.provider}/${visible.id}`, visible],
]);

function appendMessage(entries, message) {
  const entry = { type: "message", id: `e${entries.length + 1}`, parentId: entries.at(-1)?.id ?? null, message, tokenCount: 10_000 };
  entries.push(entry);
  return entry;
}
function sourceFixture() {
  const entries = [];
  const spans = [];
  for (let cycle = 1; cycle <= 6; cycle += 1) {
    const user = appendMessage(entries, { role: "user", content: [{ type: "text", text: `emergency goal ${cycle}` }] });
    const tool = appendMessage(entries, { role: "assistant", content: [{ type: "toolCall", id: `call-${cycle}`, name: "functions.read", arguments: { path: `src/${cycle}.ts` } }], stopReason: "toolUse" });
    const result = appendMessage(entries, { role: "toolResult", toolCallId: `call-${cycle}`, content: [{ type: "text", text: "read complete" }] });
    const assistant = appendMessage(entries, { role: "assistant", content: [{ type: "text", text: `closed answer ${cycle}` }], stopReason: "stop" });
    spans.push({ user, assistant, entries: [user, tool, result, assistant] });
  }
  return { entries, spans };
}
function contextEntries(branch) {
  const compaction = [...branch].reverse().find((entry) => entry.type === "compaction");
  if (!compaction) return branch;
  const compactionIndex = branch.indexOf(compaction);
  const retained = [];
  let found = false;
  for (const entry of branch.slice(0, compactionIndex)) {
    if (entry.id === compaction.firstKeptEntryId) found = true;
    if (found) retained.push(entry);
  }
  return [compaction, ...retained, ...branch.slice(compactionIndex + 1)];
}

async function world(mode = "success", cycleCount = 6) {
  const { entries, spans } = sourceFixture();
  const state = { branch: entries, nextCustom: 0, traces: [], changed: false };
  const handlers = new Map();
  const pi = {
    on(type, handler) { handlers.set(type, handler); },
    appendEntry(customType, data) {
      state.branch.push({ type: "custom", id: `p${++state.nextCustom}`, parentId: state.branch.at(-1)?.id ?? null, customType, data });
    },
  };
  const runtime = {
    modelRegistry: {
      find(provider, id) { return models.get(`${provider}/${id}`); },
      async getApiKeyAndHeaders() { return { ok: true, apiKey: "in-process-only" }; },
    },
    async agentLoop(prompts, context, config, signal) {
      state.traces.push({ role: context.role, model: `${config.model.provider}/${config.model.id}` });
      if (mode === "fail") throw new Error("all fake models fail");
      if (mode === "queue" && !state.changed) {
        state.changed = true;
        await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
        throw new Error("normal observer was aborted by the emergency lease");
      }
      if (mode === "stale" && !state.changed) {
        state.changed = true;
        appendMessage(state.branch, { role: "user", content: [{ type: "text", text: "raced branch change" }] });
      }
      const input = JSON.parse(prompts[0].content[0].text);
      if (context.role === "observer") return { observations: [{ content: "durable emergency fact", timestamp: "2026-08-06", relevance: "high", sourceEntryIds: input.sourceEntryIds }] };
      if (context.role === "reflector") return { reflections: [{ content: "durable emergency reflection", supportingObservationIds: input.observations.map((observation) => observation.id) }] };
      return { summary: "Verified emergency compaction", state: { facts: {} } };
    },
  };
  const ctx = {
    model: visible,
    hasUI: false,
    sessionManager: {
      getSessionId: () => "019fcf17-6e55-7646-89f9-4e0e0258b267",
      getEntries: () => state.branch,
      getBranch: () => state.branch,
      getLeafId: () => state.branch.at(-1)?.id,
      buildContextEntries: () => contextEntries(state.branch),
    },
    isIdle: () => true,
    hasPendingMessages: () => false,
    getContextUsage: () => ({ tokens: 45_000, contextWindow: 300_000 }),
    getSystemPrompt: () => "synthetic system prompt",
    compact: () => { throw new Error("ordinary emergency hooks must return directly to the host"); },
  };
  const coordinator = new coordinatorModule.PlasticMemoryCoordinator(pi, { enabled: true, runtime, runtimeToken: "emergency-hook", projectSnapshot, now: () => 1_000 });
  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
  const binding = coordinator.getBinding(ctx);
  for (const span of spans.slice(0, cycleCount)) {
    const queued = cycles.createQueuedCycleRecords({ binding, sourceEntries: span.entries })[0];
    assert.ok(queued, "emergency closed-cycle fixture begins with one qualifying durable queue record");
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
    assert.ok(closed, "queue-backed fixture closes only from its exact persisted attempt");
    pi.appendEntry(types.PLASTIC_CYCLE_QUEUED, queued.data);
    pi.appendEntry(types.PLASTIC_CYCLE_ATTEMPTED, attempt.record.data);
    pi.appendEntry(types.PLASTIC_CYCLE_CLOSED, closed.data);
  }
  if (mode === "queue") {
    appendMessage(state.branch, { role: "user", content: [{ type: "text", text: "queued normal observer goal" }] });
    appendMessage(state.branch, { role: "assistant", content: [{ type: "text", text: "queued normal observer answer" }], stopReason: "stop" });
  }
  const beforeCompact = async (reason = "manual") => await handlers.get("session_before_compact")({
    type: "session_before_compact",
    branchEntries: state.branch,
    preparation: { firstKeptEntryId: spans[0].user.id, tokensBefore: 7_777 },
    reason,
    signal: new AbortController().signal,
  }, ctx);
  const hostAppend = (compaction) => {
    const entry = {
      type: "compaction",
      id: `cmp-${state.branch.length}`,
      parentId: state.branch.at(-1)?.id,
      summary: compaction.summary,
      firstKeptEntryId: compaction.firstKeptEntryId,
      tokensBefore: compaction.tokensBefore,
      details: compaction.details,
      fromHook: true,
    };
    state.branch.push(entry);
    return entry;
  };
  return { coordinator, ctx, state, handlers, spans, beforeCompact, hostAppend };
}

function physicalBudget(branch) {
  return {
    contextWindow: 300_000,
    fixedTokens: 30_000,
    entryTokens: Object.fromEntries(branch.map((entry) => [entry.id, entry.type === "message" ? 10_000 : 0])),
  };
}
function stagePending(w) {
  const branch = w.state.branch;
  const binding = w.coordinator.getBinding(w.ctx);
  const prepared = engine.prepareSemanticCompaction({
    binding,
    branchEntries: branch,
    cycles: branch.filter((entry) => entry.customType === types.PLASTIC_CYCLE_CLOSED).map((entry) => entry.data),
    physicalBudget: physicalBudget(branch),
    projectSnapshot,
    runtimeToken: "emergency-hook",
    now: 1_000,
    compact: () => ({ summary: "staged summary", state: { facts: {} } }),
  });
  assert.equal(prepared.eligible, true, "six durable >=20k closed cycles stage an exact normal pending");
  w.coordinator.pendingStore.stage(prepared.prepared.pending);
  w.coordinator.preparedViews.set(prepared.prepared.pending, {
    summary: prepared.prepared.rendered.summary,
    details: prepared.prepared.rendered.details,
    state: prepared.prepared.rendered.state,
  });
  return prepared.prepared;
}

// Manual, threshold, and overflow all consume the same already-prepared exact pending;
// they do not start a raw observer/reflector or return native/synthetic content.
for (const reason of ["manual", "threshold", "overflow"]) {
  const w = await world();
  const prepared = stagePending(w);
  const result = await w.beforeCompact(reason);
  assert.equal(result.compaction.firstKeptEntryId, prepared.cut.firstKeptEntryId, `${reason} consumes the exact six/four pending`);
  assert.equal(result.compaction.tokensBefore, 7_777, "host tokensBefore is returned literally");
  assert.match(result.compaction.summary, /^PLASTIC-COMPACTION /u, "only verified Plastic content is returned");
  assert.equal(w.state.traces.length, 0, "matching pending does not invoke a fallback model");
  assert.equal(w.state.branch.some((entry) => entry.customType === types.PLASTIC_OBSERVATIONS_RECORDED || entry.customType === types.PLASTIC_REFLECTIONS_RECORDED), false,
    "hook consumption appends no transient semantic/raw records");
}

// An absent pending may refresh only from the normal, immutable durable six-cycle window.
{
  const w = await world();
  const result = await w.beforeCompact("manual");
  assert.ok(result.compaction, "idle hook safely refreshes from six durable closed cycles");
  assert.equal(result.compaction.firstKeptEntryId, w.spans[2].user.id, "normal fallback keeps exactly the newest four cycles");
  assert.deepEqual(w.state.traces.map((trace) => trace.role), ["compactor"], "safe refresh uses only the normal compactor");
  assert.equal(w.state.branch.some((entry) => entry.customType === types.PLASTIC_OBSERVATIONS_RECORDED || entry.customType === types.PLASTIC_REFLECTIONS_RECORDED), false,
    "refresh creates no observer/reflection/source side effect");
}

// Fewer cycles and an active queue worker both cancel without a native/raw result or abort.
{
  const w = await world("success", 5);
  const before = w.state.branch.length;
  assert.deepEqual(await w.beforeCompact("threshold"), { cancel: true });
  assert.equal(w.state.branch.length, before, "fewer than six durable closes leave source and pending untouched");
  assert.equal(w.state.traces.length, 0, "ineligible window makes no model call");
}
{
  const w = await world("queue");
  w.handlers.get("turn_end")({ type: "turn_end" }, w.ctx);
  for (let attempt = 0; attempt < 20 && w.state.traces.length === 0; attempt += 1) await Promise.resolve();
  assert.equal(w.state.traces[0]?.role, "observer", "normal queue worker is active before the hook");
  assert.deepEqual(await w.beforeCompact("overflow"), { cancel: true }, "busy worker cancels without acquiring/aborting its lease");
  w.coordinator.shutdown("busy-hook-test");
}

// Exhaustion follows the shared normal fallback order and still returns only cancellation.
{
  const w = await world("fail");
  const before = w.state.branch.length;
  assert.deepEqual(await w.beforeCompact("manual"), { cancel: true });
  assert.equal(w.state.branch.length, before, "fallback exhaustion has no semantic/source/pending side effect");
  assert.deepEqual(w.state.traces.map((trace) => trace.model), [
    "openai-codex/gpt-5.6-luna", "openai-codex/gpt-5.6-luna", "anthropic/claude-sonnet-5", "google/visible-hook-model",
  ], "normal fallback order is Luna, Luna retry, Sonnet 5, then the distinct current model");
}

console.log("PLASTIC_MEMORY_EMERGENCY_HOOK: PASS (passive pending-or-normal-closed-cycle hook, busy/no-pending cancellation, shared fallback, no raw/native/synthetic output)");

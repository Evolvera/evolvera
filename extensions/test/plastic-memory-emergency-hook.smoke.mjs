import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const coordinatorModule = await jiti.import(path.join(root, "plastic-memory/runtime/coordinator.ts"));
const ledger = await jiti.import(path.join(root, "plastic-memory/session/ledger.ts"));
const recall = await jiti.import(path.join(root, "plastic-memory/session/recall.ts"));
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
  const entry = { type: "message", id: `e${entries.length + 1}`, parentId: entries.at(-1)?.id ?? null, message, tokenCount: 1 };
  entries.push(entry);
  return entry;
}
function sourceFixture() {
  const entries = [];
  const spans = [];
  for (let cycle = 1; cycle <= 4; cycle += 1) {
    const user = appendMessage(entries, { role: "user", content: [{ type: "text", text: `emergency goal ${cycle}` }] });
    const tool = appendMessage(entries, { role: "assistant", content: [{ type: "toolCall", id: `call-${cycle}`, name: "functions.read", arguments: { path: `src/${cycle}.ts` } }], stopReason: "toolUse" });
    const result = appendMessage(entries, { role: "toolResult", toolCallId: `call-${cycle}`, content: [{ type: "text", text: "read complete" }] });
    const assistant = appendMessage(entries, { role: "assistant", content: [{ type: "text", text: `closed answer ${cycle}` }], stopReason: "stop" });
    spans.push({ user, assistant, entries: [user, tool, result, assistant] });
  }
  return { entries, spans };
}
function closedCycle(binding, span, number) {
  return {
    schemaVersion: 1,
    ...binding,
    cycleId: `cycle-${number}`,
    attemptId: `attempt-${number}`,
    snapshotId: `snapshot-${number}`,
    status: "complete",
    sourceStartId: span.user.id,
    sourceEndId: span.assistant.id,
    completedTurnEndId: span.assistant.id,
    sourceEntryIds: span.entries.map((entry) => entry.id),
    sourceDigest: ledger.sourceDigest(span.entries),
    observationIds: [],
    reflectionIds: [],
  };
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

async function world(mode = "success", cycleCount = 4) {
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
    getContextUsage: () => ({ tokens: 45_000, contextWindow: 100_000 }),
    getSystemPrompt: () => "synthetic system prompt",
    compact: () => { throw new Error("ordinary emergency hooks must return directly to the host"); },
  };
  const coordinator = new coordinatorModule.PlasticMemoryCoordinator(pi, { enabled: true, runtime, runtimeToken: "emergency-hook", projectSnapshot, now: () => 1_000 });
  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
  const binding = coordinator.getBinding(ctx);
  spans.slice(0, cycleCount).forEach((span, index) => pi.appendEntry(types.PLASTIC_CYCLE_CLOSED, closedCycle(binding, span, index + 1)));
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

// The lease waits for an already-running normal observer to settle before the
// emergency snapshot/model work begins; the observer's abort is not treated as ownership.
{
  const w = await world("queue", 0);
  w.handlers.get("turn_end")({ type: "turn_end" }, w.ctx);
  for (let attempt = 0; attempt < 20 && w.state.traces.length === 0; attempt += 1) await Promise.resolve();
  assert.equal(w.state.traces[0]?.role, "observer", "normal observer started before the emergency hook");
  const result = await w.beforeCompact("manual");
  assert.ok(result.compaction, "emergency waits through the normal observer abort/settlement barrier");
  assert.equal(w.state.traces.filter((trace) => trace.role === "observer").length >= 2, true, "emergency observer starts only after the queued normal observer settles");
}

// The first ordinary hook reserves the scheduler synchronously. A second manual,
// threshold, or overflow hook sees that lease and cancels rather than creating a
// second semantic pipeline or handing the host a native-summary opportunity.
for (const reason of ["manual", "threshold", "overflow"]) {
  const w = await world();
  const generationBeforeHook = w.coordinator.getGeneration();
  const first = w.beforeCompact(reason);
  const second = w.beforeCompact(reason);
  const [result, overlap] = await Promise.all([first, second]);
  assert.ok(result.compaction, `${reason} prepares an emergency compaction`);
  assert.equal(w.coordinator.getGeneration(), generationBeforeHook, "emergency preparation never rebases before a host-applied acknowledgement");
  assert.deepEqual(overlap, { cancel: true }, `${reason} overlap cancels while the exclusive lease is held`);
  assert.deepEqual(w.state.traces.map((trace) => trace.model), ["openai-codex/gpt-5.6-luna", "openai-codex/gpt-5.6-luna", "openai-codex/gpt-5.6-luna"], `${reason} runs one observer/reflector/compactor pipeline`);
  assert.equal(result.compaction.firstKeptEntryId, w.spans[2].user.id, `${reason} preserves the newest two closed cycles`);
  assert.equal(result.compaction.tokensBefore, 7_777, "host tokensBefore is returned literally");
  assert.equal(w.state.branch.filter((entry) => entry.customType === types.PLASTIC_CYCLE_CLOSED).length, 4, "emergency never writes a fake closed cycle");

  const observationRecord = w.state.branch.find((entry) => entry.customType === types.PLASTIC_OBSERVATIONS_RECORDED);
  const reflectionRecord = w.state.branch.find((entry) => entry.customType === types.PLASTIC_REFLECTIONS_RECORDED);
  assert.ok(observationRecord && reflectionRecord, "only validated semantic records append before host compaction");
  const observationId = observationRecord.data.observations[0].id;
  const reflectionId = reflectionRecord.data.reflections[0].id;
  const generationBeforeAck = w.coordinator.getGeneration();
  const host = w.hostAppend(result.compaction);
  w.handlers.get("session_compact")({ type: "session_compact", compactionEntry: host }, w.ctx);
  const appliedIndex = w.state.branch.findIndex((entry) => entry.customType === types.PLASTIC_COMPACTION_APPLIED);
  const hostIndex = w.state.branch.indexOf(host);
  assert.equal(appliedIndex, hostIndex + 1, "host boundary is followed by exactly the applied acknowledgement before rebase");
  assert.equal(w.coordinator.getGeneration(), generationBeforeAck + 1, "only a visible valid applied record rebases the emergency generation");
  assert.ok(w.state.branch.some((entry) => entry.customType === types.PLASTIC_BOOTSTRAP_RECORDED && entry.data.generation === w.coordinator.getGeneration()), "post-boundary retained raw context gets a fresh bootstrap");

  const currentBinding = w.coordinator.getBinding(w.ctx);
  assert.equal(recall.recallSession({ entries: w.state.branch, binding: currentBinding, id: observationId }).status, "found", "exact old-generation observation remains branch-locally recallable");
  assert.equal(recall.recallSession({ entries: w.state.branch, binding: currentBinding, id: reflectionId }).status, "found", "exact old-generation reflection validates its historical support");
  const fork = { type: "message", id: `fork-${reason}`, parentId: w.spans.at(-1).assistant.id, message: { role: "user", content: [{ type: "text", text: "off branch" }] } };
  assert.equal(recall.recallSession({ entries: [...w.state.branch, fork], leafId: fork.id, binding: currentBinding, id: observationId }).status, "not_found", "exact historical recall never crosses to an off-branch leaf");

  appendMessage(w.state.branch, { role: "user", content: [{ type: "text", text: "post-boundary turn" }] });
  appendMessage(w.state.branch, { role: "assistant", content: [{ type: "text", text: "post-boundary answer" }], stopReason: "stop" });
  w.handlers.get("turn_end")({ type: "turn_end" }, w.ctx);
  for (let attempt = 0; attempt < 40 && !w.state.branch.some((entry) => entry.customType === types.PLASTIC_CYCLE_CLOSED && entry.data.generation === currentBinding.generation); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  const laterCycle = w.state.branch.find((entry) => entry.customType === types.PLASTIC_CYCLE_CLOSED && entry.data.generation === currentBinding.generation);
  assert.ok(laterCycle, "the fresh generation closes a contiguous post-boundary normal cycle without repair");
}

// Model exhaustion and a branch race both fail closed: no raw model content, pending,
// semantic append, or native fallback escapes the ordinary hook.
{
  const w = await world("fail");
  const before = w.state.branch.length;
  assert.deepEqual(await w.beforeCompact("manual"), { cancel: true });
  assert.equal(w.state.branch.length, before, "all-model failure leaves the raw branch untouched");
  assert.deepEqual(w.state.traces.map((trace) => trace.model), [
    "openai-codex/gpt-5.6-luna", "openai-codex/gpt-5.6-luna", "anthropic/claude-sonnet-5", "google/visible-hook-model",
  ], "fallback order is Luna, Luna retry, Sonnet 5, then the distinct current model");
}
{
  const w = await world("stale");
  assert.deepEqual(await w.beforeCompact("overflow"), { cancel: true });
  assert.equal(w.state.branch.some((entry) => entry.customType === types.PLASTIC_OBSERVATIONS_RECORDED || entry.customType === types.PLASTIC_REFLECTIONS_RECORDED), false, "a branch change before append cancels without semantic side effects");
}

console.log("PLASTIC_MEMORY_EMERGENCY_HOOK: PASS (awaited emergency ownership, lease overlap, literal hook result, fallback cancellation, semantic append, acknowledged rebase/bootstrap, preserved tail, and branch-local historical exact recall)");

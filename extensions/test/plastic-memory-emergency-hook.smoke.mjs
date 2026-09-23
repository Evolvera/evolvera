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
const luna = { provider: "openai-codex", id: "gpt-6-luna", contextWindow: 200_000, maxTokens: 16_000 };
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
function sourceFixture(totalCycles = 6, includeIncomplete = false) {
  const entries = [];
  const spans = [];
  for (let cycle = 1; cycle <= totalCycles; cycle += 1) {
    const user = appendMessage(entries, { role: "user", content: [{ type: "text", text: `emergency goal ${cycle}` }] });
    const tool = appendMessage(entries, { role: "assistant", content: [{ type: "toolCall", id: `call-${cycle}`, name: "functions.read", arguments: { path: `src/${cycle}.ts` } }], stopReason: "toolUse" });
    const result = appendMessage(entries, { role: "toolResult", toolCallId: `call-${cycle}`, content: [{ type: "text", text: "read complete" }] });
    const assistant = appendMessage(entries, { role: "assistant", content: [{ type: "text", text: `closed answer ${cycle}` }], stopReason: "stop" });
    spans.push({ user, assistant, entries: [user, tool, result, assistant] });
  }
  if (includeIncomplete) {
    appendMessage(entries, { role: "user", content: [{ type: "text", text: "incomplete emergency turn" }] });
    appendMessage(entries, { role: "assistant", content: [{ type: "toolCall", id: "open-call", name: "functions.read", arguments: { path: "src/open.ts" } }], stopReason: "toolUse" });
    appendMessage(entries, { role: "toolResult", toolCallId: "open-call", content: [{ type: "text", text: "tool still running" }] });
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

async function world(mode = "success", cycleCount = 6, totalCycles = 6, includeIncomplete = false) {
  const { entries, spans } = sourceFixture(totalCycles, includeIncomplete);
  const state = { branch: entries, nextCustom: 0, traces: [], notices: [], changed: false };
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
    hasUI: true,
    ui: { notify(message, level) { state.notices.push({ message, level }); } },
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

// An under-six safe prefix uses the existing emergency selector/pipeline. It keeps the
// newest two durable closes and the incomplete tool-bearing tail, without making a
// transient cycle record.
{
  const w = await world("success", 5, 6, true);
  const beforeClosed = w.state.branch.filter((entry) => entry.customType === types.PLASTIC_CYCLE_CLOSED).length;
  const result = await w.beforeCompact("manual");
  assert.ok(result.compaction, "under-six durable closes use the emergency pipeline");
  const branchLengthBeforeStatus = w.state.branch.length;
  const status = w.coordinator.getStatus(w.ctx);
  assert.equal(w.state.branch.length, branchLengthBeforeStatus, "plastic:status does not mutate session entries");
  assert.deepEqual(status.context, { tokens: 45_000, window: 300_000 });
  assert.deepEqual(status.thresholds, { normal: 6, automatic: 120_000 });
  assert.equal(status.binding.generation, w.coordinator.getGeneration());
  assert.deepEqual(status.cycles, { closed: beforeClosed, queued: 5, unresolved: 0, processed: 5 });
  assert.equal(status.scheduler.busy, false);
  assert.deepEqual(status.pending, { present: true, prepared: true, consumed: true });
  assert.deepEqual(status.lastCompactionDiagnostic, {
    phase: "emergency-fallback", outcome: "prepared", code: "prepared", reason: "emergency compaction prepared",
  });
  assert.equal(status.emergency.lastAttempted, true);
  const statusText = JSON.stringify(status);
  for (const forbidden of ["emergency goal 1", "019fcf17-6e55-7646-89f9-4e0e0258b267", w.spans[0].user.id, "open-call"]) {
    assert.equal(statusText.includes(forbidden), false, `status does not expose ${forbidden}`);
  }
  assert.equal(result.compaction.firstKeptEntryId, w.spans[3].user.id, "emergency cut retains the newest two closed cycles");
  assert.deepEqual(w.state.traces.map((trace) => trace.role), ["observer", "reflector", "compactor"], "emergency uses the existing semantic phases");
  assert.equal(w.state.branch.filter((entry) => entry.customType === types.PLASTIC_CYCLE_CLOSED).length, beforeClosed, "emergency does not persist a synthetic closed cycle");
  assert.equal(w.state.branch.some((entry) => entry.customType === types.PLASTIC_OBSERVATIONS_RECORDED), true);
  assert.equal(w.state.branch.some((entry) => entry.customType === types.PLASTIC_REFLECTIONS_RECORDED), true);
  assert.equal(w.state.branch.some((entry) => entry.message?.content?.some((part) => part.id === "open-call")), true, "incomplete tool call remains on the branch");
  assert.equal(w.state.branch.some((entry) => entry.message?.toolCallId === "open-call"), true, "incomplete tool result remains on the branch");
  const host = w.hostAppend(result.compaction);
  w.handlers.get("session_compact")({ type: "session_compact", compactionEntry: host }, w.ctx);
  assert.equal(w.state.branch.some((entry) => entry.customType === types.PLASTIC_COMPACTION_APPLIED), true, "only an acknowledged emergency result appends applied evidence");
  const appliedStatus = w.coordinator.getStatus(w.ctx);
  assert.deepEqual(appliedStatus.lastCompactionDiagnostic, {
    phase: "compaction", outcome: "applied", code: "applied", reason: "Plastic compaction was acknowledged and applied",
  });
  assert.equal(appliedStatus.emergency.lastAttempted, true, "session status retains the emergency attempt after the applied boundary");
  w.coordinator.shutdown("emergency-success-test");
}

// A structurally impossible emergency window yields to native compaction without worker calls or records.
{
  const w = await world("success", 1, 1);
  const before = w.state.branch.length;
  assert.equal(await w.beforeCompact("threshold"), undefined);
  assert.equal(w.state.branch.length, before, "no representable emergency cut leaves source history untouched");
  assert.equal(w.state.traces.length, 0, "invalid emergency selection makes no model call");
  assert.deepEqual(w.coordinator.getStatus(w.ctx).lastCompactionDiagnostic, {
    phase: "emergency-fallback", outcome: "skipped", code: "no-safe-window", reason: "emergency selector found no safe current window",
  });
  assert.deepEqual(w.state.notices.at(-1), {
    message: "Plastic memory: using native compaction — no-safe-window: emergency selector found no safe current window",
    level: "info",
  });
  assert.equal(w.coordinator.getStatus(w.ctx).compaction.lastInvocation.code, "native-fallback");
  assert.equal(w.coordinator.getStatus(w.ctx).emergency.lastAttempted, true);
}

// An active normal queue worker remains the owner of its interval; the external hook
// yields to native compaction rather than racing it or aborting its queue records.
{
  const w = await world("queue");
  w.handlers.get("turn_end")({ type: "turn_end" }, w.ctx);
  for (let attempt = 0; attempt < 20 && w.state.traces.length === 0; attempt += 1) await Promise.resolve();
  assert.equal(w.state.traces[0]?.role, "observer", "normal queue worker is active before the hook");
  assert.equal(await w.beforeCompact("overflow"), undefined, "busy worker yields without emergency ownership");
  assert.deepEqual(w.coordinator.getStatus(w.ctx).lastCompactionDiagnostic, {
    phase: "normal-refresh", outcome: "skipped", code: "scheduler-busy", reason: "normal refresh was skipped while a worker was active",
  });
  assert.equal(w.coordinator.getStatus(w.ctx).emergency.lastAttempted, false);
  w.coordinator.shutdown("busy-hook-test");
}

// Exhaustion of the emergency semantic pipeline yields to native compaction without records
// and never exposes raw model/provider output.
{
  const w = await world("fail", 5, 6, true);
  const before = w.state.branch.length;
  assert.equal(await w.beforeCompact("manual"), undefined);
  assert.equal(w.state.branch.length, before, "emergency exhaustion has no semantic/source/pending side effect");
  assert.deepEqual(w.state.traces.map((trace) => trace.model), [
    "openai-codex/gpt-6-luna", "openai-codex/gpt-6-luna", "anthropic/claude-sonnet-5", "google/visible-hook-model",
  ], "emergency observer exhausts the shared fallback order before cancellation");
  assert.equal(w.state.branch.some((entry) => entry.customType === types.PLASTIC_OBSERVATIONS_RECORDED || entry.customType === types.PLASTIC_REFLECTIONS_RECORDED), false);
  const status = w.coordinator.getStatus(w.ctx);
  assert.equal(status.lastCompactionDiagnostic.phase, "emergency-fallback");
  assert.equal(status.lastCompactionDiagnostic.outcome, "failed");
  assert.equal(status.lastCompactionDiagnostic.code, "semantic-pipeline-failed");
  assert.equal(status.lastCompactionDiagnostic.reason, "emergency semantic pipeline failed");
  assert.equal(status.emergency.lastAttempted, true);
}

// A branch race after selection yields to native compaction before any semantic record append.
{
  const w = await world("stale", 5, 6, true);
  assert.equal(await w.beforeCompact("manual"), undefined);
  assert.equal(w.state.branch.some((entry) => entry.customType === types.PLASTIC_OBSERVATIONS_RECORDED || entry.customType === types.PLASTIC_REFLECTIONS_RECORDED), false, "stale emergency output appends no records");
  assert.equal(w.coordinator.getPending(), undefined, "stale emergency output stages no pending");
  assert.deepEqual(w.coordinator.getStatus(w.ctx).lastCompactionDiagnostic, {
    phase: "emergency-fallback", outcome: "skipped", code: "stale-before-append", reason: "emergency result was stale before append",
  });
}

// A host abort after the external hook ran is observable even when Plastic returned a compaction.
{
  const w = await world("success", 6, 6, true);
  const prepared = stagePending(w);
  const controller = new AbortController();
  const result = await w.handlers.get("session_before_compact")({
    type: "session_before_compact",
    branchEntries: w.state.branch,
    preparation: { firstKeptEntryId: prepared.pending.cut.firstKeptEntryId, tokensBefore: 7_777 },
    reason: "manual",
    signal: controller.signal,
  }, w.ctx);
  assert.ok(result?.compaction, "prepared Plastic result reaches the host");
  controller.abort();
  assert.deepEqual(w.coordinator.getStatus(w.ctx).lastCompactionDiagnostic, {
    phase: "compaction", outcome: "cancelled", code: "host-aborted", reason: "the host aborted compaction after the Plastic hook ran",
  });
  assert.deepEqual(w.state.notices.at(-1), {
    message: "Plastic memory: host compaction aborted — host-aborted: the host aborted compaction after the Plastic hook ran",
    level: "warning",
  });
}

// Internal automatic-apply errors are visible without changing the host error path.
{
  const w = await world("success", 6, 6, true);
  stagePending(w);
  w.ctx.getContextUsage = () => ({ tokens: 120_001, contextWindow: 300_000 });
  w.handlers.get("agent_settled")({ type: "agent_settled" }, w.ctx);
  assert.deepEqual(w.coordinator.getStatus(w.ctx).lastCompactionDiagnostic, {
    phase: "internal-apply", outcome: "failed", code: "host-error", reason: "ordinary emergency hooks must return directly to the host",
  });
}
{
  const w = await world("success", 6, 6, true);
  stagePending(w);
  let request;
  w.ctx.compact = (value) => { request = value; };
  w.ctx.getContextUsage = () => ({ tokens: 120_001, contextWindow: 300_000 });
  w.handlers.get("agent_settled")({ type: "agent_settled" }, w.ctx);
  assert.ok(request, "internal apply reaches the host compact boundary");
  request.onError(new Error("Compaction cancelled"));
  assert.deepEqual(w.coordinator.getStatus(w.ctx).lastCompactionDiagnostic, {
    phase: "internal-apply", outcome: "cancelled", code: "host-cancellation", reason: "host compaction was cancelled",
  });
}

// External pending validation/view failures yield to native compaction; internal-intent
// failures remain fail-closed. Every path leaves a bounded diagnostic.
{
  const w = await world();
  stagePending(w);
  const result = await w.handlers.get("session_before_compact")({
    type: "session_before_compact",
    branchEntries: w.state.branch,
    preparation: { firstKeptEntryId: "not-on-this-branch", tokensBefore: 7_777 },
  }, w.ctx);
  assert.equal(result, undefined);
  assert.deepEqual(w.coordinator.getStatus(w.ctx).lastCompactionDiagnostic, {
    phase: "pending-validation", outcome: "skipped", code: "pending-validation-failed", reason: "pending compaction did not match the current branch",
  });
}
{
  const w = await world();
  const prepared = stagePending(w);
  w.coordinator.preparedViews.delete(prepared.pending);
  assert.equal(await w.beforeCompact("manual"), undefined);
  assert.deepEqual(w.coordinator.getStatus(w.ctx).lastCompactionDiagnostic, {
    phase: "pending-view", outcome: "skipped", code: "prepared-view-missing", reason: "prepared compaction view was unavailable",
  });
}
{
  const w = await world();
  const result = await w.handlers.get("session_before_compact")({
    type: "session_before_compact",
    customInstructions: "\u0000plastic-memory:internal-compaction:foreign",
    branchEntries: w.state.branch,
    preparation: { firstKeptEntryId: w.spans[0].user.id, tokensBefore: 7_777 },
  }, w.ctx);
  assert.deepEqual(result, { cancel: true });
  assert.deepEqual(w.coordinator.getStatus(w.ctx).lastCompactionDiagnostic, {
    phase: "internal-apply", outcome: "cancelled", code: "internal-intent-stale", reason: "internal compaction intent was missing or stale",
  });
  assert.deepEqual(w.state.notices.at(-1), {
    message: "Plastic memory: internal compaction cancelled — internal-intent-stale: internal compaction intent was missing or stale",
    level: "warning",
  });
}

console.log("PLASTIC_MEMORY_EMERGENCY_HOOK: PASS (normal pending priority, safe under-six emergency hook, native fallback on external failure, preserved incomplete tail, internal fail-closed safety, and bounded diagnostics)");

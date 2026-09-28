import { loadJiti } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createJiti } = await loadJiti(import.meta.url);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));
const cycles = await jiti.import(path.join(root, "plastic-memory/session/cycles.ts"));
const runner = await jiti.import(path.join(root, "plastic-memory/workers/runner.ts"));
const runnerRuntime = await jiti.import(path.join(root, "plastic-memory/runtime/runner-runtime.ts"));
const observer = await jiti.import(path.join(root, "plastic-memory/workers/observer.ts"));
const reflector = await jiti.import(path.join(root, "plastic-memory/workers/reflector.ts"));
const promoter = await jiti.import(path.join(root, "plastic-memory/workers/promoter.ts"));
const safety = await jiti.import(path.join(root, "plastic-memory/common/safety.ts"));
const schedulerModule = await jiti.import(path.join(root, "plastic-memory/workers/scheduler.ts"));

const binding = { sessionId: ids.sessionDigest("workers-smoke", { generation: 1 }), generation: 1, branchId: "main" };
let next = 0;
const entries = [];
function message(role, tokenCount, text) {
  const entry = { type: "message", id: `e${++next}`, parentId: entries.at(-1)?.id ?? null, message: { role, content: [{ type: "text", text }] }, tokenCount };
  entries.push(entry);
  return entry;
}
const old = message("user", 7_000_000, "historical prefix must never be sent");
message("assistant", 1, "historical answer");
const currentUser = message("user", 50_000, "current goal: preserve the exact bounded snapshot");
const currentAssistant = message("assistant", 50_000, "current terminal answer");
const model = { provider: "openai-codex", id: "gpt-6-luna", contextWindow: 200_000, maxTokens: 16_000 };
const calls = [];
let failureMode = false;
let observerMode = "valid";
let reflectorFailOnce = false;
const reflectorPrompts = [];
const runtime = {
  modelRegistry: {
    find(provider, id) { assert.equal(provider, "openai-codex"); assert.equal(id, "gpt-6-luna"); return model; },
    async getProviderAuth(provider) { assert.equal(provider, "openai-codex"); return { apiKey: "fake-only" }; },
  },
  async agentLoop(prompts, context, config, signal) {
    assert.equal(config.model, model);
    assert.equal(config.thinking, "medium");
    assert.equal(config.maxTurns, 8);
    assert.equal(config.maxToolCalls, 4);
    calls.push({ role: context.role, prompt: prompts[0].content[0].text });
    const request = JSON.parse(prompts[0].content[0].text);
    if (context.role === "reflector") reflectorPrompts.push(prompts[0].content[0].text);
    if (context.role === "observer" && failureMode) return { observations: [{ content: "bounded fact", timestamp: "2026-08-03 00:00", relevance: "medium", sourceEntryIds: ["outside-span"] }] };
    if (context.role === "observer" && observerMode === "mixed") return { observations: [
      { content: "mixed durable fact", timestamp: "2026-08-03 00:00", relevance: "medium", sourceEntryIds: [request.sourceEntryIds[0]] },
      { content: " \t\n ", timestamp: "2026-08-03 00:00", relevance: "medium", sourceEntryIds: [request.sourceEntryIds[0]] },
      { content: "\u0000\u0001", timestamp: "2026-08-03 00:00", relevance: "medium", sourceEntryIds: [request.sourceEntryIds[0]] },
    ] };
    if (context.role === "observer" && observerMode === "blank") return { observations: [
      { content: " \t\n ", timestamp: "2026-08-03 00:00", relevance: "medium", sourceEntryIds: [request.sourceEntryIds[0]] },
      { content: "\u0000\u0001", timestamp: "2026-08-03 00:00", relevance: "medium", sourceEntryIds: [request.sourceEntryIds[0]] },
    ] };
    if (context.role === "observer" && observerMode === "blank-outside") return { observations: [
      { content: " \t\n ", timestamp: "2026-08-03 00:00", relevance: "medium", sourceEntryIds: [request.sourceEntryIds[0], "outside-span"] },
    ] };
    if (context.role === "observer" && observerMode === "blank-invalid-relevance") return { observations: [
      { content: " \t\n ", timestamp: "2026-08-03 00:00", relevance: "urgent", sourceEntryIds: [request.sourceEntryIds[0]] },
    ] };
    if (context.role === "reflector" && reflectorFailOnce && reflectorPrompts.length === 1) return { noSemanticResult: true };
    if (context.role === "observer") {
      return { observations: [{ content: "bounded fact", timestamp: "2026-08-03 00:00", relevance: "medium", sourceEntryIds: request.sourceEntryIds }] };
    }
    if (context.role === "reflector") {
      return { reflections: [{ content: "durable pattern", supportingObservationIds: request.observations.map((item) => item.id) }] };
    }
    return { proposal: "proposal", repositoryEvidence: ["extensions/plastic-memory/workers"] };
  },
};

const adapterCalls = [];
const adapterRegistry = {
  find(provider, id) { assert.equal(provider, "openai-codex"); assert.equal(id, "gpt-6-luna"); return model; },
  async getApiKeyAndHeaders(receivedModel) {
    assert.equal(receivedModel, model);
    return { ok: true, apiKey: "adapter-key", headers: { "x-test": "adapter" }, env: { ADAPTER_TEST: "yes" } };
  },
};
const piRuntime = runnerRuntime.createPiRunnerRuntime(adapterRegistry, async (receivedModel, context, options) => {
  adapterCalls.push({ receivedModel, context, options });
  return { content: [{ type: "text", text: "adapter text" }, { type: "thinking", thinking: "not returned" }] };
});
assert.ok(piRuntime, "valid Pi model registry creates a worker runtime");
const adapterSignal = new AbortController().signal;
const adapterResult = await runner.runBoundedRole({ role: "observer", prompt: "adapter worker message", systemPrompt: "adapter system prompt", runtime: piRuntime, signal: adapterSignal, inputTokens: 1 });
assert.equal(adapterResult.ok, true);
assert.equal(adapterResult.response, "adapter text", "complete text content is consumable by the existing runner");
assert.equal(adapterCalls.length, 1);
assert.equal(adapterCalls[0].receivedModel, model, "complete receives the configured Luna model from modelRegistry");
assert.equal(adapterCalls[0].context.systemPrompt, "adapter system prompt");
assert.equal(adapterCalls[0].context.messages[0].role, "user");
assert.equal(adapterCalls[0].context.messages[0].content[0].text, "adapter worker message");
assert.equal(adapterCalls[0].options.apiKey, "adapter-key");
assert.deepEqual(adapterCalls[0].options.headers, { "x-test": "adapter" });
assert.deepEqual(adapterCalls[0].options.env, { ADAPTER_TEST: "yes" });
assert.equal(adapterCalls[0].options.cacheRetention, "none");
assert.equal(adapterCalls[0].options.maxTokens, 16_000);
assert.equal(adapterCalls[0].options.signal.aborted, false);
assert.match(adapterCalls[0].options.sessionId, /^[0-9a-f-]{36}$/u);
const authFailureRuntime = runnerRuntime.createPiRunnerRuntime({ find: () => model, getApiKeyAndHeaders: async () => ({ ok: false, error: "fake auth failure" }) }, async () => ({ content: [] }));
assert.equal((await runner.resolveLunaRole("observer", authFailureRuntime)).reason, "auth-unavailable");
const modelFailureRuntime = runnerRuntime.createPiRunnerRuntime({ find: () => undefined, getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "unused" }) }, async () => ({ content: [] }));
assert.equal((await runner.resolveLunaRole("observer", modelFailureRuntime)).reason, "model-unavailable");
assert.equal(runnerRuntime.createPiRunnerRuntime({ find: () => model }), undefined, "invalid registry fails closed");

for (const role of ["observer", "reflector", "compactor", "project-promoter"]) {
  assert.deepEqual(runner.ROLE_CONFIGS[role], { model: "openai-codex/gpt-6-luna", thinking: "medium", maxTurns: 8, maxToolCalls: 4, maxRuntimeMs: 60_000 });
  const resolved = await runner.resolveLunaRole(role, runtime);
  assert.equal(resolved.contextWindow, 200_000);
}
const snapshot = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: [currentUser, currentAssistant], activeEntryIds: [currentUser.id, currentAssistant.id], maxTokens: 100_000 });
assert.equal(snapshot.status, "ready");
assert.equal(snapshot.tokenCount, 100_000);
const observed = await observer.runObserver({ binding, snapshot, sourceEntries: [currentUser, currentAssistant], runtime });
assert.equal(observed.ok, true);
assert.equal(observed.manifestValid, true);
assert.equal(observed.record.data.span.sourceDigest, snapshot.span.sourceDigest);
const reflected = await reflector.runReflector({ binding, snapshot, observations: observed.observations, runtime });
assert.equal(reflected.ok, true);
assert.equal(reflected.record.data.span.sourceDigest, snapshot.span.sourceDigest);

const appended = [];
const lifecycleEvents = [];
const queuedRecord = cycles.createQueuedCycleRecords({ binding, sourceEntries: [currentUser, currentAssistant] })[0];
assert.ok(queuedRecord, "every direct scheduler fixture starts from a qualifying durable queue record");
const scheduler = schedulerModule.createCycleScheduler();
const scheduleInput = { binding, branchEntries: entries, bootstrap: { activeEntryIds: [currentUser.id, currentAssistant.id], historicalPrefixIds: [old.id], historicalGap: "historical-unindexed" }, records: [queuedRecord], runtime, append: (entry) => appended.push(entry), lifecycleReporter: (event) => lifecycleEvents.push(event) };
const first = await scheduler.trigger(scheduleInput);
assert.equal(first.status, "closed");
assert.equal(first.cycle.data.sourceEntryIds.length, 2);
assert.equal(calls.filter((call) => call.role === "observer").length, 2);
assert.equal(calls.filter((call) => call.prompt.includes(old.id)).length, 0, "historical prefix must not enter worker request");
const repeated = await scheduler.trigger({ ...scheduleInput, records: [queuedRecord, ...appended] });
assert.equal(repeated.status, "skipped");
assert.equal(calls.filter((call) => call.role === "observer").length, 2, "repeated triggers must not hot-loop a closed snapshot");
assert.equal(appended.filter((entry) => entry.customType === "plastic.cycle.closed").length, 1);
assert.deepEqual(lifecycleEvents.filter((event) => event.phase === "observer"), [{ phase: "observer", status: "started", tokenCount: 100_000 }]);

// A second scheduler consumes the same exact persisted head instead of rebuilding a live snapshot.
const queuedAppended = [];
const queuedScheduler = schedulerModule.createCycleScheduler();
const queuedResult = await queuedScheduler.trigger({ ...scheduleInput, records: [queuedRecord], append: (entry) => queuedAppended.push(entry) });
assert.equal(queuedResult.status, "closed");
assert.deepEqual(queuedResult.snapshot.span.sourceEntryIds, queuedRecord.data.sourceEntryIds);
assert.equal(queuedAppended.filter((entry) => entry.customType === "plastic.cycle.attempted").length, 1);
assert.equal(queuedAppended.filter((entry) => entry.customType === "plastic.cycle.closed").length, 1);
assert.equal(queuedScheduler.isBusy(), false);

// Queued fallback exhaustion records only the final failed attempt: it never closes,
// never appends a suppressed/pending terminal state, and remains retryable later.
const exhaustedQueued = [];
const exhaustedRuntime = {
  ...runtime,
  visibleModel: { provider: "google", id: "visible", contextWindow: 200_000, maxTokens: 16_000 },
  modelRegistry: {
    find(_provider, id) {
      if (id === "gpt-6-luna") return model;
      if (id === "claude-sonnet-5") return { provider: "anthropic", id, contextWindow: 200_000, maxTokens: 16_000 };
      return { provider: "google", id, contextWindow: 200_000, maxTokens: 16_000 };
    },
    async getProviderAuth() { return { apiKey: "fake-only" }; },
  },
  async agentLoop() { return { invalid: true }; },
};
const exhaustedScheduler = schedulerModule.createCycleScheduler();
const exhaustedInput = { ...scheduleInput, records: [queuedRecord], runtime: exhaustedRuntime, append: (entry) => exhaustedQueued.push(entry) };
assert.equal((await exhaustedScheduler.trigger(exhaustedInput)).status, "failed");
assert.equal(exhaustedQueued.filter((entry) => entry.customType === "plastic.cycle.closed").length, 0);
const exhaustedAttempts = exhaustedQueued.filter((entry) => entry.customType === "plastic.cycle.attempted");
assert.equal(exhaustedAttempts.at(-1).data.outcome, "failed", "fallback exhaustion finalizes the one active attempt");
const beforeRetryAttempts = exhaustedAttempts.length;
assert.equal((await exhaustedScheduler.trigger({ ...exhaustedInput, records: [queuedRecord, ...exhaustedQueued] })).status, "failed", "failed queued work remains retryable");
assert.ok(exhaustedQueued.filter((entry) => entry.customType === "plastic.cycle.attempted").length > beforeRetryAttempts);

// Queue-backed semantic failures exhaust the bounded model fallback on the same immutable chunk and retry on a later durable trigger.
failureMode = true;
const retryAppended = [];
const retryScheduler = schedulerModule.createCycleScheduler();
const retryInput = { ...scheduleInput, records: [queuedRecord], append: (entry) => retryAppended.push(entry) };
const failedObserverStart = calls.filter((call) => call.role === "observer").length;
assert.equal((await retryScheduler.trigger(retryInput)).status, "failed");
const failedObserverPrompts = calls.filter((call) => call.role === "observer").slice(failedObserverStart).map((call) => call.prompt);
assert.equal(failedObserverPrompts.length, 2, "observer retries once immediately");
assert.equal(failedObserverPrompts[0], failedObserverPrompts[1], "observer retry uses byte-equivalent chunk input");
assert.equal((await retryScheduler.trigger({ ...retryInput, records: [queuedRecord, ...retryAppended] })).status, "failed", "failed queued work remains retryable only through its durable record");
assert.equal(retryAppended.filter((entry) => entry.customType === "plastic.cycle.attempted").length, 4);
assert.equal(retryAppended.filter((entry) => entry.customType === "plastic.cycle.attempted").filter((entry) => entry.data.outcome === "failed").length, 2);
assert.ok(lifecycleEvents.filter((event) => event.phase === "observer" && event.status === "failed").length >= 4);
assert.ok(lifecycleEvents.filter((event) => event.phase === "observer" && event.status === "started").length >= 4);
assert.equal(lifecycleEvents.every((event) => event.reason === undefined || event.reason.length <= 120), true);
failureMode = false;
reflectorFailOnce = true;
reflectorPrompts.length = 0;
const reflectorRetryAppended = [];
const reflectorRetryScheduler = schedulerModule.createCycleScheduler();
const reflectorRetryInput = { ...scheduleInput, records: [queuedRecord], append: (entry) => reflectorRetryAppended.push(entry) };
assert.equal((await reflectorRetryScheduler.trigger(reflectorRetryInput)).status, "closed");
assert.equal(reflectorPrompts.length, 2, "reflector retries once in the same trigger");
assert.equal(reflectorPrompts[0], reflectorPrompts[1], "reflector retry uses byte-equivalent aggregate input");
assert.equal(reflectorRetryAppended.filter((entry) => entry.customType === "plastic.observations.recorded").length, 1, "observations persist once after full coverage");
assert.equal(reflectorRetryAppended.filter((entry) => entry.customType === "plastic.reflections.recorded").length, 1);
assert.deepEqual(reflectorRetryAppended.filter((entry) => entry.customType === "plastic.cycle.attempted").map((entry) => [entry.data.attemptCount, entry.data.outcome, entry.data.phase]), [[0, "pending", "observer"]], "one queued attempt survives bounded reflector fallback without a legacy retry branch");
reflectorFailOnce = false;

observerMode = "mixed";
const mixedAppended = [];
const mixedScheduler = schedulerModule.createCycleScheduler();
const mixedResult = await mixedScheduler.trigger({ ...scheduleInput, records: [queuedRecord], append: (entry) => mixedAppended.push(entry) });
assert.equal(mixedResult.status, "closed");
const mixedObservationRecords = mixedAppended.filter((entry) => entry.customType === "plastic.observations.recorded");
assert.equal(mixedObservationRecords.length, 1);
assert.equal(mixedObservationRecords[0].data.observations.length, 1);
assert.equal(mixedObservationRecords[0].data.observations[0].content, "mixed durable fact");

observerMode = "blank";
const blankAppended = [];
const blankScheduler = schedulerModule.createCycleScheduler();
const blankResult = await blankScheduler.trigger({ ...scheduleInput, records: [queuedRecord], append: (entry) => blankAppended.push(entry) });
assert.equal(blankResult.status, "empty-valid");
assert.equal(blankAppended.filter((entry) => entry.customType === "plastic.observations.recorded").length, 0);
assert.equal(blankResult.cycle.data.status, "empty-valid");

observerMode = "blank-outside";
const blankOutsideAppended = [];
const blankOutsideScheduler = schedulerModule.createCycleScheduler();
const blankOutsideResult = await blankOutsideScheduler.trigger({ ...scheduleInput, records: [queuedRecord], append: (entry) => blankOutsideAppended.push(entry) });
assert.equal(blankOutsideResult.status, "failed");
assert.equal(blankOutsideAppended.filter((entry) => entry.customType === "plastic.cycle.closed").length, 0);

observerMode = "blank-invalid-relevance";
const blankInvalidRelevanceAppended = [];
const blankInvalidRelevanceScheduler = schedulerModule.createCycleScheduler();
const blankInvalidRelevanceResult = await blankInvalidRelevanceScheduler.trigger({ ...scheduleInput, records: [queuedRecord], append: (entry) => blankInvalidRelevanceAppended.push(entry) });
assert.equal(blankInvalidRelevanceResult.status, "failed");
assert.equal(blankInvalidRelevanceAppended.filter((entry) => entry.customType === "plastic.cycle.closed").length, 0);
observerMode = "valid";

const explicitPromotion = await promoter.runPromoter({ binding, projectId: "pm:p:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", sourceDigest: snapshot.span.sourceDigest.slice(0, 24), projectSnapshot: { summary: "bounded", activeIndex: "{}" }, explicitRequest: true, runtime });
assert.equal(explicitPromotion.ok, true);
assert.equal(explicitPromotion.proposalOnly, true);
assert.equal(explicitPromotion.record.customType, "plastic.project.proposal.recorded");
assert.deepEqual(Object.keys(explicitPromotion.record.data).sort(), ["branchId", "generation", "projectId", "proposalId", "schemaVersion", "sessionId", "sourceDigest"], "explicit promotion remains metadata-only");
assert.equal(explicitPromotion.record.data.proposalId, ids.makeQueryId(binding.sessionId, ids.recordDigest(binding.sessionId, snapshot.span.sourceDigest.slice(0, 24), "proposal")), "explicit proposal ID remains compatible");

// Automatic promotion requires a post-rebase binding and derives every identity and
// provenance field from the verified acknowledgement/state, never from Luna output.
const automaticProjectId = "pm:p:" + "b".repeat(32);
const automaticSnapshot = { summary: "verified bounded project summary", activeIndex: "verified active index" };
const automaticStateBase = {
  version: 1,
  cycleIds: ["cycle-auto"],
  sourceEntryIds: [currentUser.id, currentAssistant.id],
  sourceDigests: [snapshot.span.sourceDigest.slice(0, 24)],
  facts: { activeMemoryIds: [], files: [], commands: [], errors: [], decisions: ["bounded decision"], constraints: [], goals: [], openLoops: [] },
  projectSnapshot: automaticSnapshot,
};
const automaticState = { ...automaticStateBase, stateDigest: safety.digestParts(automaticStateBase).slice(0, 32) };
const automaticAcknowledgement = {
  schemaVersion: 1,
  ...binding,
  compactionEntryId: "cmp-automatic",
  firstKeptEntryId: currentUser.id,
  activeEntryIds: [currentUser.id, currentAssistant.id],
  activeDigest: "c".repeat(32),
};
const automaticBinding = { ...binding, generation: binding.generation + 1, branchId: "fresh-after-rebase" };
const automaticCandidate = {
  category: "decisions", title: "Preserve bounded promotion provenance", target: "docs/promotion-provenance.md", body: "The automatic candidate remains proposal-only and evidence-backed.", confidence: "known",
  evidence: [{ id: "worker-contract", path: "extensions/plastic-memory/workers/promoter.ts", claim: "The no-filesystem promoter validates the candidate in harness code." }],
};
let automaticOutput = { candidate: automaticCandidate, proposalId: "luna-must-not-choose", sourceDigest: "luna-must-not-choose", binding: { sessionId: "wrong" } };
const automaticCalls = [];
const automaticRuntime = {
  ...runtime,
  async agentLoop(prompts, context, config, signal) {
    assert.equal(context.role, "project-promoter");
    assert.equal(config.model, model);
    automaticCalls.push({ request: JSON.parse(prompts[0].content[0].text), context, signal });
    return automaticOutput;
  },
};
const automaticPromotion = await promoter.runPromoter({
  binding: automaticBinding,
  projectId: automaticProjectId,
  sourceDigest: "luna-supplied-source-must-be-ignored",
  projectSnapshot: { summary: "unverified input must not be sent", activeIndex: "wrong" },
  acknowledgement: automaticAcknowledgement,
  verifiedState: automaticState,
  runtime: automaticRuntime,
});
assert.equal(automaticPromotion.ok, true);
assert.deepEqual(automaticCalls[0].context.tools, [], "project-promoter has no filesystem or host tools");
assert.deepEqual(automaticCalls[0].request.projectSnapshot, automaticSnapshot, "only the verified state snapshot enters the automatic request");
assert.equal("binding" in automaticCalls[0].request, false, "Luna does not receive automatic binding authority");
const automaticAcknowledgementDigest = ids.recordDigest(automaticBinding.sessionId, { kind: "plastic-compaction-acknowledgement" }, automaticAcknowledgement);
const automaticSourceDigest = ids.recordDigest(automaticBinding.sessionId, {
  compactionEntryId: automaticAcknowledgement.compactionEntryId,
  acknowledgementDigest: automaticAcknowledgementDigest,
  stateDigest: automaticState.stateDigest,
}, automaticSnapshot);
assert.deepEqual(automaticPromotion.record.data.source, {
  kind: "plastic-compaction", compactionEntryId: automaticAcknowledgement.compactionEntryId,
  acknowledgementDigest: automaticAcknowledgementDigest, stateDigest: automaticState.stateDigest,
});
assert.equal(automaticPromotion.record.data.sourceDigest, automaticSourceDigest);
assert.equal(automaticPromotion.record.data.proposalId, ids.makeQueryId(automaticBinding.sessionId, ids.recordDigest(automaticBinding.sessionId, { projectId: automaticProjectId, sourceDigest: automaticSourceDigest }, automaticCandidate)));
assert.equal(automaticPromotion.record.data.binding, undefined, "Luna-supplied binding is never persisted");
assert.deepEqual(automaticPromotion.record.data.candidate, automaticCandidate);

for (const invalidOutput of [
  { proposal: "free-form output", repositoryEvidence: ["extensions/plastic-memory/workers/promoter.ts"] },
  { candidate: { ...automaticCandidate, evidence: [] } },
  { candidate: { ...automaticCandidate, target: "../unsafe.md" } },
]) {
  automaticOutput = invalidOutput;
  const rejected = await promoter.runPromoter({ binding: automaticBinding, projectId: automaticProjectId, sourceDigest: "ignored", projectSnapshot: automaticSnapshot, acknowledgement: automaticAcknowledgement, verifiedState: automaticState, runtime: automaticRuntime });
  assert.equal(rejected.ok, false, "free-form, evidence-empty, and unsafe automatic output is rejected");
  assert.equal(rejected.record, undefined);
}
const callsBeforeWrongProject = automaticCalls.length;
assert.equal((await promoter.runPromoter({ binding: automaticBinding, projectId: automaticProjectId, sourceDigest: "ignored", projectSnapshot: automaticSnapshot, acknowledgement: { ...automaticAcknowledgement, activeDigest: "malformed" }, verifiedState: automaticState, runtime: automaticRuntime })).ok, false, "malformed acknowledgement fails closed");
assert.equal((await promoter.runPromoter({ binding: automaticBinding, projectId: "not-a-project", sourceDigest: "ignored", projectSnapshot: automaticSnapshot, acknowledgement: automaticAcknowledgement, verifiedState: automaticState, runtime: automaticRuntime })).ok, false, "invalid project identity fails closed");
assert.equal((await promoter.runPromoter({ binding, projectId: automaticProjectId, sourceDigest: "ignored", projectSnapshot: automaticSnapshot, acknowledgement: automaticAcknowledgement, verifiedState: automaticState, runtime: automaticRuntime })).ok, false, "pre-rebase acknowledgement binding cannot start automatic promotion");
assert.equal(automaticCalls.length, callsBeforeWrongProject, "invalid identity/binding starts no Luna call");

const staleRuntime = { ...runtime, agentLoop: async (_prompts, _context, _config, signal) => await new Promise((resolve) => signal.addEventListener("abort", () => resolve({ coverageManifest: {} }), { once: true })) };
const staleAppended = [];
const staleScheduler = schedulerModule.createCycleScheduler();
const stalePromise = staleScheduler.trigger({ ...scheduleInput, runtime: staleRuntime, records: [queuedRecord], append: (entry) => staleAppended.push(entry) });
staleScheduler.shutdown();
assert.equal((await stalePromise).status, "stale");
assert.equal(staleAppended.some((entry) => entry.customType === "plastic.cycle.closed"), false);

console.log("PLASTIC_MEMORY_WORKERS: PASS (four Luna-medium roles, one-shot 100k closure, exact manifests, retries, legacy exclusion, stale abort, proposal-only promotion)");

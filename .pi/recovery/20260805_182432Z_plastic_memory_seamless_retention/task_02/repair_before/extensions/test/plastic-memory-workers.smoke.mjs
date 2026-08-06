import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));
const cycles = await jiti.import(path.join(root, "plastic-memory/session/cycles.ts"));
const runner = await jiti.import(path.join(root, "plastic-memory/workers/runner.ts"));
const runnerRuntime = await jiti.import(path.join(root, "plastic-memory/runtime/runner-runtime.ts"));
const observer = await jiti.import(path.join(root, "plastic-memory/workers/observer.ts"));
const reflector = await jiti.import(path.join(root, "plastic-memory/workers/reflector.ts"));
const promoter = await jiti.import(path.join(root, "plastic-memory/workers/promoter.ts"));
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
const model = { provider: "openai-codex", id: "gpt-5.6-luna", contextWindow: 200_000, maxTokens: 16_000 };
const calls = [];
let failureMode = false;
let reflectorFailOnce = false;
const reflectorPrompts = [];
const runtime = {
  modelRegistry: {
    find(provider, id) { assert.equal(provider, "openai-codex"); assert.equal(id, "gpt-5.6-luna"); return model; },
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
    if (failureMode || context.role === "reflector" && reflectorFailOnce && reflectorPrompts.length === 1) return { noSemanticResult: true };
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
  find(provider, id) { assert.equal(provider, "openai-codex"); assert.equal(id, "gpt-5.6-luna"); return model; },
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
  assert.deepEqual(runner.ROLE_CONFIGS[role], { model: "openai-codex/gpt-5.6-luna", thinking: "medium", maxTurns: 8, maxToolCalls: 4, maxRuntimeMs: 60_000 });
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
const scheduler = schedulerModule.createCycleScheduler();
const scheduleInput = { binding, branchEntries: entries, bootstrap: { activeEntryIds: [currentUser.id, currentAssistant.id], historicalPrefixIds: [old.id], historicalGap: "historical-unindexed" }, records: [], runtime, append: (entry) => appended.push(entry), lifecycleReporter: (event) => lifecycleEvents.push(event) };
const first = await scheduler.trigger(scheduleInput);
assert.equal(first.status, "closed");
assert.equal(first.cycle.data.sourceEntryIds.length, 2);
assert.equal(calls.filter((call) => call.role === "observer").length, 2);
assert.equal(calls.filter((call) => call.prompt.includes(old.id)).length, 0, "historical prefix must not enter worker request");
const repeated = await scheduler.trigger({ ...scheduleInput, records: appended });
assert.equal(repeated.status, "skipped");
assert.equal(calls.filter((call) => call.role === "observer").length, 2, "repeated triggers must not hot-loop a closed snapshot");
assert.equal(appended.filter((entry) => entry.customType === "plastic.cycle.closed").length, 1);
assert.deepEqual(lifecycleEvents.filter((event) => event.phase === "observer"), [{ phase: "observer", status: "started", tokenCount: 100_000 }]);

// Semantic failures fail closed and retry once immediately with the same chunk.
failureMode = true;
const retryAppended = [];
const retryScheduler = schedulerModule.createCycleScheduler();
const retryInput = { ...scheduleInput, records: [], append: (entry) => retryAppended.push(entry) };
const failedObserverStart = calls.filter((call) => call.role === "observer").length;
assert.equal((await retryScheduler.trigger(retryInput)).status, "failed");
const failedObserverPrompts = calls.filter((call) => call.role === "observer").slice(failedObserverStart).map((call) => call.prompt);
assert.equal(failedObserverPrompts.length, 2, "observer retries once immediately");
assert.equal(failedObserverPrompts[0], failedObserverPrompts[1], "observer retry uses byte-equivalent chunk input");
assert.equal((await retryScheduler.trigger({ ...retryInput, records: retryAppended })).status, "suppressed");
assert.equal(retryAppended.filter((entry) => entry.customType === "plastic.cycle.attempted").length, 5);
assert.equal(retryAppended.filter((entry) => entry.customType === "plastic.cycle.attempted").filter((entry) => entry.data.outcome === "failed").length, 2);
assert.equal(lifecycleEvents.filter((event) => event.phase === "observer" && event.status === "failed").length, 2);
assert.equal(lifecycleEvents.filter((event) => event.phase === "observer" && event.status === "started").length, 3);
assert.equal(lifecycleEvents.every((event) => event.reason === undefined || event.reason.length <= 120), true);
failureMode = false;
reflectorFailOnce = true;
reflectorPrompts.length = 0;
const reflectorRetryAppended = [];
const reflectorRetryScheduler = schedulerModule.createCycleScheduler();
const reflectorRetryInput = { ...scheduleInput, records: [], append: (entry) => reflectorRetryAppended.push(entry) };
assert.equal((await reflectorRetryScheduler.trigger(reflectorRetryInput)).status, "closed");
assert.equal(reflectorPrompts.length, 2, "reflector retries once in the same trigger");
assert.equal(reflectorPrompts[0], reflectorPrompts[1], "reflector retry uses byte-equivalent aggregate input");
assert.equal(reflectorRetryAppended.filter((entry) => entry.customType === "plastic.observations.recorded").length, 1, "observations persist once after full coverage");
assert.equal(reflectorRetryAppended.filter((entry) => entry.customType === "plastic.reflections.recorded").length, 1);
assert.deepEqual(reflectorRetryAppended.filter((entry) => entry.customType === "plastic.cycle.attempted").map((entry) => [entry.data.attemptCount, entry.data.outcome, entry.data.phase]), [[0, "pending", "observer"], [0, "failed", "reflector"], [1, "pending", "reflector"]]);
reflectorFailOnce = false;

const explicitPromotion = await promoter.runPromoter({ binding, projectId: "pm:p:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", sourceDigest: snapshot.span.sourceDigest.slice(0, 24), projectSnapshot: { summary: "bounded", activeIndex: "{}" }, explicitRequest: true, runtime });
assert.equal(explicitPromotion.ok, true);
assert.equal(explicitPromotion.proposalOnly, true);
assert.equal(explicitPromotion.record.customType, "plastic.project.proposal.recorded");

const staleRuntime = { ...runtime, agentLoop: async (_prompts, _context, _config, signal) => await new Promise((resolve) => signal.addEventListener("abort", () => resolve({ coverageManifest: {} }), { once: true })) };
const staleAppended = [];
const staleScheduler = schedulerModule.createCycleScheduler();
const stalePromise = staleScheduler.trigger({ ...scheduleInput, runtime: staleRuntime, records: [], append: (entry) => staleAppended.push(entry) });
staleScheduler.shutdown();
assert.equal((await stalePromise).status, "stale");
assert.equal(staleAppended.some((entry) => entry.customType === "plastic.cycle.closed"), false);

console.log("PLASTIC_MEMORY_WORKERS: PASS (four Luna-medium roles, one-shot 100k closure, exact manifests, retries, legacy exclusion, stale abort, proposal-only promotion)");

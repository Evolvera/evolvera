import { loadJiti } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createJiti } = await loadJiti(import.meta.url);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const runner = await jiti.import(path.join(root, "plastic-memory/workers/runner.ts"));
const runnerRuntime = await jiti.import(path.join(root, "plastic-memory/runtime/runner-runtime.ts"));
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));
const cycles = await jiti.import(path.join(root, "plastic-memory/session/cycles.ts"));
const schedulerModule = await jiti.import(path.join(root, "plastic-memory/workers/scheduler.ts"));

const luna = { provider: "openai", id: "gpt-6-luna", contextWindow: 200_000, maxTokens: 16_000 };
const sonnet = { provider: "anthropic", id: "claude-sonnet-5", contextWindow: 200_000, maxTokens: 16_000 };
const visible = { provider: "google", id: "gemini-visible", contextWindow: 200_000, maxTokens: 16_000 };
const models = new Map([
  ["openai/gpt-6-luna", luna],
  ["anthropic/claude-sonnet-5", sonnet],
  ["google/gemini-visible", visible],
]);
const lookups = [];
const authLookups = [];
const registry = {
  find(provider, id) {
    lookups.push(`${provider}/${id}`);
    return models.get(`${provider}/${id}`);
  },
  async getApiKeyAndHeaders(model) {
    authLookups.push(model);
    return { ok: true, apiKey: `key-for-${model.provider}` };
  },
};
const targets = runner.buildEmergencyModelTargets(visible);
assert.deepEqual(targets, [
  { provider: "openai", id: "gpt-6-luna" },
  { provider: "openai", id: "gpt-6-luna" },
  { provider: "anthropic", id: "claude-sonnet-5" },
  { provider: "google", id: "gemini-visible" },
]);
assert.deepEqual(runner.buildEmergencyModelTargets(luna), targets.slice(0, 3), "visible Luna is deduplicated");
assert.deepEqual(runner.buildEmergencyModelTargets({ contextWindow: 200_000 }), targets.slice(0, 3), "unusable visible identity is omitted");
assert.deepEqual(runner.buildModelTargets(visible), targets, "normal and compatibility candidate builders share the exact order");

const prompt = JSON.stringify({ immutable: true, sourceIds: ["pm:cy:fixed"] });
const traces = [];
const runtime = {
  modelRegistry: registry,
  async agentLoop(prompts, context, config, signal) {
    traces.push({ prompt: prompts[0].content[0].text, context, config, signal });
    return { selected: config.model.id };
  },
};
for (const target of targets.slice(0, 3)) {
  const result = await runner.runBoundedRole({ role: "compactor", prompt, runtime, model: target, inputTokens: 123 });
  assert.equal(result.ok, true);
  assert.equal(result.resolved.model, models.get(`${target.provider}/${target.id}`));
}
assert.deepEqual(traces.map((trace) => `${trace.config.model.provider}/${trace.config.model.id}`), [
  "openai/gpt-6-luna",
  "openai/gpt-6-luna",
  "anthropic/claude-sonnet-5",
]);
assert.equal(traces[0].prompt, prompt);
assert.ok(traces.every((trace) => trace.prompt === prompt), "each candidate receives the immutable prompt bytes");
assert.ok(traces.every((trace) => trace.config.model.contextWindow === 200_000));
assert.deepEqual(authLookups.slice(-3), [luna, luna, sonnet]);

const exhausted = [];
const failingRuntime = {
  modelRegistry: registry,
  async agentLoop(prompts, context, config) {
    exhausted.push({ prompt: prompts[0].content[0].text, model: config.model });
    throw new Error("response payload must never become a diagnostic");
  },
};
for (const target of targets) {
  const result = await runner.runBoundedRole({ role: "observer", prompt, runtime: failingRuntime, model: target, inputTokens: 123 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "agent-error");
  assert.equal(result.diagnostics.message, "agent error");
}
assert.deepEqual(exhausted.map(({ model }) => `${model.provider}/${model.id}`), targets.map(({ provider, id }) => `${provider}/${id}`));
assert.ok(exhausted.every(({ prompt: captured }) => captured === prompt));

const adapterCalls = [];
const adapterRuntime = runnerRuntime.createPiRunnerRuntime(registry, async (model, context, options) => {
  adapterCalls.push({ model, context, options });
  return { content: [{ type: "text", text: JSON.stringify({ adapter: model.id }) }] };
});
const adapterResult = await runner.runBoundedRole({ role: "observer", prompt, runtime: adapterRuntime, model: targets[2], inputTokens: 1 });
assert.equal(adapterResult.ok, true);
assert.equal(adapterCalls.length, 1);
assert.equal(adapterCalls[0].model, sonnet, "the adapter receives the exact selected model object");
assert.equal(adapterCalls[0].options.apiKey, "key-for-anthropic");
assert.deepEqual(adapterResult.response, { adapter: "claude-sonnet-5" });

const timeoutRuntime = {
  modelRegistry: registry,
  agentLoop: async () => new Promise(() => {}),
};
const timedOut = await runner.runBoundedRole({ role: "observer", prompt, runtime: timeoutRuntime, model: targets[3], deadlineMs: 10, inputTokens: 1 });
assert.equal(timedOut.ok, false);
assert.equal(timedOut.reason, "timeout");
assert.equal(timedOut.diagnostics.message, "worker deadline exceeded");

// The normal queued scheduler applies the same immutable candidate order independently
// to observer and reflector phases; failed Luna output cannot be mixed into Sonnet input.
const queueBinding = { sessionId: ids.sessionDigest("fallback-queue", { generation: 1 }), generation: 1, branchId: "main" };
const queueEntries = [
  { type: "message", id: "fallback-user", parentId: null, message: { role: "user", content: [{ type: "text", text: "queue fallback" }] }, tokenCount: 10_000 },
  { type: "message", id: "fallback-assistant", parentId: "fallback-user", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "queue fallback complete" }] }, tokenCount: 10_000 },
];
const queued = cycles.createQueuedCycleRecords({ binding: queueBinding, sourceEntries: queueEntries });
assert.equal(queued.length, 1);
const normalTraces = [];
const normalRuntime = {
  modelRegistry: registry,
  visibleModel: visible,
  async agentLoop(prompts, context, config) {
    const request = JSON.parse(prompts[0].content[0].text);
    normalTraces.push({ role: context.role, target: `${config.model.provider}/${config.model.id}`, prompt: prompts[0].content[0].text });
    if (config.model.provider === "openai") return { invalid: true };
    if (context.role === "observer") return { observations: [{ content: "fallback fact", timestamp: "2026-08-06T00:00:00Z", relevance: "medium", sourceEntryIds: request.sourceEntryIds }] };
    return { reflections: [{ content: "fallback reflection", supportingObservationIds: request.observations.map((item) => item.id) }] };
  },
};
const normalAppended = [];
const normalResult = await schedulerModule.createCycleScheduler().trigger({
  binding: queueBinding,
  branchEntries: queueEntries,
  bootstrap: { activeEntryIds: queueEntries.map((entry) => entry.id), historicalPrefixIds: [], historicalGap: "historical-unindexed" },
  records: queued,
  runtime: normalRuntime,
  append: (entry) => normalAppended.push(entry),
});
assert.equal(normalResult.status, "closed");
assert.deepEqual(normalTraces.map((trace) => trace.target), [
  "openai/gpt-6-luna", "openai/gpt-6-luna", "anthropic/claude-sonnet-5",
  "openai/gpt-6-luna", "openai/gpt-6-luna", "anthropic/claude-sonnet-5",
]);
assert.equal(normalTraces[0].prompt, normalTraces[1].prompt);
assert.equal(normalTraces[1].prompt, normalTraces[2].prompt);
assert.equal(normalAppended.filter((entry) => entry.customType === "plastic.cycle.closed").length, 1);

console.log("PLASTIC_MEMORY_MODEL_FALLBACK: PASS (candidate order, duplicate Luna retry, visible-model dedupe, immutable prompts, bounded timeout, and exact adapter identity)");

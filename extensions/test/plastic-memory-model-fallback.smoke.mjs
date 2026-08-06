import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const runner = await jiti.import(path.join(root, "plastic-memory/workers/runner.ts"));
const runnerRuntime = await jiti.import(path.join(root, "plastic-memory/runtime/runner-runtime.ts"));

const luna = { provider: "openai-codex", id: "gpt-5.6-luna", contextWindow: 200_000, maxTokens: 16_000 };
const sonnet = { provider: "anthropic", id: "claude-sonnet-5", contextWindow: 200_000, maxTokens: 16_000 };
const visible = { provider: "google", id: "gemini-visible", contextWindow: 200_000, maxTokens: 16_000 };
const models = new Map([
  ["openai-codex/gpt-5.6-luna", luna],
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
  { provider: "openai-codex", id: "gpt-5.6-luna" },
  { provider: "openai-codex", id: "gpt-5.6-luna" },
  { provider: "anthropic", id: "claude-sonnet-5" },
  { provider: "google", id: "gemini-visible" },
]);
assert.deepEqual(runner.buildEmergencyModelTargets(luna), targets.slice(0, 3), "visible Luna is deduplicated");
assert.deepEqual(runner.buildEmergencyModelTargets({ contextWindow: 200_000 }), targets.slice(0, 3), "unusable visible identity is omitted");

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
  "openai-codex/gpt-5.6-luna",
  "openai-codex/gpt-5.6-luna",
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

console.log("PLASTIC_MEMORY_MODEL_FALLBACK: PASS (candidate order, duplicate Luna retry, visible-model dedupe, immutable prompts, bounded timeout, and exact adapter identity)");

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, {
  fsCache: false,
  alias: {
    "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js"),
    "@earendil-works/pi-ai/models": path.join(sdkRoot, "node_modules/@earendil-works/pi-ai/dist/models.js"),
  },
});
const { default: register, FALLBACK_CHAINS, decideFallbackRoute, classifyFallbackError, nextFallbackStep, firstUsableStep } =
  await jiti.import(path.join(root, "extensions/model-fallback.ts"));
const { VIRTUAL_MODEL_STATE_ENTRY } = await import(pathToFileURL(path.join(sdkRoot, "dist/index.js")));

assert.equal(classifyFallbackError({ stopReason: "error", errorMessage: "Monthly usage limit reached" }), "fallback");
assert.equal(classifyFallbackError({ stopReason: "error", errorMessage: "provider overloaded (503)" }), "fallback");
assert.equal(classifyFallbackError({ stopReason: "error", errorMessage: "Prompt is too long: context overflow" }), "none");
assert.equal(classifyFallbackError({ stopReason: "aborted", errorMessage: "request aborted" }), "none");
// A missing or rejected account moves on too: stopping there would strand the work on a provider nobody can use.
for (const errorMessage of ["No API key found for anthropic", "401 Unauthorized", "403 Forbidden: invalid api key", "Fallback model is unavailable: x/y"]) {
  assert.equal(classifyFallbackError({ stopReason: "error", errorMessage }), "fallback", errorMessage);
}
assert.equal(classifyFallbackError({ stopReason: "error", errorMessage: "tool execution failed" }), "none");
// No chain step uses a provider outside this setup's accounts, nor a safety-removed model.
for (const [id, chain] of Object.entries(FALLBACK_CHAINS)) {
  for (const step of chain) assert.ok(["openai-codex", "anthropic"].includes(step.provider), `${id}: ${step.provider}/${step.model}`);
}
assert.equal(firstUsableStep(FALLBACK_CHAINS.builder, 0, (step) => step.provider === "anthropic"), 1);
assert.equal(firstUsableStep(FALLBACK_CHAINS.builder, 2, () => true), 2);
assert.equal(firstUsableStep(FALLBACK_CHAINS.builder, 0, () => false), null);
assert.equal(nextFallbackStep(FALLBACK_CHAINS.builder, 2), 2, "last step is clamped");

const state = { step: 0, runId: "u1" };
assert.deepEqual(decideFallbackRoute(FALLBACK_CHAINS.builder, { reason: "user", thinkingLevel: "high" }, "u1"), { step: 0, runId: "u1" });
assert.deepEqual(decideFallbackRoute(FALLBACK_CHAINS.builder, { reason: "user", thinkingLevel: "high", state: { step: 1, runId: "u1" } }, "fresh"), { step: 1, runId: "u1" }, "user requests stay on the advanced step");
assert.deepEqual(decideFallbackRoute(FALLBACK_CHAINS.builder, {
  reason: "retry", thinkingLevel: "high", state,
  failed: { model: { provider: "openai-codex", id: "gpt-6-luna" }, message: { stopReason: "error", errorMessage: "provider overloaded" } },
}, "u1"), { step: 1, runId: "u1" });
assert.deepEqual(decideFallbackRoute(FALLBACK_CHAINS.builder, {
  reason: "retry", thinkingLevel: "high", state,
  failed: { model: { provider: "openai-codex", id: "gpt-6-luna" }, message: { stopReason: "error", errorMessage: "Monthly usage limit reached" } },
}, "u1"), { step: 1, runId: "u1" });
assert.deepEqual(decideFallbackRoute(FALLBACK_CHAINS.builder, {
  reason: "retry", thinkingLevel: "high", state,
  failed: { model: { provider: "openai-codex", id: "gpt-6-luna" }, message: { stopReason: "error", errorMessage: "context window overflow" } },
}, "u1"), state, "context overflow does not advance during retry");

const models = new Map();
for (const chain of Object.values(FALLBACK_CHAINS)) {
  for (const step of chain) models.set(`${step.provider}/${step.model}`, {
    provider: step.provider, id: step.model, reasoning: true,
    thinkingLevelMap: { off: null, minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
  });
}
for (const id of ["claude-opus-5-5", "claude-sonnet-5-5"]) {
  models.set(`anthropic/${id}`, {
    provider: "anthropic", id, reasoning: true,
    thinkingLevelMap: { off: null, xhigh: "xhigh", max: "max" },
  });
}
const virtualModels = new Map();
const handlers = new Map();
const appended = [];
const published = [];
const pi = {
  registerVirtualModel(model) { virtualModels.set(`${model.provider}/${model.id}`, model); },
  on(name, handler) { handlers.set(name, handler); },
  appendEntry(type, data) { appended.push({ type: "custom", customType: type, data }); },
  events: { emit(channel, data) { published.push({ channel, data }); } },
};
register(pi);
assert.equal(virtualModels.size, 7, "all seven virtual chains register");
const selectModel = handlers.get("model_select");
selectModel({ model: { provider: "openai-codex", id: "gpt-6.1-sol" } });
assert.equal(appended.length, 0, "selecting another model does not reset fallback state");
selectModel({ model: { provider: "fallback", id: "conductor" } });
assert.equal(appended.length, 1, "selecting a virtual model persists a reset");
assert.equal(appended[0].customType, VIRTUAL_MODEL_STATE_ENTRY);
assert.equal(appended[0].data.modelId, "conductor");
assert.equal(appended[0].data.state.step, 0);
const models_ = (chain) => chain.map(({ model, level }) => ({ model, level }));
assert.deepEqual(models_(FALLBACK_CHAINS.builder), [{ model: "gpt-6.1-terra", level: "inherit" }, { model: "claude-sonnet-5-5", level: "inherit" }, { model: "claude-haiku-5-5", level: "inherit" }]);
assert.deepEqual(models_(FALLBACK_CHAINS.heavy), [{ model: "gpt-6.1-sol", level: "inherit" }, { model: "claude-opus-5-5", level: "inherit" }]);
assert.deepEqual(models_(FALLBACK_CHAINS.opus), [{ model: "claude-opus-5-5", level: "inherit" }, { model: "gpt-6.1-sol", level: "inherit" }], "planning and security review start on Opus");
for (const [id, name, contextWindow] of [["builder", "GPT-6.1 Terra", 300_000], ["heavy", "GPT-6.1 Sol", 300_000], ["sol", "GPT-6.1 Sol", 300_000], ["terra", "GPT-6.1 Terra", 300_000], ["luna", "GPT-6 Luna", 300_000], ["opus", "Claude Opus 5.5", 450_000], ["conductor", "GPT-6.1 Sol", 300_000]]) {
  const metadata = virtualModels.get(`fallback/${id}`);
  assert.equal(metadata.name, name, `${id} exposes its step-0 physical model name`);
  assert.equal(metadata.contextWindow, contextWindow);
  assert.equal(metadata.maxTokens, 128_000);
  assert.deepEqual(metadata.input, ["text", "image"]);
}
assert.deepEqual(FALLBACK_CHAINS.conductor.map(({ provider, model, level }) => ({ provider, model, level })), [
  { provider: "openai-codex", model: "gpt-6.1-sol", level: "inherit" },
  { provider: "anthropic", model: "claude-sonnet-5-5", level: "inherit" },
]);
const conductor = virtualModels.get("fallback/conductor");
const builder = virtualModels.get("fallback/builder");
const registry = { find(provider, id) { return models.get(`${provider}/${id}`); } };
const conductorPrimary = conductor.route({ model: { provider: "fallback", id: "conductor" }, thinkingLevel: "high", messages: [{ role: "user", id: "u1" }], reason: "user" }, { modelRegistry: registry });
assert.equal(conductorPrimary.model.id, "gpt-6.1-sol");
assert.equal(conductorPrimary.thinkingLevel, "high");
const conductorFallback = conductor.route({ model: { provider: "fallback", id: "conductor" }, thinkingLevel: "high", messages: [{ role: "user", id: "u1" }], reason: "continuation", state: { step: 1, runId: "u1" } }, { modelRegistry: registry });
assert.equal(conductorFallback.model.id, "claude-sonnet-5-5");
assert.equal(conductorFallback.thinkingLevel, "high");
// A step whose provider has no login is skipped at routing time; with nothing signed in the request fails clearly.
const noCodex = { find: registry.find, hasConfiguredAuth: (model) => model.provider !== "openai-codex" };
assert.equal(conductor.route({ model: { provider: "fallback", id: "conductor" }, thinkingLevel: "high", messages: [{ role: "user", id: "u1" }], reason: "user" }, { modelRegistry: noCodex }).model.id, "claude-sonnet-5-5");
assert.throws(() => conductor.route({ model: { provider: "fallback", id: "conductor" }, thinkingLevel: "high", messages: [{ role: "user", id: "u1" }], reason: "user" }, { modelRegistry: { find: registry.find, hasConfiguredAuth: () => false } }), /no signed-in model left in chain "conductor"/);
const baseRequest = { model: { provider: "fallback", id: "builder" }, thinkingLevel: "high", messages: [{ role: "user", id: "u1" }], reason: "user" };
const firstRoute = builder.route(baseRequest, { modelRegistry: registry });
assert.equal(firstRoute.model.id, "gpt-6.1-terra");
assert.equal(firstRoute.thinkingLevel, "high");
assert.deepEqual(published.at(-1), {
  channel: "model-fallback:routed",
  data: { provider: "openai-codex", modelId: "gpt-6.1-terra" },
}, "the routed physical model is published for tier gating");
assert.deepEqual(Object.keys(published.at(-1).data).sort(), ["modelId", "provider"], "only provider and model id travel");
const fallbackRoute = builder.route({ ...baseRequest, reason: "continuation", state: firstRoute.state }, { modelRegistry: registry });
assert.equal(fallbackRoute.model.id, "gpt-6.1-terra", "continuation stays on the cache-owning primary");
const solFallback = virtualModels.get("fallback/sol").route({ ...baseRequest, model: { provider: "fallback", id: "sol" }, reason: "retry", state: { step: 0, runId: "u1" }, failed: { model: { provider: "openai-codex", id: "gpt-6.1-sol" }, message: { stopReason: "error", errorMessage: "quota exceeded" } } }, { modelRegistry: registry });
assert.equal(solFallback.model.id, "claude-opus-5-5");
assert.equal(solFallback.thinkingLevel, "high", "SDK clamp preserves supported adaptive high effort");
assert.deepEqual(published.at(-1).data, { provider: "anthropic", modelId: "claude-opus-5-5" }, "the advanced step publishes its own physical model");
const terraFallback = virtualModels.get("fallback/terra").route({ ...baseRequest, model: { provider: "fallback", id: "terra" }, reason: "continuation", state: { step: 1, runId: "u1" } }, { modelRegistry: registry });
assert.equal(terraFallback.model.id, "claude-sonnet-5-5");
assert.equal(terraFallback.thinkingLevel, "high", "missing level-map key uses Anthropic's native high effort");
assert.equal(published.every(({ channel }) => channel === "model-fallback:routed"), true, "the router publishes on a single channel");

for (const chainId of ["luna"]) {
  const chain = FALLBACK_CHAINS[chainId];
  assert.deepEqual(chain.map(({ provider, model, level }) => ({ provider, model, level })), [
    { provider: "openai-codex", model: "gpt-6-luna", level: "inherit" },
    { provider: "anthropic", model: "claude-haiku-5-5", level: "inherit" },
  ]);
  assert.equal(nextFallbackStep(chain, 0), 1);
  assert.equal(nextFallbackStep(chain, 1), 1, `${chainId} clamps at its final step`);
  const primaryRoute = virtualModels.get(`fallback/${chainId}`).route({
    ...baseRequest, model: { provider: "fallback", id: chainId }, reason: "user",
  }, { modelRegistry: registry });
  assert.equal(primaryRoute.model.id, "gpt-6-luna");
  assert.equal(primaryRoute.thinkingLevel, "high", "inherit uses the requested level on step zero");
  const fallbackRoute = virtualModels.get(`fallback/${chainId}`).route({
    ...baseRequest, model: { provider: "fallback", id: chainId }, reason: "continuation",
    state: { step: 1, runId: "u1" },
  }, { modelRegistry: registry });
  assert.equal(fallbackRoute.model.id, "claude-haiku-5-5");
  assert.equal(fallbackRoute.thinkingLevel, "high", "inherit uses the requested level on fallback");
}

const settle = handlers.get("agent_before_settle");
const activeModel = { provider: "fallback", id: "builder" };
const activeStateEntry = { type: "custom", customType: VIRTUAL_MODEL_STATE_ENTRY, data: { provider: "fallback", modelId: "builder", state } };
const quotaBranch = [
  { type: "message", id: "u1", message: { role: "user", content: "work" } },
  activeStateEntry,
  { type: "message", id: "a1", message: { role: "assistant", provider: "openai-codex", model: "gpt-6.1-terra", stopReason: "error", errorMessage: "insufficient_quota" } },
];
const settleResult = settle({ outcome: "error", context: {} }, {
  model: activeModel,
  sessionManager: { getBranch: () => quotaBranch },
});
assert.deepEqual(settleResult, { continue: true }, "quota failure advances via settle continuation");
assert.equal(appended.length, 3, "advance and router state are durably recorded");
assert.equal(appended[2].data.state.step, 1);

for (const chainId of ["luna"]) {
  const chain = FALLBACK_CHAINS[chainId];
  const branch = [
    { type: "custom", customType: VIRTUAL_MODEL_STATE_ENTRY, data: { provider: "fallback", modelId: chainId, state: { step: 0, runId: `${chainId}-run` } } },
    { type: "message", message: { role: "assistant", provider: chain[0].provider, model: chain[0].model, stopReason: "error", errorMessage: "insufficient_quota" } },
  ];
  const result = settle({ outcome: "error", context: {} }, {
    model: { provider: "fallback", id: chainId },
    sessionManager: { getBranch: () => branch },
  });
  assert.deepEqual(result, { continue: true }, `${chainId} settle advances from the primary`);
  assert.equal(appended.at(-1).data.state.step, 1);
  assert.equal(settle({ outcome: "error", context: {} }, {
    model: { provider: "fallback", id: chainId },
    sessionManager: { getBranch: () => [...branch, ...appended] },
  }), undefined, `${chainId} settle advances only once from its primary`);
  const finalBranch = [
    { type: "custom", customType: VIRTUAL_MODEL_STATE_ENTRY, data: { provider: "fallback", modelId: chainId, state: { step: 1, runId: `${chainId}-run` } } },
    { type: "message", message: { role: "assistant", provider: chain[1].provider, model: chain[1].model, stopReason: "error", errorMessage: "insufficient_quota" } },
  ];
  assert.equal(settle({ outcome: "error", context: {} }, {
    model: { provider: "fallback", id: chainId },
    sessionManager: { getBranch: () => finalBranch },
  }), undefined, `${chainId} settle does not advance past the last step`);
}

const repeated = settle({ outcome: "error", context: {} }, {
  model: activeModel,
  sessionManager: { getBranch: () => [...quotaBranch, ...appended] },
});
assert.equal(repeated, undefined, "same chain step cannot advance twice in one run");
assert.equal(settle({ outcome: "aborted", context: {} }, { model: activeModel, sessionManager: { getBranch: () => quotaBranch } }), undefined);
for (const errorMessage of ["prompt context overflow", "tool execution failed"]) {
  const branch = [...quotaBranch.slice(0, -1), { type: "message", message: { role: "assistant", provider: "openai-codex", model: "gpt-6.1-terra", stopReason: "error", errorMessage } }];
  assert.equal(settle({ outcome: "error", context: {} }, { model: activeModel, sessionManager: { getBranch: () => branch } }), undefined);
}
const exhaustedBranch = [
  ...quotaBranch.slice(0, -2),
  { type: "custom", customType: VIRTUAL_MODEL_STATE_ENTRY, data: { provider: "fallback", modelId: "builder", state: { step: 2, runId: "u1" } } },
  { type: "message", message: { role: "assistant", provider: "anthropic", model: "claude-haiku-5-5", stopReason: "error", errorMessage: "insufficient_quota" } },
];
assert.equal(settle({ outcome: "error", context: {} }, { model: activeModel, sessionManager: { getBranch: () => exhaustedBranch } }), undefined, "exhausted chain ends without looping");
assert.equal(settle({ outcome: "error", context: {} }, { model: { provider: "openai-codex", id: "gpt-6-luna" }, sessionManager: { getBranch: () => quotaBranch } }), undefined);

console.log("model-fallback smoke: PASS");

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
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
const { default: register, FALLBACK_CHAINS, decideFallbackRoute, classifyFallbackError, nextFallbackStep, deepFastChain, readDeepFast, writeDeepFast, DEEP_FAST_PRIMARY, DEEP_FAST_SETTINGS_KEY } =
  await jiti.import(path.join(root, "extensions/model-fallback.ts"));
const { VIRTUAL_MODEL_STATE_ENTRY } = await import(pathToFileURL(path.join(sdkRoot, "dist/index.js")));

assert.equal(classifyFallbackError({ stopReason: "error", errorMessage: "Monthly usage limit reached" }), "fallback");
assert.equal(classifyFallbackError({ stopReason: "error", errorMessage: "provider overloaded (503)" }), "fallback");
assert.equal(classifyFallbackError({ stopReason: "error", errorMessage: "Prompt is too long: context overflow" }), "none");
assert.equal(classifyFallbackError({ stopReason: "aborted", errorMessage: "request aborted" }), "none");
assert.equal(nextFallbackStep(FALLBACK_CHAINS.builder, 2), 2, "last step is clamped");

const state = { step: 0, runId: "u1" };
assert.deepEqual(decideFallbackRoute(FALLBACK_CHAINS.builder, { reason: "user", thinkingLevel: "high" }, "u1"), { step: 0, runId: "u1" });
assert.deepEqual(decideFallbackRoute(FALLBACK_CHAINS.builder, { reason: "user", thinkingLevel: "high", state: { step: 1, runId: "u1" } }, "fresh"), { step: 1, runId: "u1" }, "user requests stay on the advanced step");
assert.deepEqual(decideFallbackRoute(FALLBACK_CHAINS.builder, {
  reason: "retry", thinkingLevel: "high", state,
  failed: { model: { provider: "openai", id: "gpt-6-luna" }, message: { stopReason: "error", errorMessage: "provider overloaded" } },
}, "u1"), { step: 1, runId: "u1" });
assert.deepEqual(decideFallbackRoute(FALLBACK_CHAINS.builder, {
  reason: "retry", thinkingLevel: "high", state,
  failed: { model: { provider: "openai", id: "gpt-6-luna" }, message: { stopReason: "error", errorMessage: "Monthly usage limit reached" } },
}, "u1"), { step: 1, runId: "u1" });
assert.deepEqual(decideFallbackRoute(FALLBACK_CHAINS.builder, {
  reason: "retry", thinkingLevel: "high", state,
  failed: { model: { provider: "openai", id: "gpt-6-luna" }, message: { stopReason: "error", errorMessage: "context window overflow" } },
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
const commands = new Map();
const notified = [];
const pi = {
  registerVirtualModel(model) { virtualModels.set(`${model.provider}/${model.id}`, model); },
  registerCommand(name, command) { commands.set(name, command); },
  on(name, handler) { handlers.set(name, handler); },
  appendEntry(type, data) { appended.push({ type: "custom", customType: type, data }); },
  events: { emit(channel, data) { published.push({ channel, data }); } },
};
const settingsFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "model-fallback-smoke-")), "settings.json");
fs.writeFileSync(settingsFile, JSON.stringify({ contextMode: "high" }));
register(pi, () => settingsFile);
assert.equal(virtualModels.size, 6, "all six virtual chains register");
const selectModel = handlers.get("model_select");
selectModel({ model: { provider: "openai", id: "gpt-6.1-sol" } });
assert.equal(appended.length, 0, "selecting another model does not reset fallback state");
selectModel({ model: { provider: "fallback", id: "conductor" } });
assert.equal(appended.length, 1, "selecting a virtual model persists a reset");
assert.equal(appended[0].customType, VIRTUAL_MODEL_STATE_ENTRY);
assert.equal(appended[0].data.modelId, "conductor");
assert.equal(appended[0].data.state.step, 0);
// heavy is the one deliberate exception to "fallbacks mirror the primary effort": it keeps xhigh.
assert.deepEqual(FALLBACK_CHAINS.heavy.map(({ model, level }) => ({ model, level })), [
  { model: "gpt-6.1-terra", level: "inherit" },
  { model: "deepseek-v4.1-flash-fast", level: "xhigh" },
  { model: "claude-haiku-5-5", level: "xhigh" },
]);
assert.deepEqual(FALLBACK_CHAINS.builder.map(({ model, level }) => ({ model, level })), [
  { model: "gpt-6-luna", level: "inherit" },
  { model: "deepseek-v4.1-flash-fast", level: "high" },
  { model: "claude-haiku-5-5", level: "inherit" },
]);
for (const [id, name] of [["builder", "GPT-6 Luna"], ["heavy", "GPT-6.1 Terra"], ["sol", "GPT-6.1 Sol"], ["terra", "GPT-6.1 Terra"], ["luna", "GPT-6 Luna"]]) {
  const metadata = virtualModels.get(`fallback/${id}`);
  assert.equal(metadata.name, name, `${id} exposes its step-0 physical model name`);
  assert.equal(metadata.contextWindow, 272_000);
  assert.equal(metadata.maxTokens, 128_000);
  assert.deepEqual(metadata.input, ["text", "image"]);
}
assert.deepEqual(FALLBACK_CHAINS.conductor.map(({ provider, model, level }) => ({ provider, model, level })), [
  { provider: "refuseless", model: "deepseek-v4.1-flash-fast", level: "high" },
  { provider: "openai", model: "gpt-6.1-sol", level: "inherit" },
]);
assert.equal(FALLBACK_CHAINS.conductor[1].level, "inherit", "the Codex fallback mirrors the requested effort");
const conductor = virtualModels.get("fallback/conductor");
const builder = virtualModels.get("fallback/builder");
const registry = { find(provider, id) { return models.get(`${provider}/${id}`); } };
const conductorPrimary = conductor.route({ model: { provider: "fallback", id: "conductor" }, thinkingLevel: "high", messages: [{ role: "user", id: "u1" }], reason: "user" }, { modelRegistry: registry });
assert.equal(conductorPrimary.model.id, "deepseek-v4.1-flash-fast");
assert.equal(conductorPrimary.thinkingLevel, "high");
const conductorFallback = conductor.route({ model: { provider: "fallback", id: "conductor" }, thinkingLevel: "high", messages: [{ role: "user", id: "u1" }], reason: "continuation", state: { step: 1, runId: "u1" } }, { modelRegistry: registry });
assert.equal(conductorFallback.model.id, "gpt-6.1-sol");
assert.equal(conductorFallback.thinkingLevel, "high");
const baseRequest = { model: { provider: "fallback", id: "builder" }, thinkingLevel: "high", messages: [{ role: "user", id: "u1" }], reason: "user" };
const firstRoute = builder.route(baseRequest, { modelRegistry: registry });
assert.equal(firstRoute.model.id, "gpt-6-luna");
assert.equal(firstRoute.thinkingLevel, "high");
assert.deepEqual(published.at(-1), {
  channel: "model-fallback:routed",
  data: { provider: "openai", modelId: "gpt-6-luna" },
}, "the routed physical model is published for tier gating");
assert.deepEqual(Object.keys(published.at(-1).data).sort(), ["modelId", "provider"], "only provider and model id travel");
const fallbackRoute = builder.route({ ...baseRequest, reason: "continuation", state: firstRoute.state }, { modelRegistry: registry });
assert.equal(fallbackRoute.model.id, "gpt-6-luna", "continuation stays on the cache-owning primary");
const solFallback = virtualModels.get("fallback/sol").route({ ...baseRequest, model: { provider: "fallback", id: "sol" }, reason: "retry", state: { step: 0, runId: "u1" }, failed: { model: { provider: "openai", id: "gpt-6.1-sol" }, message: { stopReason: "error", errorMessage: "quota exceeded" } } }, { modelRegistry: registry });
assert.equal(solFallback.model.id, "claude-opus-5-5");
assert.equal(solFallback.thinkingLevel, "high", "SDK clamp preserves supported adaptive high effort");
assert.deepEqual(published.at(-1).data, { provider: "anthropic", modelId: "claude-opus-5-5" }, "the advanced step publishes its own physical model");
const terraFallback = virtualModels.get("fallback/terra").route({ ...baseRequest, model: { provider: "fallback", id: "terra" }, reason: "continuation", state: { step: 2, runId: "u1" } }, { modelRegistry: registry });
assert.equal(terraFallback.model.id, "claude-sonnet-5-5");
assert.equal(terraFallback.thinkingLevel, "high", "missing level-map key uses Anthropic's native high effort");
assert.equal(published.every(({ channel }) => channel === "model-fallback:routed"), true, "the router publishes on a single channel");

for (const chainId of ["luna"]) {
  const chain = FALLBACK_CHAINS[chainId];
  assert.deepEqual(chain.map(({ provider, model, level }) => ({ provider, model, level })), [
    { provider: "openai", model: "gpt-6-luna", level: "inherit" },
    { provider: "refuseless", model: "deepseek-v4.1-flash-fast", level: "high" },
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
  assert.equal(fallbackRoute.model.id, "deepseek-v4.1-flash-fast");
  assert.equal(fallbackRoute.thinkingLevel, "high", "inherit uses the requested level on fallback");
}

const settle = handlers.get("agent_before_settle");
const activeModel = { provider: "fallback", id: "builder" };
const activeStateEntry = { type: "custom", customType: VIRTUAL_MODEL_STATE_ENTRY, data: { provider: "fallback", modelId: "builder", state } };
const quotaBranch = [
  { type: "message", id: "u1", message: { role: "user", content: "work" } },
  activeStateEntry,
  { type: "message", id: "a1", message: { role: "assistant", provider: "openai", model: "gpt-6-luna", stopReason: "error", errorMessage: "insufficient_quota" } },
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
  const branch = [...quotaBranch.slice(0, -1), { type: "message", message: { role: "assistant", provider: "openai", model: "gpt-6-luna", stopReason: "error", errorMessage } }];
  assert.equal(settle({ outcome: "error", context: {} }, { model: activeModel, sessionManager: { getBranch: () => branch } }), undefined);
}
const exhaustedBranch = [
  ...quotaBranch.slice(0, -2),
  { type: "custom", customType: VIRTUAL_MODEL_STATE_ENTRY, data: { provider: "fallback", modelId: "builder", state: { step: 2, runId: "u1" } } },
  { type: "message", message: { role: "assistant", provider: "anthropic", model: "claude-haiku-5-5", stopReason: "error", errorMessage: "insufficient_quota" } },
];
assert.equal(settle({ outcome: "error", context: {} }, { model: activeModel, sessionManager: { getBranch: () => exhaustedBranch } }), undefined, "exhausted chain ends without looping");
assert.equal(settle({ outcome: "error", context: {} }, { model: { provider: "openai", id: "gpt-6-luna" }, sessionManager: { getBranch: () => quotaBranch } }), undefined);

// Deep fast: every chain starts on the fastest model, the scout chain drops to low effort, and
// the original steps stay as fallbacks in the same order.
assert.equal(DEEP_FAST_SETTINGS_KEY, "deepFastMode");
assert.deepEqual({ ...DEEP_FAST_PRIMARY }, { provider: "opengateway", model: "deepseek/deepseek-v4.1-flash-ultrafast" });
for (const chainId of Object.keys(FALLBACK_CHAINS)) {
  const base = FALLBACK_CHAINS[chainId];
  const fast = deepFastChain(chainId, base);
  assert.equal(fast.length, base.length, `${chainId} keeps its fallback count`);
  assert.equal(fast[0].provider, "opengateway", `${chainId} starts on the fast provider`);
  assert.equal(fast[0].model, "deepseek/deepseek-v4.1-flash-ultrafast", `${chainId} starts on the fast model`);
  assert.deepEqual(fast.slice(1), base.slice(1), `${chainId} preserves its existing fallbacks`);
  const expectedLevel = chainId === "luna" ? "low" : "inherit";
  assert.equal(fast[0].level, expectedLevel, `${chainId} uses ${expectedLevel} effort in deep fast`);
}

// Every other key and the file mode survive the preference write.
assert.equal(readDeepFast(settingsFile), false, "deep fast defaults to off");
writeDeepFast(settingsFile, true);
assert.equal(readDeepFast(settingsFile), true);
assert.equal(JSON.parse(fs.readFileSync(settingsFile, "utf8")).contextMode, "high", "unrelated settings are preserved");
writeDeepFast(settingsFile, false);
assert.equal(readDeepFast(settingsFile), false);
assert.equal(readDeepFast(path.join(os.tmpdir(), "no-such-settings.json")), false, "a missing file never enables speed mode");
fs.writeFileSync(settingsFile, "not json");
assert.equal(readDeepFast(settingsFile), false, "a malformed file never enables speed mode");
fs.writeFileSync(settingsFile, JSON.stringify({}));

// The command drives the same preference the router reads, and routing follows it immediately.
const deepFastCommand = commands.get("deep-fast");
assert.ok(deepFastCommand, "the deep-fast command is registered");
models.set(`opengateway/${DEEP_FAST_PRIMARY.model}`, {
  provider: "opengateway", id: DEEP_FAST_PRIMARY.model, reasoning: true,
  thinkingLevelMap: { off: null, minimal: "low", low: "low", medium: "medium", high: "high" },
});
const commandCtx = { hasUI: true, model: undefined, ui: { notify: (...args) => notified.push(args), select: async () => "Desligado" } };
const scoutRequest = { model: { provider: "fallback", id: "luna" }, thinkingLevel: "high", messages: [{ role: "user", id: "u1" }], reason: "user" };
handlers.get("session_start")({}, commandCtx);
assert.equal(virtualModels.get("fallback/luna").route(scoutRequest, { modelRegistry: registry }).model.provider, "openai", "off routes to the configured primary");

await deepFastCommand.handler("on", commandCtx);
assert.equal(readDeepFast(settingsFile), true, "on persists the preference");
const fastScout = virtualModels.get("fallback/luna").route(scoutRequest, { modelRegistry: registry });
assert.equal(fastScout.model.id, "deepseek/deepseek-v4.1-flash-ultrafast");
assert.equal(fastScout.thinkingLevel, "low", "scouts run at low effort in deep fast");
const fastBuilder = virtualModels.get("fallback/builder").route({ ...scoutRequest, model: { provider: "fallback", id: "builder" } }, { modelRegistry: registry });
assert.equal(fastBuilder.model.id, "deepseek/deepseek-v4.1-flash-ultrafast");
assert.equal(fastBuilder.thinkingLevel, "high", "builders keep the requested effort in deep fast");
assert.deepEqual(published.at(-1).data, { provider: "opengateway", modelId: DEEP_FAST_PRIMARY.model }, "the fast physical model is published for tier gating");

await deepFastCommand.handler("off", commandCtx);
assert.equal(readDeepFast(settingsFile), false, "off persists the preference");
assert.equal(virtualModels.get("fallback/luna").route(scoutRequest, { modelRegistry: registry }).model.provider, "openai", "off restores the configured primary");

// A machine without the opengateway provider falls through to the next resolvable step instead
// of failing the request when deep fast is on.
const offlineRegistry = { find: (provider, id) => provider === "opengateway" ? undefined : models.get(`${provider}/${id}`) };
models.delete(`opengateway/${DEEP_FAST_PRIMARY.model}`);
handlers.get("session_start")({}, commandCtx);
await deepFastCommand.handler("on", commandCtx);
const degraded = virtualModels.get("fallback/luna").route(scoutRequest, { modelRegistry: offlineRegistry });
assert.equal(degraded.model.provider, "refuseless", "an unavailable fast primary advances instead of throwing");
assert.equal(degraded.state.step, 1, "the advanced step is recorded");
await deepFastCommand.handler("off", commandCtx);

console.log("model-fallback smoke: PASS");

import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. Provider-free; synthetic settings only in a
// fresh mkdtemp root, removed in finally. Installed SDK/catalog and repository files are read-only;
// Jiti's filesystem cache is disabled. No credentials, real settings or sessions are loaded.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const require = createRequire(import.meta.url);
const jitiPath = path.join(resolvePiSdkRoot(import.meta.url), "node_modules/jiti/lib/jiti.cjs");
const { createJiti } = require(jitiPath);
const sdkAlias = { "@earendil-works/pi-coding-agent": path.join(resolvePiSdkRoot(import.meta.url), "dist/index.js") };
const jiti = createJiti(import.meta.url, { fsCache: false, alias: sdkAlias });
const mod = await jiti.import(path.join(root, "extensions/context-mode.ts"));
const fs = await import("node:fs");
const os = await import("node:os");

assert.equal(mod.ANTHROPIC_NATIVE_CONTEXT_WINDOW, 1_000_000);
assert.equal(mod.ANTHROPIC_APPLIED_CONTEXT_WINDOW, 450_000);
assert.equal(mod.HIGH_CONTEXT_WINDOW, 800_000);

// Conductor applies 70% after normal/default or High policy and never changes output limits.
for (const [modelInput, mode, expected, normal] of [
  [{ provider: "openai-codex", id: "gpt-6.1-sol", contextWindow: 300_000 }, "default", 210_000, 300_000],
  [{ provider: "anthropic", id: "claude-opus-5", contextWindow: 1_000_000 }, "default", 315_000, 450_000],
  [{ provider: "anthropic", id: "claude-opus-5", contextWindow: 450_000 }, "default", 315_000, 450_000],
  [{ provider: "openai-codex", id: "gpt-6.1-sol", contextWindow: 300_000 }, "high", 560_000, 800_000],
  [{ provider: "openai-codex", id: "gpt-5.6-sol", contextWindow: 300_000 }, "high", 210_000, 300_000],
  [{ provider: "alibaba-plan", id: "qwen3.8-max-preview", contextWindow: 1_000_000 }, "default", 140_000, 200_000],
]) {
  const copy = { ...modelInput, maxTokens: 128_000 };
  assert.equal(mod.applyContextMode(copy, mode, true), true);
  assert.equal(copy.contextWindow, expected);
  assert.equal(copy.maxTokens, 128_000);
  assert.equal(mod.applyContextMode(copy, mode, true), false, "reapplication does not compound");
  assert.equal(copy.contextWindow, expected);
  assert.equal(mod.applyContextMode(copy, mode, false), true, "standard branch restores normal policy window");
  assert.equal(copy.contextWindow, normal);
  assert.equal(mod.applyContextMode(copy, mode, true), true);
  assert.equal(copy.contextWindow, expected, "conductor reapplication after restore is stable");
}


// default mode: native 1M Anthropic windows are capped to 450K; nothing else changes.
const native = {
  provider: "anthropic",
  id: "claude-opus-5",
  contextWindow: mod.ANTHROPIC_NATIVE_CONTEXT_WINDOW,
  maxTokens: 128_000,
  compat: { forceAdaptiveThinking: true },
  cost: { input: 5, output: 25 },
};
assert.equal(mod.applyContextMode(native, "default"), true);
assert.equal(native.contextWindow, 450_000);
assert.equal(native.maxTokens, 128_000);
assert.deepEqual(native.compat, { forceAdaptiveThinking: true });
assert.deepEqual(native.cost, { input: 5, output: 25 });
assert.equal(mod.applyContextMode(native, "default"), false);
for (const unchanged of [
  { provider: "anthropic", id: "claude-opus-5-5", contextWindow: 450_000 },
  { provider: "anthropic", id: "claude-x", contextWindow: 200_000 },
  { provider: "openai-codex", id: "gpt-6.1-sol", contextWindow: 300_000 },
  { provider: "openai-codex", id: "gpt-6.1-sol", contextWindow: 1_000_000 },
  { provider: "anthropic", id: "claude-x", contextWindow: 999_999 },
]) {
  const before = structuredClone(unchanged);
  assert.equal(mod.applyContextMode(unchanged, "default"), false);
  assert.deepEqual(unchanged, before);
}

// Eligibility for high: GPT >= 6 and Claude >= 5 on first-party providers only.
const eligible = [
  ["openai-codex", "gpt-6.1-sol"], ["openai-codex", "gpt-6-astra"], ["openai-codex", "gpt-6-sol"], ["openai-codex", "gpt-6-luna"],
  ["openai", "gpt-6.1-sol"], ["anthropic", "claude-opus-5-5"], ["anthropic", "claude-sonnet-5-5"], ["anthropic", "claude-fable-5-1"],
  ["anthropic", "claude-opus-5"], ["anthropic", "claude-haiku-5-5"],
];
const ineligible = [
  ["openai-codex", "gpt-5.6-sol"], ["openai-codex", "gpt-5.5"], ["anthropic", "claude-opus-4-8"], ["anthropic", "claude-sonnet-4-6"],
  ["openrouter", "gpt-6.1-sol"], ["cursor", "claude-opus-5-5"], ["alibaba-plan", "qwen3.8-max"], ["openai-codex", "gpt-oss-120b"],
];
for (const [provider, id] of eligible) assert.equal(mod.isHighContextModel({ provider, id }), true, `${provider}/${id} eligible`);
for (const [provider, id] of ineligible) assert.equal(mod.isHighContextModel({ provider, id }), false, `${provider}/${id} not eligible`);

// high raises eligible models to 800K and default restores their own value, even across a reload.
const sol = { provider: "openai-codex", id: "gpt-6.1-sol", contextWindow: 300_000, maxTokens: 128_000 };
const opusNative = { provider: "anthropic", id: "claude-opus-5-5", contextWindow: 1_000_000 };
const old = { provider: "openai-codex", id: "gpt-5.6-sol", contextWindow: 300_000 };
for (const model of [sol, opusNative, old]) mod.applyContextMode(model, "high");
assert.deepEqual([sol.contextWindow, opusNative.contextWindow, old.contextWindow], [800_000, 800_000, 300_000]);
assert.equal(sol.maxTokens, 128_000, "maxTokens untouched");
const reloaded = await createJiti(import.meta.url, { fsCache: false, moduleCache: false, alias: sdkAlias }).import(path.join(root, "extensions/context-mode.ts"));
for (const model of [sol, opusNative, old]) reloaded.applyContextMode(model, "default");
assert.deepEqual([sol.contextWindow, opusNative.contextWindow, old.contextWindow], [300_000, 450_000, 300_000]);
const acrossReload = { provider: "openai-codex", id: "gpt-6.1-sol", contextWindow: 300_000 };
mod.applyContextMode(acrossReload, "default", true);
assert.equal(reloaded.applyContextMode(acrossReload, "default", true), false);
assert.equal(acrossReload.contextWindow, 210_000, "reload preserves original window without compounding");
const qwenMarkedOld = { provider: "alibaba-plan", id: "qwen3.8-max-preview", contextWindow: 200_000 };
Object.defineProperty(qwenMarkedOld, Symbol.for("evolvera.context-mode.default-window"), { value: 1_000_000, configurable: true });
assert.equal(mod.applyContextMode(qwenMarkedOld, "default", true), true);
assert.equal(qwenMarkedOld.contextWindow, 140_000, "legacy Qwen marker cannot resurrect uncapped window");
assert.equal(mod.applyContextMode(qwenMarkedOld, "default", false), true);
assert.equal(qwenMarkedOld.contextWindow, 200_000);
assert.deepEqual(Object.keys(sol), ["provider", "id", "contextWindow", "maxTokens"], "default marker is not enumerable");

const anthropicCatalogPath = path.join(resolvePiSdkRoot(import.meta.url), "node_modules/@earendil-works/pi-ai/dist/providers/data/anthropic.json");
const anthropicCatalog = JSON.parse(readFileSync(anthropicCatalogPath, "utf8"))["anthropic-messages"];
const catalogNativeModels = Object.values(anthropicCatalog).filter(
  (model) => model.contextWindow === mod.ANTHROPIC_NATIVE_CONTEXT_WINDOW,
);
assert.ok(catalogNativeModels.some((model) => model.id === "claude-opus-5"));
for (const catalogModel of catalogNativeModels) {
  const model = structuredClone(catalogModel);
  const originalMaxTokens = model.maxTokens;
  assert.equal(mod.applyContextMode(model, "default"), true, model.id);
  assert.equal(model.contextWindow, 450_000, model.id);
  assert.equal(model.maxTokens, originalMaxTokens, model.id);
}

// Settings persistence: only contextMode changes; invalid or missing values mean default.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "context-mode-"));
try {
  const settingsPath = path.join(tmp, "settings.json");
  assert.equal(mod.readContextMode(settingsPath), "default");
  fs.writeFileSync(settingsPath, JSON.stringify({ theme: "cyberpsycho", contextMode: "bogus" }), { mode: 0o640 });
  assert.equal(mod.readContextMode(settingsPath), "default");
  const originalMode = fs.statSync(settingsPath).mode & 0o777;
  mod.writeContextMode(settingsPath, "high");
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, "utf8")), { theme: "cyberpsycho", contextMode: "high" });
  assert.equal(fs.statSync(settingsPath).mode & 0o777, originalMode, "file mode preserved");
  assert.equal(mod.readContextMode(settingsPath), "high");
  assert.deepEqual(fs.readdirSync(tmp), ["settings.json"], "no temp leftovers");
  assert.equal(mod.parseContextMode("padrão"), "default");
  assert.equal(mod.parseContextMode("HIGH"), "high");

  // Extension wiring with a fake PI: session start reads the mode, the command switches it live.
  const handlers = new Map(); const commands = new Map(); const statuses = new Map(); const notices = [];
  const eventHandlers = new Map();
  mod.default({ on: (name, fn) => handlers.set(name, fn), registerCommand: (name, def) => commands.set(name, def), events: { on: (name, fn) => { eventHandlers.set(name, fn); return () => eventHandlers.delete(name); } } }, () => settingsPath);
  const current = { provider: "openai-codex", id: "gpt-6.1-sol", contextWindow: 300_000 };
  let choice;
  const ctx = {
    model: current, hasUI: true,
    ui: {
      setStatus: (k, v) => (v === undefined ? statuses.delete(k) : statuses.set(k, v)),
      notify: (m, t) => notices.push({ m, t }),
      select: async (_title, options) => { assert.deepEqual(options, ["Padrão", "High"]); return choice; },
    },
  };
  await handlers.get("session_start")({}, ctx);
  assert.equal(current.contextWindow, 800_000);
  const beforeMalformed = { window: current.contextWindow, statuses: new Map(statuses) };
  for (const malformed of [undefined, null, "unexpected", 12]) eventHandlers.get("orchestration-mode:changed")(malformed);
  assert.equal(current.contextWindow, beforeMalformed.window, "malformed mode notifications are ignored");
  assert.deepEqual(statuses, beforeMalformed.statuses);
  assert.equal(statuses.get("context-mode"), "800K");
  await commands.get("context-mode").handler("default", ctx);
  assert.equal(current.contextWindow, 300_000);
  assert.equal(statuses.has("context-mode"), false);
  assert.equal(mod.readContextMode(settingsPath), "default");
  const picked = { provider: "anthropic", id: "claude-sonnet-5-5", contextWindow: 450_000 };
  ctx.model = picked;
  await handlers.get("model_select")({ model: picked }, ctx);
  assert.equal(picked.contextWindow, 450_000);
  await commands.get("context-mode").handler("high", ctx);
  await handlers.get("model_select")({ model: picked }, ctx);
  assert.equal(picked.contextWindow, 800_000);
  await commands.get("context-mode").handler("status", ctx);
  assert.match(notices.at(-1).m, /Context mode: HIGH · claude-sonnet-5-5 800K/);
  await commands.get("context-mode").handler("bogus", ctx);
  assert.equal(notices.at(-1).t, "error");
  assert.equal(mod.readContextMode(settingsPath), "high", "invalid argument does not change the saved mode");

  // Unsupported selection must never display a false 800K badge.
  ctx.model = { provider: "anthropic", id: "claude-sonnet-4-6", contextWindow: 1_000_000 };
  await handlers.get("model_select")({ model: ctx.model }, ctx);
  assert.equal(ctx.model.contextWindow, 450_000);
  assert.equal(statuses.has("context-mode"), false);
  ctx.model = { provider: "openai-codex", id: "gpt-6.1-sol", contextWindow: 300_000 };
  await handlers.get("before_agent_start")({}, ctx);
  assert.equal(ctx.model.contextWindow, 800_000, "same-model replacement is corrected before requests");
  assert.equal(statuses.get("context-mode"), "800K");

  // A conductor child (PI_REPORT_RUN) starts on the default window even though High is saved, and never saves.
  mod.writeContextMode(settingsPath, "high");
  assert.equal(mod.isConductorChild({}), false);
  assert.equal(mod.isConductorChild({ PI_REPORT_RUN: "bogus" }), false);
  assert.equal(mod.isConductorChild({ PI_REPORT_RUN: "run_abc123" }), true);
  const previousRun = process.env.PI_REPORT_RUN;
  process.env.PI_REPORT_RUN = "run_abc123";
  try {
    const childCtx = { model: { provider: "openai-codex", id: "gpt-6.1-sol", contextWindow: 300_000 }, hasUI: true, ui: ctx.ui };
    await handlers.get("session_start")({}, childCtx);
    assert.equal(childCtx.model.contextWindow, 300_000, "conductor child ignores the saved High preference");
    await commands.get("context-mode").handler("default", childCtx);
    assert.equal(mod.readContextMode(settingsPath), "high", "a conductor child never rewrites the saved preference");
  } finally {
    if (previousRun === undefined) delete process.env.PI_REPORT_RUN; else process.env.PI_REPORT_RUN = previousRun;
  }
  await handlers.get("session_start")({}, ctx);
  assert.equal(ctx.model.contextWindow, 800_000, "the user's own session still reads High");

  choice = undefined;
  await commands.get("context-mode").handler("", ctx);
  assert.equal(mod.readContextMode(settingsPath), "high", "cancelling picker preserves saved preference");
  choice = "Padrão";
  await commands.get("context-mode").handler("", ctx);
  assert.equal(ctx.model.contextWindow, 300_000);
  assert.equal(mod.readContextMode(settingsPath), "default");
  choice = "High";
  await commands.get("context-mode").handler("", ctx);
  assert.equal(ctx.model.contextWindow, 800_000);
  assert.equal(mod.readContextMode(settingsPath), "high");

  fs.writeFileSync(settingsPath, "invalid JSON");
  await commands.get("context-mode").handler("default", ctx);
  assert.equal(notices.at(-1).t, "error", "failed save does not change live mode");
  assert.equal(ctx.model.contextWindow, 800_000);
  assert.equal(fs.readFileSync(settingsPath, "utf8"), "invalid JSON", "invalid settings remain unchanged");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const modelsConfig = JSON.parse(read("config/models.json"));
const runtimeModelsConfig = JSON.parse(read("models.json"));
assert.deepEqual(runtimeModelsConfig, modelsConfig);
const haiku55 = modelsConfig.providers.anthropic.models.find(({ id }) => id === "claude-haiku-5-5");
assert.deepEqual(haiku55, {
  id: "claude-haiku-5-5",
  name: "Claude Haiku 5.5",
  api: "anthropic-messages",
  reasoning: true,
  thinkingLevelMap: { minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
  input: ["text", "image"],
  contextWindow: 1_000_000,
  maxTokens: 128_000,
  cost: {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
    tiers: [{ inputTokensAbove: 100_000, input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 }],
  },
  compat: { forceAdaptiveThinking: true, supportsStrictTools: true },
  promptCache: { short: 300, long: 3600 },
});
assert.equal(modelsConfig.providers.refuseless.models.find(({ id }) => id === "deepseek-v4.1-flash-fast").reasoning, true);

const fable51 = modelsConfig.providers.anthropic.models.find(({ id }) => id === "claude-fable-5-1");
assert.deepEqual(fable51, {
  id: "claude-fable-5-1",
  name: "Claude Fable 5.1",
  api: "anthropic-messages",
  reasoning: true,
  thinkingLevelMap: { off: null, xhigh: "xhigh", max: "max" },
  input: ["text", "image"],
  contextWindow: 450_000,
  maxTokens: 128_000,
  cost: { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  compat: { forceAdaptiveThinking: true, supportsStrictTools: true },
  // Custom definitions must keep the built-in cache lifetime, or PI's cache warmer never runs for them.
  promptCache: { short: 300, long: 3600 },
});
const opus55 = modelsConfig.providers.anthropic.models.find(({ id }) => id === "claude-opus-5-5");
assert.deepEqual(opus55, {
  id: "claude-opus-5-5",
  name: "Claude Opus 5.5",
  api: "anthropic-messages",
  reasoning: true,
  thinkingLevelMap: { off: null, xhigh: "xhigh", max: "max" },
  input: ["text", "image"],
  contextWindow: 450_000,
  maxTokens: 128_000,
  cost: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  compat: { forceAdaptiveThinking: true, supportsStrictTools: true },
  // Custom definitions must keep the built-in cache lifetime, or PI's cache warmer never runs for them.
  promptCache: { short: 300, long: 3600 },
});
assert.deepEqual(
  modelsConfig.providers.anthropic.models.find(({ id }) => id === "claude-sonnet-5-5").promptCache,
  { short: 300, long: 3600 },
  "custom Sonnet must keep the built-in cache lifetime",
);
assert.deepEqual(
  JSON.parse(read("models.json")).providers.anthropic,
  modelsConfig.providers.anthropic,
);
const codexModels = modelsConfig.providers["openai-codex"].models;
const runtimeCodexModels = JSON.parse(read("models.json")).providers["openai-codex"].models;
const gpt6CodexExpectations = {
  "gpt-6-sol": { name: "GPT-6 Sol", cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 } },
  "gpt-6-luna": { name: "GPT-6 Luna", cost: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 } },
};
for (const [id, expected] of Object.entries(gpt6CodexExpectations)) {
  const model = codexModels.find((entry) => entry.id === id);
  assert.deepEqual(model, {
    api: "openai-codex-responses",
    baseUrl: "https://chatgpt.com/backend-api",
    reasoning: true,
    thinkingLevelMap: {
      off: null, minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max",
    },
    input: ["text", "image"],
    contextWindow: 300_000,
    maxTokens: 128_000,
    id,
    name: expected.name,
    cost: expected.cost,
  });
  assert.deepEqual(runtimeCodexModels.find((entry) => entry.id === id), model, `${id} drifted between models.json and config/models.json`);
}
const gpt56CodexModels = codexModels.filter(({ id }) => id.startsWith("gpt-5.6-"));
assert.deepEqual(gpt56CodexModels.map(({ id }) => id), ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
for (const model of gpt56CodexModels) {
  assert.equal(model.thinkingLevelMap.max, "max", `${model.id} must expose max reasoning effort`);
}

const fallbackAgentRoutes = {
  "agents/scout.md": "fallback/luna",
  "agents/builder-light.md": "fallback/luna",
  "agents/general-purpose.md": "fallback/luna",
  "agents/deep-research-creative.md": "fallback/luna",
  "agents/deep-research-critical.md": "fallback/luna",
  "agents/deep-research-explorer.md": "fallback/luna",
  "agents/deep-research-methodical.md": "fallback/luna",
  "agents/deep-research-skeptical.md": "fallback/luna",
  "agents/builder.md": "fallback/builder",
  "agents/builder-heavy.md": "fallback/heavy",
  "agents/planner.md": "fallback/sol",
  "agents/plan-briefer.md": "fallback/sol",
  "agents/bug-hunt.md": "fallback/sol",
  "agents/app-validator.md": "fallback/terra",
  "agents/qa.md": "fallback/terra",
  "agents/validator.md": "fallback/terra",
  "agents/deep-research-auditor.md": "fallback/terra",
  "agents/deep-research-data.md": "fallback/terra",
  "agents/website-creative.md": "fallback/terra",
};
for (const [relativePath, model] of Object.entries(fallbackAgentRoutes)) {
  assert.ok(read(relativePath).split("---", 3)[1].split("\n").some((line) => line.trim() === `model: ${model}`));
}

const expectedRoutes = {
  "agents/builder-design.md": { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", thinking: "high" },
  "agents/builder-heavy-design.md": { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", thinking: "xhigh" },
  "agents/website-designer.md": { id: "claude-opus-5-5", label: "Claude Opus 5.5", thinking: "xhigh" },
  "agents/plan-briefer-fable.md": { id: "claude-opus-5-5", label: "Claude Opus 5.5", thinking: "high" },
};
for (const [relativePath, route] of Object.entries(expectedRoutes)) {
  const frontmatter = read(relativePath).split("---", 3)[1];
  assert.match(frontmatter, new RegExp(`^model: anthropic/${route.id}$`, "m"));
  assert.match(frontmatter, new RegExp(`^thinking: ${route.thinking}$`, "m"));
  assert.match(frontmatter, new RegExp(`Model: anthropic/${route.id} ${route.thinking}\\.`));
  assert.match(frontmatter, new RegExp(`${route.label} · ${route.thinking}`));
}
const fable = read("agents/plan-briefer-fable.md");
assert.match(fable, /^name: plan-briefer-fable$/m);
assert.match(fable, /brief_fable\.md/);

assert.equal(Object.keys(expectedRoutes).some((relativePath) => /home/i.test(relativePath)), false);
const preservedHomeRoutes = {
  "agents/builder-home.md": "minimax/MiniMax-M3",
  "agents/seo-content-writer-home.md": "zai/glm-5.2",
  "agents/validator-home.md": "minimax/MiniMax-M3",
  "agents/website-home-designer.md": "zai/glm-5.2",
  "agents/website-home-planner.md": "zai/glm-5.2",
  "agents/website-polisher-home.md": "minimax/MiniMax-M3",
};
for (const [relativePath, model] of Object.entries(preservedHomeRoutes)) {
  const frontmatter = read(relativePath).split("---", 3)[1];
  assert.match(frontmatter, new RegExp(`^model: ${model.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, "m"));
  assert.doesNotMatch(frontmatter, /claude-opus-5/);
}
assert.match(read("agents/builder-heavy.md"), /^model: fallback\/heavy$/m);
assert.match(read("agents/builder-heavy.md"), /^thinking: medium$/m);
assert.match(read("agents/builder-heavy.md"), /Model: openai-codex\/gpt-6\.1-terra medium\./);
assert.match(read("agents/builder-heavy.md"), /GPT-6\.1 Terra · medium/);
for (const preservedPath of ["agents/builder-light.md", "agents/plan-briefer.md"]) {
  assert.match(read(preservedPath), /^model: (?!.*claude-opus-5).*$/m);
}

assert.match(read("install.sh"), /PI_CODING_AGENT_VERSION=\"\$\{PI_CODING_AGENT_VERSION:-0\.83\.0\}\"/);
assert.match(read("install.ps1"), /\$PI_CODING_AGENT_VERSION = \"0\.83\.0\"/);
assert.doesNotMatch(read("install.sh"), /0\.80\.10/);
assert.doesNotMatch(read("install.ps1"), /0\.80\.10/);
assert.doesNotMatch(read("install.ps1"), /pi-xai-oauth|PI_XAI_OAUTH_VERSION/i);
assert.match(read("README.md"), /0\.83\.0/);
assert.doesNotMatch(read("README.md"), /0\.80\.10/);
assert.match(read("README.md"), /fnm 22\.22\.3/);
assert.match(read("README.md"), /450K/);

const agentGuide = read("skills/agent-guide/SKILL.md");
assert.match(agentGuide, /\| Design \| `builder-design` \| Normal design tier \(Claude Sonnet 5\.5 high\) \|/);
assert.match(agentGuide, /\| Heavy Design \| `builder-heavy-design` \| Exceptional design tier \(Claude Sonnet 5\.5 xhigh\) \|/);
assert.match(agentGuide, /\| Heavy \| `builder-heavy` \| Exceptional local-integration\/correctness tier \(GPT-6\.1 Terra medium\) \|/);

console.log("anthropic-model-policy smoke: PASS");

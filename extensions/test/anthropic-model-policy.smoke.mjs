import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// STATEFUL RESOURCE PROOF: NO_STATEFUL_RESOURCES. This smoke test is provider-free and uses no persistent resources.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const require = createRequire(import.meta.url);
const jitiPath = path.resolve(
  root,
  "../../npm-global/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.cjs",
);
const { createJiti } = require(jitiPath);
const jiti = createJiti(import.meta.url);
const mod = await jiti.import(path.join(root, "extensions/anthropic-context-limit.ts"));

assert.equal(mod.ANTHROPIC_NATIVE_CONTEXT_WINDOW, 1_000_000);
assert.equal(mod.ANTHROPIC_APPLIED_CONTEXT_WINDOW, 450_000);

const native = {
  provider: "anthropic",
  id: "claude-opus-5",
  contextWindow: mod.ANTHROPIC_NATIVE_CONTEXT_WINDOW,
  maxTokens: 128_000,
  compat: { forceAdaptiveThinking: true },
  cost: { input: 5, output: 25 },
};
assert.equal(mod.applyAnthropicContextLimit(native), true);
assert.equal(native.contextWindow, 450_000);
assert.equal(native.maxTokens, 128_000);
assert.deepEqual(native.compat, { forceAdaptiveThinking: true });
assert.deepEqual(native.cost, { input: 5, output: 25 });
assert.equal(mod.applyAnthropicContextLimit(native), false);

for (const unchanged of [
  { provider: "anthropic", contextWindow: 200_000 },
  { provider: "anthropic", contextWindow: 450_000 },
  { provider: "openai-codex", contextWindow: 1_000_000 },
  { provider: "anthropic", contextWindow: 999_999 },
]) {
  const before = structuredClone(unchanged);
  assert.equal(mod.applyAnthropicContextLimit(unchanged), false);
  assert.deepEqual(unchanged, before);
}

const anthropicCatalogPath = path.resolve(
  root,
  "../../npm-global/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/data/anthropic.json",
);
const anthropicCatalog = JSON.parse(readFileSync(anthropicCatalogPath, "utf8"))["anthropic-messages"];
const catalogNativeModels = Object.values(anthropicCatalog).filter(
  (model) => model.contextWindow === mod.ANTHROPIC_NATIVE_CONTEXT_WINDOW,
);
assert.ok(catalogNativeModels.some((model) => model.id === "claude-opus-5"));
for (const catalogModel of catalogNativeModels) {
  const model = structuredClone(catalogModel);
  const originalMaxTokens = model.maxTokens;
  assert.equal(mod.applyAnthropicContextLimit(model), true, model.id);
  assert.equal(model.contextWindow, 450_000, model.id);
  assert.equal(model.maxTokens, originalMaxTokens, model.id);
}

const sessionNative = { provider: "anthropic", contextWindow: 1_000_000 };
const sessionOther = { provider: "anthropic", contextWindow: 200_000 };
const sessionRegistry = [sessionNative, sessionOther];
const selectedAtStart = { provider: "anthropic", contextWindow: 1_000_000 };
const handlers = new Map();
const fakePi = { on(name, handler) { handlers.set(name, handler); } };
mod.default(fakePi);
assert.ok(handlers.has("session_start"));
assert.ok(handlers.has("model_select"));
await handlers.get("session_start")({}, {
  model: selectedAtStart,
  modelRegistry: { getAll: () => sessionRegistry },
});
assert.equal(sessionNative.contextWindow, 450_000);
assert.equal(sessionOther.contextWindow, 200_000);
assert.equal(selectedAtStart.contextWindow, 450_000);

const selected = { provider: "anthropic", contextWindow: 1_000_000 };
await handlers.get("model_select")({ model: selected }, {});
assert.equal(selected.contextWindow, 450_000);

const modelsConfig = JSON.parse(read("config/models.json"));
const runtimeModelsConfig = JSON.parse(read("models.json"));
assert.deepEqual(runtimeModelsConfig, modelsConfig);
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
});
const gpt56CodexModels = modelsConfig.providers["openai-codex"].models.filter(({ id }) => id.startsWith("gpt-5.6-"));
assert.deepEqual(gpt56CodexModels.map(({ id }) => id), ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
for (const model of gpt56CodexModels) {
  assert.equal(model.thinkingLevelMap.max, "max", `${model.id} must expose max reasoning effort`);
}

const expectedRoutes = {
  "agents/builder-design.md": { thinking: "medium" },
  "agents/builder-heavy-design.md": { thinking: "high" },
  "agents/website-designer.md": { thinking: "xhigh" },
  "agents/plan-briefer-fable.md": { thinking: "high" },
};
for (const [relativePath, route] of Object.entries(expectedRoutes)) {
  const frontmatter = read(relativePath).split("---", 3)[1];
  assert.match(frontmatter, /^model: anthropic\/claude-opus-5$/m);
  assert.match(frontmatter, new RegExp(`^thinking: ${route.thinking}$`, "m"));
  assert.match(frontmatter, new RegExp(`Model: anthropic/claude-opus-5 ${route.thinking}\\.`));
  assert.match(frontmatter, new RegExp(`Claude Opus 5 · ${route.thinking}`));
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
assert.match(read("agents/builder-heavy.md"), /^model: openai-codex\/gpt-5\.6-luna$/m);
assert.match(read("agents/builder-heavy.md"), /^thinking: max$/m);
for (const preservedPath of ["agents/builder-light.md", "agents/plan-briefer.md"]) {
  assert.match(read(preservedPath), /^model: (?!.*claude-opus-5).*$/m);
}

assert.match(read("install.sh"), /PI_CODING_AGENT_VERSION=\"\$\{PI_CODING_AGENT_VERSION:-0\.82\.1\}\"/);
assert.match(read("install.ps1"), /\$PI_CODING_AGENT_VERSION = \"0\.82\.1\"/);
assert.doesNotMatch(read("install.sh"), /0\.80\.10/);
assert.doesNotMatch(read("install.ps1"), /0\.80\.10/);
assert.doesNotMatch(read("install.ps1"), /pi-xai-oauth|PI_XAI_OAUTH_VERSION/i);
assert.match(read("README.md"), /0\.82\.1/);
assert.doesNotMatch(read("README.md"), /0\.80\.10/);
assert.match(read("README.md"), /fnm 22\.22\.3/);
assert.match(read("README.md"), /450K/);

const agentGuide = read("skills/agent-guide/SKILL.md");
assert.match(agentGuide, /\| Design \| `builder-design` \| Normal design tier \(Claude Opus 5 medium\) \|/);
assert.match(agentGuide, /\| Heavy Design \| `builder-heavy-design` \| Exceptional design tier \(Claude Opus 5 high\) \|/);

console.log("anthropic-model-policy smoke: PASS");

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const { effectiveDispatchModel, isHighContextModel, isHighContextDispatchModel, applyContextMode } = await jiti.import(path.join(root, "extensions/context-mode.ts"));

const virtual = { provider: "fallback", id: "heavy", contextWindow: 300_000 };
const routed = (provider, modelId) => effectiveDispatchModel(virtual, { provider, modelId });
const terra = routed("openai-codex", "gpt-6.1-terra");
assert.equal(isHighContextModel(terra), true, "routed Terra is high-context eligible");
assert.equal(isHighContextDispatchModel(virtual, { provider: "openai-codex", modelId: "gpt-6.1-terra" }), true);
const rewritten = { ...terra, contextWindow: 300_000 };
assert.equal(applyContextMode(rewritten, "high"), true);
assert.equal(rewritten.contextWindow, 800_000);
for (const [provider, id] of [["refuseless", "deepseek-v4.1-flash-fast"], ["anthropic", "claude-haiku-5-5"]]) {
  const model = routed(provider, id);
  assert.equal(isHighContextDispatchModel(virtual, { provider, modelId: id }), false, `${provider}/${id} is not high-context eligible`);
}
const physical = { provider: "openai-codex", id: "gpt-6.1-terra" };
assert.equal(effectiveDispatchModel(physical, { provider: "anthropic", modelId: "claude-haiku-5-5" }), physical, "physical selection is unchanged");
assert.equal(effectiveDispatchModel(virtual, undefined), virtual, "missing route preserves prior selection decision");
assert.equal(isHighContextModel(effectiveDispatchModel(virtual, undefined)), false);
console.log("context-mode pure routing smoke: PASS");

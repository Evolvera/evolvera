import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
const mod = await jiti.import(path.join(root, "extensions/deep-fast.ts"));
const router = await jiti.import(path.join(root, "extensions/model-fallback.ts"));

const {
  default: register,
  deepFastChain,
  effectiveChain,
  fastModelUsable,
  readDeepFast,
  writeDeepFast,
  resolveDeepFastChain,
  DEEP_FAST_CHAINS,
  DEEP_FAST_MODEL,
  DEEP_FAST_PROVIDER,
  DEEP_FAST_SETTINGS_KEY,
  DEEP_FAST_TARGET,
} = mod;
const { FALLBACK_CHAINS } = router;

// --- Policy --------------------------------------------------------------------------------
assert.equal(DEEP_FAST_SETTINGS_KEY, "deepFastMode");
assert.equal(DEEP_FAST_TARGET, `${DEEP_FAST_PROVIDER}/${DEEP_FAST_MODEL}`);
assert.deepEqual(Object.keys(DEEP_FAST_CHAINS).sort(), ["builder", "heavy", "luna"], "only the workhorse chains are accelerated");
assert.equal(DEEP_FAST_CHAINS.luna.thinking, "low", "scouts run at low effort");
assert.equal(DEEP_FAST_CHAINS.builder.thinking, "inherit", "builders keep the effort their agent declares");
assert.equal(DEEP_FAST_CHAINS.heavy.thinking, "inherit");

// The configured setup is untouched by the policy itself.
assert.deepEqual(
  FALLBACK_CHAINS.luna.map(({ provider, model }) => ({ provider, model })),
  [{ provider: "openai", model: "gpt-6-luna" }, { provider: "refuseless", model: "deepseek-v4.1-flash-fast" }],
  "the configured luna chain still starts on its primary",
);

const on = { enabled: true, usable: true };
const off = { enabled: false, usable: true };

for (const chainId of ["luna", "builder", "heavy"]) {
  const fast = effectiveChain(chainId, FALLBACK_CHAINS[chainId], on);
  assert.equal(fast[0].provider, DEEP_FAST_PROVIDER, `${chainId} starts on the fast provider`);
  assert.equal(fast[0].model, DEEP_FAST_MODEL, `${chainId} starts on the fast model`);
  assert.equal(fast[0].level, DEEP_FAST_CHAINS[chainId].thinking, `${chainId} uses its deep-fast effort`);
  assert.equal(fast.length, FALLBACK_CHAINS[chainId].length + 1, `${chainId} keeps every configured attempt`);
  assert.deepEqual(
    fast.slice(1).map((s) => `${s.provider}/${s.model}`),
    FALLBACK_CHAINS[chainId].map((s) => `${s.provider}/${s.model}`),
    `${chainId} preserves the configured attempts as fallbacks`,
  );
}

// Judgment chains are deliberately out of scope.
for (const chainId of ["sol", "terra", "conductor"]) {
  assert.deepEqual(effectiveChain(chainId, FALLBACK_CHAINS[chainId], on), FALLBACK_CHAINS[chainId], `${chainId} is untouched`);
}
// Off, and on-without-a-usable-router, both serve the configured chain.
assert.deepEqual(effectiveChain("luna", FALLBACK_CHAINS.luna, off), FALLBACK_CHAINS.luna, "off changes nothing");
assert.deepEqual(effectiveChain("luna", FALLBACK_CHAINS.luna, { enabled: true, usable: false }), FALLBACK_CHAINS.luna, "no key, no swap");

// fastModelUsable requires both a registered model and its credential.
assert.equal(fastModelUsable(undefined), false);
assert.equal(fastModelUsable({ find: () => undefined, hasConfiguredAuth: () => true }), false);
assert.equal(fastModelUsable({ find: () => ({}), hasConfiguredAuth: () => false }), false);
assert.equal(fastModelUsable({ find: () => ({}), hasConfiguredAuth: () => true }), true);



// --- Preference persistence ----------------------------------------------------------------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deep-fast-smoke-"));
const settingsFile = path.join(dir, "settings.json");
fs.writeFileSync(settingsFile, JSON.stringify({ contextMode: "high", defaultProvider: "openai" }));

assert.equal(readDeepFast(settingsFile), false, "off by default");
writeDeepFast(settingsFile, true);
assert.equal(readDeepFast(settingsFile), true);
const saved = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
assert.equal(saved.contextMode, "high", "unrelated settings survive the write");
assert.equal(saved.defaultProvider, "openai", "unrelated settings survive the write");
writeDeepFast(settingsFile, false);
assert.equal(readDeepFast(settingsFile), false);
assert.equal(readDeepFast(path.join(dir, "missing.json")), false, "a missing file never enables speed mode");
fs.writeFileSync(settingsFile, "not json");
assert.equal(readDeepFast(settingsFile), false, "a malformed file never enables speed mode");
fs.writeFileSync(settingsFile, JSON.stringify({}));

// --- Runtime wiring ------------------------------------------------------------------------
const handlers = new Map();
const commands = new Map();
const notified = [];
const pi = {
  on(name, handler) { handlers.set(name, handler); },
  registerCommand(name, command) { commands.set(name, command); },
};
const registry = (available) => ({
  find: (provider, id) => (provider === DEEP_FAST_PROVIDER && id === DEEP_FAST_MODEL ? { provider, id } : undefined),
  hasConfiguredAuth: () => available,
});
const ctx = (available) => ({ modelRegistry: registry(available), ui: { notify: (...args) => notified.push(args), select: async () => "Desligado" } });
const served = (chainId, usable) =>
  resolveDeepFastChain(chainId, FALLBACK_CHAINS[chainId], registry(usable), settingsFile);

register(pi, () => settingsFile);
assert.ok(commands.get("deep-fast"), "the deep-fast command is registered");
const command = commands.get("deep-fast");

// Off serves the configured chains, whatever the registry says.
assert.deepEqual(served("luna", true), FALLBACK_CHAINS.luna, "off serves the configured chain");

await command.handler("on", ctx(true));
assert.equal(readDeepFast(settingsFile), true, "on persists the preference");
assert.equal(served("luna", true)[0].model, DEEP_FAST_MODEL, "luna now starts on the fast model");
assert.equal(served("luna", true)[0].level, "low", "the scout chain runs at low");
assert.equal(served("builder", true)[0].model, DEEP_FAST_MODEL, "the builder chain swapped");
assert.equal(served("heavy", true)[0].model, DEEP_FAST_MODEL, "the heavy chain swapped");
assert.deepEqual(served("sol", true), FALLBACK_CHAINS.sol, "the sol chain is untouched");
assert.deepEqual(served("conductor", true), FALLBACK_CHAINS.conductor, "the conductor chain is untouched");

// The router must keep working when the router credential or model is missing.
assert.deepEqual(served("luna", false), FALLBACK_CHAINS.luna, "an unusable router serves the configured chain");

await command.handler("off", ctx(true));
assert.equal(readDeepFast(settingsFile), false, "off persists the preference");
assert.deepEqual(served("luna", true), FALLBACK_CHAINS.luna, "off restores the configured chain");

fs.rmSync(dir, { recursive: true, force: true });
console.log("deep-fast smoke: PASS");

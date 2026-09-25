import { loadJiti } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createJiti } = await loadJiti(import.meta.url);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const rootModule = await jiti.import(path.join(root, "plastic-memory/index.ts"));
const bridgeModule = await jiti.import(path.join(root, "project-memory.ts"));

function fakePi() {
  const hooks = new Map();
  return {
    hooks,
    on(name, handler) { hooks.set(name, handler); },
    appendEntry() {},
    registerTool() {},
    registerCommand() {},
  };
}

const pi = fakePi();
await rootModule.default(pi);
const handler = pi.hooks.get("before_agent_start");
assert.equal(typeof handler, "function");

const ctx = {
  cwd: "/Users/j.henrique/.pi/agent",
  hasUI: false,
  systemPrompt: "CTX_TRANSPORT_SENTINEL",
  sessionManager: {
    getSessionId: () => "session",
    getEntries: () => [],
    getBranch: () => [],
    getLeafId: () => undefined,
    buildContextEntries: () => [],
  },
  modelRegistry: {
    find: () => undefined,
    getApiKeyAndHeaders: async () => ({ ok: false, error: "synthetic test registry" }),
  },
  isIdle: () => true,
  hasPendingMessages: () => false,
  compact: () => {},
  ui: { notify() {} },
};
const result = await handler({ type: "before_agent_start", prompt: "hi", systemPrompt: "BASE_PROMPT", systemPromptOptions: {} }, ctx);
assert.equal(typeof result?.systemPrompt, "string");
assert.equal(result.systemPrompt.endsWith("BASE_PROMPT"), true);
assert.match(result.systemPrompt, /=== PROJECT MEMORY CONTEXT ===/u);
assert.equal(ctx.systemPrompt, "CTX_TRANSPORT_SENTINEL");
assert.equal(result.systemPrompt.includes("CTX_TRANSPORT_SENTINEL"), false);

const bridgePi = fakePi();
bridgeModule.default(bridgePi);
assert.equal(bridgePi.hooks.has("before_agent_start"), false, "project-memory early-returns when plastic-memory owns full mode");

console.log("PLASTIC_MEMORY_CONTEXT_INJECTION_FIRST_200:", JSON.stringify(result.systemPrompt.slice(0, 200)));
console.log("PLASTIC_MEMORY_CONTEXT_INJECTION: PASS (returned prompt transport; project-memory early-return under plastic full ownership)");

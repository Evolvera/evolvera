import { loadJiti } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(root, "..");
const sandbox = mkdtempSync(path.join(tmpdir(), "plastic-memory-context-injection-"));
const agentRoot = path.join(sandbox, "agent");
const projectRoot = path.join(sandbox, "project");
const sandboxExtensions = path.join(agentRoot, "extensions");
mkdirSync(projectRoot, { recursive: true });
mkdirSync(sandboxExtensions, { recursive: true });
mkdirSync(path.join(agentRoot, "skills", "project-memory", "scripts"), { recursive: true });
cpSync(path.join(root, "plastic-memory"), path.join(sandboxExtensions, "plastic-memory"), { recursive: true });
cpSync(path.join(root, "project-memory.ts"), path.join(sandboxExtensions, "project-memory.ts"));
cpSync(path.join(repositoryRoot, "skills", "project-memory", "scripts", "validate-architecture.mjs"), path.join(agentRoot, "skills", "project-memory", "scripts", "validate-architecture.mjs"));
writeFileSync(path.join(agentRoot, "settings.json"), JSON.stringify({ "plastic-memory": { enabled: true } }));
try {
const { createJiti } = await loadJiti(import.meta.url);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const rootModule = await jiti.import(path.join(sandboxExtensions, "plastic-memory/index.ts"));
const bridgeModule = await jiti.import(path.join(sandboxExtensions, "project-memory.ts"));

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

process.chdir(projectRoot);
const pi = fakePi();
await rootModule.default(pi);
const handler = pi.hooks.get("before_agent_start");
assert.equal(typeof handler, "function");

const ctx = {
  cwd: projectRoot,
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
} finally {
  process.chdir(repositoryRoot);
  rmSync(sandbox, { recursive: true, force: true });
}

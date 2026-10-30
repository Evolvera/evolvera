// REAL AgentSession/ExtensionRunner lifecycle integration; all writable state is beneath a fresh root.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "context-orchestration-"));
const envKeys = ["HOME", "USERPROFILE", "PI_CODING_AGENT_DIR", "PI_SDK_ROOT", "JITI_FS_CACHE", "TMPDIR", "TMP", "TEMP", "XDG_CACHE_HOME", "NPM_CONFIG_CACHE", "PI_OFFLINE"];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const callerSdkRoot = process.env.PI_SDK_ROOT;
const owned = (name) => path.join(root, name);
const directories = {
  HOME: owned("home"), USERPROFILE: owned("home"), PI_CODING_AGENT_DIR: owned("agent"),
  TMPDIR: owned("tmp"), TMP: owned("tmp"), TEMP: owned("tmp"),
  XDG_CACHE_HOME: owned("cache"), NPM_CONFIG_CACHE: owned("npm-cache"),
};
for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
for (const [key, value] of Object.entries(directories)) process.env[key] = value;
process.env.JITI_FS_CACHE = "0";
process.env.PI_OFFLINE = "1";
if (callerSdkRoot) process.env.PI_SDK_ROOT = callerSdkRoot;
else delete process.env.PI_SDK_ROOT;
let sessions = [];
let networkAttempts = 0;
const originalFetch = globalThis.fetch;
const originalHttp = { request: http.request, get: http.get, httpsRequest: https.request, httpsGet: https.get };
const blockedRequest = (...args) => { networkAttempts++; throw new Error(`Network disabled in context integration smoke: ${String(args[0])}`); };
globalThis.fetch = blockedRequest;
http.request = blockedRequest;
http.get = blockedRequest;
https.request = blockedRequest;
https.get = blockedRequest;
try {
  // SDK resolution reads only installed-package metadata via npm root -g / known local paths; it never installs or accesses user config.
  const sdkRoot = resolvePiSdkRoot(import.meta.url);
  process.env.PI_SDK_ROOT = sdkRoot;
  const sdkUrl = (relative) => pathToFileURL(path.join(sdkRoot, relative)).href;
  const sdk = await import(sdkUrl("dist/index.js"));
  const { loadExtensions } = await import(sdkUrl("dist/core/extensions/loader.js"));
  const faux = await import(sdkUrl("node_modules/@earendil-works/pi-ai/dist/providers/faux.js"));
  const core = faux.createFauxCore({ models: [
    { id: "gpt-6.1-test", contextWindow: 300_000, maxTokens: 128_000 },
    { id: "claude-opus-5-test", contextWindow: 1_000_000, maxTokens: 128_000 },
  ] });
  let providerRequests = 0;
  const streamSimple = (...args) => { providerRequests++; return core.streamSimple(...args); };
  const modelRuntime = await sdk.ModelRuntime.create({ authPath: owned("synthetic-auth.json"), modelsPath: null });
  const providerConfig = { api: core.api, streamSimple, apiKey: "synthetic-only", baseUrl: "http://127.0.0.1:9", models: core.models.map((model) => ({ ...model })) };
  modelRuntime.registerProvider(core.provider, providerConfig);
  modelRuntime.registerProvider("openai", providerConfig);
  modelRuntime.registerProvider("anthropic", providerConfig);
  fs.writeFileSync(owned("synthetic-auth.json"), JSON.stringify({ synthetic: true }));
  fs.writeFileSync(owned("synthetic-models.json"), JSON.stringify({ synthetic: true }));
  const agentSettingsPath = path.join(process.env.PI_CODING_AGENT_DIR, "settings.json");
  fs.writeFileSync(agentSettingsPath, JSON.stringify({ contextMode: "default", syntheticFixtureKey: "preserve-me" }));
  const statuses = new Map();
  const ui = {
    notify() {}, setStatus(key, value) { value === undefined ? statuses.delete(key) : statuses.set(key, value); },
    select: async () => undefined, confirm: async () => false, input: async () => undefined,
    onTerminalInput: () => () => {}, setWorkingMessage() {}, setWorkingVisible() {}, setWorkingIndicator() {},
    setHiddenThinkingLabel() {}, setWidget() {}, setFooter() {}, setHeader() {}, setTitle() {}, pasteToEditor() {},
    setEditorText() {}, getEditorText: () => "", addAutocompleteProvider() {}, setEditorComponent() {},
    getEditorComponent: () => undefined, getAllThemes: () => [], getTheme: () => undefined, setTheme: () => ({ success: false }),
    getToolsExpanded: () => false, setToolsExpanded() {}, custom: async () => undefined, editor: async () => undefined,
  };
  const makeSession = async (model) => {
    const extensions = await loadExtensions([
      path.join(repoRoot, "extensions/orchestration-mode.ts"),
      path.join(repoRoot, "extensions/context-mode.ts"),
    ], process.env.PI_CODING_AGENT_DIR);
    const resourceLoader = {
      getExtensions: () => extensions, getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }), getThemes: () => ({ themes: [], diagnostics: [] }),
      getAgentsFiles: () => ({ agentsFiles: [] }), getSystemPrompt: () => "# PI Coding Agent\nSynthetic integration.", getSystemPromptSource: () => undefined,
      getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [], extendResources: () => {}, reload: async () => {},
    };
    const result = await sdk.createAgentSession({ cwd: root, agentDir: process.env.PI_CODING_AGENT_DIR, model, thinkingLevel: "off", modelRuntime, resourceLoader,
      sessionManager: sdk.SessionManager.inMemory(root), tools: [], customTools: [],
      settingsManager: sdk.SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: true, reserveTokens: 1_024, keepRecentTokens: 100 } }) });
    sessions.push(result.session);
    result.session.extensionRunner.setUIContext(ui, "tui");
    return result.session;
  };
  const gpt = { ...core.models[0], provider: "openai", id: "gpt-6.1-test" };
  const session = await makeSession(gpt);
  const runner = session.extensionRunner;
  const command = (name, args) => session.extensionRunner.getCommand(name).handler(args, session.extensionRunner.createCommandContext());
  await runner.emit({ type: "session_start" });
  assert.equal(gpt.contextWindow, 300_000);
  await command("orchestration", "conductor");
  assert.equal(gpt.contextWindow, 210_000, "conductor command synchronously applies default reduction after session entry append");
  assert.equal(statuses.get("context-mode"), "210K");
  await command("context-mode", "high");
  assert.equal(gpt.contextWindow, 560_000);
  assert.deepEqual(JSON.parse(fs.readFileSync(agentSettingsPath, "utf8")), { contextMode: "high", syntheticFixtureKey: "preserve-me" }, "preference is persisted to owned agent settings and preserves unrelated synthetic setting");
  assert.equal(statuses.get("context-mode"), "560K", "status reports effective capacity, never nominal 800K");
  await command("context-mode", "default");
  assert.equal(gpt.contextWindow, 210_000);
  await command("orchestration", "standard");
  assert.equal(gpt.contextWindow, 300_000);
  assert.equal(statuses.has("context-mode"), false);

  // Reverse command order, then standard restores the applicable High window.
  await command("context-mode", "high");
  assert.equal(gpt.contextWindow, 800_000);
  await command("orchestration", "conductor");
  assert.equal(gpt.contextWindow, 560_000);
  await command("orchestration", "standard");
  assert.equal(gpt.contextWindow, 800_000);
  assert.equal(session.getContextUsage()?.contextWindow, 800_000, "SDK context-usage seam follows active model capacity");
  await command("context-mode", "default");

  // Session branch starts standard; worker-like independent session does not inherit conductor.
  const independent = await makeSession({ ...core.models[0], provider: "openai", id: "gpt-6.1-test" });
  await independent.extensionRunner.emit({ type: "session_start" });
  assert.equal(independent.agent.state.model.contextWindow, 300_000);
  assert.equal(independent.extensionRunner.createContext().sessionManager.getBranch().some((entry) => entry.customType === "orchestration-mode" && entry.data?.mode === "conductor"), false);

  // Real model replacement path: active replacement is normalized on the next lifecycle refresh.
  const replacement = { ...core.models[1], provider: "anthropic", id: "claude-opus-5-test" };
  await session.setModel(replacement);
  assert.equal(replacement.contextWindow, 450_000, "model_select immediately applies normal Claude cap after replacement");
  await command("orchestration", "conductor");
  assert.equal(replacement.contextWindow, 315_000, "conductor branch applies to a replaced active model");
  assert.equal(statuses.get("context-mode"), "315K");
  assert.equal(session.getContextUsage()?.contextWindow, 315_000, "context usage seam follows the replaced model's effective capacity");
  await session.reload();
  assert.equal(replacement.contextWindow, 315_000, "SDK reload preserves conductor capacity without compounding");
  assert.equal(providerRequests, 0, "no provider request was made");
  assert.equal(networkAttempts, 0, "fetch network guard observed no attempts");
  console.log(JSON.stringify({ result: "PASS", providerRequests, networkAttempts, contextWindow: replacement.contextWindow, contextUsageWindow: session.getContextUsage()?.contextWindow, syntheticAgentSettings: "preference persisted; unrelated key preserved", resources: "DISPOSABLE_VERIFIED" }));
} finally {
  for (const session of sessions) session.dispose();
  globalThis.fetch = originalFetch;
  http.request = originalHttp.request;
  http.get = originalHttp.get;
  https.request = originalHttp.httpsRequest;
  https.get = originalHttp.httpsGet;
  for (const key of envKeys) previousEnv[key] === undefined ? delete process.env[key] : process.env[key] = previousEnv[key];
  fs.rmSync(root, { recursive: true, force: true });
}

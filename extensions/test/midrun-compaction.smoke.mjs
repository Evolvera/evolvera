import assert from "node:assert/strict";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const extension = await jiti.import(path.join(root, "extensions/midrun-compaction.ts"));
const { registerMidrunCompaction } = extension;
const model = { provider: "faux", id: "midrun" };
const settings = { enabled: true, reserveTokens: 100, keepRecentTokens: 1 };
// Regression: the extension must never compact by itself. AgentSession.compact() disconnects the
// session and aborts the run; work started in that window runs unpersisted and is then erased.
{
  const handlers = new Map(); const compacts = [];
  registerMidrunCompaction({ on: (k, h) => handlers.set(k, h), sendMessage() {} }, { env: {} });
  assert.equal(handlers.has("turn_end"), false, "no turn_end trigger");
  assert.equal("shouldCompactMidrun" in extension, false, "mid-run trigger removed");
  const ctx = { mode: "tui", cwd: "/", model, isIdle: () => true, hasPendingMessages: () => false,
    getContextUsage: () => ({ tokens: 999, contextWindow: 1000 }), compact(options) { compacts.push(options); }, ui: { notify() {} },
    sessionManager: { getSessionId: () => "s", getBranch: () => [] } };
  await handlers.get("before_agent_start")({ systemPromptOptions: { customPrompt: "# PI Coding Agent" } }, ctx);
  for (const [name, handler] of handlers) if (name !== "before_agent_start") await handler(name === "input" ? { source: "interactive", text: "go" } : { message: { provider: "faux", model: "midrun", content: [{ type: "toolCall" }] } }, ctx);
  assert.equal(compacts.length, 0, "ctx.compact() is never called");
}

// Real SDK integration: all provider responses are in-process faux messages and all filesystem state is a fresh mkdtemp root.
{
  // Post-compaction stall: resume only when the task was mid-flight and nothing ran after compaction.
  const { isCompactionStall } = extension;
  const u = (text = "do it") => ({ type: "message", message: { role: "user", content: [{ type: "text", text }] } });
  const a = (stopReason, tool = false) => ({ type: "message", message: { role: "assistant", stopReason, content: tool ? [{ type: "toolCall" }] : [{ type: "text", text: "x" }] } });
  const c = { type: "compaction", summary: "s" };
  const n = { type: "custom_message", customType: "subagent-notification" };
  assert.equal(isCompactionStall([u(), a("toolUse", true), a("length"), a("length"), c]), true, "length stall");
  assert.equal(isCompactionStall([u(), a("toolUse", true), c, n]), true, "notification after compaction is not work");
  assert.equal(isCompactionStall([u(), a("stop"), c]), false, "delivered final, then compaction");
  assert.equal(isCompactionStall([u(), a("aborted"), c]), false, "user abort");
  assert.equal(isCompactionStall([u(), a("toolUse", true), c, a("aborted")]), false, "user abort after compaction is not a stall");
  assert.equal(isCompactionStall([u(), a("length"), c, a("toolUse", true)]), false, "work ran after compaction");
  assert.equal(isCompactionStall([u(), a("length"), c, u("?")]), false, "user already spoke");
  assert.equal(isCompactionStall([a("stop"), u(), c]), false, "compaction before any work");
  assert.equal(isCompactionStall([u(), a("length")]), false, "no compaction");

  const handlers = new Map(); const sent = [];
  let branch = [u(), a("toolUse", true), a("length"), c]; let running = false;
  extension.registerMidrunCompaction({ on: (k, h) => handlers.set(k, h), sendMessage: async (m, o) => sent.push({ m, o }) }, { env: {}, readCompactionSettings: () => settings, getManager: () => ({ hasRunning: () => running }) });
  const ctx = { mode: "tui", cwd: "/", model, isIdle: () => true, hasPendingMessages: () => false, getContextUsage: () => undefined, compact() {}, ui: { notify() {} }, sessionManager: { getBranch: () => branch } };
  await handlers.get("before_agent_start")({ systemPromptOptions: { customPrompt: "# PI Coding Agent" } }, ctx);
  await handlers.get("agent_settled")({}, ctx); assert.equal(sent.length, 0, "no real user input yet");
  await handlers.get("input")({ source: "interactive", text: "do it" }, ctx);
  running = true; await handlers.get("agent_settled")({}, ctx); assert.equal(sent.length, 0, "subagents running");
  running = false; await handlers.get("agent_settled")({}, ctx);
  assert.equal(sent.length, 1); assert.equal(sent[0].m.customType, "compaction-resume"); assert.equal(sent[0].o.triggerTurn, true);
  await handlers.get("agent_settled")({}, ctx); assert.equal(sent.length, 1, "once per user message");
  await handlers.get("input")({ source: "extension", text: "x" }, ctx); await handlers.get("agent_settled")({}, ctx); assert.equal(sent.length, 1, "extension input does not rearm");
  branch = [u(), a("stop"), c]; await handlers.get("input")({ source: "interactive", text: "next" }, ctx); await handlers.get("agent_settled")({}, ctx); assert.equal(sent.length, 1, "delivered reply never resumes");
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), "midrun-compaction-agent-"));
const previousJitiFsCache = process.env.JITI_FS_CACHE;
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = home;
process.env.JITI_FS_CACHE = "0";
fs.writeFileSync(path.join(home, "settings.json"), JSON.stringify({ compaction: { enabled: true, reserveTokens: 12_600, keepRecentTokens: 1_500 } }));
let session;
try {
  const sdk = await import(pathToFileURL(path.join(sdkRoot, "dist/index.js")).href);
  const { loadExtensions } = await import(pathToFileURL(path.join(sdkRoot, "dist/core/extensions/loader.js")).href);
  const faux = await import(pathToFileURL(path.join(sdkRoot, "node_modules/@earendil-works/pi-ai/dist/providers/faux.js")).href);
  const sdkRequire = createRequire(path.join(sdkRoot, "dist/index.js"));
  const { Type } = sdkRequire("typebox");
  const modelCore = faux.createFauxCore({ models: [{ id: "midrun-test", contextWindow: 16_000, maxTokens: 512 }] });
  const modelRuntime = await sdk.ModelRuntime.create({ authPath: path.join(home, "auth.json"), modelsPath: null });
  modelRuntime.registerProvider(modelCore.provider, { api: modelCore.api, streamSimple: modelCore.streamSimple, apiKey: "synthetic-only", baseUrl: "http://127.0.0.1:9", models: modelCore.models.map((item) => ({ ...item })) });
  const loaded = await loadExtensions([path.join(root, "extensions/midrun-compaction.ts")], home);
  const resourceLoader = {
    getExtensions: () => loaded, getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }), getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }), getSystemPrompt: () => "# PI Coding Agent\nSynthetic test only.", getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [], extendResources: () => {}, reload: async () => {},
  };
  const largeTool = { name: "large", label: "Large", description: "Returns synthetic context", parameters: Type.Object({}), async execute() {
    return { content: [{ type: "text", text: "Synthetic tool output. ".repeat(100) }], details: {} };
  } };
  const sessionManager = sdk.SessionManager.inMemory(home);
  // Prior completed exchanges give compaction something older than keepRecentTokens to summarize.
  for (let i = 0; i < 3; i++) {
    sessionManager.appendMessage({ role: "user", content: [{ type: "text", text: `Earlier synthetic request ${i}. ` + "context ".repeat(3_000) }], timestamp: Date.now() });
    sessionManager.appendMessage({ role: "assistant", content: [{ type: "text", text: `Earlier synthetic answer ${i}.` }], api: modelCore.api, provider: modelCore.provider, model: "midrun-test", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() });
  }
  const { session: created } = await sdk.createAgentSession({ cwd: home, agentDir: home, model: modelCore.models[0], thinkingLevel: "off", modelRuntime, resourceLoader, sessionManager, tools: ["large"], customTools: [largeTool],
    settingsManager: sdk.SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: true, reserveTokens: 12_600, keepRecentTokens: 1_500 } }) });
  session = created; session.extensionRunner.setUIContext({}, "tui");
  const errors = []; session.extensionRunner.onError((error) => errors.push(`${error.event}:${error.error}`));
  modelCore.setResponses([
    faux.fauxAssistantMessage(faux.fauxToolCall("large", {})),
    faux.fauxAssistantMessage("Synthetic final deliverable: the tool turn stayed persisted."),
    // PI's native post-run threshold compaction may summarize afterwards.
    faux.fauxAssistantMessage("## Goal\nSynthetic.\n## Next Steps\n1. None."),
    faux.fauxAssistantMessage("Turn prefix: synthetic."),
  ]);
  await session.prompt("Use the large tool, then finish and return a concise deliverable.");
  for (let i = 0; i < 200 && !(session.isIdle && !session.isCompacting); i++) await new Promise((r) => setTimeout(r, 25));
  await session.waitForIdle();
  const entries = Array.from(sessionManager.getBranch());
  const index = (predicate) => entries.findIndex(predicate);
  const toolTurn = index((entry) => entry.type === "message" && entry.message?.role === "assistant" && entry.message.content?.some((part) => part.type === "toolCall"));
  const final = index((entry) => entry.type === "message" && entry.message?.role === "assistant" && entry.message.content?.some((part) => part.type === "text" && part.text.includes("Synthetic final deliverable")));
  const firstCompaction = index((entry) => entry.type === "compaction");
  const summary = JSON.stringify(entries.map((entry) => ({ type: entry.type, role: entry.message?.role, stop: entry.message?.stopReason })));
  assert.ok(toolTurn >= 0 && final > toolTurn, `tool turn and final deliverable are both persisted in order: ${summary}`);
  assert.ok(firstCompaction === -1 || firstCompaction > final, `no compaction interrupts the run over the threshold: ${summary}`);
  const resumes = session.agent.state.messages.filter((message) => message.role === "custom" && ["midrun-compaction-resume", "compaction-resume"].includes(message.customType));
  assert.equal(resumes.length, 0, "a delivered task is never resumed");
  assert.ok(session.isIdle); assert.equal(session.agent.hasQueuedMessages(), false); assert.deepEqual(errors, []);
} finally {
  session?.dispose();
  if (previousJitiFsCache === undefined) delete process.env.JITI_FS_CACHE; else process.env.JITI_FS_CACHE = previousJitiFsCache;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  fs.rmSync(home, { recursive: true, force: true });
}
console.log("midrun-compaction smoke: PASS");

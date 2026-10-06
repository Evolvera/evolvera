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
const { registerMidrunCompaction, shouldCompactMidrun } = extension;
const settings = { enabled: true, reserveTokens: 100 };
const model = { provider: "faux", id: "midrun" };
function fixture({ primary = true, mode = "tui", usage = { tokens: 901, contextWindow: 1000 }, model: currentModel = model, config = settings, env = {}, pending = false } = {}) {
  const handlers = new Map(); const compacts = []; const sent = []; const notices = [];
  const pi = { on(name, handler) { handlers.set(name, handler); }, sendMessage(message, options) { sent.push({ message, options }); } };
  const ctx = { mode, cwd: "/run-owned", model: currentModel, getContextUsage: () => usage, hasPendingMessages: () => pending,
    ui: { notify(message, type) { notices.push({ message, type }); } }, compact(options) { compacts.push(options); } };
  registerMidrunCompaction(pi, { readCompactionSettings: () => config, env });
  const start = () => handlers.get("before_agent_start")({ systemPromptOptions: { customPrompt: primary ? "  # PI Coding Agent\n" : "# Specialist" } }, ctx);
  const end = (msg = { provider: "faux", model: "midrun", content: [{ type: "toolCall" }] }) => handlers.get("turn_end")({ message: msg }, ctx);
  return { handlers, ctx, compacts, sent, notices, start, end };
}
{
  assert.equal(shouldCompactMidrun({ provider: "faux", model: "midrun", content: [{ type: "toolCall" }] }, model, { tokens: 900, contextWindow: 1000 }, settings), false, "strictly below threshold does not compact");
  const f = fixture(); await f.start(); await f.end();
  assert.equal(f.compacts.length, 1); assert.match(f.compacts[0].customInstructions, /exact next step/);
  await f.end(); assert.equal(f.compacts.length, 1, "one active compaction maximum");
  f.compacts[0].onComplete();
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].message.customType, "midrun-compaction-resume");
  assert.equal(f.sent[0].options.triggerTurn, true); assert.equal(f.sent[0].options.deliverAs, "followUp");
  for (const { label, options } of [
    { label: "no tool call", options: { message: { provider: "faux", model: "midrun", content: [{ type: "text" }] } } },
    { label: "non-primary", options: { primary: false } }, { label: "non-tui", options: { mode: "rpc" } },
    { label: "different model", options: { message: { provider: "elsewhere", model: "other", content: [{ type: "toolCall" }] } } },
    { label: "null usage", options: { usage: { tokens: null, contextWindow: 1000 } } },
    { label: "kill switch", options: { env: { PI_MIDRUN_COMPACTION: "off" } } },
    { label: "disabled", options: { config: { enabled: false, reserveTokens: 100 } } },
  ]) { const x = fixture(options); await x.start(); await x.end(options.message); assert.equal(x.compacts.length, 0, label); }
  const fail = fixture(); await fail.start(); await fail.end(); fail.compacts[0].onError(new Error("synthetic"));
  assert.equal(fail.sent.length, 1); assert.match(fail.sent[0].message.content, /Compaction failed/); assert.equal(fail.notices.length, 1);
  const raced = fixture(); await raced.start(); await raced.end(); raced.compacts[0].onError(new Error("Already compacted"));
  assert.equal(raced.sent.length, 1, "PI compacted first: still resume"); assert.equal(raced.notices.length, 0, "no failure warning when PI already compacted");
  assert.doesNotMatch(raced.sent[0].message.content, /failed/);
  const queued = fixture({ pending: true }); await queued.start(); await queued.end(); queued.compacts[0].onComplete(); assert.equal(queued.sent.length, 0, "queued user message drives the next turn");
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
fs.writeFileSync(path.join(home, "settings.json"), JSON.stringify({ compaction: { enabled: true, reserveTokens: 12_600 } }));
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
    sessionManager.appendMessage({ role: "user", content: [{ type: "text", text: `Earlier synthetic request ${i}. ` + "context ".repeat(500) }], timestamp: Date.now() });
    sessionManager.appendMessage({ role: "assistant", content: [{ type: "text", text: `Earlier synthetic answer ${i}.` }], api: modelCore.api, provider: modelCore.provider, model: "midrun-test", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() });
  }
  const { session: created } = await sdk.createAgentSession({ cwd: home, agentDir: home, model: modelCore.models[0], thinkingLevel: "off", modelRuntime, resourceLoader, sessionManager, tools: ["large"], customTools: [largeTool],
    settingsManager: sdk.SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: true, reserveTokens: 12_600, keepRecentTokens: 1_500 } }) });
  session = created; session.extensionRunner.setUIContext({}, "tui");
  const errors = []; session.extensionRunner.onError((error) => errors.push(`${error.event}:${error.error}`));
  modelCore.setResponses([
    faux.fauxAssistantMessage(faux.fauxToolCall("large", {})),
    // Compaction splits the active turn: one history summary plus one turn-prefix summary.
    faux.fauxAssistantMessage("## Goal\nFinish the synthetic operation.\n## Next Steps\n1. Return the deliverable."),
    faux.fauxAssistantMessage("Turn prefix: the large tool already ran; next return the deliverable."),
    faux.fauxAssistantMessage("Synthetic final deliverable: task completed after mid-run compaction."),
  ]);
  await session.prompt("Use the large tool, then finish and return a concise deliverable.");
  // ctx.compact() is fire-and-forget: wait for the compaction and the resumed run to settle.
  for (let i = 0; i < 200 && !(modelCore.getPendingResponseCount() === 0 && session.isIdle && !session.isCompacting); i++) await new Promise((r) => setTimeout(r, 25));
  await session.waitForIdle();
  const entries = Array.from(sessionManager.getBranch());
  const compactionIndex = entries.findIndex((entry) => entry.type === "compaction");
  const custom = session.agent.state.messages.filter((message) => message.role === "custom" && message.customType === "midrun-compaction-resume");
  const texts = session.agent.state.messages.filter((message) => message.role === "assistant").flatMap((message) => message.content.filter((part) => part.type === "text").map((part) => part.text));
  const debugBranch = entries.map((entry) => ({ type: entry.type, message: entry.message?.role, stop: entry.message?.stopReason, provider: entry.message?.provider, model: entry.message?.model, content: entry.message?.content?.map?.((part) => part.type === "text" ? `text:${part.text?.length}` : part.type), isError: entry.message?.isError, text: entry.summary?.slice(0, 80) }));
  assert.ok(compactionIndex >= 0, `mid-run compaction must be present; model=${JSON.stringify(modelCore.models[0])}; branch=${JSON.stringify(debugBranch)}; errors=${JSON.stringify(errors)}; pending=${modelCore.getPendingResponseCount()}`);
  assert.ok(entries.slice(compactionIndex + 1).some((entry) => entry.type === "message" && entry.message?.role === "assistant" && entry.message.content?.some((part) => part.type === "text" && part.text.includes("Synthetic final deliverable"))), `compaction precedes final deliverable; branch=${JSON.stringify(entries.map((entry) => ({ type: entry.type, summary: entry.summary?.slice(0, 40), role: entry.message?.role, text: entry.message?.content?.map?.((part) => part.type === "text" ? part.text?.slice(0, 50) : part.type) })))}; custom=${custom.length}; texts=${JSON.stringify(texts)}`);
  assert.equal(custom.length, 1, "resume custom message delivered");
  assert.ok(texts.some((text) => text.includes("Synthetic final deliverable: task completed after mid-run compaction.")), JSON.stringify(texts));
  assert.ok(session.isIdle); assert.equal(session.agent.hasQueuedMessages(), false); assert.equal(modelCore.getPendingResponseCount(), 0); assert.deepEqual(errors, []);
} finally {
  session?.dispose();
  if (previousJitiFsCache === undefined) delete process.env.JITI_FS_CACHE; else process.env.JITI_FS_CACHE = previousJitiFsCache;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  fs.rmSync(home, { recursive: true, force: true });
}
console.log("midrun-compaction smoke: PASS");

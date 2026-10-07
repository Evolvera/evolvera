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
const settings = { enabled: true, reserveTokens: 100, keepRecentTokens: 1 };
const model = { provider: "faux", id: "midrun" };
function fixture({ primary = true, mode = "tui", usage = { tokens: 901, contextWindow: 1000 }, model: currentModel = model, config = settings, env = {}, pending = false, initialBranch, signal } = {}) {
  const handlers = new Map(); const compacts = []; const sent = []; const notices = [];
  const ids = ["old-user", "old-answer", "current-user", "active-toolcall"];
  let sessionId = "session-1";
  let branch = initialBranch ?? [
    { id: ids[0], type: "message", message: { role: "user", content: [{ type: "text", text: "old " + "history ".repeat(30) }] } },
    { id: ids[1], type: "message", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "done" }] } },
    { id: ids[2], type: "message", message: { role: "user", content: [{ type: "text", text: "current task" }] } },
    { id: ids[3], type: "message", message: { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", name: "large", arguments: {} }] } },
  ];
  const pi = { on(name, handler) { handlers.set(name, handler); }, sendMessage(message, options) { sent.push({ message, options }); } };
  const ctx = { mode, cwd: "/run-owned", model: currentModel, getContextUsage: () => usage, hasPendingMessages: () => pending, signal,
    sessionManager: { getSessionId: () => sessionId, getBranch: () => branch },
    isIdle: () => true, ui: { notify(message, type) { notices.push({ message, type }); } }, compact(options) { compacts.push(options); } };
  registerMidrunCompaction(pi, { readCompactionSettings: () => config, env });
  const start = () => handlers.get("before_agent_start")({ systemPromptOptions: { customPrompt: primary ? "  # PI Coding Agent\n" : "# Specialist" } }, ctx);
  const end = (msg = { provider: "faux", model: "midrun", content: [{ type: "toolCall" }] }) => handlers.get("turn_end")({ message: msg }, ctx);
  return { handlers, ctx, compacts, sent, notices, start, end, get branch() { return branch; }, set branch(value) { branch = value; }, set sessionId(value) { sessionId = value; } };
}
{
  assert.equal(shouldCompactMidrun({ provider: "faux", model: "midrun", content: [{ type: "toolCall" }] }, model, { tokens: 900, contextWindow: 1000 }, settings), false, "strictly below threshold does not compact");
  const f = fixture(); await f.start(); await f.end();
  assert.equal(f.compacts.length, 1); assert.match(f.compacts[0].customInstructions, /exact next step/);
  await f.end(); assert.equal(f.compacts.length, 1, "one active compaction maximum");
  f.branch = [...f.branch, { id: "new-compaction", type: "compaction", firstKeptEntryId: "current-user", summary: "summary" }];
  f.compacts[0].onComplete(); f.compacts[0].onComplete();
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
  const noPrefix = fixture({ config: { enabled: true, reserveTokens: 100, keepRecentTokens: 100_000 } });
  await noPrefix.start(); await noPrefix.end(); assert.equal(noPrefix.compacts.length, 0, "no discardable context must not abort the run");
  const closedBeforeStart = fixture(); await closedBeforeStart.start();
  closedBeforeStart.branch = [...closedBeforeStart.branch.slice(0, 3), { id: "already-final", type: "message", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "done" }] } }];
  await closedBeforeStart.end(); assert.equal(closedBeforeStart.compacts.length, 0, "stale tool-call event cannot compact a request already finalized");
  const abortedSignal = new AbortController(); abortedSignal.abort();
  const preaborted = fixture({ signal: abortedSignal.signal }); await preaborted.start(); await preaborted.end();
  assert.equal(preaborted.compacts.length, 0, "pre-aborted run is not manually compacted");
  const syncFailure = fixture(); await syncFailure.start(); syncFailure.ctx.compact = () => { throw new Error("sync failure"); };
  await syncFailure.end(); assert.equal(syncFailure.sent.length, 1); assert.match(syncFailure.sent[0].message.content, /did not complete/);
  const fail = fixture(); await fail.start(); await fail.end(); fail.compacts[0].onError(new Error("synthetic"));
  assert.equal(fail.sent.length, 1); assert.match(fail.sent[0].message.content, /did not complete/); assert.equal(fail.notices.length, 1);
  fail.compacts[0].onError(new Error("synthetic duplicate")); assert.equal(fail.sent.length, 1, "callback is one-shot");
  const raced = fixture(); await raced.start(); await raced.end();
  raced.branch = [...raced.branch, { id: "new-compaction", type: "compaction", firstKeptEntryId: "current-user", summary: "summary" }];
  raced.compacts[0].onError(new Error("Already compacted"));
  assert.equal(raced.sent.length, 1, "verified native compaction resumes"); assert.equal(raced.notices.length, 0);
  assert.doesNotMatch(raced.sent[0].message.content, /failed|did not complete/);
  const bogus = fixture(); await bogus.start(); await bogus.end(); bogus.compacts[0].onError(new Error("Already compacted"));
  assert.match(bogus.sent[0].message.content, /did not complete/, "error text alone is not proof of compaction");
  const queued = fixture({ pending: true }); await queued.start(); await queued.end(); queued.compacts[0].onComplete(); assert.equal(queued.sent.length, 0, "queued user message drives the next turn");
  const finalized = fixture(); await finalized.start(); await finalized.end();
  finalized.branch = [...finalized.branch, { id: "final", type: "message", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "done" }] } }];
  finalized.compacts[0].onError(new Error("synthetic")); assert.equal(finalized.sent.length, 0, "a final answer after attempt suppresses recovery");
  const finalizedBeforeCompaction = fixture(); await finalizedBeforeCompaction.start(); await finalizedBeforeCompaction.end();
  finalizedBeforeCompaction.branch = [...finalizedBeforeCompaction.branch,
    { id: "delivered-final", type: "message", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "already delivered" }] } },
    { id: "native-compaction-after-final", type: "compaction", firstKeptEntryId: "current-user", summary: "the task was delivered" }];
  finalizedBeforeCompaction.compacts[0].onError(new Error("Already compacted"));
  assert.equal(finalizedBeforeCompaction.sent.length, 0, "a later compaction cannot hide an already delivered final answer from the callback guard");
  const cancelled = fixture(); await cancelled.start(); await cancelled.end();
  cancelled.branch = [...cancelled.branch, { id: "aborted", type: "message", message: { role: "assistant", stopReason: "aborted", content: [] } }];
  cancelled.compacts[0].onError(new Error("cancelled")); assert.equal(cancelled.sent.length, 0, "user abort suppresses recovery");
  const rejected = fixture(); await rejected.start();
  await rejected.handlers.get("input")({ source: "interactive", text: "current request" });
  await rejected.end();
  rejected.branch = [...rejected.branch, { id: "cancelled-native-compaction", type: "compaction", firstKeptEntryId: "current-user", summary: "native compact" }];
  rejected.compacts[0].onError(new Error("Compaction cancelled"));
  await rejected.handlers.get("agent_settled")({}, rejected.ctx);
  assert.equal(rejected.sent.length, 0, "cancellation disarms the same request's native stalled-resume budget");
  const abortedAfterCompaction = fixture(); await abortedAfterCompaction.start();
  await abortedAfterCompaction.handlers.get("input")({ source: "interactive", text: "current request" });
  await abortedAfterCompaction.end();
  abortedAfterCompaction.branch = [...abortedAfterCompaction.branch,
    { id: "native-before-abort", type: "compaction", firstKeptEntryId: "current-user", summary: "native compact" },
    { id: "user-aborted-after-compaction", type: "message", message: { role: "assistant", stopReason: "aborted", content: [] } }];
  abortedAfterCompaction.compacts[0].onError(new Error("Compaction cancelled"));
  await abortedAfterCompaction.handlers.get("agent_settled")({}, abortedAfterCompaction.ctx);
  assert.equal(abortedAfterCompaction.sent.length, 0, "appended abortion after compaction must not revive the request through stalled recovery");
  const alreadyBusy = fixture(); await alreadyBusy.start(); await alreadyBusy.end();
  alreadyBusy.branch = [...alreadyBusy.branch, { id: "native-started-continuation", type: "compaction", firstKeptEntryId: "current-user", summary: "native compact" }];
  alreadyBusy.ctx.isIdle = () => false;
  alreadyBusy.compacts[0].onComplete();
  assert.equal(alreadyBusy.sent.length, 0, "an already-running native continuation must not receive a duplicate follow-up before its assistant message is persisted");
  const sameRequestFailure = fixture(); await sameRequestFailure.start(); await sameRequestFailure.end();
  sameRequestFailure.compacts[0].onError(new Error("synthetic failure")); await sameRequestFailure.end();
  assert.equal(sameRequestFailure.compacts.length, 1, "failure disables more proactive attempts for this request");
  await sameRequestFailure.handlers.get("input")({ source: "interactive", text: "next request" });
  sameRequestFailure.branch = [...sameRequestFailure.branch, { id: "next-user-after-failure", type: "message", message: { role: "user", content: [{ type: "text", text: "next request" }] } }, { id: "next-tool-after-failure", type: "message", message: { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", name: "large", arguments: {} }] } }];
  await sameRequestFailure.end(); assert.equal(sameRequestFailure.compacts.length, 2, "new real input rearms proactive compaction");
  const stale = fixture(); await stale.start(); await stale.end(); const old = stale.compacts[0];
  await stale.handlers.get("input")({ source: "interactive", text: "next request" });
  stale.branch = [...stale.branch, { id: "next-user", type: "message", message: { role: "user", content: [{ type: "text", text: "next request" }] } }, { id: "next-tool", type: "message", message: { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", name: "large", arguments: {} }] } }];
  await stale.end(); assert.equal(stale.compacts.length, 2, "next real request can own a new attempt");
  old.onError(new Error("Compaction cancelled")); await stale.end(); assert.equal(stale.compacts.length, 2, "stale cancellation cannot clear or disarm newer attempt");
  stale.compacts[1].onError(new Error("current failure")); assert.equal(stale.sent.length, 1, "only current attempt recovers");
  const changedSession = fixture(); await changedSession.start(); await changedSession.end(); changedSession.sessionId = "replacement-session";
  changedSession.compacts[0].onError(new Error("late callback")); assert.equal(changedSession.sent.length, 0, "session identity change invalidates callback without lifecycle event");
  for (const lifecycle of ["session_start", "session_tree", "session_before_tree", "session_before_switch", "session_shutdown"]) {
    const x = fixture(); await x.start(); await x.end(); await x.handlers.get(lifecycle)({}, x.ctx);
    x.compacts[0].onError(new Error("late lifecycle callback"));
    assert.equal(x.sent.length, 0, `${lifecycle} invalidates its in-flight callback`);
  }
  const resumedAlready = fixture(); await resumedAlready.start(); await resumedAlready.end();
  resumedAlready.branch = [...resumedAlready.branch, { id: "already-compacted", type: "compaction", firstKeptEntryId: "current-user", summary: "summary" },
    { id: "resumed-toolcall", type: "message", message: { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", name: "large", arguments: {} }] } }];
  resumedAlready.compacts[0].onError(new Error("Already compacted"));
  assert.equal(resumedAlready.sent.length, 0, "assistant work after compaction proves task already resumed");
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

  session.dispose(); session = undefined;
  fs.writeFileSync(path.join(home, "settings.json"), JSON.stringify({ compaction: { enabled: true, reserveTokens: 15_000, keepRecentTokens: 50_000 } }));
  const shortSessionManager = sdk.SessionManager.inMemory(home);
  const shortTool = { ...largeTool, async execute() { return { content: [{ type: "text", text: "Synthetic output. ".repeat(2_000) }], details: {} }; } };
  modelCore.setResponses([
    faux.fauxAssistantMessage(faux.fauxToolCall("large", {})),
    faux.fauxAssistantMessage("Ordinary final deliverable: completed without compaction."),
  ]);
  const { session: shortSession } = await sdk.createAgentSession({ cwd: home, agentDir: home, model: modelCore.models[0], thinkingLevel: "off", modelRuntime, resourceLoader, sessionManager: shortSessionManager, tools: ["large"], customTools: [shortTool],
    settingsManager: sdk.SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: true, reserveTokens: 15_000, keepRecentTokens: 50_000 } }) });
  session = shortSession; session.extensionRunner.setUIContext({}, "tui");
  const shortErrors = []; session.extensionRunner.onError((error) => shortErrors.push(`${error.event}:${error.error}`));
  const shortToolTurnUsages = [];
  const emit = session.extensionRunner.emit.bind(session.extensionRunner);
  session.extensionRunner.emit = async (event) => {
    if (event?.type === "turn_end" && event.message?.content?.some((part) => part.type === "toolCall")) {
      shortToolTurnUsages.push(session.getContextUsage());
    }
    return emit(event);
  };
  await session.prompt("Use the large tool and return its ordinary final result.");
  for (let i = 0; i < 200 && !(modelCore.getPendingResponseCount() === 0 && session.isIdle && !session.isCompacting); i++) await new Promise((r) => setTimeout(r, 25));
  await session.waitForIdle();
  const shortEntries = Array.from(shortSessionManager.getBranch());
  assert.ok(shortToolTurnUsages.some((usage) => usage?.tokens > 1_000), `toolCall turn_end usage crosses the configured threshold: ${JSON.stringify(shortToolTurnUsages)}`);
  const shortCompactions = shortEntries.filter((entry) => entry.type === "compaction");
  const shortResumes = session.agent.state.messages.filter((message) => message.role === "custom" && ["midrun-compaction-resume", "compaction-resume"].includes(message.customType));
  assert.equal(shortCompactions.length, 0, "no eligible prefix means no native or proactive compaction");
  assert.equal(shortResumes.length, 0, "no compaction error recovery is queued");
  assert.ok(session.agent.state.messages.some((message) => message.role === "assistant" && message.stopReason === "stop" && message.content.some((part) => part.type === "text" && part.text.includes("Ordinary final deliverable"))));
  assert.equal(session.agent.hasQueuedMessages(), false); assert.equal(modelCore.getPendingResponseCount(), 0); assert.deepEqual(shortErrors, []);
} finally {
  session?.dispose();
  if (previousJitiFsCache === undefined) delete process.env.JITI_FS_CACHE; else process.env.JITI_FS_CACHE = previousJitiFsCache;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  fs.rmSync(home, { recursive: true, force: true });
}
console.log("midrun-compaction smoke: PASS");

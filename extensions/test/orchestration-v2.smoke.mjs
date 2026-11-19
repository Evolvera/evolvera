import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "orchestration-v2-"));
const envKeys = ["HOME", "USERPROFILE", "PI_CODING_AGENT_DIR", "PI_SDK_ROOT", "JITI_FS_CACHE", "TMPDIR", "TMP", "TEMP", "XDG_CACHE_HOME", "NPM_CONFIG_CACHE", "PI_OFFLINE"];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const callerSdkRoot = process.env.PI_SDK_ROOT;
const owned = (name) => path.join(root, name);
for (const [key, value] of Object.entries({ HOME: owned("home"), USERPROFILE: owned("home"), PI_CODING_AGENT_DIR: owned("agent"), TMPDIR: owned("tmp"), TMP: owned("tmp"), TEMP: owned("tmp"), XDG_CACHE_HOME: owned("cache"), NPM_CONFIG_CACHE: owned("npm-cache") })) {
  fs.mkdirSync(value, { recursive: true }); process.env[key] = value;
}
process.env.JITI_FS_CACHE = "0";
process.env.PI_OFFLINE = "1";
if (callerSdkRoot) process.env.PI_SDK_ROOT = callerSdkRoot; else delete process.env.PI_SDK_ROOT;
let networkAttempts = 0;
let sessions = [];
const originalFetch = globalThis.fetch;
const originalHttp = { request: http.request, get: http.get, httpsRequest: https.request, httpsGet: https.get };
const blockedRequest = (...args) => { networkAttempts++; throw new Error(`network disabled: ${String(args[0])}`); };
globalThis.fetch = blockedRequest; http.request = blockedRequest; http.get = blockedRequest; https.request = blockedRequest; https.get = blockedRequest;
try {
  const sdkRoot = resolvePiSdkRoot(import.meta.url);
  assert.equal(JSON.parse(fs.readFileSync(path.join(sdkRoot, "package.json"), "utf8")).version, "1.4.0");
  process.env.PI_SDK_ROOT = sdkRoot;
  const sdkUrl = (relative) => pathToFileURL(path.join(sdkRoot, relative)).href;
  const require = createRequire(import.meta.url);
  const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
  const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
  const module = await jiti.import(path.join(repoRoot, "extensions/orchestration-mode.ts"));
  const validUsage = { input: 11, output: 2, cacheRead: 3, cacheWrite: 0, totalTokens: 16 };
  let calls = [];
  const registry = (response, model = { provider: "openai", id: "gpt-6-luna", api: "openai-responses" }) => ({
    find(provider, id) { calls.push({ find: [provider, id] }); return model; },
    streamSimple(target, context, options) {
      calls.push({ target, context, options });
      return { result: () => typeof response === "function" ? response(options.signal) : response };
    },
  });
  const answer = (text, usage = validUsage) => Promise.resolve({ content: [{ type: "text", text }], usage });
  let selected = await module.selectV2Guidance(registry(answer('["workflow","validation","workflow"]')), "diary entry", "new request");
  assert.deepEqual(selected, { available: true, ids: ["workflow", "validation"], usage: validUsage });
  assert.deepEqual(calls[0].find, ["openai", "gpt-6-luna"]);
  assert.equal(calls.filter((call) => call.target).length, 1);
  const firstCall = calls.find((call) => call.target);
  assert.equal(firstCall.options.reasoning, "low");
  assert.equal(firstCall.options.maxRetries, 0);
  assert.deepEqual(Object.keys(firstCall.options).sort(), ["maxRetries", "reasoning", "signal"]);
  const helperPrompt = firstCall.context.messages[0].content[0].text;
  assert.ok(helperPrompt.startsWith(module.V2_GUIDANCE.instructions + "\n\n"));
  assert.ok(helperPrompt.indexOf('"id":"workflow"') < helperPrompt.indexOf("<diary>"));
  assert.ok(helperPrompt.indexOf("<diary>\ndiary entry\n</diary>") < helperPrompt.indexOf("<new_input>\nnew request\n</new_input>"));
  for (const [response, expectedAvailable] of [
    [answer("[]"), true], [answer('["workflow","unknown"]'), false], [answer('{"ids":[]}'), false],
    [answer('["workflow"] trailing'), false], [answer('["workflow'), false],
    [Promise.reject(new Error("synthetic provider failure")), false],
  ]) {
    calls = [];
    const result = await module.selectV2Guidance(registry(response), "", "input");
    assert.equal(result.available, expectedAvailable);
    if (!expectedAvailable) assert.deepEqual(result.ids, []);
  }
  assert.deepEqual(await module.selectV2Guidance(registry(answer('["workflow"]'), null), "", ""), { available: false, ids: [] });
  assert.deepEqual(await module.selectV2Guidance(registry(answer('["workflow"]'), { provider: "openai", id: "gpt-6-luna", api: "pi-virtual" }), "", ""), { available: false, ids: [] });
  assert.deepEqual(await module.selectV2Guidance({ find() { throw new Error("lookup"); }, streamSimple() { throw new Error("unexpected"); } }, "", ""), { available: false, ids: [] });
  calls = [];
  const timed = await module.selectV2Guidance(registry(() => new Promise(() => {})), "", "");
  assert.deepEqual(timed, { available: false, ids: [] });
  assert.equal(calls.find((call) => call.target).options.signal.aborted, true, "timeout aborts underlying request");
  const late = registry(() => new Promise((resolve) => setTimeout(() => resolve({ content: [{ type: "text", text: '["workflow"]' }], usage: validUsage }), 3_050)));
  assert.deepEqual(await module.selectV2Guidance(late, "", ""), { available: false, ids: [] });
  const lateFailure = registry(() => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("late synthetic failure")), 3_050)));
  assert.deepEqual(await module.selectV2Guidance(lateFailure, "", ""), { available: false, ids: [] });
  assert.deepEqual(await module.selectV2Guidance(registry(answer("[]"), { provider: "openai", id: "gpt-6-luna", api: "openai-responses" }), "", ""), { available: true, ids: [], usage: validUsage });
  const streamThrow = { find: () => ({ provider: "openai", id: "gpt-6-luna", api: "openai-responses" }), streamSimple() { throw new Error("sync stream failure"); } };
  assert.deepEqual(await module.selectV2Guidance(streamThrow, "", ""), { available: false, ids: [] });

  const { SessionManager } = await import(sdkUrl("dist/core/session-manager.js"));
  const diaryDir = owned("diary-sessions"); fs.mkdirSync(diaryDir, { recursive: true });
  const diaryManager = SessionManager.create(root, diaryDir);
  diaryManager.appendMessage({ role: "user", content: [{ type: "text", text: "session anchor" }], timestamp: Date.now() });
  const diarySessionFile = diaryManager.getSessionFile();
  const diarySidecar = `${diarySessionFile}.v2-diary`;
  const insideRoot = (target) => path.relative(root, target) !== ".." && !path.relative(root, target).startsWith(`..${path.sep}`) && !path.isAbsolute(path.relative(root, target));
  assert.ok(diarySessionFile && insideRoot(diarySessionFile));
  assert.ok(insideRoot(diarySidecar));
  const diaryHandlers = new Map(); const busHandlers = new Map();
  const diaryPi = { on(name, handler) { diaryHandlers.set(name, handler); }, events: { on(name, handler) { busHandlers.set(name, handler); } } };
  const diaryActive = true;
  const diary = module.observeV2Diary(diaryPi, () => diaryActive);
  const diaryCtx = { sessionManager: diaryManager };
  const emitDiary = (name, event) => diaryHandlers.get(name)(event, diaryCtx);
  emitDiary("message_end", { message: { role: "user", content: [{ type: "text", text: "user diary sentinel" }] } });
  emitDiary("message_end", { message: { role: "assistant", content: [{ type: "text", text: "assistant diary sentinel" }, { type: "thinking", thinking: "hidden reasoning sentinel" }] } });
  emitDiary("message_end", { message: { role: "assistant", content: [{ type: "text", text: "error reply" }], stopReason: "error", errorMessage: "repeated failure sentinel" } });
  for (const name of ["read", "grep", "find", "ls"]) emitDiary("tool_result", { toolName: name, input: { path: `/private/${name}.txt` }, content: [{ type: "text", text: "tool output sentinel" }], isError: false });
  emitDiary("tool_result", { toolName: "bash", input: { command: "printf shell-sentinel" }, content: [{ type: "text", text: "shell output sentinel" }], isError: false });
  emitDiary("tool_result", { toolName: "edit", input: { path: "/private/edit.txt", edits: [{ oldText: "edit-old-sentinel", newText: "edit-new-sentinel" }] }, content: [], isError: false });
  emitDiary("tool_result", { toolName: "write", input: { path: "/private/write.txt", content: "write-content-sentinel" }, content: [], isError: false });
  busHandlers.get("subagents:started")({ id: "worker-1", type: "scout", description: "inspect module" });
  busHandlers.get("subagents:completed")({ id: "worker-1", type: "scout", description: "inspect module" });
  diary.recordGuidance(diaryCtx, ["workflow", "validation"]);
  diaryManager.appendMessage({ role: "bashExecution", command: "synthetic direct sentinel command", output: "direct shell output sentinel", exitCode: 0, cancelled: false, truncated: false, timestamp: Date.now() });
  emitDiary("session_compact", {});
  const diarySnapshot = diary.snapshot(diaryCtx);
  assert.equal(fs.statSync(diarySidecar).mode & 0o777, 0o600);
  const sidecarText = fs.readFileSync(diarySidecar, "utf8");
  for (const secret of ["hidden reasoning sentinel", "tool output sentinel", "shell output sentinel", "direct shell output sentinel", "edit-old-sentinel", "edit-new-sentinel", "write-content-sentinel"]) {
    assert.ok(!sidecarText.includes(secret), `sidecar excludes ${secret}`);
    assert.ok(!diarySnapshot.text.includes(secret), `snapshot excludes ${secret}`);
  }
  for (const kind of ["user", "assistant", "error", "tool", "bash", "edit", "write", "subagent", "guidance", "compaction"]) assert.ok(sidecarText.split("\n").some((line) => JSON.parse(line).kind === kind), `records ${kind}`);
  assert.ok(sidecarText.includes("repeated failure sentinel"));
  const reopenedManager = SessionManager.open(diarySessionFile, diaryDir);
  const resumedDiary = module.observeV2Diary(diaryPi, () => diaryActive);
  assert.equal(resumedDiary.snapshot({ sessionManager: reopenedManager }).text, diarySnapshot.text, "reopens same session sidecar");
  const sidecarBeforeDisabled = fs.readFileSync(diarySidecar, "utf8");
  const disabledDiary = module.observeV2Diary(diaryPi, () => false);
  assert.equal(disabledDiary.snapshot(diaryCtx), undefined);
  disabledDiary.recordGuidance(diaryCtx, ["engineering"]);
  assert.equal(fs.readFileSync(diarySidecar, "utf8"), sidecarBeforeDisabled, "disabled sessions do not touch disk");
  const trimManager = SessionManager.create(root, diaryDir);
  trimManager.appendMessage({ role: "user", content: [{ type: "text", text: "trim anchor" }], timestamp: Date.now() });
  const trimFile = trimManager.getSessionFile();
  const trimSidecar = `${trimFile}.v2-diary`;
  assert.ok(trimFile && insideRoot(trimFile)); assert.ok(insideRoot(trimSidecar));
  const trimDiary = module.observeV2Diary(diaryPi, () => true);
  const expectedTrim = [];
  for (let index = 0; index < 300; index++) {
    const text = `retained-${index}-${"x".repeat(1_500)}`;
    diaryHandlers.get("message_end")({ message: { role: "user", content: [{ type: "text", text }] } }, { sessionManager: trimManager });
    const line = JSON.stringify({ kind: "user", text });
    expectedTrim.push(line);
    while (Math.ceil(Buffer.byteLength(expectedTrim.join("\n"), "utf8") / 4) > 100_000) expectedTrim.splice(0, Math.ceil(expectedTrim.length * 0.6));
  }
  const trimSnapshot = trimDiary.snapshot({ sessionManager: trimManager });
  const retained = trimSnapshot.text.split("\n");
  assert.deepEqual(retained, expectedTrim);
  assert.ok(trimSnapshot.estimatedTokens <= 100_000);
  assert.ok(retained.length < 300);
  const siblingManager = SessionManager.create(root, diaryDir);
  siblingManager.appendMessage({ role: "user", content: [{ type: "text", text: "sibling anchor" }], timestamp: Date.now() });
  const siblingDiary = module.observeV2Diary(diaryPi, () => true);
  assert.equal(siblingDiary.snapshot({ sessionManager: siblingManager }).text, "", "sibling sessions do not inherit diary");
  const memoryManager = SessionManager.inMemory(root);
  const memoryHandlers = new Map();
  const memoryDiary = module.observeV2Diary({ on: (name, handler) => memoryHandlers.set(name, handler), events: { on() {} } }, () => true);
  const memoryCtx = { sessionManager: memoryManager };
  memoryHandlers.get("message_end")({ message: { role: "user", content: [{ type: "text", text: "memory-only" }] } }, memoryCtx);
  const memoryResume = module.observeV2Diary({ on: () => {}, events: { on() {} } }, () => true);
  assert.match(memoryDiary.snapshot(memoryCtx).text, /memory-only/);
  assert.equal(memoryResume.snapshot(memoryCtx).text, "", "in-memory diaries do not use a shared fallback");
  const brokenCtx = { sessionManager: { getSessionId: () => "broken", getSessionFile: () => owned("missing/session.jsonl"), getBranch: () => [] } };
  assert.doesNotThrow(() => {
    const brokenDiary = module.observeV2Diary({ on: (name, handler) => memoryHandlers.set(name, handler), events: { on() {} } }, () => true);
    memoryHandlers.get("message_end")({ message: { role: "user", content: [{ type: "text", text: "io failure" }] } }, brokenCtx);
    assert.equal(brokenDiary.snapshot(brokenCtx), undefined, "failed I/O is unavailable rather than an empty diary");
  });
  console.log(JSON.stringify({ diarySamples: sidecarText.trim().split("\n").map((line) => JSON.parse(line)), diaryTokens: diarySnapshot.estimatedTokens }));

  const { loadExtensions } = await import(sdkUrl("dist/core/extensions/loader.js"));
  const faux = await import(sdkUrl("node_modules/@earendil-works/pi-ai/dist/providers/faux.js"));
  const captured = [];
  const core = faux.createFauxCore({ models: [{ id: "orchestration-v2-test", contextWindow: 32_000, maxTokens: 2_000 }] });
  const modelRuntime = await (await import(sdkUrl("dist/index.js"))).ModelRuntime.create({ authPath: owned("synthetic-auth.json"), modelsPath: null });
  modelRuntime.registerProvider(core.provider, { api: core.api, streamSimple: (model, context, options) => { captured.push(structuredClone(context)); return core.streamSimple(model, context, options); }, apiKey: "synthetic-only", baseUrl: "http://127.0.0.1:9", models: core.models.map((model) => ({ ...model })) });
  fs.writeFileSync(owned("synthetic-auth.json"), JSON.stringify({ synthetic: true }));
  let extensionEnabled = true;
  let decisions = 0;
  const fixture = owned("projection-extension.mjs");
  fs.writeFileSync(fixture, `export default (pi) => { let ids = []; pi.on("before_agent_start", async () => { ids = globalThis.__v2ProjectionEnabled ? (globalThis.__v2Decision(), ["workflow"]) : []; }); pi.on("context", (event) => { if (globalThis.__v2ProjectionEnabled && ids.length) event.messages.push({ role: "user", content: "<v2-guidance id=workflow>synthetic marked guidance</v2-guidance>" }); }); };\n`);
  globalThis.__v2ProjectionEnabled = true;
  globalThis.__v2Decision = () => { decisions++; };
  const extensions = await loadExtensions([fixture], process.env.PI_CODING_AGENT_DIR);
  assert.equal(extensions.diagnostics?.length ?? 0, 0);
  const sdk = await import(sdkUrl("dist/index.js"));
  const resourceLoader = { getExtensions: () => extensions, getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }), getThemes: () => ({ themes: [], diagnostics: [] }), getAgentsFiles: () => ({ agentsFiles: [] }), getSystemPrompt: () => "# PI Coding Agent\nSynthetic normal system prompt.", getSystemPromptSource: () => undefined, getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [], extendResources() {}, reload: async () => {} };
  const uiMessages = [];
  const ui = { notify: (message) => uiMessages.push(message), setStatus() {}, select: async () => undefined, confirm: async () => false, input: async () => undefined, onTerminalInput: () => () => {}, setWorkingMessage() {}, setWorkingVisible() {}, setWorkingIndicator() {}, setHiddenThinkingLabel() {}, setWidget() {}, setFooter() {}, setHeader() {}, setTitle() {}, pasteToEditor() {}, setEditorText() {}, getEditorText: () => "", addAutocompleteProvider() {}, setEditorComponent() {}, getEditorComponent: () => undefined, getAllThemes: () => [], getTheme: () => undefined, setTheme: () => ({ success: false }), getToolsExpanded: () => false, setToolsExpanded() {}, custom: async () => undefined, editor: async () => undefined };
  const manager = sdk.SessionManager.inMemory(root);
  const created = await sdk.createAgentSession({ cwd: root, agentDir: process.env.PI_CODING_AGENT_DIR, model: core.models[0], thinkingLevel: "off", modelRuntime, resourceLoader, sessionManager: manager, tools: [], customTools: [], settingsManager: sdk.SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } }) });
  const session = created.session; sessions.push(session); session.extensionRunner.setUIContext(ui, "tui");
  await session.prompt("first synthetic input"); await session.waitForIdle();
  assert.equal(decisions, 1);
  assert.equal(captured.length, 1);
  const firstMessages = captured[0].messages;
  assert.equal(firstMessages.filter((message) => JSON.stringify(message).includes("synthetic marked guidance")).length, 1);
  assert.ok(firstMessages.some((message) => message.role === "system" && JSON.stringify(message).includes("Synthetic normal system prompt.")));
  assert.ok(!uiMessages.some((message) => String(message).includes("synthetic marked guidance")));
  assert.ok(!Array.from(manager.getBranch()).some((entry) => JSON.stringify(entry).includes("synthetic marked guidance")), "projected guidance is absent from raw session branch");
  globalThis.__v2ProjectionEnabled = false;
  await session.prompt("second synthetic input"); await session.waitForIdle();
  assert.equal(captured.length, 2);
  assert.equal(captured[1].messages.some((message) => JSON.stringify(message).includes("synthetic marked guidance")), false);
  assert.equal(networkAttempts, 0);
  console.log(JSON.stringify({ result: "PASS", selectorCases: "valid, empty, unknown, malformed, partial, lookup/provider errors, timeout, late resolution", sdkRequests: captured.length, firstRequest: "system retained; exactly one projected synthetic guide", history: "guide absent", projectionOff: "guide absent on second request", decisions, networkAttempts, resources: "DISPOSABLE_VERIFIED" }));
} finally {
  for (const session of sessions) session.dispose();
  delete globalThis.__v2ProjectionEnabled; delete globalThis.__v2Decision;
  globalThis.fetch = originalFetch; http.request = originalHttp.request; http.get = originalHttp.get; https.request = originalHttp.httpsRequest; https.get = originalHttp.httpsGet;
  for (const key of envKeys) previousEnv[key] === undefined ? delete process.env[key] : process.env[key] = previousEnv[key];
  fs.rmSync(root, { recursive: true, force: true });
}

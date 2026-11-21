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
  const sourceModeEntry = { type: "custom", customType: module.SESSION_ENTRY_TYPE, data: { mode: "v2", sessionId: "source-session" } };
  assert.equal(module.readSessionMode([sourceModeEntry], "source-session"), "v2");
  assert.equal(module.readSessionMode([sourceModeEntry], "forked-session"), "standard", "a fork without its own v2 entry stays standard");
  const todoEntry = module.V2_GUIDANCE.catalog.find((entry) => entry.id === "todo");
  assert.deepEqual(todoEntry?.source, { skill: "todo" }, "todo hygiene is a selectable skill pointer");
  const historyEntry = module.V2_GUIDANCE.catalog.find((entry) => entry.id === "session-history");
  assert.deepEqual(historyEntry?.source, { skill: "session-history" }, "history recall is a selectable skill pointer");
  assert.match(historyEntry.when, /aquilo que fizemos/, "it triggers on references to earlier work");
  assert.equal(module.V2_AFTER_COMPACTION, "session-history");
  assert.deepEqual(module.V2_BASELINE, ["engineering", "validation"], "helper fallback is engineering and validation only");
  const delegationEntry = module.V2_GUIDANCE.catalog.find((entry) => entry.id === "delegation");
  const validationEntry = module.V2_GUIDANCE.catalog.find((entry) => entry.id === "validation");
  assert.match(delegationEntry.when, /clearly large or multi-area/);
  assert.match(delegationEntry.when, /does not match/, "small solo work is excluded from delegation");
  assert.match(module.V2_GUIDANCE.catalog.find((entry) => entry.id === "workflow").when, /clearly large/);
  assert.match(delegationEntry.source.text, /scout only for an area you do not know/);
  assert.match(delegationEntry.source.text, /max_turns around 15/);
  assert.match(delegationEntry.source.text, /already know where to change/);
  assert.match(validationEntry.source.text, /run the relevant tests yourself/);
  assert.match(validationEntry.source.text, /large or high-risk/);
  assert.match(validationEntry.source.text, /sibling paths/);
  const exploreFrontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(path.join(repoRoot, "agents/Explore.md"), "utf8"))?.[1].split(/\r?\n/) ?? [];
  assert.ok(exploreFrontmatter.some((line) => /^name:\s*Explore\s*$/.test(line)), "Explore agent is named Explore");
  assert.ok(!exploreFrontmatter.some((line) => /^model\s*:/.test(line)), "Explore agent frontmatter pins no model");
  assert.ok(fs.existsSync(path.join(repoRoot, "skills/session-history/SKILL.md")) && fs.existsSync(path.join(repoRoot, "skills/session-history/scripts/session-search.mjs")), "history skill and its helper ship with the harness");
  assert.ok(fs.existsSync(path.join(repoRoot, "skills/todo/SKILL.md")), "todo skill ships with the harness");
  assert.deepEqual(module.V2_COMPANIONS, { delegation: ["workflow", "todo"], workflow: ["todo"], orca: ["todo"], planner: ["todo"] }, "multi-part guidance pulls its companions");
  for (const ids of Object.values(module.V2_COMPANIONS)) assert.ok(ids.every((id) => module.V2_GUIDANCE.catalog.some((entry) => entry.id === id)), "companions are catalog ids");
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
  const late = registry(() => new Promise((resolve) => setTimeout(() => resolve({ content: [{ type: "text", text: '["workflow"]' }], usage: validUsage }), 6_050)));
  assert.deepEqual(await module.selectV2Guidance(late, "", ""), { available: false, ids: [] });
  const lateFailure = registry(() => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("late synthetic failure")), 6_050)));
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
  const sdk = await import(sdkUrl("dist/index.js"));
  const helperUsage = { input: 11, output: 2, cacheRead: 3, cacheWrite: 0, totalTokens: 16 };
  let helperCalls = 0;
  const mainResponse = { role: "assistant", content: [{ type: "text", text: "synthetic answer" }], stopReason: "stop" };
  core.setResponses(Array.from({ length: 12 }, () => mainResponse));
  const modelRuntime = await sdk.ModelRuntime.create({ authPath: owned("synthetic-auth.json"), modelsPath: null });
  modelRuntime.registerProvider(core.provider, { api: core.api, streamSimple: (model, context, options) => { captured.push(structuredClone(context)); return core.streamSimple(model, context, options); }, apiKey: "synthetic-only", baseUrl: "http://127.0.0.1:9", models: core.models.map((model) => ({ ...model })) });
  fs.writeFileSync(owned("synthetic-auth.json"), JSON.stringify({ synthetic: true }));
  globalThis.__v2Selector = async (_registry, _diary, newInput) => { helperCalls++; return { available: true, ids: newInput.includes("skill pointer") ? ["workflow", "prompt-engineering"] : ["workflow"], usage: helperUsage }; };
  const fixture = owned("orchestration-fixture.ts");
  fs.writeFileSync(fixture, `import orchestrationMode from ${JSON.stringify(path.join(repoRoot, "extensions/orchestration-mode.ts"))};\nexport default (pi) => { for (const name of ["read", "Agent", "get_subagent_result", "mcp", "jina_read", "todo"]) pi.registerTool({ name, label: name, description: \`synthetic \${name}\`, parameters: { type: "object", properties: {} }, execute: async () => ({ content: [{ type: "text", text: "ok" }] }) }); globalThis.__v2SendMessage = (message) => pi.sendMessage(message, { triggerTurn: true }); orchestrationMode(pi, (...args) => globalThis.__v2Selector(...args)); };\n`);
  const extensions = await loadExtensions([fixture], process.env.PI_CODING_AGENT_DIR);
  assert.equal(extensions.diagnostics?.length ?? 0, 0);
  const systemMd = fs.readFileSync(path.join(repoRoot, "SYSTEM.md"), "utf8");
  const resourceLoader = { getExtensions: () => extensions, getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }), getThemes: () => ({ themes: [], diagnostics: [] }), getAgentsFiles: () => ({ agentsFiles: [] }), getSystemPrompt: () => systemMd, getSystemPromptSource: () => undefined, getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [], extendResources() {}, reload: async () => {} };
  const uiMessages = [];
  const statuses = new Map();
  const ui = { notify: (message) => uiMessages.push(message), setStatus: (key, value) => value === undefined ? statuses.delete(key) : statuses.set(key, value), select: async () => undefined, confirm: async () => false, input: async () => undefined, onTerminalInput: () => () => {}, setWorkingMessage() {}, setWorkingVisible() {}, setWorkingIndicator() {}, setHiddenThinkingLabel() {}, setWidget() {}, setFooter() {}, setHeader() {}, setTitle() {}, pasteToEditor() {}, setEditorText() {}, getEditorText: () => "", addAutocompleteProvider() {}, setEditorComponent() {}, getEditorComponent: () => undefined, getAllThemes: () => [], getTheme: () => undefined, setTheme: () => ({ success: false }), getToolsExpanded: () => false, setToolsExpanded() {}, custom: async () => undefined, editor: async () => undefined };
  const manager = sdk.SessionManager.inMemory(root);
  const created = await sdk.createAgentSession({ cwd: root, agentDir: process.env.PI_CODING_AGENT_DIR, model: core.models[0], thinkingLevel: "off", modelRuntime, resourceLoader, sessionManager: manager, tools: ["read", "Agent", "get_subagent_result", "mcp", "jina_read", "todo"], customTools: [], settingsManager: sdk.SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: true, reserveTokens: 1_024, keepRecentTokens: 1 } }) });
  const session = created.session; sessions.push(session); session.extensionRunner.setUIContext(ui, "tui");
  const command = (args) => session.extensionRunner.getCommand("orchestration").handler(args, session.extensionRunner.createCommandContext());
  await session.prompt("standard baseline input"); await session.waitForIdle();
  const systemText = (message) => typeof message.sections?.preamble === "string" ? Object.values(message.sections).filter((value) => typeof value === "string").join("\n") : typeof message.content === "string" ? message.content : JSON.stringify(message.content);
  const mainRequests = () => captured.filter((request) => request.messages.some((message) => message.role === "system" && /^(?:# PI Coding Agent|## Role)/.test(systemText(message))));
  const standardSystem = systemText(mainRequests()[0].messages.find((message) => message.role === "system"));
  const allTools = ["read", "Agent", "get_subagent_result", "mcp", "jina_read", "todo"];
  const requestTools = (request) => {
    const declared = new Set();
    for (const message of request.messages) {
      for (const tool of message.toolsRemoved ?? []) declared.delete(tool?.name ?? tool);
      for (const tool of message.toolsAdded ?? []) declared.add(tool?.name ?? tool);
    }
    return allTools.filter((name) => declared.has(name));
  };
  assert.deepEqual(requestTools(mainRequests()[0]), allTools, "standard requests declare every active tool");
  await command("v2");
  assert.equal(statuses.get("orchestration-mode"), "V2");
  await session.prompt("first synthetic input"); await session.waitForIdle();
  assert.equal(helperCalls, 1);
  assert.deepEqual(requestTools(mainRequests().at(-1)), ["read", "Agent", "get_subagent_result", "todo"], "the first v2 request declares only the lean tool set; workflow guidance turns todo on");
  const v2Request = mainRequests().at(-1).messages;
  const v2System = systemText(v2Request.find((message) => message.role === "system"));
  for (const heading of ["Role", "Communication and Explanation", "Operating Contract", "Retrieval and Evidence", "Authorization Modes and Continuation", "Safety", "Stop Rules"]) assert.ok(v2System.includes(`## ${heading}`), `keeps ${heading}`);
  for (const heading of ["Workflow Selection", "Skills and Delegation", "Orca Workers", "Project Memory", "Engineering and Architecture", "Validation and Completion"]) assert.ok(!new RegExp(`^## ${heading}$`, "m").test(v2System), `drops ${heading}`);
  assert.ok(v2System.includes(module.V2_GUIDANCE.preamble));
  assert.ok(v2System.includes(module.extractSection(systemMd, "Stop Rules")));
  assert.ok(v2System.endsWith(standardSystem.slice(systemMd.length)), "retains the assembled prompt appendix after the source block");
  const guide = v2Request.filter((message) => JSON.stringify(message).includes("<v2-guidance id=workflow>"));
  assert.equal(guide.length, 1);
  assert.equal(guide[0].content, `<v2-guidance id=workflow>${module.extractSection(systemMd, "Workflow Selection")}</v2-guidance>`, "projects the exact section body through context");
  assert.ok(v2Request.some((message) => message.content === `<v2-guidance id=todo>${module.v2SkillPointer("todo")}</v2-guidance>`), "workflow delivers the todo skill pointer as its companion");
  assert.ok(uiMessages.some((message) => String(message).includes("V2 guidance: workflow, todo")));
  assert.ok(!JSON.stringify(v2Request).includes("V2 guidance:"), "decision notice stays out of provider requests");
  assert.ok(!Array.from(manager.getBranch()).some((entry) => JSON.stringify(entry).includes("<v2-guidance")), "projected guidance is absent from raw session branch");
  await session.prompt("repeat same guidance input"); await session.waitForIdle();
  assert.equal(helperCalls, 2, "one selection per user run");
  assert.equal(mainRequests().at(-1).messages.filter((message) => JSON.stringify(message).includes("<v2-guidance id=workflow>")).length, 1, "same guide is not added as a second batch");
  const laterMessages = mainRequests().at(-1).messages.filter((message) => message.role !== "system");
  const guideAt = laterMessages.findIndex((message) => JSON.stringify(message).includes("<v2-guidance id=workflow>"));
  assert.ok(guideAt > 0 && laterMessages[guideAt - 1].role === "user" && guideAt < laterMessages.length - 1, "guidance stays anchored after the run that selected it");
  await session.compact();
  const compactionRequests = captured.filter((request) => request.messages.some((message) => message.role === "system" && systemText(message).startsWith("You are a context summarization assistant")));
  assert.ok(compactionRequests.length > 0, "SDK performed a real synthetic compaction request");
  assert.ok(compactionRequests.every((request) => !JSON.stringify(request.messages).includes("<v2-guidance")), "compactor never receives projected guidance");
  await session.prompt("skill pointer guidance after successful compaction"); await session.waitForIdle();
  assert.equal(helperCalls, 3);
  assert.equal([...manager.getBranch()].filter((entry) => entry.customType === "orchestration-v2-delivery").length, 3, "one new compact metadata batch follows compaction");
  const postCompactMessages = mainRequests().at(-1).messages;
  assert.equal(postCompactMessages.filter((message) => JSON.stringify(message).includes("<v2-guidance id=workflow>")).length, 1, "successful compaction permits redelivery of the same id");
  assert.ok(postCompactMessages.some((message) => message.content === `<v2-guidance id=prompt-engineering>${module.v2SkillPointer("prompt-engineering")}</v2-guidance>`), "skill guidance is a pointer, not loaded skill text");
  const historyPointer = `<v2-guidance id=session-history>${module.v2SkillPointer("session-history")}</v2-guidance>`;
  assert.ok(postCompactMessages.some((message) => message.content === historyPointer), "the first prompt after a compaction gets history recall");
  const historyDeliveries = [...manager.getBranch()].filter((entry) => entry.customType === "orchestration-v2-delivery" && entry.data.ids.includes("session-history")).length;
  assert.equal(historyDeliveries, 2, "history recall is delivered once per compaction window, not on every prompt");
  await command("status");
  assert.ok(uiMessages.some((message) => String(message).includes("guidance workflow, todo, prompt-engineering") && String(message).includes("helper tokens 33 in / 6 out")), "V2 status reports active ids and accumulated helper usage");
  const callsBeforeCustom = helperCalls;
  globalThis.__v2SendMessage({ customType: "synthetic-custom", content: "custom-started run", display: false });
  await session.waitForIdle();
  assert.equal(helperCalls, callsBeforeCustom, "custom-started runs do not call the helper");
  globalThis.__v2Selector = async () => { helperCalls++; return { available: false, ids: [] }; };
  const deliveriesBeforeUnavailable = [...manager.getBranch()].filter((entry) => entry.customType === "orchestration-v2-delivery").length;
  await session.prompt("helper unavailable input"); await session.waitForIdle();
  const fallbackDelivery = [...manager.getBranch()].filter((entry) => entry.customType === "orchestration-v2-delivery");
  assert.equal(fallbackDelivery.length, deliveriesBeforeUnavailable + 1, "unavailable selection falls back to the baseline");
  assert.deepEqual(fallbackDelivery.at(-1).data.ids, ["engineering", "validation"], "helper failure delivers only engineering and validation");
  const fallbackRequest = mainRequests().at(-1).messages;
  assert.ok(fallbackRequest.some((message) => message.content === `<v2-guidance id=validation>${validationEntry.source.text}</v2-guidance>`), "validation projects its own short text");
  assert.ok(fallbackRequest.some((message) => message.content === `<v2-guidance id=engineering>${module.extractSection(systemMd, "Engineering and Architecture")}</v2-guidance>`), "engineering projects its SYSTEM.md section");
  assert.ok(!JSON.stringify(fallbackRequest).includes(JSON.stringify(module.extractSection(systemMd, "Validation and Completion")).slice(1, -1)), "validation does not project the long SYSTEM.md section");
  for (const id of ["delegation", "orca", "memory"]) assert.ok(!fallbackDelivery.at(-1).data.ids.includes(id), `fallback omits ${id}`);
  assert.ok(uiMessages.some((message) => String(message).includes("helper unavailable, baseline sections")), "unavailable selection is visible only through UI notification");
  const previousReportRun = process.env.PI_REPORT_RUN;
  process.env.PI_REPORT_RUN = "run_A1";
  try {
    await session.prompt("Orca child worker prompt"); await session.waitForIdle();
    assert.equal(helperCalls, 4, "Orca child prompts never call the helper");
    assert.equal(systemText(mainRequests().at(-1).messages.find((message) => message.role === "system")), standardSystem, "Orca child prompt keeps the standard system block");
  } finally {
    if (previousReportRun === undefined) delete process.env.PI_REPORT_RUN;
    else process.env.PI_REPORT_RUN = previousReportRun;
  }
  await command("standard");
  assert.equal(statuses.has("orchestration-mode"), false);
  await session.prompt("standard after v2"); await session.waitForIdle();
  assert.equal(helperCalls, 4, "standard never calls the helper");
  assert.equal(systemText(mainRequests().at(-1).messages.find((message) => message.role === "system")), standardSystem, "standard system prompt exactly matches its baseline");
  assert.equal(mainRequests().at(-1).messages.some((message) => JSON.stringify(message).includes("<v2-guidance")), false, "standard request contains no v2 guidance");
  assert.deepEqual(requestTools(mainRequests().at(-1)), allTools, "leaving v2 restores every tool");
  assert.ok(uiMessages.some((message) => String(message).includes("helper tokens 33 in / 6 out")), "status reports accumulated helper usage");
  for (const [id, profile] of [["deepseek-v4.1-flash-fast", "deepseek"], ["deepseek-v4.1-flash-abliterated-fast", "deepseek"], ["gpt-6.1-terra", "terra"], ["kimi-k3.1-pro", "kimi"], ["kimi-k3.1-pro-abliterated", "kimi"], ["claude-sonnet-5-5", "sonnet"], ["claude-opus-5-5", undefined], ["gpt-6-luna", undefined], ["gpt-6.1", undefined]]) assert.equal(module.v2ProfileFor({ id }), profile, `profile of ${id}`);
  assert.equal(module.v2ProfileFor(undefined), undefined);
  assert.deepEqual(Object.keys(module.V2_PROFILES), ["deepseek", "terra", "kimi", "sonnet"]);
  {
    const handlers = new Map();
    const profileManager = sdk.SessionManager.inMemory(root);
    const notices = [];
    let selectorCalls = 0;
    const fakePi = { on: (name, handler) => handlers.set(name, handler), registerCommand() {}, appendEntry: (type, data) => profileManager.appendCustomEntry(type, data), events: { emit() {}, on() {} }, getThinkingLevel: () => "medium", setThinkingLevel() {}, getActiveTools: () => [], setActiveTools() {} };
    module.default(fakePi, async () => { selectorCalls++; return { available: false, ids: [] }; });
    const setMode = (mode) => profileManager.appendCustomEntry("orchestration-mode", mode === "v2" ? { mode, sessionId: profileManager.getSessionId() } : { mode });
    const ctxFor = (id) => ({ sessionManager: profileManager, model: { provider: "refuseless", id }, modelRegistry: {}, getSystemPrompt: () => systemMd, ui: { notify: (message) => notices.push(message), setStatus() {} } });
    const send = async (id, prompt) => {
      const result = await handlers.get("before_agent_start")({ systemPromptOptions: { customPrompt: systemMd }, systemPrompt: systemMd, messageType: "user", prompt }, ctxFor(id));
      const event = { messages: [] };
      handlers.get("context")(event, ctxFor(id));
      return { result, projected: event.messages.map((message) => message.content).join("\n") };
    };
    const agentCall = (id, input) => { const event = { type: "tool_call", toolName: "Agent", toolCallId: "t", input }; return Promise.resolve(handlers.get("tool_call")(event, ctxFor(id))).then((result) => ({ result, input })); };
    const previousRun = process.env.PI_REPORT_RUN;
    const previousCwd = process.cwd();
    const projectDir = owned("agent-project");
    const agentFile = (dir, file, frontmatter) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, file), `---\n${frontmatter}\n---\nbody\n`); };
    const globalAgents = path.join(process.env.PI_CODING_AGENT_DIR, "agents");
    agentFile(globalAgents, "bg-global.md", "name: bg-global\nrun_in_background: true");
    agentFile(globalAgents, "fg-global.md", "name: fg-global\nrun_in_background: false");
    agentFile(globalAgents, "plain.md", "name: plain");
    agentFile(globalAgents, "alias-file.md", "name: declared-bg\nrun_in_background: true");
    agentFile(globalAgents, "no-name-file.md", "run_in_background: true");
    agentFile(globalAgents, "shadowed.md", "name: shadowed\nrun_in_background: true");
    agentFile(globalAgents, "disabled-bg.md", "name: disabled-bg\nrun_in_background: true\nenabled: false");
    agentFile(globalAgents, "quoted.md", "name: quoted\nrun_in_background: \"true\"");
    agentFile(path.join(projectDir, ".agents", "agents"), "workspace-bg.md", "name: workspace-bg\nrun_in_background: true");
    agentFile(path.join(projectDir, ".pi", "agents"), "shadowed.md", "name: shadowed\nrun_in_background: false");
    agentFile(path.join(projectDir, ".pi", "agents"), "plain.md", "name: plain\nrun_in_background: true");
    agentFile(path.join(projectDir, ".pi", "agents"), "Explore.md", "name: Explore\nrun_in_background: true");
    delete process.env.PI_REPORT_RUN;
    process.chdir(projectDir);
    try {
      setMode("v2");
      const deepseek = await send("deepseek-v4.1-flash-abliterated-fast", "fix the bug");
      assert.equal(selectorCalls, 0, "a profile never calls the helper");
      assert.ok(deepseek.result?.systemPrompt, "the profile runs on the v2 prompt");
      assert.ok(notices.at(-1).startsWith("V2 guidance [profile deepseek]: engineering, profile-deepseek"), notices.at(-1));
      assert.ok(deepseek.projected.includes(`<v2-guidance id=profile-deepseek>${module.V2_PROFILES.deepseek.text}</v2-guidance>`));
      assert.ok(deepseek.projected.includes(`<v2-guidance id=engineering>${module.extractSection(systemMd, "Engineering and Architecture")}</v2-guidance>`));
      for (const phrase of ["Work solo", "sibling paths", "ONLY the test files", "Never run the whole suite", "locate, fix (including siblings), test the related files, commit/answer"]) assert.ok(deepseek.projected.includes(phrase), `deepseek text: ${phrase}`);
      assert.ok(!deepseek.projected.includes("run it in the foreground") && !deepseek.projected.includes("Save turns"));
      for (const id of ["deepseek-v4.1-flash-fast", "kimi-k3.1-pro"]) {
        const blocked = await agentCall(id, { prompt: "p", description: "d" });
        assert.equal(blocked.result?.block, true, `${id} blocks Agent`);
        assert.match(blocked.result.reason, /^Profile (deepseek|kimi): do it yourself\.$/);
      }
      const bash = { type: "tool_call", toolName: "bash", toolCallId: "t", input: { command: "ls" } };
      assert.equal(await handlers.get("tool_call")(bash, ctxFor("deepseek-v4.1-flash-fast")), undefined, "only Agent is guarded");

      const terra = await send("gpt-6.1-terra", "next task");
      assert.equal(selectorCalls, 0);
      assert.ok(notices.at(-1).startsWith("V2 guidance [profile terra]: profile-terra"), notices.at(-1));
      assert.ok(terra.projected.includes(module.V2_PROFILES.terra.text) && terra.projected.includes("wait for its result before ending the turn"));
      assert.ok(!terra.projected.includes(module.V2_PROFILES.deepseek.text), "a model switch drops the previous profile text");
      for (const input of [{ prompt: "p", description: "d", run_in_background: true }, { prompt: "p", description: "d" }]) {
        const forced = await agentCall("gpt-6.1-terra", input);
        assert.equal(forced.result, undefined, "terra is not blocked");
        assert.strictEqual(forced.input.run_in_background, false, "terra Agent runs in the foreground");
      }

      const terraBlockReason = "perfil terra: subagente em background não permitido; faça você mesmo ou use um agente em primeiro plano";
      const terraAgent = (input) => agentCall("gpt-6.1-terra", { prompt: "p", description: "d", ...input });
      for (const input of [
        { subagent_type: "bg-global" }, { subagent_type: "BG-Global" }, { subagent_type: "  bg-global  " }, { subagent_type: "declared-bg" }, { subagent_type: "no-name-file" },
        { subagent_type: "workspace-bg" }, { subagent_type: "plain" }, { subagent_type: "Explore" }, { subagent_type: "fg-global", schedule: "+10m" }, { subagent_type: "bg-global", resume: "agent-1" },
      ]) {
        const blocked = await terraAgent({ ...input, run_in_background: false });
        assert.deepEqual(blocked.result, { block: true, reason: terraBlockReason }, `terra blocks ${JSON.stringify(input)}`);
      }
      for (const input of [
        { subagent_type: "fg-global" }, { subagent_type: "shadowed" }, { subagent_type: "alias-file" }, { subagent_type: "disabled-bg" }, { subagent_type: "quoted" },
        { subagent_type: "general-purpose" }, { subagent_type: "does-not-exist" }, { subagent_type: "Plan" }, { subagent_type: "fg-global", resume: "agent-1" }, {},
      ]) {
        const allowed = await terraAgent(input);
        assert.equal(allowed.result, undefined, `terra allows ${JSON.stringify(input)}`);
        assert.strictEqual(allowed.input.run_in_background, false, `terra forces foreground for ${JSON.stringify(input)}`);
      }
      assert.deepEqual((await terraAgent({ subagent_type: "fg-global", schedule: "" })).result, undefined, "an empty schedule is no schedule");
      fs.mkdirSync(path.join(projectDir, ".pi"), { recursive: true });
      fs.writeFileSync(path.join(projectDir, ".pi", "subagents.json"), JSON.stringify({ fallbackSubagent: "bg-global" }));
      assert.deepEqual((await terraAgent({ subagent_type: "does-not-exist" })).result, { block: true, reason: terraBlockReason }, "a fallback agent pinned to background blocks an unknown type");
      assert.equal((await terraAgent({ subagent_type: "fg-global" })).result, undefined, "a known foreground agent ignores the fallback");
      fs.writeFileSync(path.join(projectDir, ".pi", "subagents.json"), JSON.stringify({ fallbackSubagent: false }));
      assert.equal((await terraAgent({ subagent_type: "does-not-exist" })).result, undefined, "no fallback refuses the spawn without a block");
      fs.rmSync(path.join(projectDir, ".pi", "subagents.json"));
      assert.equal((await agentCall("gpt-6.1-terra", { prompt: "p", description: "d", subagent_type: "bg-global", run_in_background: false })).result?.reason, terraBlockReason);
      const bash2 = { type: "tool_call", toolName: "bash", toolCallId: "t", input: { command: "ls" } };
      assert.equal(await handlers.get("tool_call")(bash2, ctxFor("gpt-6.1-terra")), undefined, "terra still only guards Agent");
      for (const id of ["deepseek-v4.1-flash-fast", "kimi-k3.1-pro"]) assert.equal((await agentCall(id, { subagent_type: "fg-global" })).result?.block, true, `${id} still blocks every Agent call`);
      assert.match((await agentCall("kimi-k3.1-pro", { subagent_type: "fg-global" })).result.reason, /^Profile kimi: do it yourself\.$/);

      const kimi = await send("kimi-k3.1-pro-abliterated", "another task");
      assert.ok(notices.at(-1).startsWith("V2 guidance [profile kimi]: profile-kimi"), notices.at(-1));
      assert.ok(kimi.projected.includes("read several relevant files at once") && !kimi.projected.includes(module.V2_PROFILES.terra.text));
      assert.equal((await agentCall("kimi-k3.1-pro-abliterated", { prompt: "p", description: "d" })).result?.block, true);

      const unknown = await send("gpt-6-luna-other", "unprofiled task");
      assert.equal(selectorCalls, 1, "an unknown model keeps the helper path");
      assert.ok(notices.at(-1).startsWith("V2 guidance (helper unavailable, baseline sections): validation"), notices.at(-1));
      assert.ok(!unknown.projected.includes("Work solo"), "an unknown model gets no profile text");
      const kept = await agentCall("gpt-6-luna-other", { prompt: "p", description: "d", subagent_type: "bg-global", run_in_background: true });
      assert.equal(kept.result, undefined);
      assert.strictEqual(kept.input.run_in_background, true, "an unknown model keeps its Agent input");

      process.env.PI_REPORT_RUN = "run_A1";
      assert.equal((await send("deepseek-v4.1-flash-fast", "worker task")).result, undefined, "Orca workers keep the standard prompt");
      assert.equal((await agentCall("deepseek-v4.1-flash-fast", { prompt: "p", description: "d" })).result, undefined, "Orca workers are not guarded");
      delete process.env.PI_REPORT_RUN;

      setMode("standard");
      const standard = await send("deepseek-v4.1-flash-fast", "standard task");
      assert.equal(standard.result, undefined);
      assert.equal(standard.projected, "", "standard projects no guidance");
      assert.equal(selectorCalls, 1, "standard never calls the helper");
      const standardAgent = await agentCall("gpt-6.1-terra", { prompt: "p", description: "d", subagent_type: "bg-global", run_in_background: true });
      assert.equal(standardAgent.result, undefined, "standard does not guard Agent");
      assert.strictEqual(standardAgent.input.run_in_background, true);
    } finally {
      process.chdir(previousCwd);
      if (previousRun === undefined) delete process.env.PI_REPORT_RUN; else process.env.PI_REPORT_RUN = previousRun;
    }
  }
  {
    const handlers = new Map();
    const leanManager = sdk.SessionManager.inMemory(root);
    const fakePi = { on: (name, handler) => handlers.set(name, handler), registerCommand() {}, appendEntry: (type, data) => leanManager.appendCustomEntry(type, data), events: { emit() {}, on() {} }, getThinkingLevel: () => "medium", setThinkingLevel() {}, getActiveTools: () => [], setActiveTools() {} };
    module.default(fakePi, async () => ({ available: false, ids: [] }));
    const ctxFor = (id) => ({ sessionManager: leanManager, model: { provider: "synthetic", id }, modelRegistry: {}, getSystemPrompt: () => systemMd, ui: { notify() {}, setStatus() {} } });
    const start = async (id, options = {}) => {
      const systemPrompt = options.systemPrompt ?? systemMd;
      const result = await handlers.get("before_agent_start")({ systemPromptOptions: { customPrompt: systemMd, skills: options.skills ?? [] }, systemPrompt, messageType: "user", prompt: options.prompt ?? "task" }, ctxFor(id));
      const event = { messages: [] };
      handlers.get("context")(event, ctxFor(id));
      return { systemPrompt: result?.systemPrompt, projected: event.messages.map((message) => message.content).join("\n") };
    };
    leanManager.appendCustomEntry("orchestration-mode", { mode: "v2", sessionId: leanManager.getSessionId() });
    const agentDir = process.env.PI_CODING_AGENT_DIR;
    const extracted = await start("claude-sonnet-5-5");
    assert.ok(extracted.systemPrompt.includes("## Operating Contract"), "without SYSTEM-v2.md the core is extracted from SYSTEM.md");
    assert.ok(extracted.projected.includes(`<v2-guidance id=engineering>${module.extractSection(systemMd, "Engineering and Architecture")}</v2-guidance>`), "without v2-engineering.md engineering is the SYSTEM.md section");
    const anchorEvent = { messages: [{ role: "user", content: "earlier prompt", timestamp: 1 }, { role: "assistant", content: [{ type: "text", text: "earlier answer" }], timestamp: 2 }, { role: "user", content: "task", timestamp: Date.now() + 5_000 }] };
    handlers.get("context")(anchorEvent, ctxFor("claude-sonnet-5-5"));
    assert.deepEqual(anchorEvent.messages.slice(0, 3).map((message) => message.timestamp), [1, 2, anchorEvent.messages[2].timestamp]);
    assert.equal(anchorEvent.messages[2].content, "task");
    assert.ok(anchorEvent.messages.slice(3).every((message) => message.content.startsWith("<v2-guidance id=")) && anchorEvent.messages.length > 3, "guidance follows the prompt that selected it even when the prompt is timestamped later than the delivery");
    assert.deepEqual(anchorEvent.messages.slice(3).map((message) => /^<v2-guidance id=([^>]+)>/.exec(message.content)[1]), ["engineering", "profile-sonnet"], "guides keep their delivery order");
    fs.writeFileSync(path.join(agentDir, "SYSTEM-v2.md"), "# Compact core placeholder\n");
    fs.writeFileSync(path.join(agentDir, "v2-engineering.md"), "Engineering placeholder\n");
    const compact = await start("claude-sonnet-5-5");
    assert.equal(compact.systemPrompt, `# Compact core placeholder\n\n${module.V2_GUIDANCE.preamble}`, "SYSTEM-v2.md replaces the extracted core and keeps the guidance preamble");
    assert.ok(compact.projected.includes("<v2-guidance id=engineering>Engineering placeholder</v2-guidance>"), "v2-engineering.md replaces the engineering section");
    fs.rmSync(path.join(agentDir, "SYSTEM-v2.md"));
    fs.rmSync(path.join(agentDir, "v2-engineering.md"));

    const { buildSystemPrompt } = await import(sdkUrl("dist/core/system-prompt.js"));
    const longSentence = `Beta ${"word ".repeat(30)}ends here. Second sentence stays out.`;
    const skills = [
      { name: "alpha", description: `Alpha does one thing. It also triggers on a second condition. Details that the compact list drops ${"because the line is full ".repeat(3)}here.`, filePath: path.join(agentDir, "skills", "alpha", "SKILL.md"), baseDir: path.join(agentDir, "skills", "alpha") },
      { name: "beta", description: longSentence, filePath: owned("extra-skills/beta/SKILL.md"), baseDir: owned("extra-skills/beta") },
      { name: "gamma", description: "Hidden from the model.", filePath: path.join(agentDir, "skills", "gamma", "SKILL.md"), baseDir: path.join(agentDir, "skills", "gamma"), disableModelInvocation: true },
    ];
    const assembled = buildSystemPrompt({ customPrompt: systemMd, selectedTools: ["read", "bash"], skills, cwd: root });
    assert.ok(assembled.includes("<available_skills>") && assembled.includes("Details that the compact list drops"), "the SDK prompt carries the full skills block");
    const lean = await start("claude-sonnet-5-5", { systemPrompt: assembled, skills });
    const skillsBlock = /<skills>\n([\s\S]*?)\n<\/skills>/.exec(lean.systemPrompt)?.[1];
    assert.ok(skillsBlock, "v2 keeps a skills section");
    assert.ok(!lean.systemPrompt.includes("<available_skills>") && !lean.systemPrompt.includes("Details that the compact list drops"), "v2 drops the full skills block");
    const skillLines = skillsBlock.split("\n");
    assert.equal(skillLines[0], `Each skill below is at ${path.join(agentDir, "skills", "<name>", "SKILL.md")} unless its line gives a path. Read that file when the task matches the skill, and resolve its relative paths against the skill's directory.`);
    assert.equal(skillLines[1], "- alpha: Alpha does one thing. It also triggers on a second condition.", "whole sentences are kept while the line fits 120 chars");
    assert.match(skillLines[2], new RegExp(`^- beta: Beta (word )+word… \\(${owned("extra-skills/beta/SKILL.md").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)$`), "long first sentences are cut and outside skills keep their path");
    assert.equal(skillLines.length, 3, "disable-model-invocation skills stay excluded");
    assert.ok(/^- beta: (.*)… /.exec(skillLines[2])[1].length <= 119, "a long first sentence is cut to the limit");
    const { loadSkillsFromDir } = await import(sdkUrl("dist/core/skills.js"));
    const realSkills = ["agent-guide", "teach-me"].flatMap((name) => loadSkillsFromDir({ dir: path.join(repoRoot, "skills", name), source: "path" }).skills);
    assert.equal(realSkills.length, 2);
    const teachMe = realSkills.find((skill) => skill.name === "teach-me");
    assert.ok(teachMe.disableModelInvocation && teachMe.description.startsWith("User-invoked adaptive tutor for software engineering and system architecture, from absolute"), "the SDK hands over the parsed folded YAML text");
    assert.equal(module.v2SkillsList(realSkills, path.join(repoRoot, "skills")).split("\n").length, 2, "teach-me stays excluded as disable-model-invocation");
    const realLines = module.v2SkillsList(realSkills.map((skill) => ({ ...skill, disableModelInvocation: false })), path.join(repoRoot, "skills")).split("\n").slice(1);
    assert.equal(realLines[0], "- agent-guide: Mandatory pre-flight skill. Load BEFORE using scout, bug-hunt, planner, builder, or qa.", "the trigger condition survives");
    assert.match(realLines[1], /^- teach-me: User-invoked adaptive tutor for software engineering and system architecture, from absolute/, "folded YAML descriptions arrive as their real text");
    assert.ok(!realLines[1].includes(">-") && realLines[1].length <= "- teach-me: ".length + 120);
    assert.ok(lean.systemPrompt.endsWith(`</skills>\n\n<cwd>\n${root.replace(/\\/g, "/")}\n</cwd>`), "the sections after skills are untouched");
  }
  {
    const handlers = new Map();
    let commandHandler;
    const toolManager = sdk.SessionManager.inMemory(root);
    const original = ["read", "bash", "edit", "write", "grep", "Agent", "get_subagent_result", "steer_subagent", "mcp", "mcp__blender", "generate_image", "jina_read", "pi_env_inspect", "pi_validate_skill", "goal_complete", "goal_blocked", "todo", "memory_recall"];
    let active = [...original];
    let setCalls = 0;
    let helperIds = [];
    const fakePi = { on: (name, handler) => handlers.set(name, handler), registerCommand: (_name, options) => { commandHandler = options.handler; }, appendEntry: (type, data) => toolManager.appendCustomEntry(type, data), events: { emit() {}, on() {} }, getThinkingLevel: () => "medium", setThinkingLevel() {}, getActiveTools: () => [...active], setActiveTools: (names) => { setCalls++; active = [...names]; } };
    module.default(fakePi, async () => ({ available: true, ids: helperIds, usage: validUsage }));
    const ctxFor = (id) => ({ sessionManager: toolManager, model: { provider: "synthetic", id }, modelRegistry: {}, getSystemPrompt: () => systemMd, ui: { notify() {}, setStatus() {} } });
    const start = (id, prompt = "task") => handlers.get("before_agent_start")({ systemPromptOptions: { customPrompt: systemMd, skills: [] }, systemPrompt: systemMd, messageType: "user", prompt }, ctxFor(id));
    const setMode = (mode) => toolManager.appendCustomEntry("orchestration-mode", mode === "v2" ? { mode, sessionId: toolManager.getSessionId() } : { mode });
    const previousRun = process.env.PI_REPORT_RUN;
    delete process.env.PI_REPORT_RUN;
    try {
      setMode("standard");
      await start("claude-sonnet-5-5");
      assert.deepEqual(active, original, "standard mode leaves the tool set alone");
      assert.equal(setCalls, 0);
      setMode("v2");
      await start("claude-sonnet-5-5");
      assert.deepEqual(active, ["read", "bash", "edit", "write", "grep", "Agent", "goal_complete", "goal_blocked"], "foreground profile: lean set with Agent, no background agent tools, no todo yet");
      const callsAfterFirst = setCalls;
      await start("claude-sonnet-5-5");
      assert.equal(setCalls, callsAfterFirst, "an unchanged lean set is not set again");
      await start("deepseek-v4.1-flash-fast");
      assert.deepEqual(active, ["read", "bash", "edit", "write", "grep", "goal_complete", "goal_blocked"], "a blocking profile drops Agent");
      helperIds = ["validation"];
      await start("gpt-6-luna-other");
      assert.deepEqual(active, ["read", "bash", "edit", "write", "grep", "Agent", "get_subagent_result", "steer_subagent", "goal_complete", "goal_blocked"], "an unprofiled model keeps background agent tools");
      helperIds = ["planner"];
      await start("gpt-6-luna-other", "plan the migration");
      assert.ok(active.includes("todo"), "planner guidance turns todo on");
      await start("claude-sonnet-5-5");
      assert.deepEqual(active, ["read", "bash", "edit", "write", "grep", "Agent", "goal_complete", "goal_blocked", "todo"], "todo stays on for the rest of the session");
      for (const dropped of ["mcp", "mcp__blender", "generate_image", "jina_read", "pi_env_inspect", "pi_validate_skill", "memory_recall"]) assert.ok(!active.includes(dropped), `v2 drops ${dropped}`);
      await commandHandler("standard", { ...ctxFor("claude-sonnet-5-5"), ui: { notify() {}, setStatus() {} } });
      assert.deepEqual(active, original, "leaving v2 through the command restores the previous tool set");
      setMode("v2");
      await start("claude-sonnet-5-5");
      assert.notDeepEqual(active, original);
      setMode("standard");
      await start("claude-sonnet-5-5");
      assert.deepEqual(active, original, "a standard run after v2 restores the previous tool set");
      setMode("v2");
      await start("claude-sonnet-5-5");
      process.env.PI_REPORT_RUN = "run_A1";
      await start("claude-sonnet-5-5");
      assert.deepEqual(active, original, "Orca workers keep the full tool set");
    } finally {
      if (previousRun === undefined) delete process.env.PI_REPORT_RUN; else process.env.PI_REPORT_RUN = previousRun;
    }
  }
  {
    const handlers = new Map();
    const descManager = sdk.SessionManager.inMemory(root);
    const fakePi = { on: (name, handler) => handlers.set(name, handler), registerCommand() {}, appendEntry: (type, data) => descManager.appendCustomEntry(type, data), events: { emit() {}, on() {} }, getThinkingLevel: () => "medium", setThinkingLevel() {}, getActiveTools: () => [], setActiveTools() {} };
    module.default(fakePi, async () => ({ available: false, ids: [] }));
    const ctx = { sessionManager: descManager, model: { provider: "synthetic", id: "claude-sonnet-5-5" }, modelRegistry: {}, getSystemPrompt: () => systemMd, ui: { notify() {}, setStatus() {} } };
    const header = "Launch a new agent to handle complex, multi-step tasks autonomously. Each agent type has specific capabilities and tools available to it.\n\nAvailable agent types and the tools they have access to:\n";
    const list = [
      "- general-purpose: General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. Model: openai/gpt-6-luna high. (luna) (Tools: *)",
      "- builder-light: Light general implementation agent for routine bounded work whose correctness is locally decidable: mechanical edits. (luna) (Tools: *)",
      "- scout: Guided read-only codebase exploration with evidence-based reports. Model: openai/gpt-6-luna medium. (luna) (Tools: read, grep, find, ls)",
    ].join("\n");
    const rest = "\n\nCustom agents can be defined in .pi/agents/<name>.md.\n\n## Usage notes\n\n- Always include a short description.";
    const full = header + list + rest;
    const expected = `${header.replace("Available agent types and the tools they have access to:\n", "Agent types:\n")}- general-purpose: General-purpose agent for researching complex questions, searching fo…\n- builder-light: Light general implementation agent for routine bounded work whose cor…\n- scout: Guided read-only codebase exploration with evidence-based reports${rest}`;
    assert.equal(module.compactAgentDescription(full), expected, "one short line per agent type, header and usage rules kept, no tool lists");
    assert.equal(module.compactAgentDescription("no type list"), "no type list");
    const schema = { type: "object", properties: { prompt: { type: "string", description: "Available agent types and the tools they have access to:\n- x: y (Tools: *)" } } };
    const other = { name: "read", description: full, input_schema: schema };
    const payloads = {
      anthropic: { model: "m", tools: [other, { name: "Agent", description: full, input_schema: schema }] },
      completions: { model: "m", tools: [{ type: "function", function: { name: "read", description: full, parameters: schema } }, { type: "function", function: { name: "Agent", description: full, parameters: schema } }] },
      responses: { model: "m", tools: [{ type: "function", name: "read", description: full, parameters: schema }, { type: "function", name: "Agent", description: full, parameters: schema }] },
    };
    const request = (payload) => handlers.get("before_provider_request")({ type: "before_provider_request", payload }, ctx);
    descManager.appendCustomEntry("orchestration-mode", { mode: "standard" });
    for (const payload of Object.values(payloads)) assert.equal(request(payload), undefined, "standard mode never rewrites the payload");
    descManager.appendCustomEntry("orchestration-mode", { mode: "v2", sessionId: descManager.getSessionId() });
    for (const [shape, payload] of Object.entries(payloads)) {
      const before = JSON.stringify(payload);
      const result = request(payload);
      assert.equal(JSON.stringify(payload), before, `${shape}: the original payload is not mutated`);
      const agent = result.tools[1].function ?? result.tools[1];
      const read = result.tools[0].function ?? result.tools[0];
      assert.equal(agent.description, expected, `${shape}: Agent description is compact`);
      assert.equal(read.description, full, `${shape}: other tools keep their description`);
      assert.deepEqual(agent.input_schema ?? agent.parameters, schema, `${shape}: the schema is untouched`);
      assert.equal(result.model, "m");
    }
    assert.equal(request({ messages: [] }), undefined, "payloads without tools pass through");
    const previousRun = process.env.PI_REPORT_RUN;
    process.env.PI_REPORT_RUN = "run_A1";
    try { assert.equal(request(payloads.anthropic), undefined, "Orca workers keep the full Agent description"); }
    finally { if (previousRun === undefined) delete process.env.PI_REPORT_RUN; else process.env.PI_REPORT_RUN = previousRun; }
  }
  assert.equal(networkAttempts, 0);
  console.log(JSON.stringify({ result: "PASS", selectorCases: "valid, empty, unknown, malformed, partial, lookup/provider errors, timeout, late resolution", sdkRequests: captured.length, helperCalls, firstV2Request: "seven core sections and one exact projected guide", standardAfterV2: "system prompt byte-identical to baseline; no guidance", networkAttempts, resources: "DISPOSABLE_VERIFIED" }));
} finally {
  for (const session of sessions) session.dispose();
  delete globalThis.__v2Selector; delete globalThis.__v2SendMessage;
  globalThis.fetch = originalFetch; http.request = originalHttp.request; http.get = originalHttp.get; https.request = originalHttp.httpsRequest; https.get = originalHttp.httpsGet;
  for (const key of envKeys) previousEnv[key] === undefined ? delete process.env[key] : process.env[key] = previousEnv[key];
  fs.rmSync(root, { recursive: true, force: true });
}

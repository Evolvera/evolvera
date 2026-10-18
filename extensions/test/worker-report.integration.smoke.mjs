// Real SDK AgentSession and native pi-goal tool pipeline; provider and Orca runner are in-process fakes.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "worker-report-integration-"));
const envKeys = ["HOME", "USERPROFILE", "PI_CODING_AGENT_DIR", "PI_SDK_ROOT", "JITI_FS_CACHE", "TMPDIR", "TMP", "TEMP", "XDG_CACHE_HOME", "NPM_CONFIG_CACHE", "PI_OFFLINE", "PI_REPORT_RUN"];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const callerSdkRoot = process.env.PI_SDK_ROOT;
const owned = (name) => path.join(root, name);
for (const [key, value] of Object.entries({ HOME: owned("home"), USERPROFILE: owned("home"), PI_CODING_AGENT_DIR: owned("agent"), TMPDIR: owned("tmp"), TMP: owned("tmp"), TEMP: owned("tmp"), XDG_CACHE_HOME: owned("cache"), NPM_CONFIG_CACHE: owned("npm-cache") })) {
  fs.mkdirSync(value, { recursive: true }); process.env[key] = value;
}
process.env.PI_OFFLINE = "1"; process.env.JITI_FS_CACHE = "0"; process.env.PI_REPORT_RUN = "run_integration123";
if (callerSdkRoot) process.env.PI_SDK_ROOT = callerSdkRoot; else delete process.env.PI_SDK_ROOT;
let networkAttempts = 0; let providerRequests = 0; let session;
const originalFetch = globalThis.fetch;
const originalHttp = { request: http.request, get: http.get, httpsRequest: https.request, httpsGet: https.get };
const blockedRequest = (...args) => { networkAttempts++; throw new Error(`network disabled: ${String(args[0])}`); };
globalThis.fetch = blockedRequest; http.request = blockedRequest; http.get = blockedRequest; https.request = blockedRequest; https.get = blockedRequest;
try {
  const sdkRoot = resolvePiSdkRoot(import.meta.url); process.env.PI_SDK_ROOT = sdkRoot;
  const sdkUrl = (relative) => pathToFileURL(path.join(sdkRoot, relative)).href;
  const sdk = await import(sdkUrl("dist/index.js"));
  const { loadExtensions } = await import(sdkUrl("dist/core/extensions/loader.js"));
  const faux = await import(sdkUrl("node_modules/@earendil-works/pi-ai/dist/providers/faux.js"));
  const sends = [];
  const wrapper = owned("worker-report-injected.ts");
  fs.writeFileSync(wrapper, `import { createWorkerReportExtension } from ${JSON.stringify(path.join(repoRoot, "extensions/worker-report.ts"))};\nconst runner = async (file: string, args: string[]) => { if (file === "git") return { stdout: "" }; if (file !== "orca") throw new Error("unexpected executable: " + file); if (args[1] === "run-show") return { stdout: JSON.stringify({ ok: true, result: { run: { coordinator_handle: "term_conductor" } } }) }; globalThis.__workerReportCalls.push(args); if (globalThis.__workerReportCalls.length === 1) throw new Error("synthetic first-send failure"); return { stdout: JSON.stringify({ ok: true, result: { message: { id: "msg_synthetic", type: "status" } } }) }; };\nexport default createWorkerReportExtension(runner);\n`);
  globalThis.__workerReportCalls = sends;
  const modelCore = faux.createFauxCore({ models: [{ id: "worker-report-test", contextWindow: 32_000, maxTokens: 2_000 }] });
  const modelRuntime = await sdk.ModelRuntime.create({ authPath: owned("synthetic-auth.json"), modelsPath: null });
  modelRuntime.registerProvider(modelCore.provider, { api: modelCore.api, streamSimple: (...args) => { providerRequests++; return modelCore.streamSimple(...args); }, apiKey: "synthetic-only", baseUrl: "http://127.0.0.1:9", models: modelCore.models.map((model) => ({ ...model })) });
  const extensions = await loadExtensions([path.join(repoRoot, "npm/node_modules/@narumitw/pi-goal/src/goal.ts"), wrapper], process.env.PI_CODING_AGENT_DIR);
  assert.equal(extensions.diagnostics?.length ?? 0, 0, "only the explicitly loaded native Goal and injected report extensions initialize cleanly");
  const resourceLoader = { getExtensions: () => extensions, getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }), getThemes: () => ({ themes: [], diagnostics: [] }), getAgentsFiles: () => ({ agentsFiles: [] }), getSystemPrompt: () => "Synthetic integration only.", getSystemPromptSource: () => undefined, getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [], extendResources() {}, reload: async () => {} };
  const ui = { notify() {}, setStatus() {}, select: async () => undefined, confirm: async () => false, input: async () => undefined, onTerminalInput: () => () => {}, setWorkingMessage() {}, setWorkingVisible() {}, setWorkingIndicator() {}, setHiddenThinkingLabel() {}, setWidget() {}, setFooter() {}, setHeader() {}, setTitle() {}, pasteToEditor() {}, setEditorText() {}, getEditorText: () => "", addAutocompleteProvider() {}, setEditorComponent() {}, getEditorComponent: () => undefined, getAllThemes: () => [], getTheme: () => undefined, setTheme: () => ({ success: false }), getToolsExpanded: () => false, setToolsExpanded() {}, custom: async () => undefined, editor: async () => undefined };
  const manager = sdk.SessionManager.inMemory(root);
  const created = await sdk.createAgentSession({ cwd: root, agentDir: process.env.PI_CODING_AGENT_DIR, model: modelCore.models[0], thinkingLevel: "off", modelRuntime, resourceLoader, sessionManager: manager, tools: ["goal_complete", "goal_blocked"], customTools: [], settingsManager: sdk.SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } }) });
  session = created.session; session.extensionRunner.setUIContext(ui, "tui");
  await session.extensionRunner.emit({ type: "session_start" });
  const command = session.extensionRunner.getCommand("goal");
  assert.ok(command, "native /goal command is registered");
  const start = command.handler("exercise the native goal completion tool", session.extensionRunner.createCommandContext());
  // The native command persists a canonical active state before scheduling its owned prompt.
  const activeState = Array.from(manager.getBranch()).filter((entry) => entry.customType === "goal-state").at(-1);
  const goalId = activeState?.data?.goal?.id;
  assert.equal(typeof goalId, "string", "native command created canonical Goal state");
  // Replace the placeholder args in the in-process faux provider response using its documented response queue.
  modelCore.setResponses([faux.fauxAssistantMessage(faux.fauxToolCall("goal_complete", { goal_id: goalId, summary: "Synthetic goal completed through native tool pipeline." }))]);
  await start;
  await session.waitForIdle();
  const entries = Array.from(manager.getBranch());
  assert.ok(entries.some((entry) => entry.type === "message" && entry.message?.role === "assistant" && entry.message.content?.some((part) => part.type === "toolCall" && part.name === "goal_complete")), "real AgentSession dispatched native goal_complete tool");
  assert.ok(entries.some((entry) => entry.type === "custom" && entry.customType === "goal-state" && entry.data?.goal?.id === goalId && entry.data?.goal?.status === "complete"), "native tool persisted accepted terminal canonical state");
  assert.equal(sends.length, 2, "first accepted Goal send failed once and agent_end performed one successful retry");
  assert.match(sends[0].join(" "), new RegExp(goalId));
  assert.deepEqual(sends[1], sends[0], "stable goal/outcome identity makes retry evidence recognizable");

  const blockedStart = command.handler("exercise the native blocked-goal tool", session.extensionRunner.createCommandContext());
  const secondState = Array.from(manager.getBranch()).filter((entry) => entry.customType === "goal-state").at(-1);
  const blockedGoalId = secondState?.data?.goal?.id;
  assert.equal(typeof blockedGoalId, "string", "a fresh native Goal was activated after completion");
  modelCore.setResponses([faux.fauxAssistantMessage(faux.fauxToolCall("goal_blocked", { goal_id: blockedGoalId, reason: "External access is required", evidence: "Three separate synthetic goal turns confirmed the same access denial.", repeated_turns: 3 }))]);
  await blockedStart;
  await session.waitForIdle();
  const blockedEntries = Array.from(manager.getBranch());
  assert.ok(blockedEntries.some((entry) => entry.type === "custom" && entry.customType === "goal-state" && entry.data?.goal?.id === blockedGoalId && entry.data?.goal?.status === "blocked"), "native blocked tool persisted terminal canonical state");
  assert.equal(sends.length, 3, "accepted native blocked Goal produced one additional status report");
  assert.match(sends[2].join(" "), new RegExp(blockedGoalId));

  const staleStart = command.handler("resume", session.extensionRunner.createCommandContext());
  const thirdState = Array.from(manager.getBranch()).filter((entry) => entry.customType === "goal-state").at(-1);
  const staleGoalId = thirdState?.data?.goal?.id;
  assert.equal(typeof staleGoalId, "string", "a later Goal is independently activated");
  modelCore.setResponses([faux.fauxAssistantMessage(faux.fauxToolCall("goal_complete", { goal_id: "stale-goal-id", summary: "This stale call must be rejected." }))]);
  await staleStart;
  await session.waitForIdle();
  const rejectedEntries = Array.from(manager.getBranch());
  assert.ok(rejectedEntries.some((entry) => entry.type === "message" && entry.message?.role === "toolResult" && entry.message.content?.some((part) => /Goal completion rejected/.test(part.text ?? ""))), `native Goal tool returned a stale-ID rejection through the actual pipeline: ${JSON.stringify(rejectedEntries.map((entry) => ({ type: entry.type, role: entry.message?.role, content: entry.message?.content })))}`);
  assert.equal(sends.length, 3, "rejected stale Goal call never generated a report");
  assert.equal(providerRequests >= 3, true, "faux provider served local synthetic responses for terminal and rejected calls");
  assert.equal(networkAttempts, 0, "fetch/http guards observed zero external requests");
  console.log(JSON.stringify({ result: "PASS", providerRequests, networkAttempts, sends: sends.length, resources: "DISPOSABLE_VERIFIED", scope: "real goal_complete and goal_blocked pipelines; synthetic first-send failure retried at agent_end" }));
} finally {
  session?.dispose();
  delete globalThis.__workerReportCalls;
  globalThis.fetch = originalFetch; http.request = originalHttp.request; http.get = originalHttp.get; https.request = originalHttp.httpsRequest; https.get = originalHttp.httpsGet;
  for (const key of envKeys) previousEnv[key] === undefined ? delete process.env[key] : process.env[key] = previousEnv[key];
  fs.rmSync(root, { recursive: true, force: true });
}

// Real AgentSession lifecycle: corrective prompt can be ignored once, then a later read-only list settles without looping.
// All writable paths are confined to this mkdtemp root; provider responses are in-process faux data.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "../lib/pi-sdk.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const sdk = await import(pathToFileURL(path.join(sdkRoot, "dist/index.js")).href);
const { loadExtensions } = await import(pathToFileURL(path.join(sdkRoot, "dist/core/extensions/loader.js")).href);
const faux = await import(pathToFileURL(path.join(sdkRoot, "node_modules/@earendil-works/pi-ai/dist/providers/faux.js")).href);
const { Type } = createRequire(path.join(sdkRoot, "dist/index.js"))("typebox");
const home = fs.mkdtempSync(path.join(os.tmpdir(), "todo-reconciliation-agent-"));
// The SDK extension loader uses jiti internally: disable its shared transform cache too.
const previousJitiFsCache = process.env.JITI_FS_CACHE;
process.env.JITI_FS_CACHE = "0";
let session;
try {
  const modelCore = faux.createFauxCore({ models: [{ id: "todo-reconciliation", contextWindow: 16_000, maxTokens: 512 }] });
  const modelRuntime = await sdk.ModelRuntime.create({ authPath: path.join(home, "auth.json"), modelsPath: null });
  modelRuntime.registerProvider(modelCore.provider, {
    api: modelCore.api,
    streamSimple: modelCore.streamSimple,
    apiKey: "synthetic-only",
    baseUrl: "http://127.0.0.1:9",
    models: modelCore.models.map((model) => ({ ...model })),
  });

  const loadedExtensions = await loadExtensions([path.join(repoRoot, "extensions/todo-reconciliation.ts")], home);
  const resourceLoader = {
    getExtensions: () => loadedExtensions,
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => "# PI Coding Agent\nSynthetic test only.",
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
  const taskSnapshot = [{ id: 7, subject: "synthetic open task", status: "pending" }];
  const todoTool = {
    name: "todo", label: "Todo", description: "Synthetic todo snapshot", parameters: Type.Object({ action: Type.String() }),
    async execute(_id, params) {
      return { content: [{ type: "text", text: "Synthetic todo response" }], details: { action: params.action, params, tasks: taskSnapshot, nextId: 8 } };
    },
  };
  const workTool = {
    name: "work", label: "Work", description: "Synthetic non-todo work", parameters: Type.Object({}),
    async execute() { return { content: [{ type: "text", text: "synthetic work complete" }], details: {} }; },
  };
  const sessionManager = sdk.SessionManager.inMemory(home);
  sessionManager.appendMessage({
    role: "toolResult", toolCallId: "seed-todo", toolName: "todo", content: [{ type: "text", text: "seed" }],
    details: { action: "list", params: {}, tasks: taskSnapshot, nextId: 8 }, isError: false, timestamp: Date.now(),
  });
  const result = await sdk.createAgentSession({
    cwd: home, agentDir: home, model: modelCore.models[0], thinkingLevel: "off", modelRuntime,
    resourceLoader, sessionManager, tools: ["todo", "work"], customTools: [todoTool, workTool],
    settingsManager: sdk.SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: true, reserveTokens: 1_024, keepRecentTokens: 100 } }),
  });
  session = result.session;
  session.extensionRunner.setUIContext({}, "tui");
  const observedEvents = [];
  session.extensionRunner.onError((error) => observedEvents.push(`error:${error.event}:${error.error}`));
  session.subscribe((event) => { if (["message_end", "agent_settled"].includes(event.type)) observedEvents.push(event.type === "message_end" ? `${event.type}:${event.message.role}:${event.message.customType ?? ""}` : event.type); });
  modelCore.setResponses([
    faux.fauxAssistantMessage(faux.fauxToolCall("work", {})),
    faux.fauxAssistantMessage("ordinary turn finished"),
    faux.fauxAssistantMessage("first repair was ignored"),
    faux.fauxAssistantMessage(faux.fauxToolCall("work", {})),
    faux.fauxAssistantMessage("second ordinary turn finished"),
    faux.fauxAssistantMessage(faux.fauxToolCall("todo", { action: "list" })),
    faux.fauxAssistantMessage("Read-only list confirms no change is warranted."),
  ]);
  await session.prompt("Complete the synthetic work.");
  await session.waitForIdle();
  const firstRoundCount = session.agent.state.messages.filter((message) => message.role === "custom" && message.customType === "todo-reconciliation-repair").length;
  if (firstRoundCount !== 1) throw new Error("Expected one corrective turn after the first request.");

  await session.prompt("Do the next synthetic work item.");
  await session.waitForIdle();
  const calls = modelCore.state.callCount;
  const customRepair = session.agent.state.messages.filter((message) => message.role === "custom" && message.customType === "todo-reconciliation-repair");
  const assistantTexts = session.agent.state.messages.filter((message) => message.role === "assistant").map((message) => message.content.filter((part) => part.type === "text").map((part) => part.text).join(""));
  const todoLists = session.agent.state.messages.filter((message) => message.role === "toolResult" && message.toolName === "todo" && message.details?.action === "list");
  if (calls !== 7 || customRepair.length !== 2 || !assistantTexts.includes("Read-only list confirms no change is warranted.") || todoLists.length !== 2) {
    throw new Error(`Expected read-only reconciliation to finish without another repair (calls=${calls}, repairs=${customRepair.length}, lists=${todoLists.length}, events=${JSON.stringify(observedEvents)}).`);
  }
  if (!session.isIdle || modelCore.getPendingResponseCount() !== 0) throw new Error("Agent did not settle cleanly after read-only reconciliation.");
  console.log(JSON.stringify({ calls, repairMessages: customRepair.length, todoLists: todoLists.length, idle: session.isIdle, pendingProviderResponses: modelCore.getPendingResponseCount() }));
} finally {
  session?.dispose();
  if (previousJitiFsCache === undefined) delete process.env.JITI_FS_CACHE;
  else process.env.JITI_FS_CACHE = previousJitiFsCache;
  fs.rmSync(home, { recursive: true, force: true });
}

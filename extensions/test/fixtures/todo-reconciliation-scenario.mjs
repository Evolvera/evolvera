// Real AgentSession journey with a faux in-process provider and run-owned filesystem root.
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
const previousJitiFsCache = process.env.JITI_FS_CACHE;
process.env.JITI_FS_CACHE = "0";
let session;
try {
  const modelCore = faux.createFauxCore({ models: [{ id: "todo-reconciliation", contextWindow: 16_000, maxTokens: 512 }] });
  const modelRuntime = await sdk.ModelRuntime.create({ authPath: path.join(home, "auth.json"), modelsPath: null });
  modelRuntime.registerProvider(modelCore.provider, { api: modelCore.api, streamSimple: modelCore.streamSimple, apiKey: "synthetic-only", baseUrl: "http://127.0.0.1:9", models: modelCore.models.map((model) => ({ ...model })) });
  const loadedExtensions = await loadExtensions([path.join(repoRoot, "extensions/todo-reconciliation.ts")], home);
  const resourceLoader = {
    getExtensions: () => loadedExtensions, getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }), getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }), getSystemPrompt: () => "# PI Coding Agent\nSynthetic test only.", getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [], extendResources: () => {}, reload: async () => {},
  };
  const taskSnapshot = [{ id: 7, subject: "synthetic open task", status: "pending" }];
  let todoExecutions = 0; let workExecutions = 0;
  const todoTool = {
    name: "todo", label: "Todo", description: "Synthetic todo snapshot", parameters: Type.Object({ action: Type.String(), id: Type.Optional(Type.Number()), includeDeleted: Type.Optional(Type.Boolean()) }),
    async execute(_id, params) { todoExecutions++; return { content: [{ type: "text", text: "Synthetic todo response" }], details: { action: params.action, params, tasks: taskSnapshot, nextId: 8 } }; },
  };
  const workTool = {
    name: "work", label: "Work", description: "Synthetic concrete work", parameters: Type.Object({ step: Type.Optional(Type.Number()) }),
    async execute(_id, params) { workExecutions++; return { content: [{ type: "text", text: `synthetic work step ${params.step ?? workExecutions} complete` }], details: {} }; },
  };
  const sessionManager = sdk.SessionManager.inMemory(home);
  sessionManager.appendMessage({ role: "custom", customType: "todo-reconciliation-repair", content: [{ type: "text", text: "LEGACY Do not do implementation" }], display: false, timestamp: Date.now() });
  sessionManager.appendMessage({ role: "toolResult", toolCallId: "seed-todo", toolName: "todo", content: [{ type: "text", text: "Synthetic seed" }], details: { action: "list", params: {}, tasks: taskSnapshot, nextId: 8 }, isError: false, timestamp: Date.now() });
  const result = await sdk.createAgentSession({ cwd: home, agentDir: home, model: modelCore.models[0], thinkingLevel: "off", modelRuntime, resourceLoader, sessionManager, tools: ["todo", "work"], customTools: [todoTool, workTool], settingsManager: sdk.SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: true, reserveTokens: 1_024, keepRecentTokens: 100 } }) });
  session = result.session; session.extensionRunner.setUIContext({}, "tui");
  const errors = []; session.extensionRunner.onError((error) => errors.push(`${error.event}:${error.error}`));
  modelCore.setResponses([
    faux.fauxAssistantMessage(faux.fauxToolCall("todo", { action: "list" })),
    faux.fauxAssistantMessage(faux.fauxToolCall("work", { step: 1 })),
    faux.fauxAssistantMessage(faux.fauxToolCall("work", { step: 2 })),
    faux.fauxAssistantMessage(faux.fauxToolCall("todo", { action: "list" })),
    faux.fauxAssistantMessage("Synthetic deliverable: both requested work steps are complete."),
  ]);
  await session.prompt("Complete two synthetic work steps and return the deliverable.");
  await session.waitForIdle();
  const messages = session.agent.state.messages;
  const repairs = messages.filter((message) => message.role === "custom" && message.customType === "todo-reconciliation-repair");
  const legacyStored = messages.filter((message) => message.role === "custom" && message.customType === "todo-reconciliation-repair");
  const assistantTexts = messages.filter((message) => message.role === "assistant").flatMap((message) => message.content.filter((part) => part.type === "text").map((part) => part.text));
  const listResults = messages.filter((message) => message.role === "toolResult" && message.toolName === "todo" && message.details?.action === "list");
  const automaticTaskUpdates = messages.filter((message) => message.role === "toolResult" && message.toolName === "todo" && ["update", "delete", "clear", "create"].includes(message.details?.action));
  const blocked = messages.filter((message) => message.role === "toolResult" && message.toolName === "todo" && message.isError);
  if (workExecutions !== 2 || todoExecutions !== 1 || listResults.length !== 2 || blocked.length !== 1 || repairs.length !== 1 || legacyStored.length !== 1
      || automaticTaskUpdates.length !== 0 || !assistantTexts.some((text) => text.includes("Synthetic deliverable: both requested work steps are complete."))
      || assistantTexts.some((text) => /list reconciled|Do not do implementation/.test(text))) {
    throw new Error(`Original task preservation failed: ${JSON.stringify({ todoExecutions, workExecutions, listResults: listResults.length, blocked: blocked.length, repairs: repairs.length, legacyStored: legacyStored.length, automaticTaskUpdates: automaticTaskUpdates.length, assistantTexts, errors })}`);
  }
  if (!session.isIdle || modelCore.getPendingResponseCount() !== 0 || errors.length) throw new Error(`Agent did not settle cleanly: ${JSON.stringify({ idle: session.isIdle, pending: modelCore.getPendingResponseCount(), errors })}`);
  console.log(JSON.stringify({ todoExecutions, workExecutions, blockedReads: blocked.length, repairTurns: 0, deliverable: assistantTexts.at(-1), idle: session.isIdle }));
} finally {
  session?.dispose();
  if (previousJitiFsCache === undefined) delete process.env.JITI_FS_CACHE;
  else process.env.JITI_FS_CACHE = previousJitiFsCache;
  fs.rmSync(home, { recursive: true, force: true });
}

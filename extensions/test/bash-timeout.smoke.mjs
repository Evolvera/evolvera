import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. Unit cases are in-memory. The real AgentSession uses one
// fresh mkdtemp root as cwd/agentDir, an in-process faux provider with synthetic credentials, and only
// runs `sleep`/`echo` through the real bash tool; the root is removed in finally. No network or PI process.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const m = await jiti.import(path.join(root, "extensions/bash-timeout.ts"));

// ── unit: timeout resolution ──
const limits = { defaultS: 900, maxS: 7200 };
assert.equal(m.resolveBashTimeout(undefined, limits), 900, "missing timeout gets the default");
for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "abc", null, {}]) {
  assert.equal(m.resolveBashTimeout(bad, limits), 900, `invalid timeout ${String(bad)} gets the default`);
}
assert.equal(m.resolveBashTimeout(30, limits), 30, "explicit shorter timeout is honored");
assert.equal(m.resolveBashTimeout("45", limits), 45, "numeric string is honored");
assert.equal(m.resolveBashTimeout(99_999, limits), 7200, "explicit timeout is clamped to the max");
assert.deepEqual(m.timeoutLimits({}), { defaultS: m.DEFAULT_TIMEOUT_S, maxS: m.MAX_TIMEOUT_S });
assert.deepEqual(m.timeoutLimits({ PI_BASH_DEFAULT_TIMEOUT_S: "60", PI_BASH_MAX_TIMEOUT_S: "120" }), { defaultS: 60, maxS: 120 });
assert.deepEqual(m.timeoutLimits({ PI_BASH_DEFAULT_TIMEOUT_S: "600", PI_BASH_MAX_TIMEOUT_S: "120" }), { defaultS: 120, maxS: 120 }, "default never exceeds max");
assert.deepEqual(m.timeoutLimits({ PI_BASH_DEFAULT_TIMEOUT_S: "x", PI_BASH_MAX_TIMEOUT_S: "-1" }), { defaultS: 900, maxS: 7200 });
assert.match(m.timeoutHint("900"), /killed after 900s/);
assert.deepEqual(m.interactiveTimeoutLimits({}), { defaultS: 600, maxS: 600 });
assert.deepEqual(m.interactiveTimeoutLimits({ PI_BASH_DEFAULT_TIMEOUT_S: "1200", PI_BASH_MAX_TIMEOUT_S: "7200" }), { defaultS: 600, maxS: 600 });
assert.deepEqual(m.interactiveTimeoutLimits({ PI_BASH_INTERACTIVE_MAX_TIMEOUT_S: "120", PI_BASH_DEFAULT_TIMEOUT_S: "900", PI_BASH_MAX_TIMEOUT_S: "7200" }), { defaultS: 120, maxS: 120 });
assert.deepEqual(m.interactiveTimeoutLimits({ PI_BASH_INTERACTIVE_MAX_TIMEOUT_S: "invalid" }), { defaultS: 600, maxS: 600 }, "invalid interactive cap falls back to 600");
assert.equal(m.resolveBashTimeout(undefined, limits, 600), 600, "interactive default is clamped");
assert.equal(m.resolveBashTimeout(7200, limits, 600), 600, "interactive explicit timeout is clamped");
assert.equal(m.resolveBashTimeout(7200, limits), 7200, "non-interactive max stays unchanged");
assert.match(m.interactiveTimeoutHint("600"), /interactive session.*do not wait in the foreground.*background.*log or result file.*short status commands at checkpoints.*background subagent.*Do not rerun the same blocking wait/i);
assert.match(m.timeoutHint("900"), /most likely hung.*Do not rerun it unchanged/);

// ── unit: hooks ──
{
  const handlers = new Map();
  m.default({ on: (name, handler) => handlers.set(name, handler) });
  const call = (toolName, input, toolCallId = "call", hasUI = false) => handlers.get("tool_call")({ toolName, input, toolCallId }, { hasUI });
  const input = { command: "npx jest" };
  await call("bash", input);
  assert.equal(input.timeout, m.timeoutLimits().defaultS, "non-interactive default remains 900s");
  const interactiveDefault = { command: "long job" };
  await call("bash", interactiveDefault, "interactive-default", true);
  assert.equal(interactiveDefault.timeout, 600, "interactive default is capped");
  const interactiveExplicit = { command: "long job", timeout: 7200 };
  await call("bash", interactiveExplicit, "interactive-explicit", true);
  assert.equal(interactiveExplicit.timeout, 600, "interactive explicit timeout is capped");
  const subagentExplicit = { command: "long job", timeout: 7200 };
  await call("bash", subagentExplicit, "subagent-explicit", false);
  assert.equal(subagentExplicit.timeout, 7200, "subagent keeps existing max");
  const other = { path: "x" };
  await call("read", other);
  assert.equal(other.timeout, undefined, "non-bash tools are untouched");
  const result = (event) => handlers.get("tool_result")(event);
  const successNote = await result({ toolName: "bash", toolCallId: "interactive-explicit", isError: false, content: [{ type: "text", text: "ok" }] });
  assert.match(successNote.content.at(-1).text, /interactive session.*do not wait in the foreground.*background.*log or result file.*short status commands at checkpoints.*background subagent.*Do not rerun the same blocking wait/i);
  await call("bash", { command: "short job", timeout: 30 }, "interactive-not-clamped", true);
  assert.equal(await result({ toolName: "bash", toolCallId: "interactive-not-clamped", isError: false, content: [{ type: "text", text: "ok" }] }), undefined, "unclamped success is unchanged");
  await call("bash", { command: "long job", timeout: 7200 }, "interactive-explicit-timeout", true);
  const timedInteractive = await result({ toolName: "bash", toolCallId: "interactive-explicit-timeout", isError: true, content: [{ type: "text", text: "Command timed out after 600 seconds" }] });
  assert.equal(timedInteractive.content.length, 2);
  assert.match(timedInteractive.content[1].text, /interactive session.*do not wait in the foreground.*background.*log or result file.*short status commands at checkpoints.*background subagent.*Do not rerun the same blocking wait/i);
  const timedOut = { toolName: "bash", toolCallId: "plain-timeout", isError: true, content: [{ type: "text", text: "out\n\nCommand timed out after 900 seconds" }] };
  const patched = await result(timedOut);
  assert.equal(patched.content.length, 2);
  assert.match(patched.content[1].text, /\[bash-timeout\].*900s.*forceExit/s);
  assert.equal(await result({ toolName: "bash", isError: true, content: [{ type: "text", text: "Command exited with code 1" }] }), undefined);
  assert.equal(await result({ toolName: "bash", isError: false, content: [{ type: "text", text: "Command timed out after 1 seconds" }] }), undefined);
  assert.equal(await result({ toolName: "read", isError: true, content: [{ type: "text", text: "Command timed out after 1 seconds" }] }), undefined);
  assert.equal(await result({ toolName: "bash", isError: true, content: [{ type: "image" }] }), undefined);
}

// ── integration: real AgentSession, real bash tool, both extensions loaded ──
const home = fs.mkdtempSync(path.join(os.tmpdir(), "bash-timeout-smoke-"));
const saved = Object.fromEntries(["JITI_FS_CACHE", "PI_CODING_AGENT_DIR", "PI_BASH_DEFAULT_TIMEOUT_S", "PI_FAST_MODE"].map((key) => [key, process.env[key]]));
process.env.PI_CODING_AGENT_DIR = home;
process.env.JITI_FS_CACHE = "0";
process.env.PI_BASH_DEFAULT_TIMEOUT_S = "2";
delete process.env.PI_FAST_MODE;
let session;
try {
  const sdk = await import(pathToFileURL(path.join(sdkRoot, "dist/index.js")).href);
  const { loadExtensions } = await import(pathToFileURL(path.join(sdkRoot, "dist/core/extensions/loader.js")).href);
  const faux = await import(pathToFileURL(path.join(sdkRoot, "node_modules/@earendil-works/pi-ai/dist/providers/faux.js")).href);
  const modelCore = faux.createFauxCore({ models: [{ id: "bash-timeout-test", contextWindow: 16_000, maxTokens: 512 }] });
  const modelRuntime = await sdk.ModelRuntime.create({ authPath: path.join(home, "auth.json"), modelsPath: null });
  modelRuntime.registerProvider(modelCore.provider, { api: modelCore.api, streamSimple: modelCore.streamSimple, apiKey: "synthetic-only", baseUrl: "http://127.0.0.1:9", models: modelCore.models.map((item) => ({ ...item })) });
  const loaded = await loadExtensions([path.join(root, "extensions/bash-timeout.ts"), path.join(root, "extensions/codex-fast-mode.ts")], home);
  assert.deepEqual(loaded.errors, [], JSON.stringify(loaded.errors));
  const resourceLoader = {
    getExtensions: () => loaded, getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }), getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }), getSystemPrompt: () => "Synthetic test only.", getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [], extendResources: () => {}, reload: async () => {},
  };
  const sessionManager = sdk.SessionManager.inMemory(home);
  const { session: created } = await sdk.createAgentSession({ cwd: home, agentDir: home, model: modelCore.models[0], thinkingLevel: "off", modelRuntime, resourceLoader, sessionManager, tools: ["bash"],
    settingsManager: sdk.SettingsManager.inMemory({ retry: { enabled: false } }) });
  session = created;
  const errors = []; session.extensionRunner.onError((error) => errors.push(`${error.event}:${error.error}`));
  const toolResults = () => session.agent.state.messages.filter((message) => message.role === "toolResult");
  const text = (message) => message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");

  // 1) A hung command (no timeout from the model) is killed by the default and the agent sees the hint.
  modelCore.setResponses([
    () => faux.fauxAssistantMessage(faux.fauxToolCall("bash", { command: "sleep 30" })),
    () => faux.fauxAssistantMessage("done"),
  ]);
  const started = Date.now();
  await session.prompt("run it");
  await session.waitForIdle();
  const elapsed = Date.now() - started;
  const hung = toolResults().at(-1);
  assert.ok(elapsed < 20_000, `hung command must be cut by the 2s default, took ${elapsed}ms`);
  assert.equal(hung.isError, true);
  assert.match(text(hung), /Command timed out after 2 seconds/);
  assert.match(text(hung), /\[bash-timeout\] The command was killed after 2s/);

  // 2) A fast command still succeeds normally, and the child shell sees the parent's Fast mode.
  await session.prompt("/fast on");
  modelCore.setResponses([
    () => faux.fauxAssistantMessage(faux.fauxToolCall("bash", { command: "echo \"mode=$PI_FAST_MODE\"; echo 'orca terminal create --worktree active --command \"pi --model x\"'" })),
    () => faux.fauxAssistantMessage("done"),
  ]);
  await session.prompt("echo it");
  await session.waitForIdle();
  const ok = toolResults().at(-1);
  assert.equal(ok.isError, false, text(ok));
  assert.match(text(ok), /mode=on/, "child processes inherit the parent's /fast mode via PI_FAST_MODE");
  assert.match(text(ok), /--command "pi --fast on --model x"/, "orca-launched pi receives --fast explicitly");
  assert.deepEqual(errors, []);
} finally {
  session?.dispose();
  for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  fs.rmSync(home, { recursive: true, force: true });
}
console.log("bash-timeout smoke: PASS");

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

const limits = { defaultS: 900, maxS: 7200, floorS: 600 };
assert.equal(m.resolveBashTimeout(undefined, "ls", limits), 900, "missing timeout gets the default");
for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "abc", null, {}]) {
  assert.equal(m.resolveBashTimeout(bad, "ls", limits), 900, `invalid timeout ${String(bad)} gets the default`);
}
assert.equal(m.resolveBashTimeout(30, "ls -la", limits), 30, "explicit short timeout is honoured for ordinary commands");
assert.equal(m.resolveBashTimeout("45", "echo hi", limits), 45, "numeric string is honoured");
assert.equal(m.resolveBashTimeout(99_999, "ls", limits), 7200, "explicit timeout is clamped to the max");
assert.deepEqual(m.timeoutLimits({}), { defaultS: 900, maxS: 7200, floorS: 600 });
assert.deepEqual(m.timeoutLimits({ PI_BASH_TIMEOUT_DEFAULT: "60", PI_BASH_TIMEOUT_MAX: "120" }), { defaultS: 60, maxS: 120, floorS: 120 });
assert.deepEqual(m.timeoutLimits({ PI_BASH_TIMEOUT_DEFAULT: "x", PI_BASH_TIMEOUT_MAX: "-1" }), { defaultS: 900, maxS: 7200, floorS: 600 });

for (const command of [
  "git clone https://example.com/repo.git", "git -C /repo fetch origin", "cd x && git pull --rebase", "git push origin HEAD",
  "git worktree add ../wt -b feature", "npm ci", "npm install", "pnpm install --frozen-lockfile", "yarn", "yarn install",
  "npm test", "npm run test", "CI=1 npm test -- --runInBand", "npx jest", "npx vitest run", "pytest", "python -m pytest -q",
  "go test ./...", "go test", "cargo test", "pytest tests/ -x",
]) assert.equal(m.resolveBashTimeout(120, command, limits), 600, `floor applies: ${command}`);
for (const command of [
  "git status", "git log --oneline", "git worktree list", "npm run build", "npm --version", "npx jest src/a.test.ts",
  "vitest run src/x.spec.tsx", "pytest tests/test_a.py", "pytest tests/test_a.py::test_one", "go test ./pkg/foo", "echo 'npm ci'", "ls",
]) assert.equal(m.resolveBashTimeout(120, command, limits), 120, `no floor: ${command}`);
assert.equal(m.resolveBashTimeout(1800, "npm ci", limits), 1800, "a larger explicit timeout is kept");
assert.equal(m.resolveBashTimeout(undefined, "npm ci", { defaultS: 2, maxS: 7200, floorS: 600 }), 600, "floor also lifts a low default");

assert.deepEqual(m.shellSegments("a 'b c' > out.txt 2>/dev/null && d >> \"log f\"; e | f 2>&1"), [
  { words: ["a", "b c"], writes: ["out.txt", "/dev/null"] }, { words: ["d"], writes: ["log f"] }, { words: ["e"], writes: [] }, { words: ["f"], writes: [] },
]);
assert.deepEqual(m.shellSegments("dir C:\\Users &> x"), [{ words: ["dir", "C:\\Users"], writes: ["x"] }]);
assert.match(m.guidanceNote(limits), /background.*log file.*poll the log/);
assert.match(m.timeoutHint("900"), /killed after 900s.*background.*log file/s);

{
  const handlers = new Map();
  m.default({ on: (name, handler) => handlers.set(name, handler) });
  const call = (toolName, input, toolCallId = "call") => handlers.get("tool_call")({ toolName, input, toolCallId }, { hasUI: true });
  const result = (event) => handlers.get("tool_result")(event);
  const plain = { command: "npx jest src/a.test.ts" };
  await call("bash", plain, "plain");
  assert.equal(plain.timeout, 900, "missing timeout becomes the default, also in interactive sessions");
  const clone = { command: "git clone x", timeout: 120 };
  await call("bash", clone, "clone");
  assert.equal(clone.timeout, 600);
  const raisedNote = await result({ toolName: "bash", toolCallId: "clone", isError: false, content: [{ type: "text", text: "ok" }] });
  assert.match(raisedNote.content.at(-1).text, /raised from 120s to 600s/);
  const other = { path: "x" };
  await call("read", other);
  assert.equal(other.timeout, undefined, "non-bash tools are untouched");
  assert.equal(await result({ toolName: "bash", toolCallId: "plain", isError: false, content: [{ type: "text", text: "ok" }] }), undefined);
  const timedOut = await result({ toolName: "bash", toolCallId: "t", isError: true, content: [{ type: "text", text: "out\n\nCommand timed out after 900 seconds" }] });
  assert.equal(timedOut.content.length, 2);
  assert.match(timedOut.content[1].text, /\[bash-timeout\].*900s/s);
  assert.equal(await result({ toolName: "bash", toolCallId: "e", isError: true, content: [{ type: "text", text: "Command exited with code 1" }] }), undefined);
  assert.equal(await result({ toolName: "read", toolCallId: "r", isError: true, content: [{ type: "text", text: "Command timed out after 1 seconds" }] }), undefined);
  const prompt = await handlers.get("before_agent_start")({ systemPrompt: "BASE" });
  assert.match(prompt.systemPrompt, /^BASE\n\nBash timeouts:/);
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), "bash-timeout-smoke-"));
const saved = Object.fromEntries(["JITI_FS_CACHE", "PI_CODING_AGENT_DIR", "PI_BASH_TIMEOUT_DEFAULT"].map((key) => [key, process.env[key]]));
process.env.PI_CODING_AGENT_DIR = home;
process.env.JITI_FS_CACHE = "0";
process.env.PI_BASH_TIMEOUT_DEFAULT = "2";
let session;
try {
  const sdk = await import(pathToFileURL(path.join(sdkRoot, "dist/index.js")).href);
  const { loadExtensions } = await import(pathToFileURL(path.join(sdkRoot, "dist/core/extensions/loader.js")).href);
  const faux = await import(pathToFileURL(path.join(sdkRoot, "node_modules/@earendil-works/pi-ai/dist/providers/faux.js")).href);
  const modelCore = faux.createFauxCore({ models: [{ id: "bash-timeout-test", contextWindow: 16_000, maxTokens: 512 }] });
  const modelRuntime = await sdk.ModelRuntime.create({ authPath: path.join(home, "auth.json"), modelsPath: null });
  modelRuntime.registerProvider(modelCore.provider, { api: modelCore.api, streamSimple: modelCore.streamSimple, apiKey: "synthetic-only", baseUrl: "http://127.0.0.1:9", models: modelCore.models.map((item) => ({ ...item })) });
  const loaded = await loadExtensions([path.join(root, "extensions/bash-timeout.ts"), path.join(root, "extensions/write-guard.ts")], home);
  assert.deepEqual(loaded.errors, [], JSON.stringify(loaded.errors));
  const resourceLoader = {
    getExtensions: () => loaded, getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }), getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }), getSystemPrompt: () => "Synthetic test only.", getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [], extendResources: () => {}, reload: async () => {},
  };
  const { session: created } = await sdk.createAgentSession({ cwd: home, agentDir: home, model: modelCore.models[0], thinkingLevel: "off", modelRuntime, resourceLoader,
    sessionManager: sdk.SessionManager.inMemory(home), tools: ["bash"], settingsManager: sdk.SettingsManager.inMemory({ retry: { enabled: false } }) });
  session = created;
  const errors = []; session.extensionRunner.onError((error) => errors.push(`${error.event}:${error.error}`));
  const toolResults = () => session.agent.state.messages.filter((message) => message.role === "toolResult");
  const text = (message) => message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");

  modelCore.setResponses([() => faux.fauxAssistantMessage(faux.fauxToolCall("bash", { command: "sleep 30" })), () => faux.fauxAssistantMessage("done")]);
  const started = Date.now();
  await session.prompt("run it");
  await session.waitForIdle();
  const hung = toolResults().at(-1);
  assert.ok(Date.now() - started < 20_000, "hung command is cut by the 2s default");
  assert.equal(hung.isError, true);
  assert.match(text(hung), /Command timed out after 2 seconds/);
  assert.match(text(hung), /\[bash-timeout\] The command was killed after 2s/);

  modelCore.setResponses([() => faux.fauxAssistantMessage(faux.fauxToolCall("bash", { command: "echo fine" })), () => faux.fauxAssistantMessage("done")]);
  await session.prompt("echo it");
  await session.waitForIdle();
  const ok = toolResults().at(-1);
  assert.equal(ok.isError, false, text(ok));
  assert.match(text(ok), /fine/);
  assert.deepEqual(errors, []);
} finally {
  session?.dispose();
  for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  fs.rmSync(home, { recursive: true, force: true });
}
console.log("bash-timeout smoke: PASS");

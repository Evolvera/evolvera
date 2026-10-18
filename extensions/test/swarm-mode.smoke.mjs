import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. Unit cases are in-memory. The real AgentSession uses one fresh
// mkdtemp root as cwd/agentDir (its own pi-goal.json), an in-memory session manager, and an in-process faux
// provider with synthetic credentials; the root is removed in finally. The installed pi-goal package is only read.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const extPath = path.join(root, "extensions/swarm-mode.ts");
const m = await jiti.import(extPath);
const stateKey = Symbol.for("evolvera.swarm-mode.state");

// ── unit: parsing, primary detection, directive ──
assert.deepEqual(m.parseSwarmArgs(""), { action: "status" });
assert.deepEqual(m.parseSwarmArgs("  "), { action: "status" });
assert.deepEqual(m.parseSwarmArgs("on"), { action: "on" });
assert.deepEqual(m.parseSwarmArgs("MAX"), { action: "on" });
assert.deepEqual(m.parseSwarmArgs("on  corrigir   o login "), { action: "on", objective: "corrigir   o login" });
assert.deepEqual(m.parseSwarmArgs("off"), { action: "off" });
assert.deepEqual(m.parseSwarmArgs("off now"), { action: "invalid" });
assert.deepEqual(m.parseSwarmArgs("banana"), { action: "invalid" });
assert.equal(m.isPrimaryPrompt("  # PI Coding Agent\n..."), true);
assert.equal(m.isPrimaryPrompt("# Specialist"), false);
assert.equal(m.isPrimaryPrompt(undefined), false);
assert.equal(m.MAX_AGENTS, 50);
assert.match(m.SWARM_DIRECTIVE, /up to 50 concurrent subagents/);
assert.match(m.SWARM_DIRECTIVE, /plan-heavy/);
assert.match(m.SWARM_DIRECTIVE, /never relaxes the Safety section/);
assert.equal(m.goalEventChannel("r1"), "pi-goal:event:r1");
assert.equal(JSON.parse(fs.readFileSync(path.join(root, "subagents.json"), "utf8")).maxConcurrent, 50, "ceiling matches the directive");
assert.equal(JSON.parse(fs.readFileSync(path.join(root, "config/pi-goal.json"), "utf8")).rpc.enabled, true, "pi-goal accepts /swarm starts");

// ── unit: command + hook with fakes ──
{
  delete globalThis[stateKey];
  const handlers = new Map(); const commands = new Map(); const listeners = new Map(); const emitted = [];
  const events = {
    on: (channel, fn) => { listeners.set(channel, fn); return () => listeners.delete(channel); },
    emit: (channel, data) => emitted.push({ channel, data }),
  };
  m.default({ registerCommand: (n, o) => commands.set(n, o), on: (n, h) => handlers.set(n, h), events });
  const notices = []; const statuses = [];
  const ctx = { ui: { notify: (t, l) => notices.push({ t, l }), setStatus: (_k, t) => statuses.push(t) } };
  const swarm = commands.get("swarm");
  assert.deepEqual((await swarm.getArgumentCompletions("o")).map((o) => o.value), ["on", "off"]);
  assert.deepEqual((await swarm.getArgumentCompletions("of")).map((o) => o.value), ["off"]);
  await handlers.get("session_start")({}, ctx);
  assert.equal(statuses.at(-1), undefined);
  await swarm.handler("", ctx);
  assert.match(notices.at(-1).t, /desligado/);
  await swarm.handler("xyz", ctx);
  assert.equal(notices.at(-1).l, "warning");
  const primary = { systemPrompt: "BASE", systemPromptOptions: { customPrompt: "# PI Coding Agent\n" } };
  assert.equal(await handlers.get("before_agent_start")(primary), undefined, "off: prompt untouched");

  await swarm.handler("on", ctx);
  assert.equal(statuses.at(-1), "🐝SWARM");
  assert.equal(emitted.length, 0, "no objective, no goal");
  await swarm.handler("", ctx);
  assert.match(notices.at(-1).t, /Swarm ativo/);
  assert.equal((await handlers.get("before_agent_start")(primary)).systemPrompt, `BASE\n${m.SWARM_DIRECTIVE}`);
  assert.equal(await handlers.get("before_agent_start")({ systemPrompt: "SUB", systemPromptOptions: { customPrompt: "# Builder" } }), undefined, "subagents never get it");
  assert.equal(await handlers.get("before_agent_start")({ systemPrompt: "X" }), undefined);

  await swarm.handler("on fix everything", ctx);
  assert.equal(emitted.at(-1).channel, m.GOAL_START_CHANNEL);
  assert.equal(emitted.at(-1).data.objective, "fix everything");
  const runId = emitted.at(-1).data.runId;
  listeners.get(m.goalEventChannel(runId))({ type: "error", error: { message: "A Goal already exists." } });
  assert.match(notices.at(-1).t, /\/goal não iniciou: A Goal already exists/);
  assert.equal(listeners.has(m.goalEventChannel(runId)), false, "listener removed after first event");
  await swarm.handler("on again", ctx);
  const run2 = emitted.at(-1).data.runId;
  listeners.get(m.goalEventChannel(run2))({ type: "error" });
  assert.match(notices.at(-1).t, /erro desconhecido/);
  await swarm.handler("on third", ctx);
  const n = notices.length;
  listeners.get(m.goalEventChannel(emitted.at(-1).data.runId))({ type: "state", status: "active" });
  assert.equal(notices.length, n, "success is silent");

  await swarm.handler("off", ctx);
  assert.equal(statuses.at(-1), undefined);
  assert.equal(await handlers.get("before_agent_start")(primary), undefined);
  delete globalThis[stateKey];
}

// ── integration: real AgentSession + installed pi-goal ──
const goalPkg = path.join(os.homedir(), ".pi/agent/npm/node_modules/@narumitw/pi-goal/src/index.ts");
const home = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-mode-smoke-"));
const saved = Object.fromEntries(["JITI_FS_CACHE", "PI_CODING_AGENT_DIR"].map((key) => [key, process.env[key]]));
process.env.PI_CODING_AGENT_DIR = home;
process.env.JITI_FS_CACHE = "0";
fs.copyFileSync(path.join(root, "config/pi-goal.json"), path.join(home, "pi-goal.json"));
const probe = path.join(home, "probe.ts");
fs.writeFileSync(probe, "export default function (pi) { pi.events.on('pi-goal:start', (d) => { globalThis.__swarmProbe = { start: d, events: [] }; pi.events.on('pi-goal:event:' + d.runId, (e) => globalThis.__swarmProbe.events.push(e)); }); }\n");
let session;
try {
  if (!fs.existsSync(goalPkg)) throw new Error(`installed pi-goal not found at ${goalPkg}`);
  const sdk = await import(pathToFileURL(path.join(sdkRoot, "dist/index.js")).href);
  const { loadExtensions } = await import(pathToFileURL(path.join(sdkRoot, "dist/core/extensions/loader.js")).href);
  const faux = await import(pathToFileURL(path.join(sdkRoot, "node_modules/@earendil-works/pi-ai/dist/providers/faux.js")).href);
  const modelCore = faux.createFauxCore({ models: [{ id: "swarm-test", contextWindow: 32_000, maxTokens: 512 }] });
  const modelRuntime = await sdk.ModelRuntime.create({ authPath: path.join(home, "auth.json"), modelsPath: null });
  modelRuntime.registerProvider(modelCore.provider, { api: modelCore.api, streamSimple: modelCore.streamSimple, apiKey: "synthetic-only", baseUrl: "http://127.0.0.1:9", models: modelCore.models.map((item) => ({ ...item })) });
  const loaded = await loadExtensions([probe, extPath, goalPkg], home);
  assert.deepEqual(loaded.errors, [], JSON.stringify(loaded.errors));
  const resourceLoader = {
    getExtensions: () => loaded, getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }), getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }), getSystemPrompt: () => "# PI Coding Agent\nSynthetic test only.", getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [], extendResources: () => {}, reload: async () => {},
  };
  const { session: created } = await sdk.createAgentSession({ cwd: home, agentDir: home, model: modelCore.models[0], thinkingLevel: "off", modelRuntime, resourceLoader, sessionManager: sdk.SessionManager.inMemory(home),
    settingsManager: sdk.SettingsManager.inMemory({ retry: { enabled: false } }) });
  session = created;
  const notices = [];
  const uiContext = { notify: (t) => notices.push(t), setStatus() {}, setWidget() {}, setEditorText() {}, confirm: async () => false, theme: { fg: (_c, t) => t, bold: (t) => t } };
  await session.bindExtensions({ uiContext, mode: "tui" });
  const prompts = [];
  const reply = (text) => (context) => { prompts.push(context.systemPrompt ?? ""); return faux.fauxAssistantMessage(text); };

  modelCore.setResponses([reply("plain")]);
  await session.prompt("hello");
  await session.waitForIdle();
  assert.doesNotMatch(prompts.at(-1), /SWARM MODE/, "default prompt untouched");

  await session.prompt("/swarm on Fazer a tarefa X inteira");
  for (let i = 0; i < 100 && !globalThis.__swarmProbe?.events.length; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(globalThis.__swarmProbe?.start.objective, "Fazer a tarefa X inteira");
  const first = globalThis.__swarmProbe.events[0];
  assert.equal(first?.type, "state", `pi-goal accepted the run: ${JSON.stringify(first)}; notices=${JSON.stringify(notices)}`);
  // A second start while the goal is active is refused by pi-goal and must surface as a visible warning.
  await session.prompt("/swarm on Outra tarefa");
  for (let i = 0; i < 100 && !notices.some((t) => /\/goal não iniciou/.test(t)); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(notices.some((t) => /\/goal não iniciou: A Goal already exists/.test(t)), `refusal is visible: ${JSON.stringify(notices)}`);
  await session.prompt("/goal clear");
  await session.abort();
  await session.waitForIdle();

  modelCore.setResponses([reply("swarm")]);
  await session.prompt("do work");
  await session.waitForIdle();
  assert.match(prompts.at(-1), /SWARM MODE \(active/, "real primary session receives the directive");

  await session.prompt("/swarm off");
  modelCore.setResponses([reply("normal")]);
  await session.prompt("again");
  await session.waitForIdle();
  assert.doesNotMatch(prompts.at(-1), /SWARM MODE/);
} finally {
  session?.dispose();
  delete globalThis.__swarmProbe;
  delete globalThis[stateKey];
  for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  fs.rmSync(home, { recursive: true, force: true });
}
console.log("swarm-mode smoke: PASS");

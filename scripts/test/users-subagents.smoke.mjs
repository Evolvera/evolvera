import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSandbox, createAccessGuard, denyNetwork } from "./lib/users-sandbox.mjs";
import { registerUser } from "../users/registry.mjs";
import { assertOwnedSession, assertOwnedWorkspace } from "../users/ownership.mjs";
import { PACKAGE_NAME, PACKAGE_VERSION, stageSubagentsProfileCompatibility } from "../compat/subagents-users.mjs";

const LIVE_SOURCE = "C:/Users/kevin/.pi/agent/npm/node_modules/@tintinweb/pi-subagents";
const sdk = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.d.ts";
const script = fileURLToPath(import.meta.url);
const required = ["src/agent-runner.ts", "src/agent-manager.ts", "src/index.ts", "src/memory.ts", "src/output-file.ts", "src/schedule-store.ts"];
const sandbox = createSandbox("subagents");
const netGuard = denyNetwork(net);
const protectedGuard = createAccessGuard(fs, ["C:/Users/kevin/.pi/agent", "C:/Users/kevin/Documents/Pi/.pi"]);
try {
  assert.ok(fs.statSync(sdk).isFile(), "public SDK declaration must exist");
  const source = sandbox.mkdir("source", "pkg");
  fs.cpSync(LIVE_SOURCE, source, { recursive: true, filter: (p) => !path.relative(LIVE_SOURCE, p).split(path.sep).some((part) => ["node_modules", ".git", "dist"].includes(part)) });
  const staging = sandbox.mkdir("staging");
  const agentDir = sandbox.mkdir("home", ".pi", "agent");
  const sessionRoot = sandbox.mkdir("home", ".pi", "sessions");
  const repo = sandbox.mkdir("workspaces", "repo");
  const commonGit = sandbox.mkdir("workspaces", "repo", ".git");
  const owner = registerUser({ registryPath: sandbox.dir("registry", "users.json"), id: "kevin", label: "Kevin synthetic", agentDir, sessionRoots: [sessionRoot], workspaces: [repo] });
  const profile = Object.freeze({ id: owner.id, agentDir: owner.agentDir });
  const staged = stageSubagentsProfileCompatibility(source, staging, { profile });
  assert.equal(path.resolve(staged.entry), path.join(staging, "pi-subagents-0.18.2-users", "src", "index.ts"));
  assert.equal(Object.isFrozen(staged), true);
  const metadata = JSON.parse(fs.readFileSync(path.join(staged.packageRoot, "package.json"), "utf8"));
  assert.equal(metadata.name, PACKAGE_NAME);
  assert.equal(metadata.version, PACKAGE_VERSION);
  for (const relative of required) {
    assert.ok(fs.statSync(path.join(staged.packageRoot, relative)).isFile(), `missing staged ${relative}`);
    const text = fs.readFileSync(path.join(staged.packageRoot, relative), "utf8");
    assert.match(text, /pi\.users\.context/);
  }
  const runner = fs.readFileSync(path.join(staged.packageRoot, "src/agent-runner.ts"), "utf8");
  assert.ok(runner.indexOf("usersWorkspace(effectiveCwd)") < runner.indexOf("detectEnv(options.pi, effectiveCwd)"), "ownership must precede environment/config ingestion");
  assert.ok(runner.indexOf("usersSession(options.resumeSessionFile, effectiveCwd)") < runner.indexOf("detectEnv(options.pi, effectiveCwd)"), "resume ownership must precede session ingestion");
  assert.match(runner, /usersContext\.modelRuntime/);
  const manager = fs.readFileSync(path.join(staged.packageRoot, "src/agent-manager.ts"), "utf8");
  assert.ok(manager.indexOf("usersWorkspace(baseCwd)") < manager.indexOf("createWorktree(baseCwd, id)"), "base ownership must precede worktree creation");
  const output = fs.readFileSync(path.join(staged.packageRoot, "src/output-file.ts"), "utf8");
  assert.match(output, /\.pi", "subagent-output"/);
  assert.match(output, /usersManaged \? join\(owned\.workspaceRoot, "\.pi", "subagent-output"\) : join\(tmpdir\(\)/);

  // Execute the exact staged receipt/ownership prelude in a fresh VM context. No extension,
  // session, provider, or real Git code is loaded by this smoke.
  const prefix = fs.readFileSync(path.join(staged.packageRoot, "src/index.ts"), "utf8").split("/**")[0].replace('import * as usersPath from "node:path";', '');
  const executeGuard = (descriptor, marker = undefined) => {
    const calls = { workspace: 0, session: 0, admission: 0 };
    const runtime = Object.freeze({ realParentRuntime: true });
    const profileForVm = Object.freeze({ id: owner.id, agentDir: owner.agentDir });
    const receipt = Object.freeze({
      profile: profileForVm, modelRuntime: runtime,
      assertOwnedWorkspace(cwd) { calls.workspace++; return assertOwnedWorkspace(owner, cwd); },
      assertOwnedSession(request) { calls.session++; return assertOwnedSession(owner, request); },
      admitUserResources() { calls.admission++; },
    });
    const context = { process: { env: marker === undefined ? {} : { PI_USER_ID: marker } }, globalThis: null, Object, Symbol, Error, console, usersPath: path, runtime, calls };
    context.globalThis = context;
    if (descriptor) Object.defineProperty(context, Symbol.for("pi.users.context"), descriptor(receipt));
    vm.runInNewContext(`${prefix}\nglobalThis.__guard = { usersManaged, usersContext, usersWorkspace, usersSession };`, context);
    return { context, calls, receipt, runtime };
  };
  const good = executeGuard((value) => ({ value, writable: false, configurable: false }), "kevin");
  const outside = sandbox.mkdir("detached", "copy");
  const subdir = sandbox.mkdir("detached", "copy", "nested");
  const gitdir = sandbox.mkdir("workspaces", "repo", ".git", "worktrees", "copy");
  const worktreeDotGit = path.join(outside, ".git");
  fs.writeFileSync(worktreeDotGit, `gitdir: ${gitdir}\n`);
  fs.writeFileSync(path.join(gitdir, "commondir"), "../..\n");
  fs.writeFileSync(path.join(gitdir, "gitdir"), `${worktreeDotGit}\n`);
  const positives = good.context.__guard.usersWorkspace(outside);
  assert.equal(positives.workspaceRoot, outside);
  assert.equal(positives.worktreeOrigin, repo);
  const copied = good.context.__guard.usersWorkspace(subdir);
  assert.equal(copied.workspaceRoot, outside, "copied-subdir cwd must use derived worktree root");
  assert.equal(good.calls.workspace, 2);
  assert.throws(() => good.context.__guard.usersWorkspace("C:/forged/worktree"), /WORKSPACE|OWNED|UNDECIDABLE/);
  assert.equal(good.calls.admission, 2, "alien cwd must fail before resource admission");
  const forged = sandbox.mkdir("detached", "forged");
  fs.writeFileSync(path.join(forged, ".git"), `gitdir: ${gitdir}\n`);
  assert.throws(() => good.context.__guard.usersWorkspace(forged), /WORKTREE_ORIGIN_UNDECIDABLE/);
  good.context.__guard.usersSession(path.join(sessionRoot, "synthetic-session.json"), outside);
  assert.equal(good.calls.session, 1);
  assert.equal(good.context.__guard.usersContext.modelRuntime, good.runtime, "parent modelRuntime identity must be preserved");

  let getterReads = 0;
  assert.throws(() => executeGuard((value) => ({ get() { getterReads++; return value; }, configurable: true }), "kevin"), /valid matching users receipt/);
  assert.equal(getterReads, 0, "receipt accessor must not be invoked");
  assert.throws(() => executeGuard(undefined, "kevin"), /valid matching users receipt/);
  assert.throws(() => executeGuard((value) => ({ value, writable: true, configurable: false }), "kevin"), /valid matching users receipt/);
  assert.throws(() => executeGuard((value) => ({ value, writable: false, configurable: false }), "alien"), /valid matching users receipt/);

  // Version mismatch must fail before any final or temporary publication.
  const badSource = sandbox.mkdir("source", "bad");
  fs.cpSync(source, badSource, { recursive: true });
  const badMetaPath = path.join(badSource, "package.json");
  const badMeta = JSON.parse(fs.readFileSync(badMetaPath, "utf8"));
  badMeta.version = "0.0.0";
  fs.writeFileSync(badMetaPath, JSON.stringify(badMeta));
  const badStage = sandbox.mkdir("bad-staging");
  assert.throws(() => stageSubagentsProfileCompatibility(badSource, badStage, { profile }), /identity, version, or entry mismatch/);
  assert.deepEqual(fs.readdirSync(badStage), [], "incompatible source must not publish partial staging");
  assert.equal(netGuard.attempts, 0);
  assert.equal(protectedGuard.count, 0);

  // Runtime-backed state journeys use the transformed modules with an uncached Jiti loader.
  const jitiPath = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs";
  const { createJiti } = await import(pathToFileURL(jitiPath).href);
  const sdkRuntime = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/index.js";
  assert.ok(fs.statSync(sdkRuntime).isFile(), "SDK runtime package must exist for the memory module import");
  Object.defineProperty(globalThis, Symbol.for("pi.users.context"), {
    value: Object.freeze({
      profile: Object.freeze({ id: owner.id, agentDir: owner.agentDir }),
      assertOwnedWorkspace: (cwd) => assertOwnedWorkspace(owner, cwd),
      assertOwnedSession: (request) => assertOwnedSession(owner, request),
      admitUserResources(request) { assert.equal(request.userId, owner.id); },
      modelRuntime: good.runtime,
    }), writable: false, configurable: false,
  });
  const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": sdkRuntime } });
  const memory = await jiti.import(path.join(staged.packageRoot, "src/memory.ts"));
  const outputModule = await jiti.import(path.join(staged.packageRoot, "src/output-file.ts"));
  const schedule = await jiti.import(path.join(staged.packageRoot, "src/schedule-store.ts"));
  const memoryDir = memory.resolveMemoryDir("general-purpose", "user", outside);
  assert.ok(memoryDir.startsWith(owner.agentDir), "user memory must remain under this profile root");
  assert.doesNotMatch(memoryDir, /agent-memory-local|C:\\\\Users\\\\kevin\\\\AppData/i);
  const transcript = outputModule.createOutputFilePath(subdir, "child-1", "session-1");
  assert.ok(transcript.startsWith(path.join(outside, ".pi", "subagent-output")));
  outputModule.writeInitialEntry(transcript, "child-1", "synthetic prompt", subdir);
  const messages = [{ role: "user", content: "synthetic prompt" }];
  let listener;
  const session = { messages, subscribe(callback) { listener = callback; return () => {}; } };
  const flush = outputModule.streamToOutputFile(session, transcript, "child-1", subdir, 1);
  messages.push({ role: "assistant", content: "before compact" });
  listener({ type: "turn_end" });
  listener({ type: "compaction_start" });
  messages.splice(1, 1, { role: "assistant", content: "compacted summary" });
  listener({ type: "compaction_end", aborted: false, result: {} });
  await new Promise((resolve) => setImmediate(resolve));
  messages.push({ role: "assistant", content: "after compact" });
  listener({ type: "turn_end" });
  flush();
  const transcriptText = fs.readFileSync(transcript, "utf8");
  assert.match(transcriptText, /after compact/, "transcript stream must continue after compaction");
  const storePath = schedule.resolveStorePath(subdir, "session-1");
  assert.ok(storePath.startsWith(path.join(outside, ".pi", "subagent-schedules")));
  const store = new schedule.ScheduleStore(storePath);
  store.add({ id: "scheduled-1", name: "synthetic job" });
  assert.equal(new schedule.ScheduleStore(storePath).get("scheduled-1").name, "synthetic job", "scheduled state must reload from the owned worktree root");

  // Execute the staged runner with a deliberately small SDK fake. It records every SDK boundary;
  // all filesystem/session fixtures remain in this sandbox and the fake never resolves a provider.
  const fakeRoot = sandbox.mkdir("fake-sdk");
  const fakeSdkPath = path.join(fakeRoot, "sdk.mjs");
  const countersPath = path.join(fakeRoot, "counters.mjs");
  fs.writeFileSync(countersPath, `export const calls = { factory: [], loader: 0, open: [], create: 0, settings: 0, nested: 0 };\n`);
  fs.writeFileSync(fakeSdkPath, `import { calls } from "./counters.mjs";
let sequence = 0;
class FakeSessionManager {
  constructor(file) { this.file = file; }
  getSessionFile() { return this.file; }
  static open(file, dir) { calls.open.push({ file, dir }); return new FakeSessionManager(file); }
  static create(cwd, dir) { calls.create++; return new FakeSessionManager(dir ? dir + "/synthetic-session.json" : cwd + "/synthetic-session.json"); }
  static inMemory(cwd) { return new FakeSessionManager(undefined); }
}
class FakeSettingsManager {
  static create(cwd, agentDir) { calls.settings++; return { getSessionDir() { return ${JSON.stringify(sessionRoot)}; } }; }
}
class FakeResourceLoader {
  constructor(options) { this.options = options; calls.loader++; }
  async reload() {}
  getExtensions() { return { extensions: [] }; }
}
export const SessionManager = FakeSessionManager;
export const SettingsManager = FakeSettingsManager;
export const DefaultResourceLoader = FakeResourceLoader;
export function getAgentDir() { return ${JSON.stringify(agentDir)}; }
export async function createAgentSession(options) {
  calls.factory.push(options);
  const listeners = new Set();
  const messages = [];
  const session = {
    messages,
    sessionManager: options.sessionManager,
    setSessionName() {}, bindExtensions: async () => {}, steer: async () => {}, abort() {},
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async prompt(prompt) {
      const token = "SYNTHETIC-RUN-" + (++sequence);
      const message = { role: "assistant", content: token, stopReason: "stop" };
      messages.push(message);
      for (const fn of listeners) { fn({ type: "message_start", message: { role: "assistant" } }); fn({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: token } }); fn({ type: "message_end", message }); }
      return token;
    },
  };
  return { session };
}
`);
  const stubs = {
    "agent-types.js": `export const BUILTIN_TOOL_NAMES=["read","write","edit","bash"]; const c={name:"general-purpose",extensions:false,skills:false,tools:["read"],builtinToolNames:["read"],allowedSubagents:"all",persistSession:true}; export const getAgentConfig=()=>c; export const getConfig=()=>c; export const getMemoryToolNames=()=>[]; export const getReadOnlyMemoryToolNames=()=>[]; export const getToolNamesForType=()=>["read"];`,
    "child-context.js": `export const runInChildSessionContext=(fn)=>fn();`,
    "context.js": `export const buildParentContext=()=>""; export const extractText=(content)=>typeof content==="string"?content:Array.isArray(content)?content.map(x=>x.text||"").join(""):"";`,
    "default-agents.js": `const c={name:"general-purpose",extensions:false,skills:false,tools:["read"],builtinToolNames:["read"],allowedSubagents:"all",persistSession:true}; export const DEFAULT_AGENTS=new Map([["general-purpose",c]]);`,
    "env.js": `export const detectEnv=async()=>({});`,
    "memory.js": `export const buildMemoryBlock=()=>""; export const buildReadOnlyMemoryBlock=()=>"";`,
    "nested-tools.js": `import { calls } from "${pathToFileURL(countersPath).href}"; export const getMaxSubagentDepth=()=>4; export const createNestedSubagentTools=(options)=>{calls.nested++; return [];};`,
    "prompts.js": `export const buildAgentPrompt=()=>"synthetic system prompt";`,
    "skill-loader.js": `export const preloadSkills=()=>[];`,
  };
  const aliases = { "@earendil-works/pi-coding-agent": fakeSdkPath };
  for (const [name, contents] of Object.entries(stubs)) {
    const file = path.join(fakeRoot, name);
    fs.writeFileSync(file, contents);
    aliases[`./${name}`] = file;
  }
  const runnerJiti = createJiti(import.meta.url, { fsCache: false, alias: aliases });
  const missingRuntimeWorker = path.join(fakeRoot, "missing-runtime.mjs");
  fs.writeFileSync(missingRuntimeWorker, `import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { createJiti } = await import(${JSON.stringify(pathToFileURL(jitiPath).href)});
const jiti = createJiti(import.meta.url, { fsCache: false, alias: ${JSON.stringify(aliases)} });
const key = Symbol.for("pi.users.context");
const profile = Object.freeze({ id: "kevin", agentDir: ${JSON.stringify(agentDir)} });
Object.defineProperty(globalThis, key, { value: Object.freeze({ profile, assertOwnedWorkspace() {}, assertOwnedSession() {}, admitUserResources() {}, modelRuntime: undefined }), writable: false, configurable: false });
await assert.rejects(() => jiti.import(${JSON.stringify(path.join(staged.packageRoot, "src/agent-runner.ts"))}), /valid matching users receipt/);
const sdk = await jiti.import(${JSON.stringify(fakeSdkPath)});
const counters = await jiti.import(${JSON.stringify(countersPath)});
assert.equal(counters.calls.factory.length, 0);
assert.equal(counters.calls.loader, 0);
`);
  const missingRuntime = spawnSync(process.execPath, [missingRuntimeWorker], { cwd: sandbox.root, env: { ...sandbox.env, PI_USER_ID: owner.id }, encoding: "utf8", timeout: 15000, windowsHide: true });
  assert.equal(missingRuntime.status, 0, `missing-runtime worker failed: ${missingRuntime.stderr || missingRuntime.stdout}`);
  const runnerModule = await runnerJiti.import(path.join(staged.packageRoot, "src/agent-runner.ts"));
  const fakeSdk = await runnerJiti.import(fakeSdkPath);
  const counters = await runnerJiti.import(countersPath);
  const parentRuntime = good.runtime;
  const fakePi = {};
  const ctx = { cwd: repo, model: { provider: "fake", id: "synthetic" }, modelRegistry: {}, getSystemPrompt: () => "parent", sessionManager: { getSessionFile: () => path.join(sessionRoot, "parent.json") } };
  const run = (cwd, extra = {}) => runnerModule.runAgent(ctx, "general-purpose", "synthetic task", { pi: fakePi, cwd, configCwd: repo, model: ctx.model, ...extra });
  let result = await run(repo);
  assert.equal(result.responseText, "SYNTHETIC-RUN-1");
  assert.equal(counters.calls.factory.at(-1).modelRuntime, parentRuntime, "spawn must forward exact parent runtime object");
  assert.equal(counters.calls.factory.at(-1).cwd, repo);
  result = await run(outside);
  assert.equal(counters.calls.factory.at(-1).cwd, outside, "external worktree root must reach SDK unchanged");
  result = await run(subdir);
  assert.equal(counters.calls.factory.at(-1).cwd, subdir, "copied subdirectory must reach SDK unchanged");
  const factoriesBeforeRejects = counters.calls.factory.length;
  const loadersBeforeRejects = counters.calls.loader;
  await assert.rejects(() => run("C:/alien/worktree"), /WORKSPACE|OWNED|UNDECIDABLE/);
  await assert.rejects(() => run(forged), /WORKTREE_ORIGIN_UNDECIDABLE/);
  assert.equal(counters.calls.factory.length, factoriesBeforeRejects, "alien and backlink-mismatch cwd must fail before SDK factory");
  assert.equal(counters.calls.loader, loadersBeforeRejects, "alien cwd must fail before resource loader");

  const ownedSession = path.join(sessionRoot, "owned-session.json");
  fs.writeFileSync(ownedSession, JSON.stringify({ type: "session", cwd: outside }) + "\n");
  await run(repo, { resumeSessionFile: ownedSession });
  assert.equal(counters.calls.open.at(-1).file, ownedSession, "owned resume must reach fake SessionManager.open");
  const alienSession = sandbox.dir("alien", "session.json");
  fs.mkdirSync(path.dirname(alienSession), { recursive: true });
  fs.writeFileSync(alienSession, JSON.stringify({ type: "session", cwd: repo }) + "\n");
  const opensBeforeReject = counters.calls.open.length;
  const factoriesBeforeAlienResume = counters.calls.factory.length;
  const loadersBeforeAlienResume = counters.calls.loader;
  await assert.rejects(() => run(repo, { resumeSessionFile: alienSession }), /SESSION_NOT_OWNED|SESSION_HEADER_CWD_UNOWNED/);
  assert.equal(counters.calls.open.length, opensBeforeReject, "alien resume must fail before SessionManager.open");
  assert.equal(counters.calls.loader, loadersBeforeAlienResume, "alien resume must fail before resource-loader ingestion");
  assert.equal(counters.calls.factory.length, factoriesBeforeAlienResume, "alien resume must fail before SDK factory");
  await run(repo, { nested: true, nestedRuntime: { manager: {}, parentAgentId: "parent", depth: 1 } });
  assert.equal(counters.calls.factory.at(-1).modelRuntime, parentRuntime, "nested child must preserve exact parent runtime");
  assert.equal(counters.calls.nested, 1, "nested delegation plumbing must be reached");
  assert.equal(counters.calls.factory.at(-1).sessionManager.file.startsWith(sessionRoot), true);

  assert.equal(netGuard.attempts, 0);
  assert.equal(protectedGuard.count, 0);
  console.log("PASS: staged runner spawn/nested/resume journeys, exact modelRuntime identity, linked-worktree root/subdir and forged rejection before SDK calls, missing-runtime rejection, memory/transcript/schedule/compaction, receipt getter=0, and all-or-nothing staging");
} finally {
  protectedGuard.restore();
  netGuard.restore();
  assert.equal(sandbox.cleanup(), true, "only the run-owned sandbox is cleaned");
}

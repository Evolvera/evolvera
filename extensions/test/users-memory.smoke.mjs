import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { createHash } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadJiti, resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Resolve installed code roots before the synthetic HOME/USERPROFILE takes effect.
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const jitiModule = await loadJiti(import.meta.url);
const runRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "users-memory-")));
const fakeHome = path.join(runRoot, "home");
const agentDir = path.join(fakeHome, ".pi", "agent");
const moduleRoot = path.join(runRoot, "module");
const copiedExtensions = path.join(moduleRoot, "extensions");
const workspace = path.join(runRoot, "workspace");
const sessionRoot = path.join(runRoot, "sessions");
const sessionPath = path.join(sessionRoot, "synthetic.jsonl");
const alienRoot = path.join(runRoot, "alien");
const moduleSettingsSentinel = path.join(moduleRoot, "settings.json");
const alienMemorySentinel = path.join(alienRoot, "private.md");
const protectedPaths = [alienRoot, moduleSettingsSentinel];
const original = {
  env: { ...process.env },
  cwd: process.cwd(),
  readFileSync: fs.readFileSync,
  readdirSync: fs.readdirSync,
  connect: net.Socket.prototype.connect,
};
const hits = [];
try {
  for (const [name, value] of Object.entries({
    HOME: fakeHome, USERPROFILE: fakeHome, APPDATA: path.join(runRoot, "appdata"),
    LOCALAPPDATA: path.join(runRoot, "localappdata"), XDG_CONFIG_HOME: path.join(runRoot, "config"),
    XDG_CACHE_HOME: path.join(runRoot, "cache"), TMPDIR: path.join(runRoot, "tmp"), TEMP: path.join(runRoot, "tmp"), TMP: path.join(runRoot, "tmp"), PI_SDK_ROOT: sdkRoot,
  })) process.env[name] = value;
  for (const key of Object.keys(process.env)) if (!new Set(["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "TMPDIR", "TEMP", "TMP", "PI_SDK_ROOT", "SystemRoot", "windir"]).has(key)) delete process.env[key];
  fs.mkdirSync(agentDir, { recursive: true }); fs.mkdirSync(sessionRoot, { recursive: true }); fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(copiedExtensions, { recursive: true }); fs.mkdirSync(moduleRoot, { recursive: true }); fs.mkdirSync(alienRoot, { recursive: true });
  fs.writeFileSync(moduleSettingsSentinel, '{"plastic-memory":{"enabled":false},"sentinel":"MODULE-ROOT-MUST-NOT-BE-READ"}');
  fs.writeFileSync(alienMemorySentinel, "ALIEN-MEMORY-MUST-NOT-BE-READ");
  const sentinelHashes = [moduleSettingsSentinel, alienMemorySentinel].map((file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
  process.chdir(workspace);
  fs.cpSync(path.join(sourceRoot, "plastic-memory"), path.join(copiedExtensions, "plastic-memory"), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, "project-memory.ts"), path.join(copiedExtensions, "project-memory.ts"));
  fs.copyFileSync(path.join(sourceRoot, "pi-tool-expert-helper.ts"), path.join(copiedExtensions, "pi-tool-expert-helper.ts"));
  fs.mkdirSync(path.join(moduleRoot, "skills/project-memory/scripts"), { recursive: true });
  fs.mkdirSync(path.join(moduleRoot, "node_modules/typebox"), { recursive: true });
  fs.writeFileSync(path.join(moduleRoot, "node_modules/typebox/package.json"), '{"name":"typebox","type":"module","exports":"./index.js"}');
  fs.writeFileSync(path.join(moduleRoot, "node_modules/typebox/index.js"), 'export const Type = new Proxy({}, { get: (_target, key) => (...args) => ({ kind: String(key), args }) });');
  fs.copyFileSync(path.resolve(sourceRoot, "../skills/project-memory/scripts/validate-architecture.mjs"), path.join(moduleRoot, "skills/project-memory/scripts/validate-architecture.mjs"));

  net.Socket.prototype.connect = function deniedNetwork() { throw new Error("NETWORK_DENIED"); };
  // The installed SDK is an explicit, read-only code root; no npm lookup or live PI startup.
  assert.equal(resolvePiSdkRoot(import.meta.url), path.resolve(sdkRoot));
  const { createJiti } = jitiModule;
  // fsCache:false keeps transpiled output in memory, so no cache directory outside the run root is touched.
  const jiti = createJiti(import.meta.url, { moduleCache: false, fsCache: false });
  const registry = await import(pathToFileURL(path.resolve(sourceRoot, "../scripts/users/registry.mjs")).href);
  const ownership = await import(pathToFileURL(path.resolve(sourceRoot, "../scripts/users/ownership.mjs")).href);
  const user = registry.registerUser({ registryPath: path.join(runRoot, "registry.json"), id: "kevin", label: "Synthetic Kevin", agentDir, workspaces: [workspace], sessionRoots: [sessionRoot] });
  fs.writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ "plastic-memory": { enabled: true }, packages: [], apiKey: "FAKE-SECRET-api", headers: { Authorization: "FAKE-SECRET-header" } }));
  fs.writeFileSync(sessionPath, JSON.stringify({ type: "session", cwd: workspace }) + "\n");
  const access = (operation, resource) => {
    if (operation === "workspace") return ownership.assertOwnedWorkspace(user, resource);
    if (operation === "session") return ownership.assertOwnedSession(user, resource);
    if (operation === "admit") {
      if (resource.root) assert.equal(resource.root.toLowerCase(), agentDir.toLowerCase());
      else assert.equal(path.resolve(resource.memoryRoot).toLowerCase(), path.join(workspace, ".pi", "memory").toLowerCase());
      return true;
    }
    throw new Error("unexpected policy operation");
  };
  const receiptKey = Symbol.for("pi.users.context");
  const receiptFields = {
    profile: user,
    assertOwnedWorkspace: (cwd) => access("workspace", cwd),
    assertOwnedSession: (request) => access("session", request),
    admitUserResources: (request) => access("admit", request),
    modelRuntime: Object.freeze({}),
  };
  const receipt = Object.freeze({ ...receiptFields });
  const earlyMemory = await jiti.import(path.join(copiedExtensions, "plastic-memory/index.ts"));

  // Negative receipts run BEFORE the final immutable receipt is installed; the final one can never be removed.
  process.env.PI_USER_ID = "kevin";
  assert.throws(() => earlyMemory.managedMemoryContext(workspace), /managed user context/, "marker without receipt fails closed");
  let getterRan = false;
  const invalidDescriptors = [
    { get() { getterRan = true; return receipt; }, configurable: true },
    { value: receipt, configurable: true, writable: false },
    { value: receipt, configurable: true, writable: true },
    { value: { ...receiptFields }, configurable: true, writable: false },
    { value: Object.freeze({ ...receiptFields, modelRuntime: undefined }), configurable: true, writable: false },
    { value: Object.freeze({ ...receiptFields, profile: Object.freeze({ ...user, id: "evolvera" }) }), configurable: true, writable: false },
  ];
  for (const descriptor of invalidDescriptors) {
    Object.defineProperty(globalThis, receiptKey, descriptor);
    assert.throws(() => earlyMemory.managedMemoryContext(workspace), /managed user context/);
    delete globalThis[receiptKey];
  }
  assert.equal(getterRan, false, "accessor receipt is rejected without invoking its getter");

  Object.defineProperty(globalThis, receiptKey, { value: receipt, configurable: false, writable: false, enumerable: false });

  fs.readFileSync = function guardedRead(file, ...args) {
    const resolved = path.resolve(String(file));
    if (protectedPaths.some((root) => resolved === root || resolved.startsWith(root + path.sep))) { hits.push(resolved); throw new Error("SENTINEL_ACCESS"); }
    return original.readFileSync.call(this, file, ...args);
  };
  fs.readdirSync = function guardedReadDir(file, ...args) {
    const resolved = path.resolve(String(file));
    if (protectedPaths.some((root) => resolved === root || resolved.startsWith(root + path.sep))) { hits.push(resolved); throw new Error("SENTINEL_ACCESS"); }
    return original.readdirSync.call(this, file, ...args);
  };
  syncBuiltinESMExports();

  const memory = await jiti.import(path.join(copiedExtensions, "plastic-memory/index.ts"));
  assert.equal(memory.managedMemoryContext(workspace).profile.id, "kevin");
  assert.equal(memory.readPlasticMemorySettings(workspace).config.enabled, true);
  assert.equal(memory.resolvePlasticMemoryOwnerModeFromFiles(workspace), "full");

  const handlers = new Map(); const tools = new Map();
  const fakePi = new Proxy({ getAllTools: () => [], getCommands: () => [], appendEntry() {} }, {
    get(target, key) { if (key in target) return target[key]; return (...args) => { if (key === "on") handlers.set(args[0], args[1]); if (key === "registerTool") tools.set(args[0].name, args[0]); }; },
  });
  await memory.default(fakePi);
  const before = handlers.get("before_agent_start");
  assert.equal(typeof before, "function", "full owner registers the existing context hook");
  assert.equal(before({ systemPrompt: "original" }, { cwd: workspace, sessionManager: { getSessionFile: () => sessionPath } }).systemPrompt.includes("original"), true);
  const recall = tools.get("memory_recall");
  assert.equal(typeof recall?.execute, "function", "full owner keeps recall registered");
  const recalled = await recall.execute("id", { id: "abcdef012345" }, undefined, () => {}, { cwd: alienRoot, sessionManager: { getSessionFile: () => sessionPath } });
  assert.equal(recalled.isError, true, "recall rejects before reading an alien workspace/session");
  const alienSessionRecall = await recall.execute("id", { id: "abcdef012345" }, undefined, () => {}, { cwd: workspace, sessionManager: { getSessionFile: () => path.join(alienRoot, "old-session.jsonl") } });
  assert.equal(alienSessionRecall.isError, true, "recall rejects an alien session even inside an owned workspace");
  assert.equal(before({ systemPrompt: "old" }, { cwd: alienRoot, sessionManager: { getSessionFile: () => sessionPath } }), undefined, "unowned workspace fails closed without exposing legacy context");
  fs.writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ "plastic-memory": { enabled: true }, packages: ["npm:pi-observational-memory", "git:https://kevin:FAKE-SECRET-url@example.invalid/pkg.git", { source: "npm:object-pkg", token: "FAKE-SECRET-object" }], extensions: [{ source: "./ext.ts", env: { KEY: "FAKE-SECRET-ext" } }], apiKey: "FAKE-SECRET-api", headers: { Authorization: "FAKE-SECRET-header" } }));
  assert.equal(memory.resolvePlasticMemoryOwnerModeFromFiles(workspace), "bridge");

  let projectHook;
  const projectModule = await jiti.import(path.join(copiedExtensions, "project-memory.ts"));
  projectModule.default({ on: (_name, handler) => { projectHook = handler; } });
  assert.equal(typeof projectHook, "function", "bridge owner keeps the project-memory hook");
  assert.equal(projectHook({ systemPrompt: "kept" }, { cwd: workspace, sessionManager: { getSessionFile: () => sessionPath } }).systemPrompt.includes("kept"), true);

  const helper = await jiti.import(path.join(copiedExtensions, "pi-tool-expert-helper.ts"));
  helper.default(fakePi);
  const inspect = tools.get("pi_env_inspect");
  assert.equal(typeof inspect?.execute, "function");
  const inspected = await inspect.execute("id", { detail: "summary" }, undefined, () => {}, { cwd: workspace });
  assert.equal(inspected.details.profile.agentDir.toLowerCase(), agentDir.toLowerCase());
  assert.equal(JSON.stringify(inspected.details).includes("FAKE-SECRET-api"), false);
  assert.equal(JSON.stringify(inspected.details).includes("FAKE-SECRET-header"), false);
  assert.equal(JSON.stringify(inspected.details).includes("FAKE-SECRET"), false, "no credential-bearing URL or object field is echoed");
  assert.deepEqual(inspected.details.settings.packages, ["npm:pi-observational-memory", "git:https://example.invalid/pkg.git", "npm:object-pkg"]);
  assert.deepEqual(inspected.details.settings.extensions, ["./ext.ts"]);
  process.env.PI_USER_ID = "evolvera";
  assert.throws(() => memory.managedMemoryContext(workspace), /managed user context/, "marker that disagrees with the receipt fails closed");
  const unavailableInspect = await inspect.execute("id", { detail: "full" }, undefined, () => {}, { cwd: workspace });
  assert.equal(unavailableInspect.isError, true, "introspection with a mismatched marker fails closed before file reads");
  process.env.PI_USER_ID = "kevin";
  assert.equal(Object.getOwnPropertyDescriptor(globalThis, receiptKey).configurable, false, "final receipt stays immutable");
  assert.equal(hits.length, 0, "no protected alien memory or module-root settings content was read");
  assert.deepEqual([moduleSettingsSentinel, alienMemorySentinel].map((file) => createHash("sha256").update(original.readFileSync(file)).digest("hex")), sentinelHashes, "protected fixture sentinel contents remained unchanged");
  console.log("USERS MEMORY: PASS (full/bridge hooks, owner settings, workspace/session guards, inspect root, fail-closed marker, zero sentinel reads; synthetic run root only)");
} finally {
  fs.readFileSync = original.readFileSync;
  fs.readdirSync = original.readdirSync;
  net.Socket.prototype.connect = original.connect;
  syncBuiltinESMExports();
  process.chdir(original.cwd);
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, original.env);
  // Same canonical form as runRoot: realpathSync (non-native) keeps Windows 8.3 TEMP names and would never match.
  if (fs.realpathSync.native(runRoot) !== runRoot || path.dirname(runRoot) !== fs.realpathSync.native(os.tmpdir())) throw new Error("refusing cleanup: synthetic run root identity changed");
  fs.rmSync(runRoot, { recursive: true, force: true });
}

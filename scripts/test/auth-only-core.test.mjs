import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import vm from "node:vm";
import { launchUser } from "../users/launcher.mjs";
import { createUserRuntime } from "../users/runtime.mjs";
import { registerUser } from "../users/registry.mjs";

const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), "auth-only-core-"));
const registryPath = path.join(runRoot, "registry", "users.json");
const sdkRoot = path.join(runRoot, "fake-sdk");
const earlySdkRoot = path.join(runRoot, "fake-early-sdk");
const agentDir = path.join(runRoot, "shared-agent");
fs.mkdirSync(agentDir, { recursive: true });
fs.mkdirSync(path.join(earlySdkRoot, "dist"), { recursive: true });
fs.writeFileSync(path.join(earlySdkRoot, "package.json"), '{"type":"module"}\n', { flag: "wx" });
fs.writeFileSync(path.join(earlySdkRoot, "dist/main.js"), 'export async function main(argv, options) { if (options.accountRuntimeFactory) throw new Error("early command must not receive account admission"); return argv.join(" "); }\n', { flag: "wx" });
const protectedPins = {
  "scripts/patch-pi-101-interactive-activity.mjs": "e47429c2e2c20393cc57fa561b897ad126d0008994ca36d75779d7a0b9e1f48f",
  "scripts/test/patch-pi-101-interactive-activity.smoke.mjs": "075f4e8450f97560d60d00be20cd91e45808306ce40beccb09f42be577ca4423",
};
const sdkRootPublished = process.env.SDK_101_ROOT;
assert.ok(sdkRootPublished && path.isAbsolute(sdkRootPublished), "SDK_101_ROOT must explicitly name the canonical SDK 1.0.1 fixture");
const sdkPins = {
  "package.json": "fa487897918283976006d8c4f450772a9c90b9674f2a19d5f01e3ab9af35ce8f",
  "dist/main.js": "060521b0b81f91948d8ded9139e423e5d0c9e6808a45c81750cc30519de4d2db",
  "dist/migrations.js": "8514d2573b028baeba60635498a1c5f129a602abd203ea5c37a63df2eea3fb6b",
  "dist/core/model-runtime.js": "da26f76339a031456f6d239a249159231776f760ab4ac538c6b54c417dea6f67",
  "dist/core/model-config.js": "68c447ff2ef729331713e044dae41b7416dbafbf96c83773308e2eb9c3f86107",
};
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const modelRegistryPath = path.join(sdkRootPublished, "dist/core/model-registry.js");
const modelRegistrySource = fs.readFileSync(modelRegistryPath, "utf8");
const modelRegistryHash = crypto.createHash("sha256").update(modelRegistrySource).digest("hex");
const launcherSourcePath = new URL("../users/launcher.mjs", import.meta.url);
const runtimeSourcePath = new URL("../users/runtime.mjs", import.meta.url);
const plasticRunnerPath = new URL("../../extensions/plastic-memory/runtime/runner-runtime.ts", import.meta.url);
const launcherSource = fs.readFileSync(launcherSourcePath, "utf8");
const runtimeSource = fs.readFileSync(runtimeSourcePath, "utf8");
const plasticRunnerSource = fs.readFileSync(plasticRunnerPath, "utf8");
const managedTail = launcherSource.slice(launcherSource.indexOf("export async function launchUser"));
const activeRuntimeTail = runtimeSource.slice(runtimeSource.indexOf("// The SDK owns CLI parsing"));
const managedSourceHashes = {
  launcher: crypto.createHash("sha256").update(launcherSource).digest("hex"),
  runtime: crypto.createHash("sha256").update(runtimeSource).digest("hex"),
  plasticRunner: crypto.createHash("sha256").update(plasticRunnerSource).digest("hex"),
};
const optionalProtected = Object.entries(protectedPins).filter(([file]) => fs.existsSync(path.resolve(file)));
for (const [file, expected] of optionalProtected) assert.equal(hash(path.resolve(file)), expected, `protected source baseline: ${file}`);
const resources = {
  root: runRoot,
  ownership: "fresh fs.mkdtemp root; all synthetic registry/profile/session/stage evidence remains beneath it",
  imports: ["node builtins", "../users/launcher.mjs", "../users/runtime.mjs", "../users/registry.mjs", "../users/account-session.mjs", "../users/credentials.mjs", "../users/environment.mjs", "../users/ownership.mjs", "../users/resources.mjs", "../users/settings.mjs", "../users/switch-readiness.mjs", "../users/sdk-auth-source.mjs", "../compat/alibaba-users.mjs", "../../extensions/usuario.ts (Node24 type stripping only)"],
  staticSourceReads: {
    "../users/launcher.mjs": managedSourceHashes.launcher,
    "../users/runtime.mjs": managedSourceHashes.runtime,
    "../../extensions/plastic-memory/runtime/runner-runtime.ts": managedSourceHashes.plasticRunner,
  },
  staticSdkReads: [{ file: "dist/core/model-registry.js", sha256: modelRegistryHash }],
  plasticForwardingEvidence: {
    publicParentPreferencePresent: /invoke \?\? \(typeof registry\.complete === "function" \? registry\.complete\.bind\(registry\) : defaultComplete\)/.test(plasticRunnerSource),
    scope: "protected source observation only; SDK compatibility WIP is not included in the account checkpoint; native Plastic execution unverified",
  },
  writes: ["synthetic registry", "synthetic profile roots", "fake early SDK package/entry", "resource manifest", "resource postcheck"],
  forbidden: ["SDK imports/evaluation", "Jiti", "PI/native CLI", "provider/network", "real auth/settings/session/registry", "historical roots", "child process", ".env"],
  protectedPins: optionalProtected.map(([file, expected]) => ({ file, expected })),
  protectedAbsent: Object.keys(protectedPins).filter((file) => !fs.existsSync(path.resolve(file))),
};
fs.writeFileSync(path.join(runRoot, "resource-manifest.json"), `${JSON.stringify(resources, null, 2)}\n`, { flag: "wx" });
for (const id of ["alpha", "bravo", "charlie"]) {
  const accountDir = path.join(runRoot, "profiles", id, "agent");
  fs.mkdirSync(accountDir, { recursive: true });
  registerUser({ registryPath, id, label: id, agentDir: accountDir, sessionRoots: [path.join(runRoot, "sessions", id)] });
}

let serial = 0;
class FakeSessionManager {
  constructor(entries = []) {
    this.entries = structuredClone(entries);
    this.id = `session-${++serial}`;
    this.operations = [];
  }
  getEntries() { return this.entries; }
  getSessionId() { return this.id; }
  getHeader() { return { id: this.id }; }
  getSessionFile() { return undefined; }
  isPersisted() { return false; }
  appendCustomEntry(customType, data) {
    this.operations.push("binding");
    this.entries.push({ type: "custom", customType, data: structuredClone(data) });
  }
}
const binding = (id) => ({ type: "custom", customType: "pi.account", data: { version: 1, accountId: id } });

const events = [];
const storeOwners = [];
const runtimeRequests = [];
let pickedAccount = "alpha";
const factory = createUserRuntime(registryPath, {
  sdkRoot,
  pickAccount: async (users) => { events.push("picker"); assert.equal(users.length, 3); return pickedAccount; },
  createStore: (account, options) => { events.push(`store:${account.id}`); storeOwners.push({ account, options }); return { accountId: account.id }; },
  createModelRuntime: async (options) => { events.push(`runtime:${options.credentials.accountId ?? "metadata"}`); runtimeRequests.push(options); return { accountId: options.credentials.accountId ?? "metadata" }; },
});

test("account selection precedes store/runtime and remains immutable per invocation", async () => {
  const manager = new FakeSessionManager();
  const first = await factory({ purpose: "application", sessionManager: manager, sdkRoot, agentDir });
  assert.deepEqual(events, ["picker", "store:alpha", "runtime:alpha"]);
  assert.deepEqual(manager.entries[0].data, { version: 1, accountId: "alpha" });
  assert.equal(storeOwners[0].options.sdkRoot, sdkRoot);
  assert.deepEqual(storeOwners[0].options.accountEnv, {});
  assert.equal(runtimeRequests[0].modelsPath, path.join(agentDir, "models.json"));
  assert.equal(Object.hasOwn(runtimeRequests[0], "modelsStorePath"), false, "retain the SDK's native shared models-store default");
  assert.equal(await runtimeRequests[0].authContext.env("HOME"), undefined);
  assert.equal(first.modelRuntime.accountId, "alpha");

  const conflicting = new FakeSessionManager([binding("bravo")]);
  await assert.rejects(factory({ purpose: "application", sessionManager: conflicting, sdkRoot, agentDir }), { code: "ACCOUNT_PROCESS_RESTART_REQUIRED" });
  assert.deepEqual(events, ["picker", "store:alpha", "runtime:alpha"], "no second credential store/runtime is constructed");

  const legacy = new FakeSessionManager();
  pickedAccount = "bravo";
  await assert.rejects(factory({ purpose: "application", sessionManager: legacy, sdkRoot, agentDir }), { code: "ACCOUNT_PROCESS_RESTART_REQUIRED" });
  assert.equal(legacy.entries.length, 0, "different legacy account rejected before binding append");
});

test("bound native session wins, auth commands select explicitly, and metadata stays inert", async () => {
  const selected = createUserRuntime(registryPath, {
    pickAccount: async () => assert.fail("bound session must not prompt"),
    createStore: (account, options) => ({ accountId: account.id, sdkRoot: options.sdkRoot }),
    createModelRuntime: async (options) => ({ accountId: options.credentials.accountId }),
  });
  const bound = await selected({ purpose: "application", sessionManager: new FakeSessionManager([binding("charlie")]), sdkRoot, agentDir });
  assert.equal(bound.modelRuntime.accountId, "charlie");

  let authPick = 0;
  let authStore = 0;
  const authRuntime = createUserRuntime(registryPath, {
    pickAccount: async () => { authPick++; return "bravo"; },
    createStore: (account) => { authStore++; return { accountId: account.id }; },
    createModelRuntime: async ({ credentials }) => ({ accountId: credentials.accountId }),
  });
  const auth = await authRuntime({ purpose: "auth-command", sdkRoot, agentDir, signal: AbortSignal.timeout(15_000) });
  assert.equal(auth.modelRuntime.accountId, "bravo");
  assert.equal(authPick, 1);
  assert.equal(authStore, 1);
  const readonlyAuth = await authRuntime({ purpose: "auth-command", readonly: true, sdkRoot, agentDir, signal: AbortSignal.timeout(15_000) });
  await assert.rejects(readonlyAuth.credentials.modify("provider", () => undefined), { code: "AUTH_COMMAND_READ_ONLY" });
  assert.equal(authStore, 2, "readonly wrapper encloses only the explicitly selected store");

  let pickerCalls = 0;
  const metadataFactory = createUserRuntime(registryPath, {
    pickAccount: async () => { pickerCalls++; throw new Error("metadata picker forbidden"); },
    createStore: () => assert.fail("metadata store forbidden"),
    createModelRuntime: async (options) => {
      assert.deepEqual(await options.credentials.list(), []);
      assert.equal(await options.authContext.env("ANYTHING"), undefined);
      assert.equal(typeof options.accountConfigPolicy.filterConfig, "function");
      return { accountId: "metadata" };
    },
  });
  await metadataFactory({ purpose: "metadata", sdkRoot, agentDir });
  await metadataFactory({ purpose: "metadata", parsed: { listModels: true }, readonly: true, sdkRoot, agentDir });
  assert.equal(pickerCalls, 0);
});

test("public SDK completion forwards exact parent references; simulated invoker precedence remains explicit", async () => {
  const method = /complete\(model, context, options\)\s*\{\s*return this\.runtime\.complete\(model, context, options\);\s*\}/.exec(modelRegistrySource);
  assert.ok(method, "public SDK completion source must forward to its parent runtime");
  const complete = vm.runInNewContext(`({ ${method[0]} }).complete`, {}, { timeout: 1000 });
  const model = Object.freeze({ id: "synthetic-model" });
  const context = Object.freeze({ messages: [] });
  const options = Object.freeze({ synthetic: true });
  const parentResponse = Object.freeze({ text: "parent-response" });
  let parentCalls = 0;
  const parentRuntime = Object.freeze({ complete: async (passedModel, passedContext, passedOptions) => {
    parentCalls++;
    assert.equal(passedModel, model);
    assert.equal(passedContext, context);
    assert.equal(passedOptions, options);
    return parentResponse;
  } });
  const registry = Object.freeze({ runtime: parentRuntime, complete });
  const childOptions = { modelRuntime: registry.runtime };
  assert.equal(childOptions.modelRuntime, parentRuntime);
  assert.equal(await registry.complete(model, context, options), parentResponse);
  assert.equal(parentCalls, 1);
  const explicitInvoker = async () => ({ text: "explicit-invoker" });
  const selectedInvoker = explicitInvoker ?? registry.complete.bind(registry);
  assert.deepEqual(await selectedInvoker(), { text: "explicit-invoker" });
  assert.equal(parentCalls, 1, "explicit invoker does not call the parent runtime");
});

test("only the native prepared entry is reachable from the active launcher/runtime tails", () => {
  assert.doesNotMatch(managedTail, /--managed-child|spawnSelected|runChild\(|superviseRpc\(|createUserEnvironment|installUserEnvironment/);
  assert.doesNotMatch(activeRuntimeTail, /publicSdk\(|InteractiveMode|runRpcMode|runPrintMode|createGuardedSessionRuntimeClass/);
});

test("launcher early classifier routes help and model-list through prepared bridge", () => {
  const start = launcherSource.indexOf("function isNativeEarlyCommand(argv) {");
  const end = launcherSource.indexOf("\nasync function createNativeAdapter", start);
  assert.ok(start >= 0 && end > start, "launcher classifier source boundaries found");
  const classifier = vm.runInNewContext(`(${launcherSource.slice(start, end).trim()})`, {}, { timeout: 1000 });
  assert.equal(classifier(["--help"]), false);
  assert.equal(classifier(["-h"]), false);
  assert.equal(classifier(["--list-models"]), false);
  assert.equal(classifier(["--version"]), true);
  assert.equal(classifier(["package"]), true);
  assert.equal(classifier(["config"]), true);
});

test("native early version bypasses account admission and prepared-source pins", async () => {
  const result = await launchUser(["--version"], { registryPath, packageRoot: earlySdkRoot, pickAccount: async () => assert.fail("early native path must not select an account") });
  assert.equal(result, "--version");
  assert.equal(fs.existsSync(path.join(runRoot, "prepared-sdk")), false, "early native path does not stage or pin SDK sources");
});

test("launcher forwards native argv and delegates mode dispatch without a supervisor", async () => {
  const argv = ["--continue", "--cwd", "/synthetic/project", "--no-extensions", "-p", "hello"];
  let observed;
  const result = await launchUser(argv, {
    registryPath,
    nativeMain: async (passed, options) => { observed = { passed, options }; return "native-result"; },
    accountRuntimeFactory: async () => ({}),
  });
  assert.equal(result, "native-result");
  assert.equal(observed.passed, argv, "native argv identity/order is unchanged");
  assert.equal(typeof observed.options.accountRuntimeFactory, "function");
});

test("executable preserves native exit status and reports only finite rejected errors", async () => {
  const start = launcherSource.lastIndexOf("  launchUser().");
  const end = launcherSource.lastIndexOf("\n}");
  assert.ok(start >= 0 && end > start, "executable promise source boundaries found");
  const invocation = launcherSource.slice(start, end).trim();
  for (const status of [undefined, 0, 1, 2]) {
    const errors = [];
    const nativeProcess = { env: {}, exitCode: status, stderr: { write: (text) => errors.push(text) } };
    await vm.runInNewContext(invocation, { launchUser: async () => undefined, process: nativeProcess }, { timeout: 1000 });
    assert.equal(nativeProcess.exitCode, status, `native status ${status} must not be overwritten`);
    assert.deepEqual(errors, []);
  }
  for (const [code, expected] of [["ACCOUNT_SELECTION_REQUIRED", "ACCOUNT_SELECTION_REQUIRED"], ["private-path/or-secret", "USER_LAUNCH_FAILED"]]) {
    const errors = [];
    const nativeProcess = { env: {}, exitCode: undefined, stderr: { write: (text) => errors.push(text) } };
    await vm.runInNewContext(invocation, { launchUser: async () => { throw { code }; }, process: nativeProcess }, { timeout: 1000 });
    assert.equal(nativeProcess.exitCode, 1);
    assert.deepEqual(errors, [`${expected}\n`]);
  }
});

test("managed usuario control validates use and returns fresh-process guidance only", async () => {
  const manager = new FakeSessionManager();
  let spawned = 0;
  const controlled = createUserRuntime(registryPath, {
    pickAccount: async () => "alpha",
    createStore: (account) => ({ accountId: account.id }),
    createModelRuntime: async ({ credentials }) => ({ accountId: credentials.accountId }),
  });
  const { resourceLoaderOptions } = await controlled({ purpose: "application", sessionManager: manager, sdkRoot, agentDir });
  assert.equal(resourceLoaderOptions.extensionFactories.length, 2);
  assert.equal(resourceLoaderOptions.extensionFactories[0].name, "usuario");
  assert.equal(resourceLoaderOptions.extensionFactories[1].name, "session-usage-managed");
  const ordinary = { resolvedPath: fileURLToPath(new URL("../../extensions/usuario.ts", import.meta.url)), commands: new Map() };
  const ordinaryUsage = { resolvedPath: fileURLToPath(new URL("../../extensions/session-usage.ts", import.meta.url)), commands: new Map() };
  const agentUsage = { resolvedPath: path.join(agentDir, "extensions", "session-usage.ts"), commands: new Map() };
  const customUsage = { resolvedPath: "/synthetic/custom-session-usage.ts", commands: new Map() };
  const unrelated = { resolvedPath: "/synthetic/other-extension.ts", commands: new Map() };
  assert.deepEqual(resourceLoaderOptions.extensionsOverride({ extensions: [ordinary, ordinaryUsage, agentUsage, customUsage, unrelated] }).extensions, [customUsage, unrelated]);
  const { createUsuarioFactory } = await import("../../extensions/usuario.ts");
  let command;
  const pi = { registerCommand(_name, value) { command = value; }, sendMessage() {} };
  resourceLoaderOptions.extensionFactories[0].factory(pi);
  const shown = [];
  const response = await command.handler("use bravo", { hasUI: true, sessionManager: manager, ui: { notify: (text) => shown.push(text) } });
  assert.equal(response, undefined);
  assert.match(shown[0], /novo processo|novo processo/i);
  assert.equal(spawned, 0);
});

after(() => {
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(modelRegistryPath)).digest("hex"), modelRegistryHash, "public runtime forwarding source unchanged");
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(launcherSourcePath)).digest("hex"), managedSourceHashes.launcher, "launcher source unchanged during test");
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(runtimeSourcePath)).digest("hex"), managedSourceHashes.runtime, "runtime source unchanged during test");
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(plasticRunnerPath)).digest("hex"), managedSourceHashes.plasticRunner, "Plastic WIP source unchanged during test");
  for (const [relative, expected] of Object.entries(sdkPins)) {
    const file = path.join(sdkRootPublished, ...relative.split("/"));
    assert.equal(hash(file), expected, `published SDK source unchanged: ${relative}`);
  }
  for (const [file, expected] of optionalProtected) assert.equal(hash(path.resolve(file)), expected, `protected source unchanged: ${file}`);
  fs.writeFileSync(path.join(runRoot, "resource-postcheck.json"), `${JSON.stringify({ sdkProtected: "PASS", selectorProtected: "PASS", evidenceRetained: true }, null, 2)}\n`, { flag: "wx" });
  console.log(`SYNTHETIC_RESOURCE_MANIFEST=${path.join(runRoot, "resource-manifest.json")}`);
});

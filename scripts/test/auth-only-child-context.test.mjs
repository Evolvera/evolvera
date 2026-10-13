import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import {
  ACCOUNT_LAUNCH_CONTEXT_ENV,
  decodeAccountLaunchContext,
  encodeAccountLaunchContext,
  extractAccountLaunchContextArgs,
} from "../users/environment.mjs";
import { launchUser } from "../users/launcher.mjs";
import { createUserRuntime } from "../users/runtime.mjs";
import { registerUser } from "../users/registry.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "auth-only-child-context-"));
const registryPath = path.join(root, "shared", "users.json");
const agentDir = path.join(root, "shared", "agent");
fs.mkdirSync(agentDir, { recursive: true });
for (const id of ["alpha", "beta"]) {
  registerUser({ registryPath, id, label: id, agentDir: path.join(root, "profiles", id, "agent"), sessionRoots: [path.join(root, "profiles", id, "sessions")] });
}
const resources = {
  root,
  ownership: "unique fs.mkdtemp run root; synthetic registry/accounts/session managers only; retained",
  imports: ["Node built-ins", "users/environment.mjs", "users/launcher.mjs", "users/runtime.mjs", "users/registry.mjs", "inert repository imports"],
  forbidden: ["SDK/main/Jiti/provider imports or evaluation", "credentials/private files", "ambient env enumeration", "network", "child process", "cleanup of prior roots"],
  writable: [registryPath, "synthetic account registry/profile descriptors under run root", "resource manifest/postcheck"],
  env: "plain fake objects; no process.env reads in this suite",
};
fs.writeFileSync(path.join(root, "resource-manifest.json"), `${JSON.stringify(resources, null, 2)}\n`, { flag: "wx" });

const context = (accountId) => Object.freeze({ version: 1, accountId, registryPath });
const binding = (accountId) => ({ type: "custom", customType: "pi.account", data: { version: 1, accountId } });
let sessionSerial = 0;
class FakeSessionManager {
  constructor(entries = []) { this.entries = structuredClone(entries); this.id = `synthetic-${++sessionSerial}`; }
  getEntries() { return this.entries; }
  getSessionId() { return this.id; }
  getHeader() { return { id: this.id }; }
  getSessionFile() { return undefined; }
  isPersisted() { return false; }
  appendCustomEntry(customType, data) { this.entries.push({ type: "custom", customType, data: structuredClone(data) }); }
}
function runtimeFor(inheritedAccountId, env, effects = {}) {
  return createUserRuntime(registryPath, {
    inheritedAccountId,
    onAccountSelected: ({ version, accountId, registryPath: sharedRegistry }) => {
      assert.equal(version, 1);
      env[ACCOUNT_LAUNCH_CONTEXT_ENV] = encodeAccountLaunchContext({ version, accountId, registryPath: sharedRegistry });
    },
    pickAccount: effects.pickAccount,
    createStore: effects.createStore ?? ((account, options) => {
      effects.events?.push(`store:${account.id}`);
      effects.storeOptions?.push(options);
      return { accountId: account.id };
    }),
    createModelRuntime: async ({ credentials, authContext, modelsPath }) => {
      effects.authContexts?.push(authContext);
      effects.modelPaths?.push(modelsPath);
      return { accountId: credentials.accountId };
    },
    sdkRoot: path.join(root, "fake-sdk"),
  });
}

async function invokeManaged(argv, env, factory, accountId) {
  let received;
  const result = await launchUser(argv, {
    env,
    nativeMain: async (nativeArgv, options) => {
      received = { argv: nativeArgv, options };
      if (!options.accountRuntimeFactory) return "native";
      const runtime = await options.accountRuntimeFactory({ purpose: "application", sessionManager: new FakeSessionManager(), sdkRoot: path.join(root, "fake-sdk"), agentDir });
      return runtime.modelRuntime.accountId;
    },
    accountRuntimeFactory: factory,
  });
  return { result, received, accountId };
}

test("personal and company contexts propagate parent to child to grandchild without crossing", async () => {
  for (const accountId of ["alpha", "beta"]) {
    const env = { HOME: "shared-home", CUSTOM: "preserve", OPENAI_API_KEY: "sentinel-not-forwarded-to-auth" };
    const events = [], storeOptions = [], authContexts = [], modelPaths = [];
    const parentRuntime = runtimeFor(undefined, env, { pickAccount: async () => accountId, events, storeOptions, authContexts, modelPaths });
    assert.equal(Object.hasOwn(env, ACCOUNT_LAUNCH_CONTEXT_ENV), false, "runtime construction does not publish process context");
    await parentRuntime({ purpose: "application", sessionManager: new FakeSessionManager(), sdkRoot: path.join(root, "fake-sdk"), agentDir });
    const parentContext = decodeAccountLaunchContext(env[ACCOUNT_LAUNCH_CONTEXT_ENV]);
    assert.equal(parentContext.accountId, accountId);
    const savedNonContext = { HOME: env.HOME, CUSTOM: env.CUSTOM, OPENAI_API_KEY: env.OPENAI_API_KEY };

    const childEnv = { ...env };
    const childInheritedContext = decodeAccountLaunchContext(childEnv[ACCOUNT_LAUNCH_CONTEXT_ENV]);
    const childFactory = runtimeFor(childInheritedContext.accountId, childEnv, { pickAccount: () => assert.fail("inherited child must not prompt"), events, storeOptions, authContexts, modelPaths });
    const child = await invokeManaged(["--continue", "--cwd", "/shared/project", "--", "--usuario-context", "literal prompt"], childEnv, childFactory);
    assert.deepEqual(child.received.argv, ["--continue", "--cwd", "/shared/project", "--", "--usuario-context", "literal prompt"]);
    assert.deepEqual({ HOME: childEnv.HOME, CUSTOM: childEnv.CUSTOM, OPENAI_API_KEY: childEnv.OPENAI_API_KEY }, savedNonContext);
    const childContext = decodeAccountLaunchContext(childEnv[ACCOUNT_LAUNCH_CONTEXT_ENV]);
    assert.equal(childContext.accountId, accountId);

    const grandchildEnv = { ...childEnv };
    const grandchildContext = decodeAccountLaunchContext(grandchildEnv[ACCOUNT_LAUNCH_CONTEXT_ENV]);
    const grandchildFactory = runtimeFor(grandchildContext.accountId, grandchildEnv, { pickAccount: () => assert.fail("inherited child must not prompt"), events, storeOptions, authContexts, modelPaths });
    const grandchild = await grandchildFactory({ purpose: "application", sessionManager: new FakeSessionManager(), sdkRoot: path.join(root, "fake-sdk"), agentDir });
    assert.equal(grandchild.modelRuntime.accountId, accountId);
    assert.equal(decodeAccountLaunchContext(grandchildEnv[ACCOUNT_LAUNCH_CONTEXT_ENV]).accountId, accountId);
    assert.deepEqual(storeOptions.at(-1).accountEnv, {});
    assert.equal(await authContexts.at(-1).env("OPENAI_API_KEY"), undefined);
    assert.equal(modelPaths.at(-1), path.join(agentDir, "models.json"), "model store remains shared");
    assert.deepEqual(events, [`store:${accountId}`, `store:${accountId}`, `store:${accountId}`]);
  }

});

test("simultaneous inherited launch contexts remain isolated", async () => {
  const envs = ["alpha", "beta"].map(() => ({ SHARED: "unchanged" }));
  const outcomes = await Promise.all(["alpha", "beta"].map(async (accountId, index) => {
    const env = envs[index];
    const factory = runtimeFor(accountId, env, { pickAccount: () => assert.fail("inherited context must not prompt") });
    const result = await factory({ purpose: "application", sessionManager: new FakeSessionManager(), sdkRoot: path.join(root, "fake-sdk"), agentDir });
    return { selected: result.modelRuntime.accountId, published: decodeAccountLaunchContext(env[ACCOUNT_LAUNCH_CONTEXT_ENV]).accountId, shared: env.SHARED };
  }));
  assert.deepEqual(outcomes, [
    { selected: "alpha", published: "alpha", shared: "unchanged" },
    { selected: "beta", published: "beta", shared: "unchanged" },
  ]);
});

test("no context leaves fresh selection to picker; bound resume and context conflict are fail-closed before store", async () => {
  const env = {};
  let picks = 0, stores = 0;
  const fresh = createUserRuntime(registryPath, {
    pickAccount: async () => { picks++; return "beta"; },
    createStore: (account) => { stores++; return { accountId: account.id }; },
    createModelRuntime: async ({ credentials }) => ({ accountId: credentials.accountId }),
    sdkRoot: path.join(root, "fake-sdk"),
  });
  assert.equal((await fresh({ purpose: "application", sessionManager: new FakeSessionManager(), sdkRoot: path.join(root, "fake-sdk"), agentDir })).modelRuntime.accountId, "beta");
  assert.equal(picks, 1);
  const inherited = runtimeFor("alpha", env, { createStore: () => { stores++; return { accountId: "alpha" }; } });
  assert.equal((await inherited({ purpose: "application", sessionManager: new FakeSessionManager([binding("alpha")]), sdkRoot: path.join(root, "fake-sdk"), agentDir })).modelRuntime.accountId, "alpha");
  const before = stores;
  await assert.rejects(inherited({ purpose: "application", sessionManager: new FakeSessionManager([binding("beta")]), sdkRoot: path.join(root, "fake-sdk"), agentDir }), { code: "ACCOUNT_BINDING_CONFLICT" });
  assert.equal(stores, before, "binding conflict precedes credential-store construction");
  const auth = runtimeFor("alpha", {}, { createStore: () => { stores++; return { accountId: "alpha" }; } });
  assert.equal((await auth({ purpose: "auth-command", sdkRoot: path.join(root, "fake-sdk"), agentDir })).modelRuntime.accountId, "alpha");
  const beforeUnknown = stores;
  const unknown = runtimeFor("missing", {}, { createStore: () => { stores++; return { accountId: "missing" }; } });
  await assert.rejects(unknown({ purpose: "application", sessionManager: new FakeSessionManager(), sdkRoot: path.join(root, "fake-sdk"), agentDir }), { code: "ACCOUNT_BINDING_UNKNOWN" });
  assert.equal(stores, beforeUnknown, "unknown inherited account fails before store construction");
});

test("context codec and wrapper parser reject malformed, unsupported, extra and duplicate values", () => {
  const encoded = encodeAccountLaunchContext(context("alpha"));
  assert.deepEqual(decodeAccountLaunchContext(encoded), context("alpha"));
  for (const invalid of ["", "***", Buffer.from('{"version":2,"accountId":"alpha","registryPath":"C:\\\\x","extra":1}', "utf8").toString("base64url"),
    Buffer.from('{"version":1,"accountId":"alpha","registryPath":"C:\\\\x","extra":1}', "utf8").toString("base64url")]) {
    assert.throws(() => decodeAccountLaunchContext(invalid), { code: "ACCOUNT_LAUNCH_CONTEXT_INVALID" });
  }
  assert.throws(() => encodeAccountLaunchContext({ ...context("alpha"), secret: "no" }), { code: "ACCOUNT_LAUNCH_CONTEXT_INVALID" });
  assert.throws(() => extractAccountLaunchContextArgs(["--usuario-context"]), { code: "ACCOUNT_LAUNCH_CONTEXT_INVALID" });
  assert.throws(() => extractAccountLaunchContextArgs(["--usuario-context", encoded, "--usuario-context=" + encoded]), { code: "ACCOUNT_LAUNCH_CONTEXT_INVALID" });
  assert.deepEqual(extractAccountLaunchContextArgs(["--usuario-context=" + encoded, "--", "--usuario-context", "literal"]), {
    argv: ["--", "--usuario-context", "literal"], encoded,
  });
});

test("context rejects NUL and publication canonicalizes valid absolute registry spellings", async () => {
  assert.throws(() => encodeAccountLaunchContext({ ...context("alpha"), registryPath: registryPath + String.fromCharCode(0) }), { code: "ACCOUNT_LAUNCH_CONTEXT_INVALID" });
  const alternateRegistryPath = path.dirname(registryPath) + path.sep + "." + path.sep + path.basename(registryPath);
  let published;
  const factory = createUserRuntime(alternateRegistryPath, {
    pickAccount: async () => "alpha",
    onAccountSelected: (selected) => { published = decodeAccountLaunchContext(encodeAccountLaunchContext(selected)); },
    createStore: (account) => ({ accountId: account.id }),
    createModelRuntime: async ({ credentials }) => ({ accountId: credentials.accountId }),
    sdkRoot: path.join(root, "fake-sdk"),
  });
  const result = await factory({ purpose: "application", sessionManager: new FakeSessionManager(), sdkRoot: path.join(root, "fake-sdk"), agentDir });
  assert.equal(result.modelRuntime.accountId, "alpha");
  assert.equal(published.registryPath, registryPath);
});

test("launcher rejects conflicting registry/context, preserves native argv and leaves metadata inert", async () => {
  const env = { [ACCOUNT_LAUNCH_CONTEXT_ENV]: encodeAccountLaunchContext(context("alpha")), HOME: "shared" };
  await assert.rejects(launchUser([], { env, registryPath: path.join(root, "other", "users.json"), nativeMain: async () => "never" }), { code: "ACCOUNT_LAUNCH_REGISTRY_CONFLICT" });
  await assert.rejects(launchUser(["--usuario-context=" + env[ACCOUNT_LAUNCH_CONTEXT_ENV]], { env, nativeMain: async () => "never" }), { code: "ACCOUNT_LAUNCH_CONTEXT_INVALID" });
  const seen = await invokeManaged(["--help", "--usuario-context", encodeAccountLaunchContext(context("alpha")), "-p"], {}, undefined);
  assert.deepEqual(seen.received.argv, ["--help", "-p"]);
  assert.equal(seen.result, "native");
  assert.equal(Object.hasOwn(seen.received.options, "accountRuntimeFactory"), false);
  const explicit = await launchUser(["--help"], { env: {}, accountLaunchContext: context("alpha"), nativeMain: async (args) => args });
  assert.deepEqual(explicit, ["--help"], "explicit context option remains supported without account-store work");

  let metadataStoreCalls = 0, metadataPublishCalls = 0;
  const metadata = createUserRuntime(registryPath, {
    inheritedAccountId: "alpha",
    onAccountSelected: () => { metadataPublishCalls++; },
    createStore: () => { metadataStoreCalls++; throw new Error("metadata store forbidden"); },
    createModelRuntime: async ({ credentials }) => ({ credentials }),
  });
  await metadata({ purpose: "metadata", agentDir });
  assert.equal(metadataStoreCalls, 0);
  assert.equal(metadataPublishCalls, 0);
});

after(() => {
  fs.writeFileSync(path.join(root, "resource-postcheck.json"), `${JSON.stringify({ runRoot: root, registry: "synthetic-only", credentials: "not opened", retained: true }, null, 2)}\n`, { flag: "wx" });
  console.log(`SYNTHETIC_RESOURCE_MANIFEST=${path.join(root, "resource-manifest.json")}`);
});

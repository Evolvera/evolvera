import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import {
  ACCOUNT_LAUNCH_CONTEXT_ENV,
  decodeAccountLaunchContext,
  encodeAccountLaunchContext,
  extractUserSelectorArgs,
} from "../users/environment.mjs";
import { launchUser } from "../users/launcher.mjs";
import { createUserRuntime } from "../users/runtime.mjs";
import { registerUser } from "../users/registry.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "auth-only-user-flag-"));
const registryPath = path.join(root, "shared", "registry.json");
const agentDir = path.join(root, "shared", "agent");
fs.mkdirSync(agentDir, { recursive: true });
for (const id of ["evolvera", "other"]) {
  registerUser({ registryPath, id, label: id, agentDir: path.join(root, "profiles", id, "agent"), sessionRoots: [path.join(root, "profiles", id, "sessions")] });
}
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

const resourceProof = {
  runRoot: root,
  disposition: "DISPOSABLE_VERIFIED",
  writable: ["synthetic registry and profiles under run root", "resource manifest and postcheck under run root"],
  noCredentialsOrPrivateFiles: true,
  networkSdkSpawnAndProviderCalls: "not used; all injected fakes",
  cleanup: "none; run-owned fixture intentionally retained",
};
fs.writeFileSync(path.join(root, "resource-manifest.json"), `${JSON.stringify(resourceProof, null, 2)}\n`, { flag: "wx" });

test("leading selector spellings parse and native arguments remain byte-for-byte ordered", () => {
  for (const argv of [
    ["-u", "evolvera", "-c"],
    ["--user", "evolvera", "--session", "saved"],
    ["--user=evolvera", "-c"],
  ]) {
    assert.deepEqual(extractUserSelectorArgs(argv), { argv: argv.at(-1) === "saved" ? ["--session", "saved"] : [argv.at(-1)], accountId: "evolvera" });
  }
  assert.deepEqual(extractUserSelectorArgs(["-c", "--user", "literal", "-u", "literal"]), { argv: ["-c", "--user", "literal", "-u", "literal"], accountId: undefined });
  assert.deepEqual(extractUserSelectorArgs(["-u", "evolvera", "--", "--user", "literal"]), { argv: ["--", "--user", "literal"], accountId: "evolvera" });
  assert.deepEqual(extractUserSelectorArgs(["--session", "-u", "literal"]), { argv: ["--session", "-u", "literal"], accountId: undefined });
});

test("malformed and repeated leading selectors fail with a finite error", () => {
  for (const argv of [["-u"], ["--user"], ["--user="], ["-u", ""], ["-u", "Bad"], ["-u", "x"], ["-u", "evolvera", "--user", "other"], ["--user=evolvera", "-u", "other"]]) {
    assert.throws(() => extractUserSelectorArgs(argv), { code: "ACCOUNT_SELECTOR_INVALID" });
  }
});

test("launcher forwards stripped native argv and supplies a fixed-account runtime without prompting", async () => {
  let received;
  let storeAccount;
  const env = {};
  const runtime = createUserRuntime(registryPath, {
    inheritedAccountId: "evolvera",
    pickAccount: () => assert.fail("explicit selector must bypass the picker"),
    createStore: (account) => { storeAccount = account.id; return { accountId: account.id }; },
    createModelRuntime: async ({ credentials }) => ({ accountId: credentials.accountId }),
    onAccountSelected: (selected) => { env[ACCOUNT_LAUNCH_CONTEXT_ENV] = encodeAccountLaunchContext(selected); },
    sdkRoot: path.join(root, "fake-sdk"),
  });
  const sessionManager = new FakeSessionManager();
  const result = await launchUser(["-u", "evolvera", "-c", "--session", "synthetic-session"], {
    env,
    registryPath,
    nativeMain: async (argv, options) => {
      received = argv;
      const accountRuntime = await options.accountRuntimeFactory({ purpose: "application", sessionManager, sdkRoot: path.join(root, "fake-sdk"), agentDir });
      return { accountId: accountRuntime.modelRuntime.accountId, sessionManager };
    },
    accountRuntimeFactory: runtime,
  });
  assert.deepEqual(received, ["-c", "--session", "synthetic-session"]);
  assert.equal(result.accountId, "evolvera");
  assert.equal(result.sessionManager, sessionManager, "the native-selected session manager is retained");
  assert.deepEqual(sessionManager.getEntries(), [binding("evolvera")]);
  assert.equal(storeAccount, "evolvera");
  assert.deepEqual(decodeAccountLaunchContext(env[ACCOUNT_LAUNCH_CONTEXT_ENV]), context("evolvera"));
});

test("selector context reconciles with inherited contexts and rejects different account IDs before native entry", async () => {
  const env = { [ACCOUNT_LAUNCH_CONTEXT_ENV]: encodeAccountLaunchContext(context("evolvera")) };
  let argvSeen;
  await launchUser(["--user=evolvera", "--help"], { env, nativeMain: async (argv) => { argvSeen = argv; } });
  assert.deepEqual(argvSeen, ["--help"]);
  await assert.rejects(launchUser(["-u", "other"], { env, nativeMain: async () => assert.fail("conflict must fail before native entry") }), { code: "ACCOUNT_BINDING_CONFLICT" });
  const encoded = encodeAccountLaunchContext(context("evolvera"));
  await launchUser(["-u", "evolvera", `--usuario-context=${encoded}`], { nativeMain: async (argv) => { assert.deepEqual(argv, []); } });
  await launchUser(["-u", "evolvera"], { accountLaunchContext: context("evolvera"), nativeMain: async () => undefined });
  await assert.rejects(launchUser(["-u", "evolvera"], { env, accountLaunchContext: context("evolvera"), nativeMain: async () => assert.fail("multiple context sources remain invalid") }), { code: "ACCOUNT_LAUNCH_CONTEXT_INVALID" });
  await assert.rejects(launchUser(["-u", "evolvera", `--usuario-context=${encodeAccountLaunchContext(context("other"))}`], { nativeMain: async () => assert.fail("conflict must fail before native entry") }), { code: "ACCOUNT_BINDING_CONFLICT" });
  await assert.rejects(launchUser(["-u", "evolvera"], { accountLaunchContext: context("other"), nativeMain: async () => assert.fail("conflict must fail before native entry") }), { code: "ACCOUNT_BINDING_CONFLICT" });
});

test("unknown selection and mismatched saved-session binding fail before credential creation", async () => {
  let stores = 0;
  const createRuntime = (inheritedAccountId) => createUserRuntime(registryPath, {
    inheritedAccountId,
    pickAccount: () => assert.fail("explicit selector must bypass picker"),
    createStore: (account) => { stores += 1; return { accountId: account.id }; },
    createModelRuntime: async ({ credentials }) => ({ accountId: credentials.accountId }),
    sdkRoot: path.join(root, "fake-sdk"),
  });
  const invoke = (id, inheritedAccountId, entries = []) => launchUser(["-u", id], {
    registryPath,
    nativeMain: async (_argv, options) => options.accountRuntimeFactory({ purpose: "application", sessionManager: new FakeSessionManager(entries), sdkRoot: path.join(root, "fake-sdk"), agentDir }),
    accountRuntimeFactory: createRuntime(inheritedAccountId),
  });
  await assert.rejects(invoke("missing", "missing"), { code: "ACCOUNT_BINDING_UNKNOWN" });
  assert.equal(stores, 0);
  await assert.rejects(invoke("evolvera", "evolvera", [binding("other")]), { code: "ACCOUNT_BINDING_CONFLICT" });
  assert.equal(stores, 0);
});

test("metadata and native update/package/config routes do not construct account stores", async () => {
  let stores = 0;
  const inertRegistryPath = path.join(root, "inert", "registry.json");
  const runtime = createUserRuntime(registryPath, {
    createStore: () => { stores += 1; throw new Error("store must remain inert"); },
    createModelRuntime: async () => assert.fail("metadata must not create a model runtime"),
  });
  for (const args of [["--help"], ["--version"], ["update"], ["package", "list"], ["config", "get"]]) {
    let received;
    await launchUser(["-u", "evolvera", ...args], {
      env: {}, registryPath: inertRegistryPath,
      nativeMain: async (argv, options) => { received = argv; assert.equal(options.accountRuntimeFactory, runtime); },
      accountRuntimeFactory: runtime,
    });
    assert.deepEqual(received, args);
  }
  assert.equal(stores, 0);
  assert.equal(fs.existsSync(inertRegistryPath), false);
});

after(() => {
  fs.writeFileSync(path.join(root, "resource-postcheck.json"), `${JSON.stringify({ ...resourceProof, syntheticRegistryExists: fs.existsSync(registryPath), retained: true }, null, 2)}\n`, { flag: "wx" });
  console.log(`SYNTHETIC_RESOURCE_ROOT=${root}`);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createUserRuntime } from "../users/runtime.mjs";
import { registerUser } from "../users/registry.mjs";

const testParent = process.env.PI_USERS_TEST_PARENT ?? process.env.TEMP ?? process.env.TMP;
if (typeof testParent !== "string" || !path.isAbsolute(testParent)) throw new Error("PI_USERS_TEST_PARENT, TEMP, or TMP must be an absolute path");
if (process.env.NODE_OPTIONS !== undefined) throw new Error("NODE_OPTIONS must be absent for this isolated test");
if (Object.keys(process.env).some((name) => /(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|CLIENT_SECRET|PROVIDER_KEY)$/i.test(name))) {
  throw new Error("provider credential environment variables must be absent for this isolated test");
}

const runRoot = fs.mkdtempSync(path.join(testParent, "pi-users-reference-env-"));
process.env.HOME = runRoot;
process.env.USERPROFILE = runRoot;
const registryPath = path.join(runRoot, "registry", "users.json");
const profiles = new Map();
for (const [id, adoption] of [["evolvera", "reference"], ["evolveranew", "new"], ["alpha", "new"]]) {
  const agentDir = path.join(runRoot, "profiles", id, "agent");
  fs.mkdirSync(agentDir, { recursive: true });
  if (id === "evolvera") fs.writeFileSync(path.join(agentDir, "auth.json"), '{"synthetic":"fake-auth-marker"}\n', { flag: "wx" });
  profiles.set(id, registerUser({ registryPath, id, label: id, agentDir, adoptExisting: adoption === "reference" }));
}

const syntheticKey = "PI_USERS_REFERENCE_ENV_SENTINEL";
const syntheticValue = "synthetic-reference-only-value";
const sdkRoot = path.join(runRoot, "sdk-placeholder");

function makeRuntime(id) {
  let capturedStoreEnv;
  let capturedRuntime;
  const factory = createUserRuntime(registryPath, {
    sdkRoot,
    pickAccount: async () => id,
    createStore: (_profile, options) => {
      capturedStoreEnv = options.accountEnv;
      return { marker: "synthetic-store" };
    },
    createModelRuntime: async (request) => {
      capturedRuntime = request;
      return { marker: "synthetic-model-runtime" };
    },
    onAccountSelected: () => assert.fail("auth-command must not invoke application account-selection callback"),
  });
  return {
    factory,
    getStoreEnv: () => capturedStoreEnv,
    getRuntime: () => capturedRuntime,
  };
}

async function invoke(runtime, id) {
  await runtime.factory({
    purpose: "auth-command",
    accountId: id,
    sdkRoot,
    agentDir: profiles.get(id).agentDir,
  });
  return runtime;
}

test("only the registry-issued legacy reference owner receives a factory-time environment snapshot", async () => {
  const originalSentinel = process.env[syntheticKey];
  try {
    process.env[syntheticKey] = syntheticValue;

    const legacyRuntime = makeRuntime("evolvera");
    process.env[syntheticKey] = "later-environment-value";
    await invoke(legacyRuntime, "evolvera");
    const legacyStoreEnv = legacyRuntime.getStoreEnv();
    const legacyModelRuntime = legacyRuntime.getRuntime();
    assert.equal(Object.isFrozen(legacyStoreEnv), true);
    assert.equal(legacyStoreEnv[syntheticKey] === syntheticValue, true);
    assert.equal(legacyModelRuntime.accountConfigPolicy.referenceOwner, true);
    assert.equal(legacyModelRuntime.accountConfigPolicy.env[syntheticKey] === syntheticValue, true);
    assert.equal((await legacyModelRuntime.authContext.env(syntheticKey)) === syntheticValue, true);
    assert.deepEqual(Object.keys(legacyModelRuntime.accountConfigPolicy.env).sort(), Object.keys(legacyStoreEnv).sort());
    for (const name of Object.keys(legacyStoreEnv)) {
      assert.equal(legacyModelRuntime.accountConfigPolicy.env[name] === legacyStoreEnv[name], true);
      assert.equal((await legacyModelRuntime.authContext.env(name)) === legacyStoreEnv[name], true);
    }
    assert.equal(legacyStoreEnv[syntheticKey] === process.env[syntheticKey], false);

    for (const id of ["evolveranew", "alpha"]) {
      const runtime = await invoke(makeRuntime(id), id);
      assert.deepEqual(Object.keys(runtime.getStoreEnv()), []);
      assert.equal(runtime.getRuntime().accountConfigPolicy.referenceOwner, false);
      assert.deepEqual(Object.keys(runtime.getRuntime().accountConfigPolicy.env), []);
      assert.equal(await runtime.getRuntime().authContext.env(syntheticKey), undefined);
    }

    const metadataRuntime = makeRuntime("alpha");
    await metadataRuntime.factory({ purpose: "metadata", agentDir: profiles.get("alpha").agentDir });
    assert.deepEqual(Object.keys(metadataRuntime.getRuntime().accountConfigPolicy.env), []);
    assert.equal(await metadataRuntime.getRuntime().authContext.env(syntheticKey), undefined);
  } finally {
    if (originalSentinel === undefined) delete process.env[syntheticKey];
    else process.env[syntheticKey] = originalSentinel;
  }
});

assert.equal(path.dirname(runRoot), path.resolve(testParent));
assert.equal(process.env.HOME, runRoot);
assert.equal(process.env.USERPROFILE, runRoot);

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { syncBuiltinESMExports } from "node:module";
import { createHash } from "node:crypto";
import { createSandbox, createAccessGuard, denyNetwork } from "./lib/users-sandbox.mjs";
import { stageAlibabaProfileCompatibility, PACKAGE_NAME, PACKAGE_VERSION } from "../compat/alibaba-users.mjs";

const LIVE_SOURCE = "C:/Users/kevin/.pi/agent/npm/node_modules/pi-alibaba-models";
const ENTRY = path.join("extensions", "alibaba.ts");
const SCRIPT = fileURLToPath(import.meta.url);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inside = (root, value) => {
  const rel = path.relative(root, path.resolve(value));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
};
function sourceFixture(sandbox, name, override = {}) {
  const root = sandbox.mkdir("sources", name);
  const packagePath = path.join(root, "package.json");
  const entryPath = path.join(root, ENTRY);
  fs.mkdirSync(path.dirname(entryPath), { recursive: true });
  const meta = JSON.parse(fs.readFileSync(path.join(LIVE_SOURCE, "package.json"), "utf8"));
  const source = fs.readFileSync(path.join(LIVE_SOURCE, ENTRY), "utf8");
  fs.writeFileSync(packagePath, JSON.stringify({ ...meta, ...override.meta }, null, 2));
  fs.writeFileSync(entryPath, override.source ?? source);
  return root;
}
function runWorker(sandbox, id, agentDir, protectedRoot, mode = "run", stageName = id) {
  const env = { ...sandbox.env, PI_USER_ID: id, DASHSCOPE_API_KEY: "CORPORATE_SENTINEL_DO_NOT_USE" };
  const result = spawnSync(process.execPath, [SCRIPT, "--worker", mode, id, agentDir, protectedRoot, sandbox.root, stageName], {
    cwd: sandbox.root, env, encoding: "utf8", timeout: 15000, windowsHide: true,
  });
  assert.equal(result.status, 0, `worker ${id}/${mode} failed: ${result.stderr || result.stdout}`);
  if (result.stdout.trim()) console.log(result.stdout.trim());
  return result.stdout;
}

async function worker(mode, id, agentDir, protectedRoot, sandboxRoot, stageName) {
  // This process is created with the fixture allowlist plus one deliberately hostile key.
  assert.equal(process.env.NODE_OPTIONS, undefined);
  assert.equal(process.env.NODE_PATH, undefined);
  assert.equal(process.env.DASHSCOPE_API_KEY, "CORPORATE_SENTINEL_DO_NOT_USE");
  if (["invalid", "mismatch", "accessor", "writable", "mutable-profile", "null-runtime"].includes(mode)) {
    assert.equal(process.env.PI_USER_ID, id, `fixture marker missing for ${mode}`);
    const key = Symbol.for("pi.users.context");
    if (mode === "invalid") assert.equal(Object.getOwnPropertyDescriptor(globalThis, key), undefined);
    if (mode === "accessor") {
      let reads = 0;
      Object.defineProperty(globalThis, key, { get() { reads += 1; throw new Error("receipt getter executed"); }, configurable: true });
      const { createJiti } = await import(pathToFileURL("C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs").href);
      await assert.rejects(async () => {
        const extension = await createJiti(import.meta.url, { fsCache: false }).import(pathToStaged(path.join(sandboxRoot, "staging", `${stageName}-entry`)));
        await extension.default({});
      }, /valid matching users receipt/);
      assert.equal(reads, 0, "receipt accessor must be rejected before its value is read");
      return;
    }
    if (mode !== "invalid") {
      const profile = mode === "mismatch"
        ? Object.freeze({ id: "different-user", agentDir })
        : mode === "mutable-profile" ? { id, agentDir } : Object.freeze({ id, agentDir });
      const receipt = Object.freeze({ profile, assertOwnedWorkspace() {}, assertOwnedSession() {}, admitUserResources() {}, modelRuntime: mode === "null-runtime" ? null : {} });
      Object.defineProperty(globalThis, key, { value: receipt, writable: mode === "writable", configurable: false });
    }
    const { createJiti } = await import(pathToFileURL("C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs").href);
    await assert.rejects(async () => {
      const extension = await createJiti(import.meta.url, { fsCache: false }).import(pathToStaged(path.join(sandboxRoot, "staging", `${stageName}-entry`)));
      await extension.default({});
    }, /valid matching users receipt/);
    return;
  }
  const symbol = Symbol.for("pi.users.context");
  const profile = Object.freeze({ id, label: id, agentDir, sessionRoots: Object.freeze([]), workspaces: Object.freeze([]), contexts: Object.freeze([]), sharedAssets: Object.freeze([]) });
  const receipt = Object.freeze({
    profile,
    assertOwnedWorkspace() { throw new Error("synthetic ownership stub"); },
    assertOwnedSession() { throw new Error("synthetic ownership stub"); },
    admitUserResources() { throw new Error("synthetic admission stub"); },
    modelRuntime: Object.freeze({ synthetic: true }),
  });
  Object.defineProperty(globalThis, symbol, { value: receipt, writable: false, configurable: false, enumerable: false });

  const sourceStage = path.join(sandboxRoot, "staging", `${stageName}-entry`);
  const moduleEntry = pathToStaged(sourceStage);
  const runtimePath = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/index.js";
  const { ModelRuntime } = await import(pathToFileURL(runtimePath).href);
  const jitiPath = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs";
  const { createJiti } = await import(pathToFileURL(jitiPath).href);
  const jiti = createJiti(import.meta.url, { fsCache: false });
  const protectedFixture = protectedRoot;
  const access = createAccessGuard(fs, [protectedFixture]);
  const network = denyNetwork(net);
  const ops = [];
  const methods = ["readFileSync", "openSync", "writeFileSync", "appendFileSync", "mkdirSync", "unlinkSync", "rmSync", "renameSync"];
  const originals = new Map();
  const fetches = [];
  globalThis.fetch = async (url, init = {}) => {
    fetches.push({ url: String(url), authorization: init.headers?.Authorization ?? init.headers?.authorization ?? null });
    return { ok: true, status: 200, async json() { return { data: [{ id: "qwen3.7-plus", name: "Synthetic Qwen" }] }; } };
  };
  const extension = await jiti.import(moduleEntry);
  assert.equal(typeof extension.normalizeAlibabaAuthRecords, "function");
  try {
    access.install();
    syncBuiltinESMExports();
    for (const name of methods) {
      const original = fs[name];
      originals.set(name, original);
      fs[name] = function audited(...args) {
        for (const arg of args.slice(0, name === "renameSync" ? 2 : 1)) {
          if (typeof arg === "string") {
            ops.push({ name, path: path.resolve(arg) });
            assert.ok(inside(sandboxRoot, arg), `filesystem operation escaped fixture: ${name}`);
          }
        }
        return original.apply(this, args);
      };
    }
    syncBuiltinESMExports();
    const providers = new Map();
    const registrationCounts = new Map();
    const events = new Map();
    const commands = new Map();
    const pi = {
      registerProvider(name, config) {
        providers.set(name, config);
        registrationCounts.set(name, (registrationCounts.get(name) ?? 0) + 1);
      },
      on(name, callback) { events.set(name, callback); },
      registerCommand(name, config) { commands.set(name, config); },
    };
    await extension.default(pi);
    assert.deepEqual([...providers.keys()].sort(), ["alibaba-cloud", "alibaba-plan"]);
    const cloud = providers.get("alibaba-cloud");
    const plan = providers.get("alibaba-plan");
    assert.equal(cloud.api, "anthropic-messages");
    assert.equal(cloud.authHeader, true);
    assert.equal(cloud.apiKey, undefined, "managed registration must not fall back to ambient provider env");
    assert.equal(plan.api, "anthropic-messages");
    assert.equal(typeof plan.oauth.login, "function");
    assert.equal(typeof plan.oauth.refreshToken, "function");
    assert.equal(typeof plan.oauth.getApiKey, "function");
    assert.equal(plan.oauth.getApiKey({ access: "SYNTHETIC_PLAN_KEY" }), "SYNTHETIC_PLAN_KEY");
    assert.deepEqual(plan.oauth.modifyModels([], { access: "SYNTHETIC_PLAN_KEY" }), []);
    assert.equal(typeof events.get("session_start"), "function");
    assert.equal(typeof commands.get("alibaba")?.handler, "function");
    for (const choice of ["Re-login Plan", "Re-login Cloud", "Plan — Change Endpoints", "Reset all"]) {
      const before = ops.length;
      await assert.rejects(commands.get("alibaba").handler([], { ui: { async select() { return choice; } } }), /blocked before effects/);
      assert.equal(ops.length, before, `${choice} must block before filesystem effects`);
    }
    await events.get("session_start")();
    assert.deepEqual([...registrationCounts.values()], [2, 2], "session_start must re-register both providers");
    const refreshedCloud = providers.get("alibaba-cloud");
    assert.equal(refreshedCloud.api, "anthropic-messages");
    assert.equal(access.count, 0, "a profile must not access another profile's protected synthetic store");
    const rawFactoryRecords = JSON.parse(fs.readFileSync(path.join(agentDir, "auth.json"), "utf8"));
    const factoryNormalized = extension.normalizeAlibabaAuthRecords(rawFactoryRecords, Date.now());
    if (mode === "no-key") {
      assert.equal(fetches.length, 0, "without Kevin credentials, no sentinel or inherited key request is allowed");
      assert.equal(refreshedCloud.models.length, 1, "existing Cloud login seed remains registered");
    } else {
      const cloudCredential = factoryNormalized["alibaba-cloud"];
      const expectedCredential = cloudCredential ?? factoryNormalized["alibaba-plan"];
      const expectedToken = expectedCredential?.key ?? expectedCredential?.access;
      assert.ok(expectedToken, "factory fixture must normalize to one selected Alibaba credential");
      assert.equal(fetches.length >= 1, true, "configured profile key must drive the catalog transport");
      assert.ok(fetches.every((entry) => entry.authorization === `Bearer ${expectedToken}`));
      if (cloudCredential) {
        const model = refreshedCloud.models.find((entry) => entry.id === "qwen3.7-plus");
        assert.ok(model);
        assert.equal(model.api, "anthropic-messages");
        assert.equal(model.baseUrl, "https://dashscope-intl.aliyuncs.com/apps/anthropic");
      } else {
        assert.equal(refreshedCloud.models.length, 1, "legacy Plan auth must not become Cloud auth");
        assert.ok(providers.get("alibaba-plan").models.some((entry) => entry.id === "qwen3.7-plus"), "legacy Plan auth must drive the Plan catalog");
      }
    }
    assert.ok(ops.every((op) => inside(agentDir, op.path)), "all plugin file operations must remain beneath profile.agentDir");
    assert.equal(network.attempts, 0, "external socket access must remain blocked and unused");

    const codecCases = [
      [{ alibaba: { type: "oauth", access: "CLOUD_OLD" } }, { "alibaba-cloud": { type: "api_key", key: "CLOUD_OLD" } }],
      [{ alibaba: { type: "oauth", access: "sk-sp-PLAN" } }, { "alibaba-plan": { type: "oauth", access: "sk-sp-PLAN", refresh: "", expires: 1234 + 365 * 86400_000 } }],
      [{ alibaba: { type: "api_key", key: "sk-tok-PLAN" } }, { "alibaba-plan": { type: "oauth", access: "sk-tok-PLAN", refresh: "", expires: 1234 + 365 * 86400_000 } }],
      [{ "alibaba-cloud": { type: "oauth", access: "CLOUD_OAUTH" } }, { "alibaba-cloud": { type: "api_key", key: "CLOUD_OAUTH" } }],
      [{ "alibaba-cloud": { type: "api_key", key: "sk-sp-MISROUTED" } }, { "alibaba-plan": { type: "oauth", access: "sk-sp-MISROUTED", refresh: "", expires: 1234 + 365 * 86400_000 } }],
      [{ alibaba: { type: "oauth", access: "OLD_WINS" }, "alibaba-cloud": { type: "api_key", key: "MODERN" }, unrelated: 7 }, { "alibaba-cloud": { type: "api_key", key: "OLD_WINS" }, unrelated: 7 }],
      [{ "alibaba-cloud": { type: "api_key", key: "sk-tok-X" }, "alibaba-plan": { type: "oauth", access: "CANON", refresh: "refresh", expires: 77 }, unrelated: 9 }, { "alibaba-plan": { type: "oauth", access: "CANON", refresh: "refresh", expires: 77 }, unrelated: 9 }],
    ];
    for (const [input, expected] of codecCases) {
      const before = structuredClone(input);
      assert.deepEqual(extension.normalizeAlibabaAuthRecords(input, 1234), expected);
      assert.deepEqual(input, before, "normalization must be pure");
    }
    const rawRecords = rawFactoryRecords;
    const normalized = extension.normalizeAlibabaAuthRecords(rawRecords, 1234);
    assert.deepEqual(rawRecords, JSON.parse(fs.readFileSync(path.join(agentDir, "auth.json"), "utf8")), "codec must not mutate its input");
    if (mode === "no-key") {
      assert.deepEqual(normalized, {}, "blank Kevin must remain credential-empty");
      assert.equal(fetches.length, 0, "blank Kevin must never request a catalog");
      const blankStore = { async read() { return undefined; }, async list() { return []; }, async modify() { throw new Error("blank read-only store"); }, async delete() { throw new Error("blank read-only store"); } };
      const blankRuntime = await ModelRuntime.create({ credentials: blankStore, modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
      for (const [name, config] of providers) blankRuntime.registerProvider(name, config);
      assert.equal(await blankRuntime.getAuth("alibaba-cloud"), undefined, "blank Kevin core lookup must not see ambient credentials");
      return;
    }
    const credentials = {
      async read(providerId) { return normalized[providerId]; },
      async list() { return Object.keys(normalized).map((providerId) => ({ providerId, type: normalized[providerId].type })); },
      async modify(providerId, fn) { return fn(normalized[providerId]); },
      async delete() { /* synthetic store has no persistent backing */ },
    };
    const runtime = await ModelRuntime.create({ credentials, modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
    for (const [name, config] of providers) runtime.registerProvider(name, config);
    const canonical = normalized["alibaba-cloud"] ? ["alibaba-cloud", normalized["alibaba-cloud"]] : ["alibaba-plan", normalized["alibaba-plan"]];
    assert.ok(canonical[1], "legacy-only fixture must normalize to a supported credential");
    const auth = await runtime.getAuth(canonical[0]);
    assert.ok(auth, `core getAuth must resolve ${canonical[0]} from the shared codec`);
    assert.equal(auth.auth.apiKey, canonical[1].key ?? canonical[1].access, "factory and core must observe the same legacy token");
    for (const [input, expected] of codecCases) {
      const expectedEntry = expected["alibaba-cloud"] ? ["alibaba-cloud", expected["alibaba-cloud"]] : ["alibaba-plan", expected["alibaba-plan"]];
      if (!expectedEntry[1]) continue;
      const caseStore = {
        async read(providerId) { return expected[providerId]; },
        async list() { return Object.keys(expected).map((providerId) => ({ providerId, type: expected[providerId].type })); },
        async modify(providerId, fn) { return fn(expected[providerId]); },
        async delete() { /* synthetic store has no persistent backing */ },
      };
      const caseRuntime = await ModelRuntime.create({ credentials: caseStore, modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
      for (const [name, config] of providers) caseRuntime.registerProvider(name, config);
      const caseAuth = await caseRuntime.getAuth(expectedEntry[0]);
      assert.equal(caseAuth?.auth.apiKey, expectedEntry[1].key ?? expectedEntry[1].access, `core lookup must normalize ${input.alibaba ? "alibaba" : "cloud"} legacy credentials`);
    }
    console.log(JSON.stringify({ id, providerNames: [...providers.keys()].sort(), fetchCount: fetches.length, coreProvider: canonical[0], coreToken: auth.auth.apiKey, protectedAccesses: access.count, networkAttempts: network.attempts, fixtureOperations: ops.length }));
  } finally {
    network.restore();
    for (const [name, original] of originals) fs[name] = original;
    access.restore();
    syncBuiltinESMExports();
  }
}

function pathToStaged(stagingRoot) {
  return path.join(stagingRoot, PACKAGE_NAME + "-" + PACKAGE_VERSION, ENTRY);
}

async function main() {
  const sourceHashBefore = sha(fs.readFileSync(path.join(LIVE_SOURCE, ENTRY)));
  const packageHashBefore = sha(fs.readFileSync(path.join(LIVE_SOURCE, "package.json")));
  const sandbox = createSandbox("alibaba-users");
  let cleaned = false;
  try {
    const sourceRoot = LIVE_SOURCE;
    const a = path.join(sandbox.root, "profiles", "evolvera", "agent");
    const b = path.join(sandbox.root, "profiles", "kevin", "agent");
    const c = path.join(sandbox.root, "profiles", "kevin-no-key", "agent");
    const d = path.join(sandbox.root, "profiles", "plan-sp", "agent");
    const e = path.join(sandbox.root, "profiles", "cloud-oauth", "agent");
    const f = path.join(sandbox.root, "profiles", "misrouted-plan", "agent");
    for (const root of [a, b, c, d, e, f]) fs.mkdirSync(root, { recursive: true });
    const authFiles = [a, b, c, d, e, f].map((root) => path.join(root, "auth.json"));
    const fixtures = [
      { alibaba: { type: "api_key", key: "EVOLVERA_PRIVATE_KEY" } },
      { alibaba: { type: "api_key", key: "KEVIN_PRIVATE_KEY" } },
      {},
      { alibaba: { type: "oauth", access: "sk-sp-PLAN" } },
      { "alibaba-cloud": { type: "oauth", access: "CLOUD_OAUTH" } },
      { "alibaba-cloud": { type: "api_key", key: "sk-tok-MISROUTED" } },
    ];
    authFiles.forEach((file, i) => fs.writeFileSync(file, JSON.stringify(fixtures[i])));
    const authHashes = authFiles.map((file) => sha(fs.readFileSync(file)));

    const identities = ["evolvera", "kevin", "kevin", "plan-sp", "cloud-oauth", "misrouted-plan"];
    const stageNames = ["evolvera", "kevin", "kevin-no-key", "plan-sp", "cloud-oauth", "misrouted-plan"];
    const roots = [a, b, c, d, e, f];
    const stageRoots = stageNames.map((name) => path.join(sandbox.root, "staging", `${name}-entry`));
    stageRoots.forEach((root) => fs.mkdirSync(root, { recursive: true }));
    const stagedProfiles = roots.map((agentDir, index) => stageAlibabaProfileCompatibility(sourceRoot, stageRoots[index], { profile: { id: identities[index], agentDir } }));
    for (const staged of stagedProfiles) {
      assert.ok(inside(sandbox.root, staged.entry));
      assert.equal(fs.existsSync(path.join(staged.packageRoot, "README.md")), false, "only code and required metadata are staged");
      const adapted = fs.readFileSync(staged.entry, "utf8");
      assert.ok(adapted.includes('managedUser ? usersContext.profile.agentDir : path.join(os.homedir(), ".pi", "agent")'));
      assert.ok(adapted.includes('managedUser ? null : (process.env.DASHSCOPE_API_KEY || null)'));
      assert.ok(adapted.includes('if (!managedUser) migrateLegacyAuth();'));
      assert.ok(adapted.includes('managedUser ? undefined : "$DASHSCOPE_API_KEY"'));
    }

    for (const [name, override] of [["wrong-version", { meta: { version: "9.9.9" } }], ["wrong-anchor", { source: fs.readFileSync(path.join(sourceRoot, ENTRY), "utf8").replace('migrateLegacyAuth();', 'migrateOldAuth();') }]]) {
      const badSource = sourceFixture(sandbox, name, override);
      const badStage = path.join(sandbox.root, "staging", `refuse-${name}`);
      fs.mkdirSync(badStage, { recursive: true });
      assert.throws(() => stageAlibabaProfileCompatibility(badSource, badStage, { profile: { id: "test-user", agentDir: b } }), /refused/);
      assert.deepEqual(fs.readdirSync(badStage), [], `refusal left an entry for ${name}`);
    }
    assert.throws(() => stageAlibabaProfileCompatibility(sourceRoot, sourceRoot, { profile: { id: "test-user", agentDir: b } }), /disjoint/);
    runWorker(sandbox, identities[0], a, b, "run", stageNames[0]);
    runWorker(sandbox, identities[1], b, a, "run", stageNames[1]);
    runWorker(sandbox, identities[2], c, a, "no-key", stageNames[2]);
    for (let i = 3; i < roots.length; i += 1) runWorker(sandbox, identities[i], roots[i], a, "run", stageNames[i]);
    for (const mode of ["invalid", "mismatch", "accessor", "writable", "mutable-profile", "null-runtime"]) {
      runWorker(sandbox, "kevin", b, a, mode, stageNames[1]);
    }
    authFiles.forEach((file, i) => assert.equal(sha(fs.readFileSync(file)), authHashes[i], `managed startup transformed fixture auth ${i}`));
  } finally {
    // cleanup authorization is confined to createSandbox's canonical run root.
    cleaned = sandbox.cleanup();
  }
  assert.equal(cleaned, true);
  assert.equal(sha(fs.readFileSync(path.join(LIVE_SOURCE, ENTRY))), sourceHashBefore, "installed source code changed");
  assert.equal(sha(fs.readFileSync(path.join(LIVE_SOURCE, "package.json"))), packageHashBefore, "installed package metadata changed");
  console.log(`Alibaba ${PACKAGE_VERSION} compatibility smoke passed; legacy auth hashes unchanged; run-owned fixture cleaned; installed source checksums unchanged.`);
}

if (process.argv[2] === "--worker") {
  const [, , , mode, id, agentDir, protectedRoot, sandboxRoot, stageName] = process.argv;
  await worker(mode, id, agentDir, protectedRoot, sandboxRoot, stageName);
} else {
  await main();
}

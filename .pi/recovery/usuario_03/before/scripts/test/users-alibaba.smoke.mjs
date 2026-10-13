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
  assert.equal(result.status, 0, `worker ${id} failed: ${result.stderr || result.stdout}`);
  if (result.stdout.trim()) console.log(result.stdout.trim());
  return result.stdout;
}

async function worker(mode, id, agentDir, protectedRoot, sandboxRoot, stageName) {
  // This process is created with the fixture allowlist plus one deliberately hostile key.
  assert.equal(process.env.NODE_OPTIONS, undefined);
  assert.equal(process.env.NODE_PATH, undefined);
  assert.equal(process.env.DASHSCOPE_API_KEY, "CORPORATE_SENTINEL_DO_NOT_USE");
  if (mode === "invalid" || mode === "mismatch") {
    if (mode === "mismatch") {
      const profile = Object.freeze({ id: "different-user", agentDir });
      const receipt = Object.freeze({ profile, assertOwnedWorkspace() {}, assertOwnedSession() {}, admitUserResources() {}, modelRuntime: {} });
      Object.defineProperty(globalThis, Symbol.for("pi.users.context"), { value: receipt, writable: false, configurable: false });
    }
    await assert.rejects(import(pathToFileURL(pathToStaged(path.join(sandboxRoot, "staging", `${stageName}-entry`))).href), /valid matching users receipt/);
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
  const protectedFixture = protectedRoot;
  const access = createAccessGuard(fs, [protectedFixture]);
  const network = denyNetwork(net);
  const ops = [];
  const methods = ["readFileSync", "openSync", "writeFileSync", "appendFileSync", "mkdirSync", "unlinkSync", "rmSync", "renameSync"];
  const originals = new Map();
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
    const fetches = [];
    globalThis.fetch = async (url, init = {}) => {
      fetches.push({ url: String(url), authorization: init.headers?.Authorization ?? init.headers?.authorization ?? null });
      return { ok: true, status: 200, async json() { return { data: [{ id: "qwen3.7-plus", name: "Synthetic Qwen" }] }; } };
    };
    const extension = await import(`${pathToFileURL(moduleEntry).href}?run=${id}`);
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
    await events.get("session_start")();
    assert.deepEqual([...registrationCounts.values()], [2, 2], "session_start must re-register both providers");
    const refreshedCloud = providers.get("alibaba-cloud");
    assert.equal(refreshedCloud.api, "anthropic-messages");
    assert.equal(access.count, 0, "a profile must not access another profile's protected synthetic store");
    if (mode === "no-key") {
      assert.equal(fetches.length, 0, "without Kevin credentials, no sentinel or inherited key request is allowed");
      assert.equal(refreshedCloud.models.length, 1, "existing Cloud login seed remains registered");
    } else {
      assert.equal(fetches.length >= 1, true, "configured profile key must drive the catalog transport");
      assert.ok(fetches.every((entry) => entry.authorization === `Bearer ${id.toUpperCase()}_PRIVATE_KEY`));
      const model = refreshedCloud.models.find((entry) => entry.id === "qwen3.7-plus");
      assert.ok(model);
      assert.equal(model.api, "anthropic-messages");
      assert.equal(model.baseUrl, "https://dashscope-intl.aliyuncs.com/apps/anthropic");
    }
    assert.ok(ops.every((op) => inside(agentDir, op.path)), "all plugin file operations must remain beneath profile.agentDir");
    assert.equal(network.attempts, 0, "external socket access must remain blocked and unused");
    console.log(JSON.stringify({ id, providerNames: [...providers.keys()].sort(), fetchCount: fetches.length, protectedAccesses: access.count, networkAttempts: network.attempts, fixtureOperations: ops.length }));
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
    for (const root of [a, b, c]) fs.mkdirSync(root, { recursive: true });
    const authA = path.join(a, "auth.json");
    const authB = path.join(b, "auth.json");
    const authC = path.join(c, "auth.json");
    const legacy = { alibaba: { type: "oauth", access: "LEGACY_SYNTHETIC_SENTINEL" } };
    fs.writeFileSync(authA, JSON.stringify({ ...legacy, "alibaba-cloud": { type: "api_key", key: "EVOLVERA_PRIVATE_KEY" } }));
    fs.writeFileSync(authB, JSON.stringify({ ...legacy, "alibaba-cloud": { type: "api_key", key: "KEVIN_PRIVATE_KEY" } }));
    fs.writeFileSync(authC, JSON.stringify(legacy));
    const aBefore = sha(fs.readFileSync(authA));
    const bBefore = sha(fs.readFileSync(authB));
    const cBefore = sha(fs.readFileSync(authC));

    const stageA = path.join(sandbox.root, "staging", "evolvera-entry");
    const stageB = path.join(sandbox.root, "staging", "kevin-entry");
    const stageC = path.join(sandbox.root, "staging", "kevin-no-key-entry");
    for (const root of [stageA, stageB, stageC]) fs.mkdirSync(root, { recursive: true });
    const stagedA = stageAlibabaProfileCompatibility(sourceRoot, stageA, { profile: { id: "evolvera", agentDir: a } });
    const stagedB = stageAlibabaProfileCompatibility(sourceRoot, stageB, { profile: { id: "kevin", agentDir: b } });
    const stagedC = stageAlibabaProfileCompatibility(sourceRoot, stageC, { profile: { id: "kevin", agentDir: c } });
    for (const staged of [stagedA, stagedB, stagedC]) {
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
    runWorker(sandbox, "evolvera", a, b);
    runWorker(sandbox, "kevin", b, a);
    runWorker(sandbox, "kevin", c, a, "no-key", "kevin-no-key");
    runWorker(sandbox, "kevin", b, a, "invalid");
    runWorker(sandbox, "kevin", b, a, "mismatch");
    assert.equal(sha(fs.readFileSync(authA)), aBefore, "managed startup transformed Evolvera legacy auth");
    assert.equal(sha(fs.readFileSync(authB)), bBefore, "managed startup transformed Kevin legacy auth");
    assert.equal(sha(fs.readFileSync(authC)), cBefore, "managed startup transformed no-key legacy auth");
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
